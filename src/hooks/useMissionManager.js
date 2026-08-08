import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { callAI } from '../lib/openai';
import { sanitizeFeedback } from '../utils/aiFeedbackGuard';
import { dataCache } from '../lib/cache';
import { readLocalStorageJson } from '../lib/browserStorage';
import { pointApi } from '../modules/points/pointApi';

export const useMissionManager = (activeClass, bootstrapProfile = null) => {
    const [missions, setMissions] = useState([]);
    const [submissionCounts, setSubmissionCounts] = useState({});
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showCompleteToast, setShowCompleteToast] = useState(false);
    const [tempFeedback, setTempFeedback] = useState('');
    const [postReactions, setPostReactions] = useState([]);
    const [postComments, setPostComments] = useState([]);
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
            alert('현재 루브릭의 단계와 명칭이 계정에 저장되었습니다! 💾\n어디서든 로그인하면 이 설정이 기본으로 적용됩니다.');
        } catch (err) {
            console.error('루브릭 저장 실패:', err);
            alert('저장 중 오류가 발생했습니다.');
        }
    };

    const handleSaveDefaultSettings = async () => {
        const settingsToSave = {
            min_chars: formData.min_chars,
            min_paragraphs: formData.min_paragraphs,
            base_reward: formData.base_reward,
            bonus_threshold: formData.bonus_threshold,
            bonus_reward: formData.bonus_reward,
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
            alert('분량, 포인트, 댓글 설정이 계정에 저장되었습니다! 💾\n어디서든 로그인하면 이 설정이 기본으로 적용됩니다.');
        } catch (err) {
            console.error('설정 저장 실패:', err);
            // DB 저장 실패해도 로컬스토리지는 성공했을 수 있으므로 안내 메시지 조절
            alert('설정 저장에 저장되었으나 동기화 중 일부 오류가 발생했습니다.');
        }
    };

    const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);

    const fetchMissionDetails = useCallback(async (missionId) => {
        if (!missionId) return null;

        const { data, error } = await supabase
            .from('writing_missions')
            .select('id, title, guide, genre, mission_type, input_template, template_config, min_chars, min_paragraphs, guide_questions, is_archived, created_at, base_reward, bonus_threshold, bonus_reward, allow_comments, tags, evaluation_rubric')
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
            setMissions(overview.missions || []);
            setTotalStudentCount(Number(overview.total_students || 0));
            setSubmissionCounts(overview.submission_counts || {});
        } catch (err) {
            console.error('글쓰기 미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [activeClass?.id]);

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
                .select('id, title, guide, genre, mission_type, input_template, template_config, min_chars, min_paragraphs, guide_questions, base_reward, bonus_threshold, bonus_reward, allow_comments, tags, evaluation_rubric')
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
            alert('주제를 먼저 입력해주세요! ✨');
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
            alert('질문을 생성하는 도중 오류가 발생했습니다.');
        } finally {
            setIsGeneratingQuestions(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title.trim() || !formData.guide.trim()) {
            alert('주제와 안내 내용을 입력해주세요! ✍️');
            return;
        }

        try {
            if (isEditing) {
                const { error } = await supabase
                    .from('writing_missions')
                    .update({ ...formData, mission_type: formData.genre })
                    .eq('id', editingMissionId);

                if (error) throw error;
                alert('글쓰기 미션이 성공적으로 수정되었습니다! ✏️');
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                const { error } = await supabase.from('writing_missions').insert({
                    ...formData,
                    mission_type: formData.genre,
                    class_id: activeClass.id,
                    teacher_id: user?.id
                });
                if (error) throw error;
                alert('새로운 글쓰기 미션이 공개되었습니다! 🚀');
            }

            // [추가] 캐시 무효화로 즉각 반영 보장
            if (activeClass?.id) {
                dataCache.invalidate(`missions_v2_${activeClass.id}`);
                dataCache.invalidate(`missions_${activeClass.id}`);
            }

            handleCancelEdit();
            fetchMissions();
        } catch (error) {
            alert('글쓰기 미션 저장 실패: ' + error.message);
        }
    };

    const fetchReactionsAndComments = async (postId) => {
        if (!postId) return;
        try {
            const { data: detail, error } = await supabase.rpc('get_teacher_post_detail_v1', { p_post_id: postId });
            if (error) throw error;
            setPostReactions((detail?.reactions || []).map((reaction) => ({
                ...reaction,
                students: reaction.student_name ? { name: reaction.student_name } : null
            })));
            setPostComments((detail?.comments || []).map((comment) => ({
                ...comment,
                students: comment.student_name ? { name: comment.student_name } : null
            })));
        } catch (err) {
            console.error('반응/댓글 로드 실패:', err.message);
        }
    };

    useEffect(() => {
        if (selectedPost) {
            fetchReactionsAndComments(selectedPost.id);
            setTempFeedback(selectedPost.ai_feedback || '');
        } else {
            setPostReactions([]);
            setPostComments([]);
            setTempFeedback('');
            setIsEvaluationMode(false); // 뷰어 닫힐 때 평가 모드 초기화
        }
    }, [selectedPost]);

    const handleEvaluationMode = async (mission) => {
        const fetchedPosts = await fetchPostsForMission(mission);
        if (fetchedPosts && fetchedPosts.length > 0) {
            setSelectedPost(fetchedPosts[0]);
            setIsEvaluationMode(true);
        } else {
            alert('아직 제출한 학생이 없습니다. 🐥');
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
                    original_title, original_content, first_submitted_at, initial_eval, final_eval, eval_comment, student_answers,
                    awarded_base_reward, awarded_bonus_reward, awarded_bonus_threshold,
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
            alert('글을 불러오는 도중 오류가 발생했습니다.');
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
                return `[학생 ${idx + 1}]\nID: ${p.id}\n성함: ${p.student_name || '학생'}\n제목: ${p.title}\n내용: ${p.content}${qaSection}`;
            }).join('\n\n')}`;
        } else {
            let qaSection = "";
            const p = postArray[0];
            if (selectedMission?.guide_questions?.length > 0 && p.student_answers?.length > 0) {
                qaSection = "\n[핵심질문에 대한 답변]\n" + selectedMission.guide_questions.map((q, i) => `질문${i + 1}: ${q}\n답변${i + 1}: ${Reflect.get(p.student_answers, i) || '(답변 없음)'}`).join('\n');
            }
            prompt = `${basePrompt}\n\n---\n[학생 정보]\n이름: ${p.student_name || '학생'}\n글 제목: "${p.title}"\n글 내용:\n"${p.content}"${qaSection}`;
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
            .select('id');

        if (selectedMission) await fetchPostsForMission(selectedMission);

        if (error) {
            console.error('회수 실패:', error.message);
            return { count: 0, failed: list.length, error };
        }

        const count = updated?.length ?? 0;
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
            alert('피드백을 저장하는 중 오류가 발생했습니다.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleBulkAIAction = async () => {
        const targetPosts = posts.filter(p => p.is_submitted && !p.is_confirmed);
        if (targetPosts.length === 0) {
            alert('피드백이 필요한 새로운 미확인 글이 없습니다.');
            return;
        }

        if (!confirm(`${targetPosts.length}개의 글에 대해 AI 피드백을 생성하고, '다시 쓰기'를 일괄 요청하시겠습니까? 🤖♻️`)) return;

        setIsGenerating(true);
        setProgress({ current: 0, total: targetPosts.length });

        try {
            const allUpdatePromises = [];
            const processedIds = [];
            const CHUNK_SIZE = 2;

            const toAIPayload = (p) => ({
                id: p.id,
                title: p.title,
                content: p.content,
                student_answers: p.student_answers,
                student_name: p.students?.name
            });

            const queueFeedbackUpdate = (post, feedback) => {
                if (!post || !feedback || processedIds.includes(post.id)) return;

                processedIds.push(post.id);
                allUpdatePromises.push(
                    supabase
                        .from('student_posts')
                        .update({
                            ai_feedback: feedback,
                            is_submitted: false,
                            is_returned: true
                        })
                        .eq('id', post.id)
                );
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
                        await fetchAIFeedback(chunk.map(toAIPayload)),
                        chunk
                    );

                    for (const res of results) {
                        const post = chunk.find(p => p.id === res.id);
                        queueFeedbackUpdate(post, res.feedback);
                    }

                    const missingPosts = chunk.filter(p => !processedIds.includes(p.id));
                    for (const post of missingPosts) {
                        const retryResults = normalizeAIResults(
                            await fetchAIFeedback([toAIPayload(post)]),
                            [post]
                        );
                        const retryFeedback = retryResults.find(res => res.id === post.id)?.feedback;
                        queueFeedbackUpdate(post, retryFeedback);
                    }
                    
                    setProgress(prev => ({ 
                        ...prev, 
                        current: Math.min(i + chunk.length, targetPosts.length) 
                    }));

                    // [최적화] API 부하 방지 지연 최소화 (청크 처리에 따라 빈도 감소)
                    if (i + CHUNK_SIZE < targetPosts.length) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (innerErr) {
                    console.error(`Chunk 처리 중 에러:`, innerErr);
                }
            }

            // [최종 최적화] 수집된 DB 작업들을 일괄 처리
            const dbTasks = [];
            if (allUpdatePromises.length > 0) {
                dbTasks.push(Promise.all(allUpdatePromises).then((results) => {
                    const failed = results.find((result) => result.error);
                    if (failed?.error) throw failed.error;
                    return results;
                }));
            }

            if (dbTasks.length > 0) {
                await Promise.all(dbTasks);
            }

            setShowCompleteToast(true);
            setTimeout(() => setShowCompleteToast(false), 3000);
            alert('모든 글에 대한 일괄 처리가 완료되었습니다! ✨');
            fetchPostsForMission(selectedMission);
        } catch {
            alert('일괄 처리 중 오류가 발생했습니다.');
        } finally {
            setIsGenerating(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    const handleRequestRewrite = async (post) => {
        if (!confirm('학생에게 이 글을 돌려보내고 다시 쓰기를 요청할까요? ♻️\n학생의 화면에 안내 문구가 표시됩니다.')) return;

        try {
            // [최적화] 글 상태 업데이트와 포인트 로그 삽입을 병렬 처리
            const { error: postError } = await supabase.from('student_posts').update({
                is_submitted: false,
                is_returned: true,
                ai_feedback: tempFeedback
            }).eq('id', post.id);

            if (postError) throw postError;

            alert('다시 쓰기 요청을 전달했습니다! 📤');
            setSelectedPost(null);
            if (selectedMission) fetchPostsForMission(selectedMission);
        } catch (err) {
            console.error('다시 쓰기 요청 실패:', err.message);
            alert(`요청 중 오류 발생: ${err.message}`);
        }
    };

    const handleApprovePost = async (post) => {
        if (!confirm(`${post.students?.name} 학생의 글을 승인하고 포인트를 지급하시겠습니까? 🎁`)) return;

        try {
            setLoadingPosts(true);
            const data = await pointApi.approveAssignment(post.id, tempFeedback);

            const awardedPoints = Number(data?.points_awarded || 0);
            alert(data?.status === 'already_approved'
                ? '이미 승인된 글입니다. 포인트는 다시 지급하지 않았습니다.'
                : `✅ 승인과 ${awardedPoints}포인트 지급이 함께 완료되었습니다!`);
            setSelectedPost(null);
            if (data?.status !== 'already_approved') {
                setPosts((current) => current.map((item) => item.id === post.id
                    ? { ...item, is_submitted: true, is_confirmed: true, is_returned: false, ai_feedback: tempFeedback }
                    : item));
                if (selectedMission?.mission_type !== 'meeting') {
                    setSubmissionCounts((current) => ({
                        ...current,
                        [post.mission_id]: (current[post.mission_id] || 0) + 1
                    }));
                }
            }
        } catch (err) {
            console.error('승인 처리 실패:', err.message);
            alert('승인 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleBulkApprove = async () => {
        const toApprove = posts.filter(p => p.is_submitted && !p.is_confirmed);
        if (toApprove.length === 0) {
            alert('승인 대기 중인 글이 없습니다.');
            return;
        }

        if (!confirm(`제출된 ${toApprove.length}개의 글을 모두 승인하고 포인트를 지급하시겠습니까? 🎁`)) return;

        setLoadingPosts(true);
        try {
            const data = await pointApi.approveAssignments(toApprove.map((post) => post.id));
            alert(`🎉 ${data?.approved_count ?? toApprove.length}건 승인, ${data?.points_awarded ?? 0}포인트 지급 완료!`);
            const approvedIds = new Set(toApprove.map((post) => post.id));
            setPosts((current) => current.map((post) => approvedIds.has(post.id)
                ? { ...post, is_submitted: true, is_confirmed: true, is_returned: false }
                : post));
            if (selectedMission.mission_type !== 'meeting') {
                setSubmissionCounts((current) => ({
                    ...current,
                    [selectedMission.id]: (current[selectedMission.id] || 0) + Number(data?.approved_count ?? toApprove.length)
                }));
            }
        } catch (err) {
            console.error('일괄 승인 실패:', err.message);
            alert('일괄 처리 중 오류가 발생했습니다.');
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleRecovery = async (post) => {
        if (!confirm('승인을 취소하고 지급된 포인트를 회수하시겠습니까? ⚠️\n학생의 총점에서 해당 포인트가 차감됩니다.')) return;

        setLoadingPosts(true);
        try {
            const data = await pointApi.recoverAssignment(post.id, tempFeedback);

            const recoveredPoints = Number(data?.points_recovered || 0);
            alert(data?.status === 'already_recovered'
                ? '이미 승인이 취소된 글입니다. 포인트를 추가로 회수하지 않았습니다.'
                : `✅ 승인 취소와 ${recoveredPoints}포인트 회수가 함께 완료되었습니다.`);
            setSelectedPost(null);
            if (data?.status !== 'already_recovered') {
                setPosts((current) => current.map((item) => item.id === post.id
                    ? { ...item, is_confirmed: false, ai_feedback: tempFeedback }
                    : item));
                if (selectedMission?.mission_type !== 'meeting') {
                    setSubmissionCounts((current) => ({
                        ...current,
                        [post.mission_id]: Math.max(0, (current[post.mission_id] || 0) - 1)
                    }));
                }
            }
        } catch (err) {
            console.error('회수 실패:', err.message);
            alert('회수 처리 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleBulkRecovery = async () => {
        const toRecover = posts.filter(p => p.is_confirmed);
        if (toRecover.length === 0) {
            alert('회수 가능한(승인 완료된) 글이 없습니다.');
            return;
        }

        if (!confirm(`${toRecover.length}개의 글에 대해 승인을 취소하고 포인트를 일괄 회수하시겠습니까? ⚠️\n지급되었던 포인트가 모두 차감됩니다.`)) return;

        setLoadingPosts(true);
        try {
            const data = await pointApi.recoverAssignments(toRecover.map((post) => post.id));
            alert(`✅ ${data?.recovered_count ?? toRecover.length}건 승인 취소, ${data?.points_recovered ?? 0}포인트 회수 완료!`);
            const recoveredIds = new Set(toRecover.map((post) => post.id));
            setPosts((current) => current.map((post) => recoveredIds.has(post.id)
                ? { ...post, is_confirmed: false }
                : post));
            if (selectedMission.mission_type !== 'meeting') {
                setSubmissionCounts((current) => ({
                    ...current,
                    [selectedMission.id]: Math.max(0, (current[selectedMission.id] || 0) - Number(data?.recovered_count ?? toRecover.length))
                }));
            }
        } catch (err) {
            console.error('일괄 회수 실패:', err.message);
            alert('일괄 회수 중 오류가 발생했습니다.');
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleBulkRequestRewrite = async () => {
        const toRewrite = posts.filter(p => (p.is_submitted || p.is_confirmed) && !p.is_returned);
        if (toRewrite.length === 0) {
            alert('다시 쓰기를 요청할 미확인 제출글이 없습니다.');
            return;
        }

        if (!confirm(`제출된 ${toRewrite.length}개의 글에 대해 일괄 다시 쓰기를 요청하시겠습니까? ♻️\n학생들에게 돌아가기 알림이 전송됩니다.`)) return;

        setLoadingPosts(true);
        try {
            const rewritePromises = toRewrite.map(async (post) => {
                const { error } = await supabase
                    .from('student_posts')
                    .update({
                        is_submitted: false,
                        is_returned: true,
                        is_confirmed: false
                    })
                    .eq('id', post.id);
                if (error) throw error;
            });

            await Promise.all(rewritePromises);
            alert(`✅ ${toRewrite.length}건 일괄 다시 쓰기 요청 완료!`);
            if (selectedMission) fetchPostsForMission(selectedMission);
        } catch (err) {
            console.error('일괄 다시 쓰기 요청 실패:', err.message);
            alert('일괄 처리 중 오류가 발생했습니다.');
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
            alert('보관 처리 중 오류가 발생했습니다: ' + err.message);
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
            alert('미션 삭제 중 오류가 발생했습니다: ' + err.message);
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
            alert('댓글 등록 중 오류가 발생했습니다: ' + err.message);
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
            alert('댓글 삭제 중 오류가 발생했습니다: ' + err.message);
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
            alert('학생 글 수정 저장 중 오류가 발생했습니다: ' + err.message);
            return false;
        }
    };

    return {
        missions, submissionCounts, isFormOpen, setIsFormOpen, loading,
        selectedMission, setSelectedMission, posts, setPosts, selectedPost, setSelectedPost,
        loadingPosts, isGenerating, showCompleteToast, setShowCompleteToast,
        tempFeedback, setTempFeedback, postReactions, postComments, totalStudentCount,
        archiveModal, setArchiveModal, progress, isEditing, formData, setFormData, editingMissionId,
        handleEditClick, handleCancelEdit, handleSubmit, fetchPostsForMission,
        handleGenerateSingleAI, handleBulkAIAction, handleRequestRewrite,
        handleApprovePost, handleBulkApprove, handleRecovery, handleBulkRecovery,
        handleRecallPosts, handleUndoRecall,
        handleBulkRequestRewrite,
        handleFinalArchive, handleDeleteMission, fetchMissions,
        handleGenerateQuestions, isGeneratingQuestions,
        handleSaveDefaultRubric,
        isEvaluationMode, setIsEvaluationMode, handleEvaluationMode,
        frequentTags, saveFrequentTag, removeFrequentTag,
        handleSaveDefaultSettings,
        addTeacherComment, deleteTeacherComment, handleTeacherEditPost
    };
};
