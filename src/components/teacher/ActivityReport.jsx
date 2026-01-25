import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import Card from '../common/Card';
import { useEvaluation } from '../../hooks/useEvaluation';
import { callGemini } from '../../lib/openai';
import * as XLSX from 'xlsx';
import { FileDown, FileText, CheckCircle2, Circle, RefreshCw, ChevronDown, ChevronUp, Copy, ExternalLink } from 'lucide-react';

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

    // 5. 단일 생성
    const generateCombinedReview = async (studentData) => {
        setIsGenerating(prev => ({ ...prev, [studentData.student.id]: true }));
        try {
            const activitiesInfo = studentData.posts.map(p => `
                [미션명]: ${p.writing_missions.title}
                [성취준위]: ${p.final_eval || p.initial_eval || '평가 전'}
                [작성내용]: ${p.content}
                [교사코멘트]: ${p.eval_comment || '없음'}
            `).join('\n---\n');

            let prompt = '';
            if (promptTemplate && promptTemplate.trim()) {
                prompt = `${promptTemplate}\n\n[대상 학생 활동 데이터]\n${activitiesInfo}`;
            } else {
                prompt = `학생 '${studentData.student.name}'의 여러 활동 데이터:\n${activitiesInfo}\n\n위 활동들을 통합하여 생기부용 성장 분석 코멘트를 200자 이내 평어체(~함.)로 작성해줘.`;
            }

            const review = await callGemini(prompt);

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

    // 6. 일괄 생성
    const handleBatchGenerate = async () => {
        if (studentPosts.length === 0) return;
        if (!confirm('학급 전체 학생의 통합 리포트를 일괄 생성하시겠습니까? (저장된 결과는 유지됩니다)')) return;

        setBatchLoading(true);
        setBatchProgress({ current: 0, total: studentPosts.length });

        for (let i = 0; i < studentPosts.length; i++) {
            const data = studentPosts[i];
            if (data.ai_synthesis) {
                setBatchProgress(prev => ({ ...prev, current: i + 1 }));
                continue;
            }

            try {
                const activitiesInfo = data.posts.map(p => `
                    [미션]: ${p.writing_missions.title} 
                    [내용]: ${p.content.substring(0, 300)}...
                    [평가]: ${p.final_eval || p.initial_eval || '-'}
                `).join('\n');

                let prompt = '';
                if (promptTemplate && promptTemplate.trim()) {
                    prompt = `${promptTemplate}\n\n[학생 명단: ${data.student.name}]\n[활동들]\n${activitiesInfo}`;
                } else {
                    prompt = `학생 '${data.student.name}'의 활동들:\n${activitiesInfo}\n\n생기부용 통합 총평 180자 내외 평어체 작성:`;
                }

                const review = await callGemini(prompt);
                if (review) {
                    setStudentPosts(prev => prev.map((s, idx) =>
                        idx === i ? { ...s, ai_synthesis: review } : s
                    ));
                    saveToPersistence(data.student.id, review);
                }
                setBatchProgress(prev => ({ ...prev, current: i + 1 }));
                await new Promise(r => setTimeout(r, 800)); // Rate limiting safety
            } catch (err) {
                console.error(`학생 ${data.student.name} 처리 중 오류:`, err);
            }
        }
        setBatchLoading(false);
        alert('일괄 생성이 완료되었습니다! ✨');
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
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '950', color: '#1E293B' }}>🔗 AI쫑알이 (생기부 도움자료)</h2>
                    <p style={{ color: '#64748B', fontSize: '1.05rem', margin: 0 }}>여러 미션을 연결하여 학기 말 생활지도기록부 작성을 돕는 기초 자료를 완성합니다.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="outline" size="sm" onClick={exportToExcel} style={{ borderColor: '#10B981', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileDown size={16} /> 엑셀 다운로드
                    </Button>
                    <Button variant="outline" size="sm" onClick={copyToDocs} style={{ borderColor: '#3B82F6', color: '#2563EB', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileText size={16} /> 구글 문서용 복사
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
                                <Button size="sm" onClick={handleBatchGenerate} disabled={batchLoading || studentPosts.length === 0} style={{ borderRadius: '10px', fontWeight: 'bold' }}>
                                    {batchLoading ? `생성 중... (${batchProgress.current}/${batchProgress.total})` : '🪄 일괄 생성'}
                                </Button>
                            </div>

                            {/* 리스트 헤더 */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(120px, 1fr) 100px 120px 100px 50px',
                                padding: '12px 24px',
                                background: 'white',
                                borderRadius: '16px 16px 0 0',
                                borderBottom: '2px solid #F1F5F9',
                                fontSize: '0.85rem',
                                color: '#94A3B8',
                                fontWeight: 'bold'
                            }}>
                                <div>학생 이름</div>
                                <div style={{ textAlign: 'center' }}>활동 수</div>
                                <div style={{ textAlign: 'center' }}>분석 상태</div>
                                <div style={{ textAlign: 'right' }}>관리</div>
                                <div></div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#F1F5F9' }}>
                                {studentPosts.map(data => (
                                    <div key={data.student.id} style={{ background: 'white' }}>
                                        <div
                                            onClick={() => setExpandedStudentId(expandedStudentId === data.student.id ? null : data.student.id)}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(120px, 1fr) 100px 120px 100px 50px',
                                                padding: '20px 24px',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s',
                                                background: expandedStudentId === data.student.id ? '#F8F9FF' : 'white'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = expandedStudentId === data.student.id ? '#F8F9FF' : 'white'}
                                        >
                                            <div style={{ fontWeight: '900', color: '#1E293B', fontSize: '1rem' }}>{data.student.name}</div>
                                            <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#64748B' }}>{data.posts.length}건</div>
                                            <div style={{ textAlign: 'center' }}>
                                                {data.ai_synthesis ? (
                                                    <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '8px', background: '#ECFDF5', color: '#059669', fontWeight: 'bold' }}>분석 완료</span>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '8px', background: '#F1F5F9', color: '#94A3B8' }}>대기 중</span>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); generateCombinedReview(data); }}
                                                    disabled={isGenerating[data.student.id]}
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366F1', fontSize: '0.85rem', fontWeight: 'bold' }}
                                                >
                                                    {isGenerating[data.student.id] ? '...' : '분석'}
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
        </div>
    );
};

export default ActivityReport;
