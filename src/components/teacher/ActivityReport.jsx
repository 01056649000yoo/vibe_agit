import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import Card from '../common/Card';
import { useEvaluation } from '../../hooks/useEvaluation';
import { callAI } from '../../lib/openai';
import * as XLSX from 'xlsx';
import { FileDown, FileText, CheckCircle2, Circle, RefreshCw, ChevronDown, ChevronUp, Copy, ExternalLink } from 'lucide-react';
import BulkAIProgressModal from './BulkAIProgressModal';

/**
 * 역할: 선생님 - 활동별 리포트 (통합 분석 & 내보내기 버전) 📊
 */
const ActivityReport = ({ activeClass, isMobile, promptTemplate }) => {
    const [allTags, setAllTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [missions, setMissions] = useState([]);
    const [selectedMissionIds, setSelectedMissionIds] = useState([]);
    const [studentPosts, setStudentPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isGenerating, setIsGenerating] = useState({});
    const [batchLoading, setBatchLoading] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [expandedStudentId, setExpandedStudentId] = useState(null);
    const [generationHistory, setGenerationHistory] = useState([]);
    const [teacherId, setTeacherId] = useState(null);

    // 로컬 스토리지 키 생성 (해당 학급 + 선택된 미션 조합별 유니크 키)
    const persistenceKey = useMemo(() => {
        if (!activeClass?.id || selectedMissionIds.length === 0) return null;
        const sortedIds = [...selectedMissionIds].sort().join(',');
        return `vibe_report_${activeClass.id}_${sortedIds}`;
    }, [activeClass?.id, selectedMissionIds]);

    // 1. 초기 데이터 로드 (미션 목록)
    const fetchData = useCallback(async () => {
        if (!activeClass?.id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', activeClass.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMissions(data || []);

            const tagsSet = new Set();
            data.forEach(m => m.tags?.forEach(t => tagsSet.add(t)));
            setAllTags(Array.from(tagsSet).sort());
        } catch (err) {
            console.error('리포트 데이터 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [activeClass?.id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // 교사 ID 가져오기 및 이력 로드
    useEffect(() => {
        const fetchTeacherAndHistory = async () => {
            if (!activeClass?.id) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: teacherData } = await supabase
                .from('teachers')
                .select('id')
                .eq('id', user.id)
                .single();

            if (teacherData) {
                setTeacherId(teacherData.id);
                await loadGenerationHistory(activeClass.id);
            }
        };
        fetchTeacherAndHistory();
    }, [activeClass?.id]);

    // 생성 이력 불러오기
    const loadGenerationHistory = async (classId) => {
        if (!classId) return;
        const { data, error } = await supabase
            .from('student_records')
            .select('*')
            .eq('class_id', classId)
            .eq('record_type', 'ai_comment')
            .is('student_id', null)
            .order('created_at', { ascending: false });

        if (!error && data) {
            console.log('생성 이력 로드:', data); // 디버깅용
            setGenerationHistory(data);
        } else if (error) {
            console.error('생성 이력 로드 실패:', error);
        }
    };

    // 2. 태그 필터링
    const filteredMissions = missions.filter(m => {
        if (selectedTags.length === 0) return true;
        if (!m.tags) return false;
        return selectedTags.every(tag => m.tags.includes(tag));
    });

    // 3. 데이터 수합 및 로컬 저장소 캐시 로드
    const toggleMissionSelection = async (missionId) => {
        let newIds;
        if (selectedMissionIds.includes(missionId)) {
            newIds = selectedMissionIds.filter(id => id !== missionId);
        } else {
            newIds = [...selectedMissionIds, missionId];
        }
        setSelectedMissionIds(newIds);
    };

    useEffect(() => {
        const loadAndSynthesize = async () => {
            if (selectedMissionIds.length === 0) {
                setStudentPosts([]);
                return;
            }
            setLoadingDetails(true);
            try {
                // 1. 해당 학급의 모든 학생 목록 먼저 가져오기
                const { data: classStudents, error: studentsError } = await supabase
                    .from('students')
                    .select('id, name')
                    .eq('class_id', activeClass.id)
                    .order('name', { ascending: true });

                if (studentsError) throw studentsError;

                // 2. 선택된 미션들에 대한 제출물 가져오기
                const { data: postsData, error: postsError } = await supabase
                    .from('student_posts')
                    .select(`
                        *,
                        writing_missions (id, title, evaluation_rubric)
                    `)
                    .in('mission_id', selectedMissionIds)
                    .eq('is_submitted', true);

                if (postsError) throw postsError;

                // 로컬 저장소에서 기존 생성 결과 가져오기
                let savedResults = {};
                if (persistenceKey) {
                    const saved = localStorage.getItem(persistenceKey);
                    if (saved) savedResults = JSON.parse(saved);
                }

                // 학생 ID별로 포스트 그룹화
                const postMap = (postsData || []).reduce((acc, p) => {
                    if (!acc[p.student_id]) acc[p.student_id] = [];
                    acc[p.student_id].push(p);
                    return acc;
                }, {});

                // 학생 목록 기반으로 데이터 구성
                const synthesized = classStudents.map(student => ({
                    student: student,
                    posts: postMap[student.id] || [],
                    ai_synthesis: savedResults[student.id] || ''
                }));

                // 게시물이 하나라도 있는 학생만 보여주거나, 전체를 보여줌 (여기서는 일단 참여 학생만 필터링)
                const activeInMissions = synthesized.filter(s => s.posts.length > 0);

                setStudentPosts(activeInMissions);
            } catch (err) {
                console.error('데이터 수합 실패:', err.message);
                alert('학생 데이터를 불러오는 중 오류가 발생했습니다.');
            } finally {
                setLoadingDetails(false);
            }
        };
        loadAndSynthesize();
    }, [selectedMissionIds, persistenceKey]);

    // 4. 저장 로직 (로컬 스토리지)
    const saveToPersistence = (studentId, synthesis) => {
        if (!persistenceKey) return;
        const saved = localStorage.getItem(persistenceKey);
        const data = saved ? JSON.parse(saved) : {};
        data[studentId] = synthesis;
        localStorage.setItem(persistenceKey, JSON.stringify(data));
    };

    // AI에게 보낼 학생 활동 데이터 및 프롬프트 구성 (공통 사용)
    const getStudentPrompt = (studentName, posts) => {
        const activitiesInfo = posts.map(p => `
[미션명]: ${p.writing_missions?.title || '정보없음'}
[성취수준]: ${p.final_eval || p.initial_eval || '평가 전'}
[작성내용]: ${p.content}
[교사코멘트]: ${p.eval_comment || '없음'}`).join('\n\n---\n');

        const contextData = `
[분석 대상 학생]: ${studentName}
[활동 기록 데이터]:
${activitiesInfo}`;

        if (promptTemplate && promptTemplate.trim()) {
            return `${promptTemplate.trim()}\n\n${contextData.trim()}`;
        }

        return `학생 '${studentName}'의 활동 기록들을 바탕으로 학교생활기록부용 성취 수준 분석 리포트를 200자 내외 평어체(~함.)로 작성해줘.\n\n${contextData.trim()}`;
    };

    // 5. 단일 생성
    const generateCombinedReview = async (studentData) => {
        setIsGenerating(prev => ({ ...prev, [studentData.student.id]: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profileData } = await supabase
                .from('profiles')
                .select('gemini_api_key')
                .eq('id', user?.id)
                .single();

            const prompt = getStudentPrompt(studentData.student.name, studentData.posts);
            const review = await callAI({ prompt, type: 'AI_FEEDBACK' });

            if (review) {
                setStudentPosts(prev => prev.map(s =>
                    s.student.id === studentData.student.id ? { ...s, ai_synthesis: review } : s
                ));
                saveToPersistence(studentData.student.id, review);
            }
        } catch (err) {
            console.error('단일 생성 오류:', err);
            alert(`생성 중 오류 발생: ${err.message}`);
        } finally {
            setIsGenerating(prev => ({ ...prev, [studentData.student.id]: false }));
        }
    };

    // 6. 일괄 생성 및 재생성
    const handleBatchGenerate = async () => {
        if (studentPosts.length === 0) return;

        const isRegen = generatedCount > 0;
        const msg = isRegen
            ? '기존 내용은 삭제되고 재생성됩니다. 진행하시겠습니까?'
            : '학급 전체 학생의 통합 리포트를 일괄 생성하시겠습니까?';

        if (!confirm(msg)) return;

        setBatchLoading(true);
        setBatchProgress({ current: 0, total: studentPosts.length });

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profileData } = await supabase
                .from('profiles')
                .select('gemini_api_key')
                .eq('id', user?.id)
                .single();

            const userApiKey = profileData?.gemini_api_key;

            for (let i = 0; i < studentPosts.length; i++) {
                const data = studentPosts[i];

                if (!isRegen && data.ai_synthesis) {
                    setBatchProgress(prev => ({ ...prev, current: i + 1 }));
                    continue;
                }
                try {
                    const prompt = getStudentPrompt(data.student.name, data.posts);
                    const review = await callAI({ prompt, type: 'AI_FEEDBACK' });
                    if (review) {
                        setStudentPosts(prev => prev.map((s, idx) =>
                            idx === i ? { ...s, ai_synthesis: review } : s
                        ));
                        saveToPersistence(data.student.id, review);
                    }
                    // ✅ 진행 상태 업데이트 추가
                    setBatchProgress(prev => ({ ...prev, current: i + 1 }));
                    // ✅ AI API 과부하 방지를 위한 짧은 휴식 추가
                    await new Promise(r => setTimeout(r, 800));
                } catch (err) {
                    console.error(`학생 ${data.student.name} 처리 중 오류:`, err);
                }
            }
        } catch (err) {
            console.error('일괄 처리 초기화 오류:', err);
            alert('일괄 처리를 시작하는 도중 오류가 발생했습니다.');
        } finally {
            setBatchLoading(false);

            // ✅ 상태 업데이트가 반영될 시간을 준 뒤 저장 함수 호출
            setTimeout(async () => {
                // 저장 함수 내 로직을 보강하여 현재 렌더링된 최신 데이터를 가져오도록 합니다.
                await saveGenerationHistory();
            }, 1000);

            alert(isRegen ? '일괄 AI 쫑알이 재생성이 완료되었습니다! ✨' : '일괄 AI쫑알이 생성이 완료되었습니다! ✨');
        }
    };

    // 저장된 텍스트에서 학생별 분석 결과 파싱
    const parseHistoryContent = (content) => {
        const results = {};
        const sections = content.split('\n\n---\n\n');
        sections.forEach(section => {
            const match = section.match(/^\[(.*?)\]\n([\s\S]*)$/);
            if (match) {
                const [_, name, synthesis] = match;
                results[name] = synthesis;
            }
        });
        return results;
    };

    // 생성 이력 저장
    const saveGenerationHistory = async () => {
        if (!teacherId || selectedMissionIds.length === 0) return;

        try {
            // ✅ 현재 studentPosts 상태에서 ai_synthesis가 있는 것들만 취합
            // studentPosts 자체는 최신 상태를 유지하므로 여기서 직접 참조합니다.
            const currentResults = studentPosts.filter(s => s.ai_synthesis);

            if (currentResults.length === 0) {
                console.log('저장할 분석 결과가 없습니다.');
                return;
            }

            // 1. 학급 전체 이력용 (기존 유지)
            const combinedContent = currentResults
                .map(s => `[${s.student.name}]\n${s.ai_synthesis}`)
                .join('\n\n---\n\n');

            await supabase
                .from('student_records')
                .insert({
                    class_id: activeClass.id,
                    teacher_id: teacherId,
                    record_type: 'ai_comment',
                    content: combinedContent,
                    mission_ids: selectedMissionIds,
                    activity_count: currentResults.length
                });

            // 2. ✅ 개별 학생별 기록 저장 (학생 명단에서 조회하기 위함)
            const individualRecords = currentResults.map(s => ({
                student_id: s.student.id,
                class_id: activeClass.id,
                teacher_id: teacherId,
                record_type: 'ai_comment',
                content: s.ai_synthesis,
                mission_ids: selectedMissionIds,
                activity_count: s.posts.length
            }));

            const { error: indError } = await supabase
                .from('student_records')
                .insert(individualRecords);

            if (indError) throw indError;

            await loadGenerationHistory(activeClass.id);
        } catch (err) {
            console.error('생성 이력 저장 실패:', err);
        }
    };

    // 7. 엑셀 내보내기
    const exportToExcel = () => {
        const data = studentPosts.map(s => {
            const achievements = s.posts.map(p => `${p.writing_missions.title}: ${p.final_eval || p.initial_eval || '-'}점`).join(', ');
            return {
                '이름': s.student.name,
                '참여 활동수': s.posts.length,
                '활동별 성취': achievements,
                '통합 생기부 코멘트': s.ai_synthesis || '(미생성)'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "종합 리포트");

        // 컬럼 너비 설정
        worksheet['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 40 }, { wch: 60 }];

        XLSX.writeFile(workbook, `통합리포트_${activeClass.name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // 8. 구글 문서용 클립보드 복사
    const copyToDocs = () => {
        const text = studentPosts.map(s => {
            return `[${s.student.name}]\n- 활동건수: ${s.posts.length}건\n- 종합 분석: ${s.ai_synthesis || '미생성'}\n`;
        }).join('\n---\n\n');

        navigator.clipboard.writeText(text);
        alert('전체 학생의 종합 분석 결과가 클립보드에 복사되었습니다! 📋\n구글 문서나 한글(HWP) 등에 붙여넣어 사용하세요.');
    };

    const toggleTag = (tag) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    // 생성된 완료 수 계산
    const generatedCount = studentPosts.filter(s => s.ai_synthesis).length;

    return (
        <div style={{ width: '100%', boxSizing: 'border-box', padding: isMobile ? '0' : '10px 0' }}>
            <header style={{
                marginBottom: '32px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'white',
                padding: '24px 32px',
                borderRadius: '24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
            }}>
                <div>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.6rem', fontWeight: '950', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.8rem' }}>🐣</span> AI쫑알이 <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#6366F1', background: '#EEF2FF', padding: '4px 10px', borderRadius: '10px' }}>생기부 도움자료</span>
                    </h2>
                    <p style={{ color: '#64748B', fontSize: '0.95rem', margin: 0 }}>활동 기록을 연결하여 나만의 교육과정 성취 기준 리포트를 완성하세요.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <Button variant="outline" size="sm" onClick={exportToExcel} style={{ borderRadius: '12px', borderColor: '#10B981', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                        <FileDown size={14} /> 엑셀 저장
                    </Button>
                    <Button variant="outline" size="sm" onClick={copyToDocs} style={{ borderRadius: '12px', borderColor: '#3B82F6', color: '#2563EB', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                        <FileText size={14} /> 클립보드 복사
                    </Button>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '24px', alignItems: 'start' }}>
                {/* 필터 영역 (슬림화) */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 'bold', marginBottom: '12px' }}>🏷️ 태그 필터</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {allTags.map(tag => (
                                <button key={tag} onClick={() => toggleTag(tag)} style={{ padding: '6px 12px', borderRadius: '14px', border: 'none', background: selectedTags.includes(tag) ? '#6366F1' : '#F1F5F9', color: selectedTags.includes(tag) ? 'white' : '#64748B', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 'bold', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>🎯 대상 미션 선택 ({selectedMissionIds.length})</span>
                            <span onClick={() => setSelectedMissionIds([])} style={{ cursor: 'pointer', color: '#3B82F6', fontWeight: 'normal' }}>초기화</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                            {filteredMissions.map(m => (
                                <div key={m.id} onClick={() => toggleMissionSelection(m.id)} style={{ padding: '10px 14px', background: selectedMissionIds.includes(m.id) ? '#EEF2FF' : '#F8FAFC', borderRadius: '12px', border: selectedMissionIds.includes(m.id) ? '1px solid #6366F1' : '1px solid #E2E8F0', cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {selectedMissionIds.includes(m.id) ? <CheckCircle2 size={16} color="#6366F1" /> : <Circle size={16} color="#CBD5E1" />}
                                    <span style={{ fontWeight: selectedMissionIds.includes(m.id) ? 'bold' : 'normal', color: selectedMissionIds.includes(m.id) ? '#312E81' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 생성 이력 */}
                    {generationHistory.length > 0 && (
                        <div style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 'bold', marginBottom: '12px' }}>📚 생성 이력 ({generationHistory.length}건)</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                                {generationHistory.map(record => {
                                    const missionTitles = record.mission_ids?.map(id => {
                                        const mission = missions.find(m => m.id === id);
                                        return mission?.title || '미션';
                                    }).join(', ') || '정보 없음';

                                    return (
                                        <div
                                            key={record.id}
                                            style={{
                                                padding: '12px',
                                                background: '#F8FAFC',
                                                borderRadius: '12px',
                                                border: '1px solid #E2E8F0',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#EEF2FF'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#F8FAFC'}
                                            onClick={() => {
                                                // 1. 해당 미션들을 선택
                                                setSelectedMissionIds(record.mission_ids || []);

                                                // 2. 저장된 결과 파싱하여 학생 목록에 적용
                                                const parsedResults = parseHistoryContent(record.content);
                                                setStudentPosts(prev => prev.map(s => ({
                                                    ...s,
                                                    ai_synthesis: parsedResults[s.student.name] || s.ai_synthesis
                                                })));

                                                alert(`${new Date(record.created_at).toLocaleString()}에 생성된 기록을 불러왔습니다.`);
                                            }}
                                        >
                                            <div style={{ fontSize: '0.7rem', color: '#6366F1', fontWeight: 'bold', marginBottom: '4px' }}>
                                                {new Date(record.created_at).toLocaleString('ko-KR')}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '4px' }}>
                                                {record.activity_count}명 분석 완료
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {missionTitles}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </aside>

                {/* 메인 리스트 영역 (클린 테이블 UI) */}
                <main>
                    {selectedMissionIds.length === 0 ? (
                        <div style={{ padding: '80px', textAlign: 'center', background: '#F8FAFC', borderRadius: '24px', border: '2px dashed #E2E8F0' }}>
                            <RefreshCw size={48} style={{ color: '#CBD5E1', marginBottom: '16px' }} />
                            <h3 style={{ margin: 0, color: '#64748B' }}>미션을 선택하여 분석을 시작하세요</h3>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* 상황바 */}
                            <div style={{ background: '#F1F5F9', padding: '16px 24px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 'bold' }}>
                                    총 <span style={{ color: '#1E293B' }}>{studentPosts.length}명</span>의 학생 중 <span style={{ color: '#6366F1' }}>{generatedCount}명</span> 분석 완료
                                </div>
                                <Button
                                    size="sm"
                                    onClick={handleBatchGenerate}
                                    disabled={batchLoading || studentPosts.length === 0}
                                    style={{
                                        borderRadius: '12px',
                                        fontWeight: 'bold',
                                        background: generatedCount > 0 ? '#F59E0B' : '#6366F1'
                                    }}
                                >
                                    {batchLoading
                                        ? `작업 중... (${batchProgress.current}/${batchProgress.total})`
                                        : (generatedCount > 0 ? '🔄 일괄 AI 쫑알이 재생성' : '🪄 일괄 AI쫑알이 생성')}
                                </Button>
                            </div>

                            {/* 리스트 헤더 - 더 타이트하게 조정 */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '80px minmax(100px, 1fr) 100px 100px 120px 50px',
                                padding: '12px 24px',
                                background: '#F8F9FA',
                                borderRadius: '16px 16px 0 0',
                                borderBottom: '1px solid #E2E8F0',
                                fontSize: '0.8rem',
                                color: '#94A3B8',
                                fontWeight: 'bold'
                            }}>
                                <div style={{ textAlign: 'center' }}>번호</div>
                                <div>학생 이름</div>
                                <div style={{ textAlign: 'center' }}>참여 활동</div>
                                <div style={{ textAlign: 'center' }}>분석 상태</div>
                                <div style={{ textAlign: 'center' }}>AI 분석</div>
                                <div></div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#F1F5F9' }}>
                                {studentPosts.map((data, idx) => (
                                    <div key={data.student.id} style={{ background: 'white', borderBottom: '1px solid #F1F5F9' }}>
                                        <div
                                            onClick={() => setExpandedStudentId(expandedStudentId === data.student.id ? null : data.student.id)}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '80px minmax(100px, 1fr) 100px 100px 120px 50px',
                                                padding: '16px 24px',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                background: expandedStudentId === data.student.id ? '#F8F9FF' : 'white'
                                            }}
                                        >
                                            <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem', fontWeight: '600' }}>{idx + 1}</div>
                                            <div style={{ fontWeight: '900', color: '#1E293B', fontSize: '1rem' }}>{data.student.name}</div>
                                            <div style={{ textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: '700', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px' }}>{data.posts.length}건</span>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                {data.ai_synthesis ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#059669', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                        <CheckCircle2 size={14} /> 완료
                                                    </div>
                                                ) : (
                                                    <div style={{ color: '#94A3B8', fontSize: '0.8rem' }}>미완료</div>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); generateCombinedReview(data); }}
                                                    disabled={isGenerating[data.student.id]}
                                                    style={{
                                                        border: '1px solid #6366F1',
                                                        background: isGenerating[data.student.id] ? '#F1F3FF' : 'white',
                                                        color: '#6366F1',
                                                        padding: '6px 16px',
                                                        borderRadius: '10px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={e => { if (!isGenerating[data.student.id]) { e.currentTarget.style.background = '#6366F1'; e.currentTarget.style.color = 'white'; } }}
                                                    onMouseLeave={e => { if (!isGenerating[data.student.id]) { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#6366F1'; } }}
                                                >
                                                    {isGenerating[data.student.id] ? '분석 중...' : '생성하기'}
                                                </button>
                                            </div>
                                            <div style={{ textAlign: 'center', color: '#CBD5E1' }}>
                                                {expandedStudentId === data.student.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {expandedStudentId === data.student.id && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    style={{ overflow: 'hidden', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}
                                                >
                                                    <div style={{ padding: '24px 32px' }}>
                                                        <div style={{
                                                            display: 'flex',
                                                            flexDirection: isMobile ? 'column' : 'row',
                                                            gap: '24px',
                                                            alignItems: 'start'
                                                        }}>
                                                            {/* 수합 활동 요약 (슬림화) */}
                                                            <div style={{ width: isMobile ? '100%' : '260px', flexShrink: 0 }}>
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ fontSize: '1rem' }}>🔗</span> 참여 미션 ({data.posts.length})
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    {data.posts.map(p => (
                                                                        <div key={p.id} style={{
                                                                            background: 'white',
                                                                            padding: '10px 14px',
                                                                            borderRadius: '10px',
                                                                            border: '1px solid #E2E8F0',
                                                                            fontSize: '0.8rem',
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            gap: '8px'
                                                                        }}>
                                                                            <span style={{ fontWeight: 'bold', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.writing_missions.title}</span>
                                                                            <span style={{ fontSize: '0.75rem', color: '#3B82F6', fontWeight: '900', flexShrink: 0 }}>{p.final_eval || p.initial_eval || '-'}점</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            {/* AI 분석 결과 (메인 영역) */}
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6366F1' }}>✨ 통합 생기부 문구 분석 결과</div>
                                                                    {data.ai_synthesis && (
                                                                        <button
                                                                            onClick={() => { navigator.clipboard.writeText(data.ai_synthesis); alert('복사되었습니다! 📋'); }}
                                                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3B82F6', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}
                                                                        >
                                                                            <Copy size={14} /> 복사
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div style={{
                                                                    background: '#FFFBEB',
                                                                    padding: '24px',
                                                                    borderRadius: '18px',
                                                                    border: '1px solid #FEF3C7',
                                                                    fontSize: '1.05rem',
                                                                    lineHeight: '1.75',
                                                                    color: '#451A03',
                                                                    whiteSpace: 'pre-wrap',
                                                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
                                                                }}>
                                                                    {data.ai_synthesis || (
                                                                        <span style={{ color: '#D97706', fontStyle: 'italic' }}>상단의 '분석' 버튼을 눌러 결과물을 생성하세요.</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                            <footer style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '0.85rem' }}>
                                * 생성된 분석 결과는 선택된 미션 조합별로 이 브라우저에 안전하게 저장됩니다.
                            </footer>
                        </div>
                    )}
                </main>
            </div>

            {/* AI 일괄 생성 진행 모달 */}
            <BulkAIProgressModal isGenerating={batchLoading} progress={batchProgress} />
        </div>
    );
};

export default ActivityReport;
