import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { checkBadWords } from '../constants/badWords';
import { checkContentSafety } from '../utils/aiSafety';

/**
 * 역할: 게시글의 반응(좋아요 등)과 댓글을 관리하는 공통 훅 ✨
 * 모든 외래키는 student_id로 통일되어 있습니다.
 */
export const usePostInteractions = (postId, studentId) => {
    const [reactions, setReactions] = useState([]);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchInteractions = useCallback(async () => {
        if (!postId) return;
        setLoading(true);
        try {
            // 1. 반응 가져오기 (students 정보를 student_id 조인으로 가져옴)
            const { data: rxData, error: rxError } = await supabase
                .from('post_reactions')
                .select('*, students:student_id(name)')
                .eq('post_id', postId);

            if (rxError) throw rxError;
            console.log(`[usePostInteractions] 반응 조회 성공 (postId: ${postId}):`, rxData);
            setReactions(rxData || []);

            // 2. 댓글 가져오기 (students 정보를 student_id 조인으로 가져옴)
            const { data: cmData, error: cmError } = await supabase
                .from('post_comments')
                .select('*, students:student_id(name), teacher_id')
                .eq('post_id', postId)
                .order('created_at', { ascending: true });

            if (cmError) throw cmError;
            console.log(`[usePostInteractions] 댓글 조회 성공 (postId: ${postId}):`, cmData);
            setComments(cmData || []);

        } catch (err) {
            console.error('[usePostInteractions] 데이터 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchInteractions();
    }, [fetchInteractions]);

    // 반응 추가/취소 핸들러
    const handleReaction = async (type) => {
        if (!studentId || !postId) return;

        // 현재 학생의 기존 반응이 있는지 확인
        const myReaction = reactions.find(r => r.student_id === studentId);

        try {
            if (myReaction) {
                if (myReaction.reaction_type === type) {
                    // 동일한 반응을 클릭하면 삭제 (토글 오프)
                    const { error } = await supabase
                        .from('post_reactions')
                        .delete()
                        .eq('post_id', postId)
                        .eq('student_id', studentId);
                    if (error) throw error;
                } else {
                    // 다른 반응을 클릭하면 기존 반응을 새로운 것으로 교체 (1개 유지)
                    const { error } = await supabase
                        .from('post_reactions')
                        .update({ reaction_type: type })
                        .eq('post_id', postId)
                        .eq('student_id', studentId);
                    if (error) throw error;
                }
            } else {
                // 기존 반응이 없으면 새로 추가
                const { error } = await supabase
                    .from('post_reactions')
                    .insert({
                        post_id: postId,
                        student_id: studentId,
                        reaction_type: type
                    });
                if (error) throw error;
            }
            fetchInteractions();
        } catch (err) {
            console.error('반응 처리 오류:', err.message);
        }
    };

    // 댓글 등록 핸들러
    const addComment = async (content) => {
        if (!content.trim() || !studentId || !postId) return;

        // 1단: 로컬 비속어 체크 (즉시)
        if (checkBadWords(content)) {
            alert('다정한 교실을 위해 예쁜 말을 사용해 주세요! 🌸\n(비속어나 욕설은 등록할 수 없어요.)');
            return false;
        }

        // [낙관적 업데이트] 즉시 화면에 임시 댓글 표시
        const tempId = `temp-${Date.now()}`;
        const optimisticComment = {
            id: tempId,
            post_id: postId,
            student_id: studentId,
            content: content.trim(),
            created_at: new Date().toISOString(),
            isOptimistic: true
        };
        setComments(prev => [...prev, optimisticComment]);

        // 2단: 비동기 DB 저장 및 AI 검사 (Fire-and-forget)
        (async () => {
            try {
                // 1. 실제 DB 인서트 (대기)
                const { data: insertedComment, error } = await supabase
                    .from('post_comments')
                    .insert({
                        post_id: postId,
                        student_id: studentId,
                        content: content.trim()
                    }).select('id').single();

                if (error) throw error;
                const newCommentId = insertedComment.id;

                // 2. 보상 지급 (백그라운드)
                supabase.rpc('reward_for_comment', { p_post_id: postId }).then(({ data, error: rpcErr }) => {
                    if (!rpcErr && data?.success) {
                        console.log(`💰 [Realtime] 보상 지급 성공! +${data.points_awarded}P`);
                    }
                });

                // 3. AI 문맥 분석 (백그라운드)
                checkContentSafety(content).then(async (safety) => {
                    if (!safety.is_appropriate) {
                        // 통과 실패 시 삭제 후 알림 및 새로고침
                        await supabase.from('post_comments').delete().eq('id', newCommentId);
                        alert(`잠깐! ✋\n\n${safety.reason || '조금 더 고운 표현을 사용해 볼까요?'}\n(방금 작성한 댓글은 삭제 처리 되었습니다.)`);
                        fetchInteractions();
                    } else {
                        // 통과 시 정상 댓글 목록으로 새로고침 (tempId 제거)
                        fetchInteractions();
                    }
                }).catch(err => {
                    console.error('AI Check failed:', err);
                    fetchInteractions();
                });

            } catch (err) {
                console.error('댓글 비동기 저장 오류:', err.message);
                fetchInteractions(); // 에러 발생 시 UI 롤백
            }
        })();

        return true; // UI 즉시 해제 (Blocking 방지)
    };

    // 댓글 수정 핸들러
    const updateComment = async (commentId, newContent) => {
        if (!newContent.trim() || !studentId) return;

        // 1단: 로컬 비속어 체크
        if (checkBadWords(newContent)) {
            alert('다정한 교실을 위해 예쁜 말을 사용해 주세요! 🌸\n(비속어나 욕설은 저장할 수 없어요.)');
            return false;
        }

        // [낙관적 업데이트] 화면 우선 반영
        const previousComments = [...comments];
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent.trim(), isOptimistic: true } : c));

        // 2단: 비동기 업데이트 및 AI 검사 (Fire-and-forget)
        (async () => {
            try {
                // DB 즉시 업데이트
                const { error } = await supabase
                    .from('post_comments')
                    .update({ content: newContent.trim() })
                    .eq('id', commentId);
                if (error) throw error;

                // AI 문맥 분석 (백그라운드)
                checkContentSafety(newContent).then(async (safety) => {
                    if (!safety.is_appropriate) {
                        // 통과 실패 시 이전 내용으로 롤백 후 알림
                        const originalContent = previousComments.find(c => c.id === commentId)?.content;
                        if (originalContent) {
                            await supabase.from('post_comments').update({ content: originalContent }).eq('id', commentId);
                        }
                        alert(`잠깐! ✋\n\n${safety.reason || '조금 더 고운 표현을 사용해 볼까요?'}\n(수정 내용이 차단 및 복구되었습니다.)`);
                    }
                    fetchInteractions();
                }).catch(err => {
                    console.error('AI Check failed:', err);
                    fetchInteractions();
                });

            } catch (err) {
                console.error('댓글 비동기 수정 오류:', err.message);
                setComments(previousComments); // 에러 발생 시 롤백
            }
        })();

        return true; // UI 즉시 해제 (Blocking 방지)
    };

    // 댓글 삭제 핸들러
    const deleteComment = async (commentId) => {
        try {
            const { error } = await supabase
                .from('post_comments')
                .delete()
                .eq('id', commentId);
            if (error) throw error;
            fetchInteractions();
            return true;
        } catch (err) {
            console.error('댓글 삭제 오류:', err.message);
            return false;
        }
    };

    return {
        reactions,
        comments,
        loading,
        handleReaction,
        addComment,
        updateComment,
        deleteComment,
        refresh: fetchInteractions
    };
}; 
