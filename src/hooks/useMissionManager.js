import { useState, useEffect, useCallback, useRef } from 'react';
import useConfirmDialog from '../components/common/useConfirmDialog';
import useNotice from '../components/common/useNotice';
import { supabase } from '../lib/supabaseClient';
import { callAI } from '../lib/openai';
import { sanitizeFeedback } from '../utils/aiFeedbackGuard';
import { dataCache } from '../lib/cache';
import { readLocalStorageJson } from '../lib/browserStorage';
import { pointApi } from '../modules/points/pointApi';
import { assignmentApi } from '../modules/writing/assignmentApi';
import { appendFeedbackMessage } from '../constants/feedbackPhrases';
import { normalizeLabResult } from '../modules/writing/tools/lab-results/api';
import { getLatestSubmissionBoardMission } from '../modules/writing/submission-board/boardMissionScope';
import { useTeacherSubmissionBoard } from '../modules/writing/submission-board/useTeacherSubmissionBoard';

export const useMissionManager = (
    activeClass,
    bootstrapProfile = null,
    { submissionBoardPollingEnabled = false } = {}
) => {
    const [missions, setMissions] = useState([]);
    const {
        board: submissionBoard,
        submissionCounts,
        pollError: submissionBoardPollError,
        selectedMissionId: submissionBoardMissionId,
        isScopeLoading: submissionBoardScopeLoading,
        hydrateBoard: hydrateSubmissionBoard,
        selectMissionScope: selectSubmissionBoardMission,
        applyDefaultMissionScope: applyDefaultSubmissionBoardMission,
        transitionMissionStatus,
        loadSubmissionHistory
    } = useTeacherSubmissionBoard(activeClass?.id, { enabled: submissionBoardPollingEnabled });
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showCompleteToast, setShowCompleteToast] = useState(false);
    /*
     * 승인은 브라우저 기본 창 대신 앱 안 창으로 묻고, 끝났다는 말은 스스로 사라지는 띠로 한다.
     * 기본 창은 확인을 두 번(묻기·알리기) 눌러야 했고, 크롬이 막으면 조용히 무시됐다.
     */
    const { ask, confirmDialog } = useConfirmDialog();
    const { notify, notice } = useNotice();
    // 어느 글을 승인하는 중인지. 버튼이 '승인 중...'으로 바뀌어 누른 티가 난다.
    const [approvingPostId, setApprovingPostId] = useState(null);
    const [rewritingPostId, setRewritingPostId] = useState(null);
    const [tempFeedback, setTempFeedback] = useState('');
    const [postReactions, setPostReactions] = useState([]);
    const [postComments, setPostComments] = useState([]);
    const [postOutlineReferenceState, setPostOutlineReferenceState] = useState({ postId: null, result: null });
    const [postDetailLoading, setPostDetailLoading] = useState(false);
    const postDetailRequestRef = useRef(0);
    const lastPostDetailLoadedAtRef = useRef(0);
    const [totalStudentCount, setTotalStudentCount] = useState(0);
    const [archiveModal, setArchiveModal] = useState({ isOpen: false, mission: null, hasIncomplete: false });
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [isEditing, setIsEditing] = useState(false);
    const [editingMissionId, setEditingMissionId] = useState(null);
    const [isEvaluationMode, setIsEvaluationMode] = useState(false);
    const [frequentTags, setFrequentTags] = useState(() => bootstrapProfile?.frequent_tags || []);
    const [defaultRubric, setDefaultRubric] = useState(() => bootstrapProfile?.default_rubric || null);
    const [missionDefaultSettings, setMissionDefaultSettings] = useState(() => bootstrapProfile?.mission_default_settings || null);

    useEffect(() => {
        if (bootstrapProfile) return;
        const fetchProfileData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('profiles')
                .select('frequent_tags, default_rubric, mission_default_settings')
                .eq('id', user.id)
                .single();

            if (data) {
                if (data.frequent_tags) setFrequentTags(data.frequent_tags);
                if (data.default_rubric) setDefaultRubric(data.default_rubric);
                if (data.mission_default_settings) setMissionDefaultSettings(data.mission_default_settings);
            }
        };
        fetchProfileData();
    }, [bootstrapProfile]);

    // defaultRubric이 로드되면 폼 데이터에도 반영 (새 글 작성 시에만 초기값으로 세팅)
    useEffect(() => {
        if (defaultRubric && !isEditing) {
            setFormData(prev => ({
                ...prev,
                evaluation_rubric: {
                    ...prev.evaluation_rubric,
                    levels: defaultRubric
                }
            }));
        }
    }, [defaultRubric, isEditing]);

    // DB에서 불러온 미션 기본 설정을 폼에 적용 (새 글 작성 시에만)
    useEffect(() => {
        if (missionDefaultSettings && !isEditing) {
            setFormData(prev => ({
                ...prev,
                min_chars: missionDefaultSettings.min_chars ?? prev.min_chars,
                min_paragraphs: missionDefaultSettings.min_paragraphs ?? prev.min_paragraphs,
                base_reward: missionDefaultSettings.base_reward ?? prev.base_reward,
                bonus_threshold: missionDefaultSettings.bonus_threshold ?? prev.bonus_threshold,
                bonus_reward: missionDefaultSettings.bonus_reward ?? prev.bonus_reward,
                repeat_bonus_enabled: missionDefaultSettings.repeat_bonus_enabled ?? prev.repeat_bonus_enabled,
                repeat_bonus_threshold: missionDefaultSettings.repeat_bonus_threshold ?? prev.repeat_bonus_threshold,
                repeat_bonus_reward: missionDefaultSettings.repeat_bonus_reward ?? prev.repeat_bonus_reward,
                repeat_bonus_max_count: missionDefaultSettings.repeat_bonus_max_count ?? prev.repeat_bonus_max_count,
                allow_comments: missionDefaultSettings.allow_comments ?? prev.allow_comments
            }));
        }
    }, [missionDefaultSettings, isEditing]);

    const saveFrequentTag = async (tag) => {
        if (!tag || frequentTags.includes(tag)) return;
        const newTags = [...frequentTags, tag];
        setFrequentTags(newTags); // UI 즉시 반영

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('profiles').update({ frequent_tags: newTags }).eq('id', user.id);
        }
    };

    const removeFrequentTag = async (tag) => {
        const newTags = frequentTags.filter(t => t !== tag);
        setFrequentTags(newTags); // UI 즉시 반영

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('profiles').update({ frequent_tags: newTags }).eq('id', user.id);
        }
    };

    const getResetFormData = useCallback(() => {
        const defaultLevels = [
            { score: 3, label: '우수' },
            { score: 2, label: '보통' },
            { score: 1, label: '노력' }
        ];

        // 로컬 스토리지에서 기본 설정 불러오기
        const defaults = readLocalStorageJson('mission_default_settings', {});

        return {
            title: '',
            guide: '',
            genre: '일기',
            min_chars: defaults.min_chars ?? 100,
            min_paragraphs: defaults.min_paragraphs ?? 1,
            base_reward: defaults.base_reward ?? 100,
            bonus_threshold: defaults.bonus_threshold ?? 100,
            bonus_reward: defaults.bonus_reward ?? 10,
            repeat_bonus_enabled: defaults.repeat_bonus_enabled ?? false,
            repeat_bonus_threshold: defaults.repeat_bonus_threshold ?? 100,
            repeat_bonus_reward: defaults.repeat_bonus_reward ?? 10,
            repeat_bonus_max_count: defaults.repeat_bonus_max_count ?? 3,
            allow_comments: defaults.allow_comments ?? true,
            mission_type: '일기',
            guide_questions: [],
            question_count: 3,
            tags: [],
            evaluation_rubric: {
                use_rubric: false,
                levels: defaultLevels
            }
        };
    }, []);

    const [formData, setFormData] = useState(getResetFormData);

    const handleSaveDefaultRubric = async () => {
        if (!formData.evaluation_rubric?.levels) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('profiles')
                .update({ default_rubric: formData.evaluation_rubric.levels })
                .eq('id', user.id);

            if (error) throw error;

            setDefaultRubric(formData.evaluation_rubric.levels);
            notify('💾 루브릭 단계와 이름을 계정에 저장했어요. 어디서 로그인해도 기본으로 쓰입니다.');
        } catch (err) {
            console.error('루브릭 저장 실패:', err);
            await ask({
                title: '루브릭을 저장하지 못했습니다',
                body: `잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        }
    };

    const handleSaveDefaultSettings = async () => {
        const settingsToSave = {
            min_chars: formData.min_chars,
            min_paragraphs: formData.min_paragraphs,
            base_reward: formData.base_reward,
            bonus_threshold: formData.bonus_threshold,
            bonus_reward: formData.bonus_reward,
            repeat_bonus_enabled: formData.repeat_bonus_enabled,
            repeat_bonus_threshold: formData.repeat_bonus_threshold,
            repeat_bonus_reward: formData.repeat_bonus_reward,
            repeat_bonus_max_count: formData.repeat_bonus_max_count,
            allow_comments: formData.allow_comments
        };

        // 1. 로컬 스토리지 저장 (백업용)
        localStorage.setItem('mission_default_settings', JSON.stringify(settingsToSave));

        // 2. DB 프로필에 저장
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ mission_default_settings: settingsToSave })
                    .eq('id', user.id);

                if (error) throw error;
            }
            // 상태 업데이트하여 즉시 반영
            setMissionDefaultSettings(settingsToSave);
            notify('💾 분량·포인트·댓글 설정을 계정에 저장했어요. 어디서 로그인해도 기본으로 쓰입니다.');
        } catch (err) {
            console.error('설정 저장 실패:', err);
            // DB 저장 실패해도 로컬스토리지는 성공했을 수 있으므로 안내 메시지 조절
            await ask({
                title: '설정은 저장했지만 일부가 어긋났습니다',
                body: `다시 열어 값이 맞는지 확인해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        }
    };

    const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);

    const fetchMissionDetails = useCallback(async (missionId) => {
        if (!missionId) return null;

        const { data, error } = await supabase
            .from('writing_missions')
            .select('id, title, guide, genre, mission_type, input_template, template_config, min_chars, min_paragraphs, guide_questions, is_archived, created_at, base_reward, bonus_threshold, bonus_reward, repeat_bonus_enabled, repeat_bonus_threshold, repeat_bonus_reward, repeat_bonus_max_count, allow_comments, tags, evaluation_rubric')
            .eq('id', missionId)
            .maybeSingle();

        if (error) throw error;
        return data;
    }, []);

    const fetchMissions = useCallback(async () => {
        if (!activeClass?.id) return;
        setLoading(true);
        try {
            const { data: overview, error: overviewError } = await supabase.rpc('get_teacher_mission_overview_v1', {
                p_class_id: activeClass.id,
                p_limit: 100
            });
            if (overviewError) throw overviewError;
            if (Number(overview?.version) !== 1) throw new Error('지원하지 않는 교사 과제 개요 응답입니다.');
            const nextMissions = overview.missions || [];
            setMissions(nextMissions);
            // 전광판은 매번 범위를 고르지 않아도 되게 가장 최근 과제로 열린다.
            applyDefaultSubmissionBoardMission(getLatestSubmissionBoardMission(nextMissions)?.id || null);
            setTotalStudentCount(Number(overview.total_students || 0));
            hydrateSubmissionBoard(overview.submission_board, {
                totalStudents: overview.total_students,
                submissionCounts: overview.submission_counts
            });
        } catch (err) {
            console.error('글쓰기 미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [activeClass?.id, applyDefaultSubmissionBoardMission, hydrateSubmissionBoard]);

    useEffect(() => {
        if (activeClass?.id) {
            fetchMissions();
        }
    }, [activeClass?.id, fetchMissions]);

    const buildMissionFormData = useCallback((mission) => {
        const defaultLevels = readLocalStorageJson('default_rubric_levels', [
            { score: 3, label: '우수' },
            { score: 2, label: '보통' },
            { score: 1, label: '노력' }
        ]);

        return {
            title: mission.title || '',
            guide: mission.guide || '',
            genre: mission.genre || '일기',
            min_chars: mission.min_chars ?? 100,
            min_paragraphs: mission.min_paragraphs ?? 1,
            base_reward: mission.base_reward ?? 100,
            bonus_threshold: mission.bonus_threshold ?? 100,
            bonus_reward: mission.bonus_reward ?? 10,
            repeat_bonus_enabled: mission.repeat_bonus_enabled ?? false,
            repeat_bonus_threshold: mission.repeat_bonus_threshold ?? 100,
            repeat_bonus_reward: mission.repeat_bonus_reward ?? 10,
            repeat_bonus_max_count: mission.repeat_bonus_max_count ?? 3,
            allow_comments: mission.allow_comments ?? true,
            mission_type: mission.mission_type || mission.genre || '일기',
            guide_questions: mission.guide_questions || [],
            tags: mission.tags || [],
            evaluation_rubric: mission.evaluation_rubric || {
                use_rubric: false,
                levels: defaultLevels
            }
        };
    }, []);

    useEffect(() => {
        if (!isEditing || !editingMissionId) return;

        const editingMission = missions.find((mission) => mission.id === editingMissionId);
        if (!editingMission) return;

        setFormData(buildMissionFormData(editingMission));
    }, [isEditing, editingMissionId, missions, buildMissionFormData]);

    const handleEditClick = async (mission) => {
        let missionForEdit = mission;

        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('id, title, guide, genre, mission_type, input_template, template_config, min_chars, min_paragraphs, guide_questions, base_reward, bonus_threshold, bonus_reward, repeat_bonus_enabled, repeat_bonus_threshold, repeat_bonus_reward, repeat_bonus_max_count, allow_comments, tags, evaluation_rubric')
                .eq('id', mission.id)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                missionForEdit = data;
            }
        } catch (err) {
            console.warn('[MissionManager] 수정용 미션 재조회 실패, 목록 데이터로 진행합니다:', err.message);
        }

        setIsEditing(true);
        setEditingMissionId(mission.id);
        setFormData(buildMissionFormData(missionForEdit));
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditingMissionId(null);
        setFormData(getResetFormData());
        setIsFormOpen(false);
    };

    const handleGenerateQuestions = async (count = 5) => {
        if (!formData.title.trim()) {
            notify('주제를 먼저 적어 주세요. ✨');
            return;
        }

        setIsGeneratingQuestions(true);

        try {
            const prompt = `
            너는 초등학생 글쓰기 지도를 돕는 AI 선생님이야. 
            주제: "${formData.title}"
            글의 종류: "${formData.genre}"
            가이드: "${formData.guide}"
            
            학생들이 이 주제로 글을 쓸 때, 글의 구조를 잡고 내용을 풍성하게 만들 수 있도록 돕는 '핵심 질문'을 ${count}개 만들어줘.
            
            [규칙]
            1. 질문은 초등학생이 이해하기 쉬운 친절한 말투여야 해.
            2. 질문이 너무 추상적이지 않고, 구체적인 기억이나 생각을 끌어낼 수 있어야 해.
            3. 보기에 좋은 JSON 배열 형식으로만 답해줘. (다른 설명 없이)
            
            [응답 형식 예시]
            ["질문1", "질문2", "질문3"]
            `;

            const responseText = await callAI(prompt, { type: 'GENERAL' });

            const jsonMatch = responseText.match(/\[.*\]/s);
            if (jsonMatch) {
                const questions = JSON.parse(jsonMatch[0]);
                setFormData(prev => ({ ...prev, guide_questions: questions }));
            }
        } catch (err) {
            console.error('질문 생성 오류:', err);
            await ask({
                title: '질문을 만들지 못했습니다',
                body: `잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setIsGeneratingQuestions(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title.trim() || !formData.guide.trim()) {
            notify('주제와 안내 내용을 적어 주세요. ✍️');
            return;
        }

        try {
            if (isEditing) {
                const { error } = await supabase
                    .from('writing_missions')
                    .update({ ...formData, mission_type: formData.genre })
                    .eq('id', editingMissionId);

                if (error) throw error;
                notify('✏️ 글쓰기 과제를 고쳤어요.');
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                const { error } = await supabase.from('writing_missions').insert({
                    ...formData,
                    mission_type: formData.genre,
                    class_id: activeClass.id,
                    teacher_id: user?.id
                });
                if (error) throw error;
                notify('🚀 새 글쓰기 과제를 열었어요.');
            }

            // [추가] 캐시 무효화로 즉각 반영 보장
            if (activeClass?.id) {
                dataCache.invalidate(`missions_v2_${activeClass.id}`);
                dataCache.invalidate(`missions_${activeClass.id}`);
            }

            handleCancelEdit();
            fetchMissions();
        } catch (error) {
            await ask({
                title: '글쓰기 과제를 저장하지 못했습니다',
                body: `${error.message}

적어 둔 내용은 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        }
    };

    const fetchReactionsAndComments = useCallback(async (postId) => {
        if (!postId) return;
        const requestId = postDetailRequestRef.current + 1;
        postDetailRequestRef.current = requestId;
        setPostDetailLoading(true);
        try {
            const { data: detail, error } = await supabase.rpc('get_teacher_post_detail_v1', { p_post_id: postId });
            if (error) throw error;
            if (postDetailRequestRef.current !== requestId) return;
            setPostReactions((detail?.reactions || []).map((reaction) => ({
                ...reaction,
                students: reaction.student_name ? { name: reaction.student_name } : null
            })));
            setPostComments((detail?.comments || []).map((comment) => ({
                ...comment,
                students: comment.student_name ? { name: comment.student_name } : null
            })));
            setPostOutlineReferenceState({
                postId,
                result: normalizeLabResult(detail?.outline_reference) || null
            });
            lastPostDetailLoadedAtRef.current = Date.now();
        } catch (err) {
            console.error('반응/댓글 로드 실패:', err.message);
        } finally {
            if (postDetailRequestRef.current === requestId) setPostDetailLoading(false);
        }
    }, []);

    const selectedPostId = selectedPost?.id || null;
    const selectedPostFeedback = selectedPost?.ai_feedback || '';

    useEffect(() => {
        if (selectedPostId) {
            fetchReactionsAndComments(selectedPostId);
            setTempFeedback(selectedPostFeedback);
        } else {
            postDetailRequestRef.current += 1;
            setPostReactions([]);
            setPostComments([]);
            setPostOutlineReferenceState({ postId: null, result: null });
            setPostDetailLoading(false);
            setTempFeedback('');
            setIsEvaluationMode(false); // 뷰어 닫힐 때 평가 모드 초기화
        }
    }, [fetchReactionsAndComments, selectedPostFeedback, selectedPostId]);

    useEffect(() => {
        if (!selectedPostId) return undefined;
        const refreshWhenReturning = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastPostDetailLoadedAtRef.current < 1000) return;
            void fetchReactionsAndComments(selectedPostId);
        };
        window.addEventListener('focus', refreshWhenReturning);
        document.addEventListener('visibilitychange', refreshWhenReturning);
        return () => {
            window.removeEventListener('focus', refreshWhenReturning);
            document.removeEventListener('visibilitychange', refreshWhenReturning);
        };
    }, [fetchReactionsAndComments, selectedPostId]);

    const refreshSelectedPostDetail = useCallback(() => {
        if (!selectedPostId) return Promise.resolve();
        return fetchReactionsAndComments(selectedPostId);
    }, [fetchReactionsAndComments, selectedPostId]);

    const handleEvaluationMode = async (mission) => {
        const fetchedPosts = await fetchPostsForMission(mission);
        if (fetchedPosts && fetchedPosts.length > 0) {
            setSelectedPost(fetchedPosts[0]);
            setIsEvaluationMode(true);
        } else {
            notify('아직 제출한 학생이 없어요. 🐥');
        }
    };

    const fetchPostsForMission = async (mission) => {
        setLoadingPosts(true);
        try {
            const detailedMission = await fetchMissionDetails(mission.id);
            const missionForSelection = detailedMission || mission;
            setSelectedMission(missionForSelection);

            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, title, content, student_id, mission_id, char_count, is_submitted, is_confirmed, is_returned, ai_feedback, created_at, updated_at, recalled_at, recalled_by,
                    original_title, original_content, first_submitted_at, initial_eval, final_eval, eval_comment, student_answers, structured_content,
                    awarded_base_reward, awarded_bonus_reward, awarded_bonus_threshold,
                    awarded_repeat_bonus_enabled, awarded_repeat_bonus_threshold,
                    awarded_repeat_bonus_reward, awarded_repeat_bonus_max_count,
                    teacher_edited_title, teacher_edited_content, teacher_edited_at, teacher_edited_by, is_teacher_edited,
                    students!inner(name, class_id)
                `)
                .eq('mission_id', mission.id)
                // 학급은 student_posts.class_id 로 직접 좁힌다 (students 경유 금지).
                .eq('class_id', activeClass.id)
                .is('students.deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setPosts(data || []);
            return data || [];
        } catch (err) {
            console.error('학생 글 불러오기 실패:', err.message);
            // ⚠️ 창을 띄우기 전에 잠금을 푼다 — finally 는 창을 닫은 뒤에야 돈다.
            setLoadingPosts(false);
            await ask({
                title: '학생 글을 불러오지 못했습니다',
                body: `잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return [];
        } finally {
            setLoadingPosts(false);
        }
    };

    const fetchAIFeedback = async (postArray) => {
        // postArray는 [{id, title, content}, ...] 형식
        const isBulk = postArray.length > 1;
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profileData } = await supabase
            .from('profiles')
            .select('ai_prompt_template')
            .eq('id', user?.id)
            .single();

        let customTemplate = profileData?.ai_prompt_template?.trim();

        // JSON 패킹된 프롬프트인지 확인하여 피드백 섹션만 추출
        if (customTemplate && customTemplate.startsWith('{') && customTemplate.endsWith('}')) {
            try {
                const parsed = JSON.parse(customTemplate);
                customTemplate = parsed.feedback;
            } catch {
                console.warn('프롬프트 JSON 파싱 실패, 원문 사용');
            }
        }

        const defaultTemplate = `너는 초등학생의 글쓰기 성장을 돕는 다정한 보조 선생님이야. 아래 학생의 글을 읽고 정해진 형식에 맞춰 피드백을 작성해줘.

[피드백 작성 규칙]
1. 말투는 항상 다정하고 따뜻하게 작성해줘.
2. 마크다운 기호(#, *, - 등)는 절대 사용하지 말고, 이모지와 줄바꿈만 사용해줘.
3. 답변은 반드시 아래의 형식을 정확히 지켜줘:

---
안녕! 선생님이야 😊 네 글을 정말 잘 읽었어.

[맞춤법 교정]
(틀린 부분과 이유를 초등학생 눈높이에서 친절하게 설명)

[글의 강점]
(참신한 표현이나 감동적인 부분 등 칭찬할 점)

[보완할점]
(내용을 더 풍성하게 만들 질문이나 아이디어를 하나만 제안)`;

        const basePrompt = customTemplate || defaultTemplate;
        let prompt = '';

        if (isBulk) {
            prompt = `${basePrompt}

현재 입력된 글은 총 ${postArray.length}개야. 
각 학생별로 원본 피드백 형식을 유지하면서, 반드시 아래의 JSON 형식으로만 응답해줘. 
설명은 일절 하지 말고 오직 JSON 코드 블록만 출력해.

[응답 형식]
[
  { "id": "글의_ID", "feedback": "위의 피드백 형식을 따른 전체 텍스트" }
]

[분석할 글 목록]
${postArray.map((p, idx) => {
                let qaSection = "";
                if (selectedMission?.guide_questions?.length > 0 && p.student_answers?.length > 0) {
                    qaSection = "\n[핵심질문에 대한 답변]\n" + selectedMission.guide_questions.map((q, i) => `질문${i + 1}: ${q}\n답변${i + 1}: ${Reflect.get(p.student_answers, i) || '(답변 없음)'}`).join('\n');
                }
                // 이름은 보내지 않는다. 되돌려 붙이는 데는 ID 하나면 되고, 피드백 문구에도 이름을 쓰지 않는다.
                // (2026-08-19 — 개인정보 처리방침에 "식별정보를 제외한 글 내용만 전송"으로 적었다.)
                return `[학생 ${idx + 1}]\nID: ${p.id}\n제목: ${p.title}\n내용: ${p.content}${qaSection}`;
            }).join('\n\n')}`;
        } else {
            let qaSection = "";
            const p = postArray[0];
            if (selectedMission?.guide_questions?.length > 0 && p.student_answers?.length > 0) {
                qaSection = "\n[핵심질문에 대한 답변]\n" + selectedMission.guide_questions.map((q, i) => `질문${i + 1}: ${q}\n답변${i + 1}: ${Reflect.get(p.student_answers, i) || '(답변 없음)'}`).join('\n');
            }
            // 이름 없이 글만 보낸다(위와 같은 이유).
            prompt = `${basePrompt}\n\n---\n[학생 글]\n글 제목: "${p.title}"\n글 내용:\n"${p.content}"${qaSection}`;
        }

        try {
            const responseText = await callAI(prompt, { type: 'AI_FEEDBACK' });

            if (isBulk) {
                const jsonMatch = responseText.match(/\[\s*\{.*\}\s*\]/s);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    // 지적할 게 없을 때 모델이 학생 글을 그대로 되돌려주는 경우가 있어 걸러낸다
                    return parsed.map((item) => {
                        const source = postArray.find((p) => String(p.id) === String(item.id));
                        return { ...item, feedback: sanitizeFeedback(item.feedback, source?.content) };
                    });
                }
                throw new Error('AI 응답 형식이 일괄 처리에 적합하지 않습니다.');
            }

            return sanitizeFeedback(responseText, postArray[0]?.content);
        } catch (err) {
            console.error('AI 피드백 생성 실패:', err.message);
            return null;
        }
    };

    /**
     * 다시쓰기 강제 회수.
     *
     * 다시쓰기를 보낸 뒤 학생이 제출하지 않으면 교사가 글을 되돌려받을 수 없어
     * 학생 계정으로 로그인해야 했다. 지금 저장돼 있는 내용 그대로 제출 처리하되,
     * 학생이 스스로 낸 글과 구분되도록 회수 표시를 남긴다(포인트는 지급하지 않음).
     */
    const handleRecallPosts = async (targets) => {
        const list = (Array.isArray(targets) ? targets : [targets]).filter(
            (p) => p && p.is_returned && !p.is_submitted
        );
        if (list.length === 0) return { count: 0 };

        const { data: { user } } = await supabase.auth.getUser();
        // 실제로 바뀐 행을 돌려받아, 일부만 성공한 경우도 교사가 알 수 있게 한다
        const { data: updated, error } = await supabase
            .from('student_posts')
            .update({
                is_submitted: true,
                is_returned: false,
                recalled_at: new Date().toISOString(),
                recalled_by: user?.id ?? null,
            })
            .in('id', list.map((p) => p.id))
            .select('id, student_id');

        if (selectedMission) await fetchPostsForMission(selectedMission);

        if (error) {
            console.error('회수 실패:', error.message);
            return { count: 0, failed: list.length, error };
        }

        const count = updated?.length ?? 0;
        transitionMissionStatus(
            selectedMission?.id || list[0]?.mission_id,
            'recall',
            count,
            (updated || []).map((post) => post.student_id)
        );
        return { count, failed: list.length - count };
    };

    /** 회수 되돌리기 — 다시 학생에게 넘겨 이어 쓰게 한다 */
    const handleUndoRecall = async (post) => {
        if (!post?.recalled_at) return { ok: false };
        const { error } = await supabase
            .from('student_posts')
            .update({
                is_submitted: false,
                is_returned: true,
                recalled_at: null,
                recalled_by: null,
            })
            .eq('id', post.id);

        if (error) {
            console.error('회수 취소 실패:', error.message);
            return { ok: false, error };
        }
        if (selectedMission) await fetchPostsForMission(selectedMission);
        transitionMissionStatus(post.mission_id || selectedMission?.id, 'undo-recall', 1, [post.student_id]);
        return { ok: true };
    };

    const handleGenerateSingleAI = async () => {
        if (!selectedPost) return;
        setIsGenerating(true);
        try {
            const feedback = await fetchAIFeedback([{
                id: selectedPost.id,
                title: selectedPost.title,
                content: selectedPost.content,
                student_answers: selectedPost.student_answers,
                student_name: selectedPost.students?.name
            }]);
            if (feedback) {
                const { error } = await supabase
                    .from('student_posts')
                    .update({ ai_feedback: feedback })
                    .eq('id', selectedPost.id);

                if (error) throw error;

                setTempFeedback(feedback);
                setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, ai_feedback: feedback } : p));
                setSelectedPost(prev => ({ ...prev, ai_feedback: feedback }));

                setShowCompleteToast(true);
                setTimeout(() => setShowCompleteToast(false), 3000);
            }
        } catch (err) {
            console.error('피드백 저장 실패:', err.message);
            setIsGenerating(false);
            await ask({
                title: '피드백을 저장하지 못했습니다',
                body: `적어 둔 내용은 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleBulkAIAction = async () => {
        const targetPosts = posts.filter(p => p.is_submitted && !p.is_confirmed);
        if (targetPosts.length === 0) {
            notify('피드백이 필요한 새로운 미확인 글이 없어요.');
            return;
        }

        const agreed = await ask({
            title: `${targetPosts.length}명의 글에 AI 피드백을 쓰고 다시 쓰기를 요청할까요?`,
            body: '한 명씩 차례로 처리해서 시간이 걸립니다. 끝나면 학생들에게 돌아가기 알림이 갑니다.',
            confirmLabel: 'AI 피드백 쓰기 🤖'
        });
        if (!agreed) return;

        setIsGenerating(true);
        setProgress({ current: 0, total: targetPosts.length });

        try {
            const CHUNK_SIZE = 2;
            const AI_REQUEST_INTERVAL_MS = 2000;
            const processedIds = new Set();
            let lastAIRequestAt = 0;

            const toAIPayload = (p) => ({
                id: p.id,
                title: p.title,
                content: p.content,
                student_answers: p.student_answers,
                student_name: p.students?.name
            });

            // 한 교사 브라우저에서 최대 30 RPM만 시작한다. 여러 교사 사이의
            // 전역 동시성·TPM 제한은 Edge/DB 대기열에서 별도로 제어해야 한다.
            const fetchPacedAIFeedback = async (payload) => {
                const elapsed = Date.now() - lastAIRequestAt;
                if (lastAIRequestAt > 0 && elapsed < AI_REQUEST_INTERVAL_MS) {
                    await new Promise(resolve => setTimeout(resolve, AI_REQUEST_INTERVAL_MS - elapsed));
                }
                lastAIRequestAt = Date.now();
                return fetchAIFeedback(payload);
            };

            const saveFeedback = async (post, feedback) => {
                if (!post || !feedback || processedIds.has(post.id)) return false;

                try {
                    await assignmentApi.requestRewrite(post.id, feedback);
                } catch (error) {
                    console.error(`피드백 저장 실패 (${post.id}):`, error.message);
                    return false;
                }

                processedIds.add(post.id);
                return true;
            };

            const normalizeAIResults = (results, chunk) => {
                if (!results) return [];
                if (Array.isArray(results)) return results;
                if (chunk.length === 1) {
                    return [{ id: chunk[0].id, feedback: results }];
                }
                return [];
            };

            for (let i = 0; i < targetPosts.length; i += CHUNK_SIZE) {
                const chunk = targetPosts.slice(i, i + CHUNK_SIZE);
                try {
                    const results = normalizeAIResults(
                        await fetchPacedAIFeedback(chunk.map(toAIPayload)),
                        chunk
                    );
                    const returnedIds = new Set(results.map(res => String(res.id)));

                    await Promise.all(results.map((res) => {
                        const post = chunk.find(p => String(p.id) === String(res.id));
                        return saveFeedback(post, res.feedback);
                    }));

                    // 응답에서 빠진 학생만 단건으로 다시 생성한다. DB 저장 실패 때문에
                    // 같은 AI 피드백을 불필요하게 재생성하지 않는다.
                    const missingPosts = chunk.filter(p => !returnedIds.has(String(p.id)));
                    for (const post of missingPosts) {
                        const retryResults = normalizeAIResults(
                            await fetchPacedAIFeedback([toAIPayload(post)]),
                            [post]
                        );
                        const retryFeedback = retryResults.find(res => String(res.id) === String(post.id))?.feedback;
                        await saveFeedback(post, retryFeedback);
                    }
                    
                    setProgress(prev => ({ 
                        ...prev, 
                        current: Math.min(i + chunk.length, targetPosts.length) 
                    }));

                } catch (innerErr) {
                    console.error(`Chunk 처리 중 에러:`, innerErr);
                }
            }

            if (processedIds.size > 0) {
                setShowCompleteToast(true);
                setTimeout(() => setShowCompleteToast(false), 3000);
            }

            const failedCount = targetPosts.length - processedIds.size;
            await fetchPostsForMission(selectedMission);
            if (failedCount > 0) {
                // 일부만 됐다는 말은 그냥 지나가면 안 된다 — 남은 글을 다시 돌려야 한다.
                // ⚠️ '작성 중이에요' 진행 창이 실패 안내 뒤에 남지 않도록 먼저 닫는다.
                setIsGenerating(false);
                setProgress({ current: 0, total: 0 });
                await ask({
                    title: `${processedIds.size}명은 됐고 ${failedCount}명은 못 했습니다`,
                    body: '못 한 글은 제출 상태로 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.',
                    confirmLabel: '알겠어요',
                    acknowledgeOnly: true
                });
            } else {
                notify(`✨ ${processedIds.size}명의 글에 AI 피드백을 쓰고 돌려보냈어요`);
            }
        } catch {
            setIsGenerating(false);
            setProgress({ current: 0, total: 0 });
            await ask({
                title: 'AI 피드백을 마치지 못했습니다',
                body: '잠시 뒤 다시 시도해 주세요. 이미 처리된 글은 그대로 남아 있습니다.',
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setIsGenerating(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    /*
     * 다시 쓰기 요청도 승인과 같은 창을 쓴다 (2026-09-04).
     *
     * 승인만 앱 안 창으로 옮겨 두고 이쪽은 브라우저 창으로 남아 있었다. 같은 화면의 나란한 두 버튼이
     * 서로 다르게 굴면, 크롬이 "추가 대화상자 표시 안 함"으로 막았을 때 **한쪽만 조용히 먹통**이 된다.
     * 그 증상이 바로 "버튼이 한 번에 안 눌린다"로 겪게 되는 것이라 승인과 규칙을 맞춘다.
     */
    const handleRequestRewrite = async (post) => {
        // 같은 글을 두 번 누르면 두 번 보내지 않는다.
        if (rewritingPostId) return;
        const studentName = post.students?.name || '학생';
        const agreed = await ask({
            title: `${studentName} 학생에게 다시 쓰기를 요청할까요?`,
            body: '글이 학생에게 돌아가고, 피드백 칸에 적어 둔 내용이 안내로 보입니다.',
            confirmLabel: '돌려보내기 ♻️'
        });
        if (!agreed) return;

        try {
            setRewritingPostId(post.id);
            setLoadingPosts(true);
            await assignmentApi.requestRewrite(post.id, tempFeedback);

            // 끝났다는 말은 읽기만 하면 되므로 확인을 누르게 하지 않는다.
            notify(`♻️ ${studentName} 학생에게 다시 쓰기를 요청했어요`);
            setSelectedPost(null);
            setPosts((current) => current.map((item) => item.id === post.id
                ? { ...item, is_submitted: false, is_returned: true, ai_feedback: tempFeedback }
                : item));
            transitionMissionStatus(post.mission_id, 'request-rewrite', 1, [post.student_id]);
        } catch (err) {
            console.error('다시 쓰기 요청 실패:', err.message);
            /*
             * ⚠️ 알리기 **전에** 잠금을 푼다. 안 그러면 실패 창 뒤에서 목록이 계속
             *    '글을 불러오고 있어요...'로 남는다 — finally 는 창을 닫은 뒤에야 돈다.
             */
            setRewritingPostId(null);
            setLoadingPosts(false);
            // 실패는 띠로 흘리지 않는다. 그냥 지나가면 돌려보낸 줄 알고 넘어간다.
            await ask({
                title: `${studentName} 학생에게 다시 쓰기를 요청하지 못했습니다`,
                body: `${err.message}

잠시 뒤 다시 시도해 주세요. 글은 학생에게 돌아가지 않았습니다.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setRewritingPostId(null);
            setLoadingPosts(false);
        }
    };

    const handleApprovePost = async (post) => {
        // 같은 글을 두 번 누르면 두 번 보내지 않는다.
        if (approvingPostId) return;
        const studentName = post.students?.name || '학생';
        const agreed = await ask({
            title: `${studentName} 학생의 글을 승인할까요?`,
            body: '승인하면 포인트가 바로 지급되고 학생에게 알림이 갑니다.',
            confirmLabel: '승인하고 포인트 주기 🎁'
        });
        if (!agreed) return;

        try {
            setApprovingPostId(post.id);
            setLoadingPosts(true);
            const data = await pointApi.approveAssignment(post.id, tempFeedback);

            const awardedPoints = Number(data?.points_awarded || 0);
            // 끝났다는 말은 읽기만 하면 되므로 확인을 누르게 하지 않는다.
            notify(data?.status === 'already_approved'
                ? `${studentName} 학생의 글은 이미 승인되어 있어요. 포인트는 다시 주지 않았습니다.`
                : `✅ ${studentName} 학생 승인 · ${awardedPoints}P 지급`);
            setSelectedPost(null);
            if (data?.status !== 'already_approved') {
                setPosts((current) => current.map((item) => item.id === post.id
                    ? { ...item, is_submitted: true, is_confirmed: true, is_returned: false, ai_feedback: tempFeedback }
                    : item));
                if (selectedMission?.mission_type !== 'meeting') {
                    transitionMissionStatus(post.mission_id, 'approve', 1, [post.student_id]);
                }
            }
        } catch (err) {
            console.error('승인 처리 실패:', err.message);
            /*
             * ⚠️ 알리기 **전에** 잠금을 푼다. 안 그러면 실패 창 뒤에서 목록이 계속
             *    '글을 불러오고 있어요...'로 남는다 — finally 는 창을 닫은 뒤에야 돈다.
             */
            setApprovingPostId(null);
            setLoadingPosts(false);
            // 실패는 띠로 흘리지 않는다. 그냥 지나가면 승인이 된 줄 알고 넘어간다.
            await ask({
                title: `${studentName} 학생의 글을 승인하지 못했습니다`,
                body: `${err.message}

잠시 뒤 다시 시도해 주세요. 포인트는 지급되지 않았습니다.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setApprovingPostId(null);
            setLoadingPosts(false);
        }
    };

    const handleBulkApprove = async () => {
        const toApprove = posts.filter(p => p.is_submitted && !p.is_confirmed);
        if (toApprove.length === 0) {
            notify('승인을 기다리는 글이 없어요.');
            return;
        }

        const agreed = await ask({
            title: `${toApprove.length}명의 글을 모두 승인할까요?`,
            body: '승인하면 포인트가 바로 지급되고 학생들에게 알림이 갑니다.',
            confirmLabel: '모두 승인하고 포인트 주기 🎁'
        });
        if (!agreed) return;

        setLoadingPosts(true);
        try {
            const data = await pointApi.approveAssignments(toApprove.map((post) => post.id));
            notify(`🎉 ${data?.approved_count ?? toApprove.length}명 승인 · ${data?.points_awarded ?? 0}P 지급`);
            const approvedIds = new Set(toApprove.map((post) => post.id));
            setPosts((current) => current.map((post) => approvedIds.has(post.id)
                ? { ...post, is_submitted: true, is_confirmed: true, is_returned: false }
                : post));
            if (selectedMission.mission_type !== 'meeting') {
                const approvedCount = Number(data?.approved_count ?? toApprove.length);
                transitionMissionStatus(
                    selectedMission.id,
                    'approve',
                    approvedCount,
                    toApprove.slice(0, approvedCount).map((post) => post.student_id)
                );
            }
        } catch (err) {
            console.error('일괄 승인 실패:', err.message);
            setLoadingPosts(false);
            await ask({
                title: '일괄 승인을 마치지 못했습니다',
                body: `${err.message}

잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleRecovery = async (post) => {
        const agreed = await ask({
            title: '승인을 취소하고 포인트를 회수할까요?',
            body: '학생의 총점에서 지급했던 포인트가 차감됩니다.',
            confirmLabel: '승인 취소하기 ⚠️',
            tone: 'danger'
        });
        if (!agreed) return;

        setLoadingPosts(true);
        try {
            const data = await pointApi.recoverAssignment(post.id, tempFeedback);

            const recoveredPoints = Number(data?.points_recovered || 0);
            notify(data?.status === 'already_recovered'
                ? '이미 승인이 취소된 글이에요. 포인트를 더 회수하지 않았습니다.'
                : `⚠️ 승인 취소 · ${recoveredPoints}P 회수`);
            setSelectedPost(null);
            if (data?.status !== 'already_recovered') {
                setPosts((current) => current.map((item) => item.id === post.id
                    ? { ...item, is_confirmed: false, ai_feedback: tempFeedback }
                    : item));
                if (selectedMission?.mission_type !== 'meeting') {
                    transitionMissionStatus(post.mission_id, 'recover', 1, [post.student_id]);
                }
            }
        } catch (err) {
            console.error('회수 실패:', err.message);
            /*
             * ⚠️ 알리기 **전에** 잠금을 푼다. `finally` 는 창을 닫은 뒤에야 돌기 때문에,
             *    먼저 창을 띄우면 그 뒤에서 목록이 계속 '불러오는 중'으로 남는다.
             */
            setLoadingPosts(false);
            await ask({
                title: '승인 취소를 마치지 못했습니다',
                body: `${err.message}

포인트는 그대로입니다. 잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleBulkRecovery = async () => {
        const toRecover = posts.filter(p => p.is_confirmed);
        if (toRecover.length === 0) {
            notify('승인을 취소할 글이 없어요.');
            return;
        }

        const agreed = await ask({
            title: `${toRecover.length}명의 승인을 취소하고 포인트를 회수할까요?`,
            body: '지급했던 포인트가 모두 차감됩니다.',
            confirmLabel: '모두 승인 취소하기 ⚠️',
            tone: 'danger'
        });
        if (!agreed) return;

        setLoadingPosts(true);
        try {
            const data = await pointApi.recoverAssignments(toRecover.map((post) => post.id));
            notify(`⚠️ ${data?.recovered_count ?? toRecover.length}명 승인 취소 · ${data?.points_recovered ?? 0}P 회수`);
            const recoveredIds = new Set(toRecover.map((post) => post.id));
            setPosts((current) => current.map((post) => recoveredIds.has(post.id)
                ? { ...post, is_confirmed: false }
                : post));
            if (selectedMission.mission_type !== 'meeting') {
                const recoveredCount = Number(data?.recovered_count ?? toRecover.length);
                transitionMissionStatus(
                    selectedMission.id,
                    'recover',
                    recoveredCount,
                    toRecover.slice(0, recoveredCount).map((post) => post.student_id)
                );
            }
        } catch (err) {
            console.error('일괄 회수 실패:', err.message);
            setLoadingPosts(false);
            await ask({
                title: '일괄 승인 취소를 마치지 못했습니다',
                body: `잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleBulkRequestRewrite = async () => {
        const toRewrite = posts.filter(p => p.is_submitted && !p.is_confirmed && !p.is_returned);
        if (toRewrite.length === 0) {
            notify('다시 쓰기를 요청할 미확인 제출글이 없어요.');
            return;
        }

        const agreed = await ask({
            title: `${toRewrite.length}명에게 다시 쓰기를 요청할까요?`,
            body: '글이 학생들에게 돌아가고 돌아가기 알림이 갑니다.',
            confirmLabel: '모두 돌려보내기 ♻️'
        });
        if (!agreed) return;

        setLoadingPosts(true);
        try {
            const result = await assignmentApi.requestRewrites(toRewrite.map((post) => post.id));
            const requestedCount = Number(result?.requested_count ?? toRewrite.length);
            notify(`♻️ ${requestedCount}명에게 다시 쓰기를 요청했어요`);
            const rewrittenIds = new Set(toRewrite.map((post) => post.id));
            setPosts((current) => current.map((post) => rewrittenIds.has(post.id)
                ? { ...post, is_submitted: false, is_returned: true, is_confirmed: false }
                : post));
            transitionMissionStatus(
                selectedMission.id,
                'request-rewrite',
                requestedCount,
                toRewrite.slice(0, requestedCount).map((post) => post.student_id)
            );
        } catch (err) {
            console.error('일괄 다시 쓰기 요청 실패:', err.message);
            setLoadingPosts(false);
            await ask({
                title: '일괄 다시 쓰기 요청을 마치지 못했습니다',
                body: `${err.message}

잠시 뒤 다시 시도해 주세요. 글은 학생들에게 돌아가지 않았습니다.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setLoadingPosts(false);
        }
    };

    /*
     * 저장해 둔 문장으로 일괄 다시 쓰기 요청 (AI 를 거치지 않는 두 번째 갈래).
     *
     * 왜 따로 있나: `handleBulkAIAction` 은 글마다 AI 를 부르느라 25명이면 1분 가까이 걸리고
     * 호출도 25번 나간다. 반 전체에 같은 지시를 내릴 때는 AI 가 필요 없다. 여기서는 호출이 0회다.
     * `handleBulkRequestRewrite` 와도 다르다 — 그쪽은 **아무 말 없이** 돌려보낸다.
     *
     * 이미 피드백이 적힌 글은 덮어쓰지 않고 아래에 덧붙인다(낱개와 같은 규칙).
     * 덧붙일 것이 없는 글은 한 번의 일괄 호출로 보내 왕복을 줄인다.
     */
    const handleBulkPhraseRewrite = async (message) => {
        const text = String(message || '').trim();
        if (!text) return;

        const targets = posts.filter(p => p.is_submitted && !p.is_confirmed && !p.is_returned);
        if (targets.length === 0) {
            notify('다시 쓰기를 요청할 미확인 제출글이 없어요.');
            return;
        }

        const hasFeedback = (post) => Boolean(String(post.ai_feedback || '').trim());
        const toAppend = targets.filter(hasFeedback);
        const toSend = targets.filter((post) => !hasFeedback(post));

        // 물음은 제목이 하고, 본문은 **무엇이 나가는지**만 보여 준다(제목과 겹쳐 적지 않는다).
        const confirmMessage = [
            text,
            '',
            toAppend.length > 0 ? `※ ${toAppend.length}명은 이미 적힌 피드백을 지우지 않고 아래에 덧붙입니다.` : null,
            '학생들에게 돌아가기 알림이 갑니다.'
        ].filter((line) => line !== null).join('\n');
        if (!await ask({
            title: `${targets.length}명에게 이 문장으로 다시 쓰기를 요청할까요?`,
            body: confirmMessage,
            confirmLabel: '모두 돌려보내기 ♻️'
        })) return;

        setLoadingPosts(true);
        try {
            const applied = new Map();
            let requestedCount = 0;

            // 서버가 한 번에 받는 최대 건수(bulk_request_assignment_rewrite_v1)
            const BULK_LIMIT = 100;
            for (let index = 0; index < toSend.length; index += BULK_LIMIT) {
                const chunk = toSend.slice(index, index + BULK_LIMIT);
                const result = await assignmentApi.requestRewrites(chunk.map((post) => post.id), text);
                requestedCount += Number(result?.requested_count ?? chunk.length);
                chunk.forEach((post) => applied.set(post.id, text));
            }

            for (const post of toAppend) {
                const merged = appendFeedbackMessage(post.ai_feedback, text);
                const result = await assignmentApi.requestRewrite(post.id, merged);
                if (result?.status === 'requested') {
                    requestedCount += 1;
                    applied.set(post.id, merged);
                }
            }

            notify(requestedCount > 0
                ? `♻️ ${requestedCount}명에게 문장을 담아 다시 쓰기를 요청했어요`
                : '이미 다시 쓰기를 요청한 글이라 새로 보낸 것이 없어요.');

            setPosts((current) => current.map((post) => (applied.has(post.id)
                ? { ...post, is_submitted: false, is_returned: true, is_confirmed: false, ai_feedback: applied.get(post.id) }
                : post)));
            if (requestedCount > 0) {
                transitionMissionStatus(
                    selectedMission.id,
                    'request-rewrite',
                    requestedCount,
                    targets.filter((post) => applied.has(post.id)).slice(0, requestedCount).map((post) => post.student_id)
                );
            }
            // 일괄 호출은 건별 결과를 돌려주지 않는다. 화면 값을 서버 값으로 다시 맞춘다.
            await fetchPostsForMission(selectedMission);
        } catch (err) {
            console.error('문장 일괄 다시 쓰기 요청 실패:', err.message);
            setLoadingPosts(false);
            await ask({
                title: '일괄 다시 쓰기 요청을 마치지 못했습니다',
                body: `${err.message}

잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleFinalArchive = async () => {
        if (!archiveModal.mission) return;
        try {
            const { error } = await supabase
                .from('writing_missions')
                .update({
                    is_archived: true,
                    archived_at: new Date().toISOString()
                })
                .eq('id', archiveModal.mission.id);

            if (error) throw error;
            
            // [추가] 캐시 무효화
            if (activeClass?.id) {
                dataCache.invalidate(`missions_v2_${activeClass.id}`);
                dataCache.invalidate(`missions_${activeClass.id}`);
            }

            setArchiveModal({ isOpen: false, mission: null, hasIncomplete: false });
            fetchMissions();
        } catch (err) {
            await ask({
                title: '과제를 보관하지 못했습니다',
                body: `${err.message}

잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        }
    };

    // [신규] 미션 하드 삭제 (🗑️ 버튼용)
    const handleDeleteMission = async (missionId) => {
        if (!missionId) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('writing_missions')
                .delete()
                .eq('id', missionId);

            if (error) throw error;

            // [핵심] 캐시 무효화로 즉시 반영 보장
            if (activeClass?.id) {
                dataCache.invalidate(`missions_v2_${activeClass.id}`);
                dataCache.invalidate(`missions_${activeClass.id}`);
            }

            fetchMissions();
            return true;
        } catch (err) {
            console.error('미션 삭제 실패:', err.message);
            await ask({
                title: '과제를 지우지 못했습니다',
                body: `${err.message}

잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        } finally {
            setLoading(false);
        }
    };

    // 교사 댓글 등록
    const addTeacherComment = async (postId, content) => {
        if (!content.trim() || !postId) return false;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return false;

            const { error } = await supabase
                .from('post_comments')
                .insert({
                    post_id: postId,
                    class_id: activeClass?.id,
                    teacher_id: user.id,
                    student_id: null,
                    content: content.trim(),
                    status: 'approved'
                });

            if (error) throw error;
            await fetchReactionsAndComments(postId);
            return true;
        } catch (err) {
            console.error('교사 댓글 등록 실패:', err.message);
            await ask({
                title: '댓글을 남기지 못했습니다',
                body: `${err.message}

적은 내용은 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        }
    };

    // 교사 댓글 삭제
    const deleteTeacherComment = async (commentId, postId) => {
        if (!commentId) return false;
        try {
            const { error } = await supabase
                .from('post_comments')
                .delete()
                .eq('id', commentId);

            if (error) throw error;
            if (postId) await fetchReactionsAndComments(postId);
            return true;
        } catch (err) {
            console.error('교사 댓글 삭제 실패:', err.message);
            await ask({
                title: '댓글을 지우지 못했습니다',
                body: `${err.message}

잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        }
    };

    const handleTeacherEditPost = async (postId, title, content) => {
        if (!postId) return false;
        try {
            const { error } = await supabase.rpc('teacher_edit_student_post', {
                p_post_id: postId,
                p_title: title,
                p_content: content
            });

            if (error) throw error;

            if (selectedMission) {
                const refreshedPosts = await fetchPostsForMission(selectedMission);
                const refreshedPost = refreshedPosts.find((post) => post.id === postId);
                if (refreshedPost) {
                    setSelectedPost(refreshedPost);
                }
            }

            return true;
        } catch (err) {
            console.error('교사 글 수정 실패:', err.message);
            await ask({
                title: '수정본을 저장하지 못했습니다',
                body: `${err.message}

고친 내용은 화면에 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        }
    };

    const postOutlineReference = postOutlineReferenceState.postId === selectedPostId
        ? postOutlineReferenceState.result
        : undefined;

    return {
        missions, submissionCounts, submissionBoard, submissionBoardPollError,
        submissionBoardMissionId, submissionBoardScopeLoading, selectSubmissionBoardMission,
        loadSubmissionHistory,
        isFormOpen, setIsFormOpen, loading,
        selectedMission, setSelectedMission, posts, setPosts, selectedPost, setSelectedPost,
        loadingPosts, isGenerating, showCompleteToast, setShowCompleteToast,
        // 승인 확인 창과 알림 띠. 그릴 자리는 화면 쪽이 정한다.
        approvingPostId, rewritingPostId, confirmDialog, notice, ask, notify,
        tempFeedback, setTempFeedback, postReactions, postComments, totalStudentCount,
        postOutlineReference, postDetailLoading, refreshSelectedPostDetail,
        archiveModal, setArchiveModal, progress, isEditing, formData, setFormData, editingMissionId,
        handleEditClick, handleCancelEdit, handleSubmit, fetchPostsForMission,
        handleGenerateSingleAI, handleBulkAIAction, handleRequestRewrite,
        handleApprovePost, handleBulkApprove, handleRecovery, handleBulkRecovery,
        handleRecallPosts, handleUndoRecall,
        handleBulkRequestRewrite,
        handleBulkPhraseRewrite,
        handleFinalArchive, handleDeleteMission, fetchMissions,
        handleGenerateQuestions, isGeneratingQuestions,
        handleSaveDefaultRubric,
        isEvaluationMode, setIsEvaluationMode, handleEvaluationMode,
        frequentTags, saveFrequentTag, removeFrequentTag,
        handleSaveDefaultSettings,
        addTeacherComment, deleteTeacherComment, handleTeacherEditPost
    };
};
