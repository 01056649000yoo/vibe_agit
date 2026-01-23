import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useMissionManager = (activeClass, fetchMissionsCallback) => {
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

    const [formData, setFormData] = useState({
        title: '',
        guide: '',
        genre: '일기',
        min_chars: 100,
        min_paragraphs: 1,
        base_reward: 100,
        bonus_threshold: 100,
        bonus_reward: 10,
        allow_comments: true
    });

    const fetchMissions = useCallback(async () => {
        if (!activeClass?.id) return;
        setLoading(true);
        try {
            const [missionsResult, studentCountResult] = await Promise.all([
                supabase
                    .from('writing_missions')
                    .select('id, title, guide, genre, min_chars, min_paragraphs, base_reward, bonus_threshold, bonus_reward, allow_comments, is_archived, created_at')
                    .eq('class_id', activeClass.id)
                    .eq('is_archived', false)
                    .order('created_at', { ascending: false }),

                supabase
                    .from('students')
                    .select('id', { count: 'exact', head: true })
                    .eq('class_id', activeClass.id)
            ]);

            if (missionsResult.error) throw missionsResult.error;
            const data = missionsResult.data || [];
            setMissions(data);

            if (studentCountResult.error) console.error('학생 수 조회 실패:', studentCountResult.error);
            else setTotalStudentCount(studentCountResult.count || 0);

            if (data && data.length > 0) {
                const missionIds = data.map(m => m.id);
                const { data: counts, error: countError } = await supabase
                    .from('student_posts')
                    .select('mission_id')
                    .in('mission_id', missionIds);

                if (!countError && counts) {
                    const stats = counts.reduce((acc, curr) => {
                        acc[curr.mission_id] = (acc[curr.mission_id] || 0) + 1;
                        return acc;
                    }, {});
                    setSubmissionCounts(stats);
                }
            }
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

    const handleEditClick = (mission) => {
        setFormData({
            title: mission.title,
            guide: mission.guide,
            genre: mission.genre,
            min_chars: mission.min_chars,
            min_paragraphs: mission.min_paragraphs,
            base_reward: mission.base_reward,
            bonus_threshold: mission.bonus_threshold,
            bonus_reward: mission.bonus_reward,
            allow_comments: mission.allow_comments
        });
        setEditingMissionId(mission.id);
        setIsEditing(true);
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditingMissionId(null);
        setFormData({ title: '', guide: '', genre: '일기', min_chars: 100, min_paragraphs: 1, base_reward: 100, bonus_threshold: 100, bonus_reward: 10, allow_comments: true });
        setIsFormOpen(false);
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
                    .update({ ...formData })
                    .eq('id', editingMissionId);

                if (error) throw error;
                alert('글쓰기 미션이 성공적으로 수정되었습니다! ✏️');
            } else {
                const { error } = await supabase.from('writing_missions').insert({ ...formData, class_id: activeClass.id });
                if (error) throw error;
                alert('새로운 글쓰기 미션이 공개되었습니다! 🚀');
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
            const { data: reactions, error: rxError } = await supabase
                .from('post_reactions')
                .select('id, reaction_type, student_id, created_at')
                .eq('post_id', postId);
            if (!rxError) setPostReactions(reactions || []);

            const { data: comments, error: cmError } = await supabase
                .from('post_comments')
                .select('id, content, student_id, created_at, students(name)')
                .eq('post_id', postId)
                .order('created_at', { ascending: true });
            if (!cmError) setPostComments(comments || []);
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
        }
    }, [selectedPost]);

    const fetchPostsForMission = async (mission) => {
        setLoadingPosts(true);
        setSelectedMission(mission);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, title, content, student_id, mission_id, char_count, is_submitted, is_confirmed, is_returned, ai_feedback, created_at,
                    students!inner(name, class_id)
                `)
                .eq('mission_id', mission.id)
                .eq('students.class_id', activeClass.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPosts(data || []);
        } catch (err) {
            console.error('학생 글 불러오기 실패:', err.message);
            alert('글을 불러오는 도중 오류가 발생했습니다.');
        } finally {
            setLoadingPosts(false);
        }
    };

    const fetchAIFeedback = async (postTitle, postContent) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profileData } = await supabase
            .from('profiles')
            .select('gemini_api_key, ai_prompt_template')
            .eq('id', user?.id)
            .single();

        const apiKey = profileData?.gemini_api_key?.trim();
        const customTemplate = profileData?.ai_prompt_template?.trim();

        if (!apiKey) {
            alert('Gemini API 키가 등록되지 않았습니다. [설정] 메뉴에서 키를 먼저 등록해주세요! 🔐');
            return null;
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

        const prompt = `${basePrompt}

---
[학생의 글 정보]
글 제목: "${postTitle}"
글 내용:
"${postContent}"`;

        try {
            const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

            const response = await fetch(`${baseUrl}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = errorData?.error?.message || '알 수 없는 서비스 오류';
                throw new Error(`AI 서비스 오류 (${response.status}): ${errorMsg}`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0].content.parts[0].text) {
                return data.candidates[0].content.parts[0].text;
            }
            throw new Error('AI 응답 형식이 올바르지 않습니다.');
        } catch (err) {
            console.error('AI 피드백 생성 실패 원인:', err.message);
            alert(`피드백 생성 중 문제가 발생했습니다: ${err.message}`);
            return null;
        }
    };

    const handleGenerateSingleAI = async () => {
        if (!selectedPost) return;
        setIsGenerating(true);
        try {
            const feedback = await fetchAIFeedback(selectedPost.title, selectedPost.content);
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

        if (!confirm(`${targetPosts.length}개의 글에 대해 AI 피드백을 생성하고, 동시에 '다시 쓰기'를 일괄 요청하시겠습니까? 🤖♻️\n학생들에게 자동으로 피드백이 전달됩니다.`)) return;

        setIsGenerating(true);
        setProgress({ current: 0, total: targetPosts.length });

        try {
            let processedCount = 0;
            const aiPromises = targetPosts.map(async (post) => {
                try {
                    const feedback = await fetchAIFeedback(post.title, post.content);
                    if (feedback) {
                        await Promise.all([
                            supabase
                                .from('student_posts')
                                .update({
                                    ai_feedback: feedback,
                                    is_submitted: false,
                                    is_returned: true
                                })
                                .eq('id', post.id),

                            supabase.from('point_logs').insert({
                                student_id: post.student_id,
                                post_id: post.id,
                                mission_id: post.mission_id,
                                amount: 0,
                                reason: `[AI 요청] '${post.title}' 글에 대한 다시 쓰기 요청이 도착했습니다. ♻️`
                            })
                        ]);
                    }
                    processedCount++;
                    setProgress(prev => ({ ...prev, current: processedCount }));
                } catch (innerErr) {
                    console.error(`Post ${post.id} 처리 중 에러:`, innerErr);
                }
            });

            await Promise.all(aiPromises);
            setShowCompleteToast(true);
            setTimeout(() => setShowCompleteToast(false), 3000);
            alert('모든 글에 대한 AI 피드백 생성 및 다시 쓰기 요청이 완료되었습니다! ✨');
            fetchPostsForMission(selectedMission);
        } catch (err) {
            alert('일괄 처리 중 오류가 발생했습니다.');
        } finally {
            setIsGenerating(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    const handleRequestRewrite = async (post) => {
        if (!confirm('학생에게 이 글을 돌려보내고 다시 쓰기를 요청할까요? ♻️\n학생의 화면에 안내 문구가 표시됩니다.')) return;

        try {
            const { error } = await supabase
                .from('student_posts')
                .update({
                    is_submitted: false,
                    is_returned: true,
                    ai_feedback: tempFeedback
                })
                .eq('id', post.id);

            if (error) throw error;

            await supabase.from('point_logs').insert({
                student_id: post.student_id,
                post_id: post.id,
                mission_id: post.mission_id,
                amount: 0,
                reason: `선생님께서 '${post.title}' 글에 대한 다시 쓰기를 요청하셨습니다. ♻️`
            });

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
            let totalPointsToGive = selectedMission.base_reward || 0;
            let isBonusAchieved = false;
            if (selectedMission.bonus_threshold && post.char_count >= selectedMission.bonus_threshold) {
                totalPointsToGive += (selectedMission.bonus_reward || 0);
                isBonusAchieved = true;
            }

            const { error: postError } = await supabase
                .from('student_posts')
                .update({
                    is_confirmed: true,
                    ai_feedback: tempFeedback
                })
                .eq('id', post.id);

            if (postError) throw postError;

            const { data: studentData, error: studentFetchError } = await supabase
                .from('students')
                .select('total_points')
                .eq('id', post.student_id)
                .single();

            if (studentFetchError) throw studentFetchError;

            const newTotalPoints = (studentData.total_points || 0) + totalPointsToGive;
            await supabase
                .from('students')
                .update({ total_points: newTotalPoints })
                .eq('id', post.student_id);

            await supabase
                .from('point_logs')
                .insert({
                    student_id: post.student_id,
                    post_id: post.id,
                    mission_id: post.mission_id,
                    amount: totalPointsToGive,
                    reason: `[${selectedMission.title}] 미션 승인 보상 ${isBonusAchieved ? '(보너스 포함! 🔥)' : ''}`
                });

            alert(`✅ ${totalPointsToGive}포인트가 성공적으로 지급되었습니다!`);
            setSelectedPost(null);
            if (selectedMission) fetchPostsForMission(selectedMission);
            fetchMissions();
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
            const approvalPromises = toApprove.map(async (post) => {
                let amount = selectedMission.base_reward || 0;
                let isBonus = (selectedMission.bonus_threshold && post.char_count >= selectedMission.bonus_threshold);
                if (isBonus) amount += (selectedMission.bonus_reward || 0);

                await supabase.from('student_posts').update({ is_confirmed: true }).eq('id', post.id);
                const { data: st } = await supabase.from('students').select('total_points').eq('id', post.student_id).single();
                const currentPoints = st?.total_points || 0;
                await supabase.from('students').update({ total_points: currentPoints + amount }).eq('id', post.student_id);

                await supabase.from('point_logs').insert({
                    student_id: post.student_id,
                    post_id: post.id,
                    mission_id: post.mission_id,
                    amount: amount,
                    reason: `일괄 승인 보상: ${selectedMission.title}${isBonus ? ' (보너스 달성! 🔥)' : ''}`
                });
            });

            await Promise.all(approvalPromises);
            alert(`🎉 ${toApprove.length}건 일괄 승인 완료!`);
            fetchPostsForMission(selectedMission);
            fetchMissions();
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
            const { data: logs, error: logFetchError } = await supabase
                .from('point_logs')
                .select('*')
                .eq('student_id', post.student_id)
                .ilike('reason', `%${selectedMission.title}%`)
                .order('created_at', { ascending: false })
                .limit(1);

            if (logFetchError) throw logFetchError;

            if (!logs || logs.length === 0) {
                alert('해당 글에 대한 지급 내역을 찾을 수 없어 회수가 불가능합니다.');
                return;
            }

            const amountToRecover = logs[0].amount;
            await supabase
                .from('student_posts')
                .update({ is_confirmed: false, is_submitted: true })
                .eq('id', post.id);

            const { data: stData } = await supabase
                .from('students')
                .select('total_points')
                .eq('id', post.student_id)
                .single();

            const newPoints = Math.max(0, (stData?.total_points || 0) - amountToRecover);
            await supabase.from('students').update({ total_points: newPoints }).eq('id', post.student_id);

            await supabase.from('point_logs').insert({
                student_id: post.student_id,
                post_id: post.id,
                mission_id: post.mission_id,
                amount: -amountToRecover,
                reason: `[${selectedMission.title}] 승인 취소로 인한 포인트 회수`
            });

            alert(`✅ ${amountToRecover}포인트 회수 및 승인 취소가 완료되었습니다.`);
            setSelectedPost(null);
            if (selectedMission) fetchPostsForMission(selectedMission);
            fetchMissions();
        } catch (err) {
            console.error('회수 실패:', err.message);
            alert('회수 처리 중 오류가 발생했습니다.');
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
            const recoveryPromises = toRecover.map(async (post) => {
                const { data: logs } = await supabase
                    .from('point_logs')
                    .select('amount')
                    .eq('student_id', post.student_id)
                    .ilike('reason', `%${selectedMission.title}%`)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (logs && logs.length > 0) {
                    const amount = logs[0].amount;
                    if (amount > 0) {
                        const { data: st } = await supabase.from('students').select('total_points').eq('id', post.student_id).single();
                        await Promise.all([
                            supabase.from('student_posts').update({ is_confirmed: false, is_submitted: true }).eq('id', post.id),
                            supabase.from('students').update({ total_points: Math.max(0, (st?.total_points || 0) - amount) }).eq('id', post.student_id),
                            supabase.from('point_logs').insert({
                                student_id: post.student_id,
                                post_id: post.id,
                                mission_id: post.mission_id,
                                amount: -amount,
                                reason: `[일괄 회수] 승인 취소: ${selectedMission.title}`
                            })
                        ]);
                    }
                }
            });

            await Promise.all(recoveryPromises);
            alert('일괄 회수 처리가 원활하게 완료되었습니다.');
            if (selectedMission) fetchPostsForMission(selectedMission);
            fetchMissions();
        } catch (err) {
            console.error('일괄 회수 실패:', err.message);
            alert('일괄 회수 중 오류가 발생했습니다.');
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
            setArchiveModal({ isOpen: false, mission: null, hasIncomplete: false });
            fetchMissions();
        } catch (err) {
            alert('보관 처리 중 오류가 발생했습니다: ' + err.message);
        }
    };

    return {
        missions, submissionCounts, isFormOpen, setIsFormOpen, loading,
        selectedMission, setSelectedMission, posts, setPosts, selectedPost, setSelectedPost,
        loadingPosts, isGenerating, showCompleteToast, setShowCompleteToast,
        tempFeedback, setTempFeedback, postReactions, postComments, totalStudentCount,
        archiveModal, setArchiveModal, progress, isEditing, formData, setFormData,
        handleEditClick, handleCancelEdit, handleSubmit, fetchPostsForMission,
        handleGenerateSingleAI, handleBulkAIAction, handleRequestRewrite,
        handleApprovePost, handleBulkApprove, handleRecovery, handleBulkRecovery,
        handleFinalArchive, fetchMissions
    };
};
