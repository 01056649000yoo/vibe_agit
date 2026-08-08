import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { readLocalStorageJson } from '../../lib/browserStorage';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import { callAI } from '../../lib/openai';
import { exportObjectsToExcel } from '../../lib/excelExport';
// XLSX 생성기는 내보내기 버튼을 누를 때 공용 유틸리티에서 지연 로드한다.
import { FileDown, FileText, CheckCircle2, Circle, RefreshCw, ChevronDown, ChevronUp, Copy, ExternalLink, Trash2, X } from 'lucide-react';
import BulkAIProgressModal from './BulkAIProgressModal';
import PromptRuleButton from './PromptRuleButton';
import RubricSettings, { createDefaultEvaluationRubric } from '../../modules/writing/evaluation/RubricSettings';
import MissionEvaluationEntry from '../../modules/writing/evaluation/MissionEvaluationEntry';
import {
    formatKoreanGradeBand,
    getCurriculumGradeBand,
    getRecommendedStandardCodesForMission,
    resolveKoreanStandards
} from '../../modules/writing/evaluation/koreanAchievementStandards';

/**
 * 역할: 선생님 - 글쓰기 평가 덧붙임 문장 작성 및 내보내기 📊
 */
const ActivityReport = ({ activeClass, isMobile, promptTemplate }) => {
    // 규칙 보관함에서 방금 적용한 내용을 즉시 반영하기 위한 덮어쓰기 값.
    // (promptTemplate 은 대시보드가 마운트될 때 읽어온 값이라 바로 갱신되지 않는다)
    const [livePromptTemplate, setLivePromptTemplate] = useState(null);
    const effectivePrompt = livePromptTemplate ?? promptTemplate;
    const [allTags, setAllTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [missions, setMissions] = useState([]);
    const [selectedMissionIds, setSelectedMissionIds] = useState([]);
    const [studentPosts, setStudentPosts] = useState([]);
    const [, setLoading] = useState(false);
    const [, setLoadingDetails] = useState(false);
    const [isGenerating, setIsGenerating] = useState({});
    const [batchLoading, setBatchLoading] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [expandedStudentId, setExpandedStudentId] = useState(null);
    const [generationHistory, setGenerationHistory] = useState([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [mainListLimit, setMainListLimit] = useState(20); // [성능 최적화] 메인 리스트 지연 렌더링
    const ITEMS_PER_PAGE = 5;
    const [teacherId, setTeacherId] = useState(null);
    const [rubricMission, setRubricMission] = useState(null);
    const [rubricDraft, setRubricDraft] = useState(null);
    const [evaluationMission, setEvaluationMission] = useState(null);
    const [dataRefreshToken, setDataRefreshToken] = useState(0);
    const [evaluationGaps, setEvaluationGaps] = useState({
        unevaluatedSubmissions: [],
        missingSubmissions: []
    });

    // 로컬 스토리지 키 생성 (해당 학급 + 선택된 미션 조합별 유니크 키)
    const persistenceKey = useMemo(() => {
        if (!activeClass?.id || selectedMissionIds.length === 0) return null;
        const sortedIds = [...selectedMissionIds].sort().join(',');
        return `vibe_korean_writing_append_v3_${activeClass.id}_${sortedIds}`;
    }, [activeClass?.id, selectedMissionIds]);

    // 1. 초기 데이터 로드 (미션 목록)
    const fetchData = useCallback(async () => {
        if (!activeClass?.id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('id, title, genre, mission_type, input_template, tags, is_archived, evaluation_rubric')
                .eq('class_id', activeClass.id)
                // .or('is_archived.eq.false,is_archived.is.null') // 보관함 미션도 선택 가능하도록 필터 제거
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
            .select('id, content, created_at, record_type, mission_ids, activity_count, tags')
            .eq('class_id', classId)
            .eq('record_type', 'ai_comment')
            .is('student_id', null)
            .order('created_at', { ascending: false });

        if (!error && data) {
            setGenerationHistory(data);
        } else if (error) {
            console.error('생성 이력 로드 실패:', error);
        }
    };

    // [신규] 생성 이력 삭제
    const handleDeleteHistory = async (e, recordId) => {
        e.stopPropagation(); // 부모 클릭 이벤트(불러오기) 방지
        if (!window.confirm('🗑️ 이 기록을 삭제하시겠습니까? (학생별 기록은 보존됩니다)')) return;

        try {
            const { error } = await supabase
                .from('student_records')
                .delete()
                .eq('id', recordId);

            if (error) throw error;
            setGenerationHistory(prev => prev.filter(r => r.id !== recordId));
        } catch (err) {
            console.error('기록 삭제 실패:', err);
            alert('삭제에 실패했습니다.');
        }
    };

    const selectedMissions = useMemo(
        () => missions.filter((mission) => selectedMissionIds.includes(mission.id)),
        [missions, selectedMissionIds]
    );

    const missionsWithoutStandards = useMemo(() => selectedMissions.filter((mission) => (
        !mission.evaluation_rubric?.use_rubric
        || !getCurriculumGradeBand(mission.evaluation_rubric?.curriculum)
        || resolveKoreanStandards(
            mission.evaluation_rubric?.curriculum?.achievement_standard_codes,
            mission.evaluation_rubric?.curriculum
        ).length === 0
    )), [selectedMissions]);

    const openRubricSettings = (mission) => {
        setRubricMission(mission);
        setRubricDraft(createDefaultEvaluationRubric(mission.evaluation_rubric));
    };

    const handleSaveMissionRubric = async () => {
        if (!rubricMission || !rubricDraft) return;

        const standards = resolveKoreanStandards(
            rubricDraft.curriculum?.achievement_standard_codes,
            rubricDraft.curriculum
        );
        if (!rubricDraft.use_rubric || !getCurriculumGradeBand(rubricDraft.curriculum) || standards.length === 0) {
            alert('평가 루브릭을 켜고 학년군과 관련 국어 성취기준을 1개 이상 선택해주세요.');
            return;
        }

        const { error } = await supabase
            .from('writing_missions')
            .update({ evaluation_rubric: rubricDraft })
            .eq('id', rubricMission.id);

        if (error) {
            console.error('평가·성취기준 저장 실패:', error.message);
            alert('평가 설정을 저장하지 못했습니다.');
            return;
        }

        setMissions((current) => current.map((mission) => (
            mission.id === rubricMission.id
                ? { ...mission, evaluation_rubric: rubricDraft }
                : mission
        )));
        if (persistenceKey) localStorage.removeItem(persistenceKey);
        setStudentPosts((current) => current.map((student) => ({ ...student, ai_synthesis: '' })));
        setDataRefreshToken((current) => current + 1);
        setRubricMission(null);
        setRubricDraft(null);
        alert('성취기준과 평가 루브릭을 저장했습니다.');
    };

    const openEvaluationEntry = (mission) => {
        const standards = resolveKoreanStandards(
            mission.evaluation_rubric?.curriculum?.achievement_standard_codes,
            mission.evaluation_rubric?.curriculum
        );
        if (
            !mission.evaluation_rubric?.use_rubric
            || !getCurriculumGradeBand(mission.evaluation_rubric?.curriculum)
            || standards.length === 0
        ) {
            alert('먼저 해당 글의 학년군과 관련 국어 성취기준을 선택해주세요.');
            openRubricSettings(mission);
            return;
        }
        setEvaluationMission(mission);
    };

    const handleEvaluationSaved = () => {
        if (persistenceKey) localStorage.removeItem(persistenceKey);
        setDataRefreshToken((current) => current + 1);
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

    const pendingHistoryRef = React.useRef(null);

    useEffect(() => {
        const loadAndSynthesize = async () => {
            if (selectedMissionIds.length === 0) {
                setStudentPosts([]);
                setEvaluationGaps({ unevaluatedSubmissions: [], missingSubmissions: [] });
                return;
            }
            setLoadingDetails(true);
            try {
                // 학생 목록과 제출 글을 학급 범위 RPC로 읽는다. 제출 글은 200개씩 받아
                // 1,000개에서 조용히 잘리던 문제 없이 필요한 만큼 이어서 가져온다.
                let nextOffset = 0;
                let classStudents = [];
                const postsData = [];
                do {
                    const { data: workspace, error: workspaceError } = await supabase.rpc(
                        'get_teacher_activity_report_workspace_v1',
                        {
                            p_class_id: activeClass.id,
                            p_mission_ids: selectedMissionIds,
                            p_limit: 200,
                            p_offset: nextOffset
                        }
                    );
                    if (workspaceError) throw workspaceError;
                    if (Number(workspace?.version) !== 1) throw new Error('지원하지 않는 활동 보고서 응답입니다.');
                    if (nextOffset === 0) classStudents = workspace.students || [];
                    postsData.push(...(workspace.posts || []));
                    nextOffset = workspace.next_offset;
                } while (nextOffset != null);

                // 로컬 저장소에서 기존 생성 결과 가져오기
                let savedResults = persistenceKey
                    ? readLocalStorageJson(persistenceKey, {})
                    : {};

                // [추가] 불러오기 예약된 이력이 있다면 덮어쓰기 (Ref 사용으로 재렌더링 방지)
                if (pendingHistoryRef.current) {
                    const parsedResults = parseHistoryContent(pendingHistoryRef.current.content);
                    Object.keys(parsedResults).forEach(name => {
                        const student = classStudents.find(s => s.name === name);
                        if (student) {
                            Reflect.set(savedResults, student.id, Reflect.get(parsedResults, name));
                        }
                    });

                    // 불러온 이력을 로컬 스토리지에도 즉시 저장
                    if (persistenceKey) {
                        localStorage.setItem(persistenceKey, JSON.stringify(savedResults));
                    }

                    pendingHistoryRef.current = null; // 사용 후 초기화
                }

                // 평어는 보관 여부와 관계없이 평가 결과가 있는 글만 근거로 사용한다.
                const missionMap = new Map(selectedMissions.map((mission) => [mission.id, mission]));
                const submittedPosts = (postsData || []).map((post) => ({
                    ...post,
                    writing_missions: missionMap.get(post.mission_id) || null
                }));
                const evaluablePosts = submittedPosts.filter((post) => (
                    post.initial_eval !== null || post.final_eval !== null
                ));
                const unevaluatedSubmissions = submittedPosts
                    .filter((post) => post.initial_eval === null && post.final_eval === null)
                    .map((post) => ({
                        studentId: post.student_id,
                        missionId: post.mission_id,
                        missionTitle: missionMap.get(post.mission_id)?.title || post.writing_missions?.title || '미션'
                    }));
                const submittedKeys = new Set(
                    submittedPosts.map((post) => `${post.student_id}:${post.mission_id}`)
                );
                const missingSubmissions = [];
                classStudents.forEach((student) => {
                    selectedMissionIds.forEach((missionId) => {
                        if (!submittedKeys.has(`${student.id}:${missionId}`)) {
                            missingSubmissions.push({
                                studentId: student.id,
                                studentName: student.name,
                                missionId,
                                missionTitle: missionMap.get(missionId)?.title || '미션'
                            });
                        }
                    });
                });
                setEvaluationGaps({ unevaluatedSubmissions, missingSubmissions });

                // 학생 ID별로 평가 완료 포스트 그룹화
                const postMap = evaluablePosts.reduce((acc, p) => {
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

                // 게시물이 하나라도 있는 학생만 보여주거나, 전체를 보여줌
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
    }, [activeClass.id, dataRefreshToken, persistenceKey, selectedMissionIds, selectedMissions]);

    // 4. 저장 로직 (로컬 스토리지)
    const saveToPersistence = (studentId, synthesis) => {
        if (!persistenceKey) return;
        const data = readLocalStorageJson(persistenceKey, {});
        Reflect.set(data, studentId, synthesis);
        localStorage.setItem(persistenceKey, JSON.stringify(data));
    };

    // AI에게 보낼 글쓰기 평가 데이터 및 덧붙임 문장 프롬프트 구성 (공통 사용)
    const getWritingAppendPrompt = (posts) => {
        const activitiesInfo = posts.map(p => {
            const rubric = p.writing_missions?.evaluation_rubric || {};
            const score = p.final_eval ?? p.initial_eval;
            const level = rubric.levels?.find((item) => item.score === score);
            const standards = resolveKoreanStandards(
                rubric.curriculum?.achievement_standard_codes,
                rubric.curriculum
            );
            const standardsText = standards.length > 0
                ? standards.map((standard) => `[${standard.code}] ${standard.description}`).join('\n')
                : '연결된 국어 성취기준 없음';

            return `
[미션명]: ${p.writing_missions?.title || '정보없음'}
[적용 학년군]: ${formatKoreanGradeBand(rubric.curriculum)}
[국어 성취기준]:
${standardsText}
[교사 평가]: ${score ? `${level?.label || `${score}점`} (${score}점)` : '평가 전'}
[작성내용]: ${p.content}
[교사코멘트]: ${p.eval_comment || '없음'}`;
        }).join('\n\n---\n');

        const contextData = `
[글쓰기 평가 자료]:
${activitiesInfo}`;

        const outputRules = `[최우선 출력 규칙]
- 결과는 교사가 이미 작성한 국어 교과 평어의 앞이나 뒤에 그대로 붙일 수 있는 '글쓰기 평가 덧붙임 문장'임.
- 제목, 번호, 해설, 인사말 없이 완성된 문장 1~2개만 출력할 것.
- 학생 이름 및 '학생', '이 학생은', '해당 학생은'이라는 표현을 쓰지 말 것.
- '또한', '그리고', '한편'처럼 앞 문맥에 의존하는 접속어로 시작하지 말고, 확인된 글쓰기 능력이나 수행 모습으로 바로 시작할 것.
- 성취기준 코드는 쓰지 말되, 선택된 성취기준의 핵심 능력과 교사의 평가 수준·의견을 자연스럽게 반영할 것.
- 실제 글과 교사 평가에서 확인되지 않은 능력은 추측하지 말 것.
- 다른 교과 평어 문장과 자연스럽게 이어지도록 90~140자 안팎의 관찰 중심 평어체(~함, ~임)로 끝낼 것.
- 문장 예시: 대상의 특징이 잘 드러나도록 알맞은 내용을 선정하고, 설명 순서를 고려하여 글을 체계적으로 작성함.`;

        if (effectivePrompt && effectivePrompt.trim()) {
            return `${effectivePrompt.trim()}\n\n${contextData.trim()}\n\n${outputRules}`;
        }

        return `아래 글쓰기 평가 자료를 바탕으로 선택된 2022 개정 국어과 성취기준을 반영한 글쓰기 평가 덧붙임 문장을 작성해줘.\n\n${contextData.trim()}\n\n${outputRules}`;
    };

    const validateGenerationReadiness = (studentId = null) => {
        if (missionsWithoutStandards.length > 0) {
            const mission = missionsWithoutStandards[0];
            alert(`"${mission.title}" 미션의 관련 국어 성취기준을 먼저 선택해주세요.`);
            openRubricSettings(mission);
            return false;
        }

        const unevaluated = evaluationGaps.unevaluatedSubmissions.filter((item) => (
            !studentId || item.studentId === studentId
        ));
        if (unevaluated.length > 0) {
            const mission = missions.find((item) => item.id === unevaluated[0].missionId);
            alert('평가결과가 없습니다. 평가결과를 입력해주세요.');
            if (mission) openEvaluationEntry(mission);
            return false;
        }

        const missing = evaluationGaps.missingSubmissions.filter((item) => (
            !studentId || item.studentId === studentId
        ));
        if (missing.length > 0) {
            const studentNames = [...new Set(missing.map((item) => item.studentName))];
            const visibleNames = studentNames.slice(0, 8).join(', ');
            const extraCount = Math.max(0, studentNames.length - 8);
            const nameSummary = `${visibleNames}${extraCount > 0 ? ` 외 ${extraCount}명` : ''}`;
            const shouldExclude = window.confirm(
                `선택한 미션에 제출 글이 없는 학생이 있습니다: ${nameSummary}\n\n`
                + '결석 등으로 평가 대상이 아닌 학생을 제외하고 나머지 학생의 평어를 작성할까요?'
            );
            if (!shouldExclude) return false;
        }

        return true;
    };

    // 5. 단일 생성
    const generateCombinedReview = async (studentData) => {
        if (!validateGenerationReadiness(studentData.student.id)) return;
        setIsGenerating(prev => ({ ...prev, [studentData.student.id]: true }));
        try {
            await supabase.auth.getUser();
            // [보안] gemini_api_key 조회 제거 — Edge Function이 서버에서 키를 관리하므로 클라이언트 불필요

            const prompt = getWritingAppendPrompt(studentData.posts);
            const review = await callAI({ prompt, type: 'AI_FEEDBACK' });

            if (review) {
                const updatedStudent = { ...studentData, ai_synthesis: review };
                setStudentPosts(prev => prev.map(s =>
                    s.student.id === studentData.student.id ? updatedStudent : s
                ));
                saveToPersistence(studentData.student.id, review);
                
                // ✅ 단일 생성 시에도 즉시 DB 저장 (학생 누적기록 연동)
                await saveGenerationHistory([updatedStudent]);
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
        if (!validateGenerationReadiness()) return;
        if (studentPosts.length === 0) {
            alert('평가결과가 없습니다. 평가결과를 입력해주세요.');
            return;
        }

        const isRegen = generatedCount > 0;
        const msg = isRegen
            ? '기존 내용은 삭제되고 재생성됩니다. 진행하시겠습니까?'
            : `평가 완료 학생 ${studentPosts.length}명의 덧붙임 문장을 일괄 작성하시겠습니까?`;

        if (!confirm(msg)) return;

        setBatchLoading(true);
        setBatchProgress({ current: 0, total: studentPosts.length });

        // [수정] 최신 상태를 추적하기 위한 로컬 변수 (클로저 문제 해결)
        let updatedPosts = [...studentPosts];

        try {
            await supabase.auth.getUser();
            // [보안] gemini_api_key 조회 제거 — Edge Function이 서버에서 키를 관리

            for (let i = 0; i < studentPosts.length; i++) {
                const data = Reflect.get(studentPosts, i);

                if (!isRegen && data.ai_synthesis) {
                    setBatchProgress(prev => ({ ...prev, current: i + 1 }));
                    continue;
                }
                try {
                    const prompt = getWritingAppendPrompt(data.posts);
                    const review = await callAI({ prompt, type: 'AI_FEEDBACK' });
                    if (review) {
                        setStudentPosts(prev => prev.map((s, idx) =>
                            idx === i ? { ...s, ai_synthesis: review } : s
                        ));
                        // 로컬 변수 업데이트
                        updatedPosts.splice(i, 1, { ...Reflect.get(updatedPosts, i), ai_synthesis: review });

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

            // ✅ 최신 데이터를 인자로 전달하여 저장
            setTimeout(async () => {
                await saveGenerationHistory(updatedPosts);
            }, 1000);

            alert(isRegen ? '덧붙임 문장 일괄 재작성이 완료되었습니다! ✨' : '덧붙임 문장 일괄 작성이 완료되었습니다! ✨');
        }
    };

    // 저장된 텍스트에서 학생별 분석 결과 파싱
    const parseHistoryContent = (content) => {
        const results = Object.create(null);
        const sections = content.split('\n\n---\n\n');
        sections.forEach(section => {
            const match = section.match(/^\[(.*?)\]\n([\s\S]*)$/);
            if (match) {
                const [_, name, synthesis] = match;
                Reflect.set(results, name, synthesis);
            }
        });
        return results;
    };

    // 생성 이력 저장 (targets 인자가 있으면 해당 리스트만, 없으면 전체 studentPosts 중 생성된 것만 저장)
    const saveGenerationHistory = async (targets = null) => {
        if (!teacherId || selectedMissionIds.length === 0) return;

        try {
            // ✅ 저장할 대상 결정 (전체 일괄 저장 또는 특정 학생 단일 저장)
            const currentResults = (targets || studentPosts).filter(s => s.ai_synthesis);

            if (currentResults.length === 0) {
                console.log('저장할 분석 결과가 없습니다.');
                return;
            }

            // 1. 학급 전체 이력용 (일괄 저장 시에만 의미가 큼)
            if (!targets || targets.length > 1) {
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
            }

            // 2. ✅ 개별 학생별 기록 저장 (학생 명단 > 누적 기록에서 조회하기 위함)
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

            // 히스트로리 목록 갱신 (전체 이력 탭용)
            await loadGenerationHistory(activeClass.id);
        } catch (err) {
            console.error('생성 이력 저장 실패:', err);
        }
    };

    // 7. 엑셀 내보내기
    const exportToExcel = async () => {
        const data = studentPosts.map(s => {
            const achievements = s.posts.map(p => `${p.writing_missions.title}: ${p.final_eval || p.initial_eval || '-'}점`).join(', ');
            return {
                '이름': s.student.name,
                '참여 활동수': s.posts.length,
                '활동별 성취': achievements,
                '글쓰기 평가 덧붙임 문장': s.ai_synthesis || '(미생성)'
            };
        });

        await exportObjectsToExcel(
            data,
            `글쓰기평어_덧붙임문장_${activeClass.name}_${new Date().toISOString().slice(0, 10)}`,
            { sheetName: '글쓰기 평어 문장', columnWidths: [10, 12, 40, 60] }
        );
    };

    // 8. 구글 문서용 클립보드 복사
    const copyToDocs = () => {
        const text = studentPosts.map(s => {
            return `[${s.student.name}]\n- 활동건수: ${s.posts.length}건\n- 글쓰기 평가 덧붙임 문장: ${s.ai_synthesis || '미생성'}\n`;
        }).join('\n---\n\n');

        navigator.clipboard.writeText(text);
        alert('전체 학생의 덧붙임 문장이 클립보드에 복사되었습니다! 📋\n작성 중인 국어 평어의 앞이나 뒤에 붙여넣어 사용하세요.');
    };

    const toggleTag = (tag) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    // 생성된 완료 수 계산
    const generatedCount = studentPosts.filter(s => s.ai_synthesis).length;

    return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
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
                        <span style={{ fontSize: '1.8rem' }}>📘</span> 평어 도우미 <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#6366F1', background: '#EEF2FF', padding: '4px 10px', borderRadius: '10px' }}>2022 성취기준 연동</span>
                    </h2>
                    <p style={{ color: '#64748B', fontSize: '0.95rem', margin: 0 }}>작성 중인 국어 평어의 앞이나 뒤에 붙일 글쓰기 평가 문장을 만듭니다.</p>
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
                                    <span style={{ minWidth: 0, flex: 1 }}>
                                        <span style={{ display: 'block', fontWeight: selectedMissionIds.includes(m.id) ? 'bold' : 'normal', color: selectedMissionIds.includes(m.id) ? '#312E81' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.title} {m.is_archived && <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 'normal' }}>(보관됨)</span>}
                                        </span>
                                        {m.evaluation_rubric?.use_rubric
                                            && getCurriculumGradeBand(m.evaluation_rubric?.curriculum)
                                            && resolveKoreanStandards(
                                                m.evaluation_rubric?.curriculum?.achievement_standard_codes,
                                                m.evaluation_rubric?.curriculum
                                            ).length > 0 ? (
                                            <span style={{ display: 'block', marginTop: '3px', color: '#6366F1', fontSize: '0.68rem', fontWeight: '800' }}>
                                                {formatKoreanGradeBand(m.evaluation_rubric.curriculum)} · 성취기준 {resolveKoreanStandards(
                                                    m.evaluation_rubric.curriculum.achievement_standard_codes,
                                                    m.evaluation_rubric.curriculum
                                                ).length}개
                                            </span>
                                        ) : (
                                            <span style={{ display: 'block', marginTop: '3px', color: '#DC2626', fontSize: '0.68rem', fontWeight: '900' }}>
                                                성취기준 선택 필요
                                            </span>
                                        )}
                                        <span style={{ display: 'flex', gap: '5px', marginTop: '7px' }}>
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    openRubricSettings(m);
                                                }}
                                                style={{ padding: '5px 7px', borderRadius: '8px', border: '1px solid #C7D2FE', background: 'white', color: '#4338CA', fontSize: '0.66rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                📚 성취기준
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    openEvaluationEntry(m);
                                                }}
                                                style={{ padding: '5px 7px', borderRadius: '8px', border: '1px solid #BBF7D0', background: 'white', color: '#15803D', fontSize: '0.66rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                🎯 평가 입력
                                            </button>
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 생성 이력 */}
                    {generationHistory.length > 0 && (
                        <div style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>📚 생성 이력 ({generationHistory.length}건)</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '400px' }}>
                                {generationHistory
                                    .slice((historyPage - 1) * ITEMS_PER_PAGE, historyPage * ITEMS_PER_PAGE)
                                    .map(record => {
                                        const missionTitles = record.mission_ids?.map(id => {
                                            const mission = missions.find(m => m.id === id);
                                            return mission?.title || '미션';
                                        }).join(', ') || '정보 없음';

                                        return (
                                            <div
                                                key={record.id}
                                                style={{
                                                    padding: '14px',
                                                    background: '#F8FAFC',
                                                    borderRadius: '16px',
                                                    border: '1px solid #E2E8F0',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = '#EEF2FF';
                                                    e.currentTarget.style.borderColor = '#6366F1';
                                                    const btn = e.currentTarget.querySelector('.delete-btn');
                                                    if (btn) btn.style.opacity = '1';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = '#F8FAFC';
                                                    e.currentTarget.style.borderColor = '#E2E8F0';
                                                    const btn = e.currentTarget.querySelector('.delete-btn');
                                                    if (btn) btn.style.opacity = '0';
                                                }}
                                                onClick={() => {
                                                    const targetMissionIds = record.mission_ids || [];
                                                    setSelectedMissionIds(targetMissionIds);
                                                    pendingHistoryRef.current = record;
                                                    const parsedResults = parseHistoryContent(record.content);
                                                    setStudentPosts(prev => {
                                                        if (prev.length === 0) return prev;
                                                        return prev.map(s => ({
                                                            ...s,
                                                            ai_synthesis: parsedResults[s.student.name] || s.ai_synthesis
                                                        }));
                                                    });
                                                    alert(`${new Date(record.created_at).toLocaleString()}에 생성된 기록을 불러왔습니다.`);
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: '900', marginBottom: '6px' }}>
                                                        {new Date(record.created_at).toLocaleString('ko-KR')}
                                                    </div>
                                                    <button
                                                        className="delete-btn"
                                                        onClick={(e) => handleDeleteHistory(e, record.id)}
                                                        style={{
                                                            padding: '4px',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            color: '#94A3B8',
                                                            opacity: 0,
                                                            transition: 'all 0.2s',
                                                            marginTop: '-6px'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#F43F5E'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                                                        title="이력 삭제"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#1E293B', fontWeight: 'bold', marginBottom: '8px' }}>
                                                    🎯 {record.activity_count}명 문장 작성 완료
                                                </div>
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: '#64748B',
                                                    lineHeight: '1.4',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: '2',
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden'
                                                }}>
                                                    🔗 {missionTitles}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

                            {/* 페이지네이션 컨트롤 */}
                            {generationHistory.length > ITEMS_PER_PAGE && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setHistoryPage(p => Math.max(1, p - 1)); }}
                                        disabled={historyPage === 1}
                                        style={{ border: 'none', background: 'none', cursor: historyPage === 1 ? 'default' : 'pointer', color: historyPage === 1 ? '#CBD5E1' : '#6366F1', display: 'flex', alignItems: 'center' }}
                                    >
                                        ◀
                                    </button>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569' }}>
                                        {historyPage} / {Math.ceil(generationHistory.length / ITEMS_PER_PAGE)}
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setHistoryPage(p => Math.min(Math.ceil(generationHistory.length / ITEMS_PER_PAGE), p + 1)); }}
                                        disabled={historyPage >= Math.ceil(generationHistory.length / ITEMS_PER_PAGE)}
                                        style={{ border: 'none', background: 'none', cursor: historyPage >= Math.ceil(generationHistory.length / ITEMS_PER_PAGE) ? 'default' : 'pointer', color: historyPage >= Math.ceil(generationHistory.length / ITEMS_PER_PAGE) ? '#CBD5E1' : '#6366F1', display: 'flex', alignItems: 'center' }}
                                    >
                                        ▶
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </aside>

                {/* 메인 리스트 영역 (클린 테이블 UI) */}
                <main>
                    {selectedMissionIds.length === 0 ? (
                        <div style={{ padding: '80px', textAlign: 'center', background: '#F8FAFC', borderRadius: '24px', border: '2px dashed #E2E8F0' }}>
                            <RefreshCw size={48} style={{ color: '#CBD5E1', marginBottom: '16px' }} />
                            <h3 style={{ margin: 0, color: '#64748B' }}>미션을 선택하여 글쓰기 평어 문장 작성을 시작하세요</h3>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {missionsWithoutStandards.length > 0 && (
                                <div style={{ padding: '16px 18px', borderRadius: '16px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <div>
                                        <strong>관련 성취기준을 선택해주세요.</strong>
                                        <div style={{ marginTop: '3px', fontSize: '0.8rem' }}>{missionsWithoutStandards.map((mission) => mission.title).join(', ')}</div>
                                    </div>
                                    <Button size="sm" onClick={() => openRubricSettings(missionsWithoutStandards[0])} style={{ background: '#B91C1C', color: 'white', fontWeight: '900' }}>
                                        성취기준 선택
                                    </Button>
                                </div>
                            )}

                            {evaluationGaps.unevaluatedSubmissions.length > 0 && (
                                <div style={{ padding: '16px 18px', borderRadius: '16px', background: '#FFF7ED', border: '1px solid #FED7AA', color: '#C2410C', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <div>
                                        <strong>평가결과가 없습니다. 평가결과를 입력해주세요.</strong>
                                        <div style={{ marginTop: '3px', fontSize: '0.8rem' }}>평가 필요 제출물 {evaluationGaps.unevaluatedSubmissions.length}건</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            const firstGap = evaluationGaps.unevaluatedSubmissions[0];
                                            const mission = missions.find((item) => item.id === firstGap.missionId);
                                            if (mission) openEvaluationEntry(mission);
                                        }}
                                        style={{ background: '#C2410C', color: 'white', fontWeight: '900' }}
                                    >
                                        평가결과 입력
                                    </Button>
                                </div>
                            )}

                            {evaluationGaps.missingSubmissions.length > 0 && (
                                <div style={{ padding: '13px 18px', borderRadius: '16px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', fontSize: '0.82rem', fontWeight: '800' }}>
                                    제출 글이 없는 학생이 있습니다. 일괄 작성 시 결석 등으로 제외할지 확인합니다.
                                </div>
                            )}

                            {/* 상황바 */}
                            <div style={{ background: '#F1F5F9', padding: '16px 24px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 'bold' }}>
                                    평가 완료 <span style={{ color: '#1E293B' }}>{studentPosts.length}명</span> 중 <span style={{ color: '#6366F1' }}>{generatedCount}명</span> 덧붙임 문장 작성 완료
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    {/* 작성 직전에 평어 규칙을 고르고 고칠 수 있게 한다 */}
                                    <PromptRuleButton
                                        kind="report"
                                        isMobile={isMobile}
                                        onApplied={(content) => setLivePromptTemplate(content)}
                                    />
                                    <Button
                                        size="sm"
                                        onClick={handleBatchGenerate}
                                        disabled={batchLoading}
                                        style={{
                                            borderRadius: '12px',
                                            fontWeight: 'bold',
                                            background: generatedCount > 0 ? '#F59E0B' : '#6366F1'
                                        }}
                                    >
                                        {batchLoading
                                            ? `작업 중... (${batchProgress.current}/${batchProgress.total})`
                                            : (generatedCount > 0 ? '🔄 덧붙임 문장 일괄 재작성' : '🪄 덧붙임 문장 일괄 작성')}
                                    </Button>
                                </div>
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
                                <div style={{ textAlign: 'center' }}>작성 상태</div>
                                <div style={{ textAlign: 'center' }}>문장 작성</div>
                                <div></div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#F1F5F9' }}>
                                {studentPosts.slice(0, mainListLimit).map((data, idx) => (
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
                                                    {isGenerating[data.student.id] ? '작성 중...' : '문장 작성'}
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
                                                                {data.posts.map(p => (
                                                                    <div key={p.id} style={{
                                                                        background: 'white',
                                                                        padding: '12px 16px',
                                                                        borderRadius: '12px',
                                                                        border: '1px solid #E2E8F0',
                                                                        fontSize: '0.85rem',
                                                                        marginBottom: '8px'
                                                                    }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span style={{ fontWeight: 'bold', color: '#4F46E5' }}>{p.writing_missions?.title}</span>
                                                                            <span style={{ fontSize: '0.75rem', color: '#3B82F6', fontWeight: '900' }}>{p.final_eval || p.initial_eval || '-'}점</span>
                                                                        </div>

                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* AI 분석 결과 (메인 영역) */}
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6366F1' }}>✨ 글쓰기 평가 덧붙임 문장</div>
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
                                                                    padding: '20px',
                                                                    borderRadius: '16px',
                                                                    border: '1px solid #FEF3C7',
                                                                    whiteSpace: 'pre-wrap',
                                                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
                                                                }}>
                                                                    {data.ai_synthesis || (
                                                                        <span style={{ color: '#D97706', fontStyle: 'italic' }}>문장 작성 버튼을 눌러 덧붙임 문장을 작성하세요.</span>
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

                            {/* [성능 최적화] 더보기 버튼 추가 */}
                            {mainListLimit < studentPosts.length && (
                                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                                    <button
                                        onClick={() => setMainListLimit(prev => prev + 20)}
                                        style={{
                                            border: '1px solid #DEE2E6',
                                            background: 'white',
                                            color: '#6366F1',
                                            padding: '10px 24px',
                                            borderRadius: '12px',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                    >
                                        학생 명단 더 보기 ({mainListLimit} / {studentPosts.length}) 🔽
                                    </button>
                                </div>
                            )}

                            <footer style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '0.85rem' }}>
                                * 작성된 덧붙임 문장은 국어 평어의 앞이나 뒤에 그대로 붙여 쓸 수 있으며, 선택한 미션 조합별로 이 브라우저에 저장됩니다.
                            </footer>
                        </div>
                    )}
                </main>
            </div>

            <AnimatePresence>
                {rubricMission && rubricDraft && (
                    <div
                        style={{
                            position: 'fixed', inset: 0, zIndex: 2500, background: 'rgba(15, 23, 42, 0.55)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '24px'
                        }}
                        onClick={() => {
                            setRubricMission(null);
                            setRubricDraft(null);
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.98 }}
                            onClick={(event) => event.stopPropagation()}
                            style={{
                                width: '100%', maxWidth: '920px', maxHeight: isMobile ? '100%' : '90vh',
                                overflowY: 'auto', background: 'white', borderRadius: isMobile ? 0 : '28px',
                                padding: isMobile ? '18px' : '28px', boxSizing: 'border-box'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                                <div>
                                    <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.3rem' }}>📚 미션별 성취기준 선택</h3>
                                    <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '0.84rem' }}>
                                        {rubricMission.title} · 글의 종류와 수업 내용에 맞는 기준을 교사가 선택합니다.
                                    </p>
                                </div>
                                <Button variant="ghost" onClick={() => {
                                    setRubricMission(null);
                                    setRubricDraft(null);
                                }}>✕ 닫기</Button>
                            </div>

                            <RubricSettings
                                rubric={rubricDraft}
                                onChange={setRubricDraft}
                                isMobile={isMobile}
                                recommendedCodes={getRecommendedStandardCodesForMission(rubricMission)}
                            />

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <Button variant="ghost" onClick={() => {
                                    setRubricMission(null);
                                    setRubricDraft(null);
                                }}>취소</Button>
                                <Button onClick={handleSaveMissionRubric} style={{ background: '#4F46E5', color: 'white', fontWeight: '900' }}>
                                    성취기준·평가 설정 저장
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {evaluationMission && (
                <MissionEvaluationEntry
                    mission={evaluationMission}
                    activeClass={activeClass}
                    isMobile={isMobile}
                    onClose={() => setEvaluationMission(null)}
                    onSaved={handleEvaluationSaved}
                />
            )}

            {/* AI 일괄 생성 진행 모달 */}
            <BulkAIProgressModal isGenerating={batchLoading} progress={batchProgress} />
        </div>
    );
};

export default ActivityReport;
