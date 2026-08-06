import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { checkBadWords } from '../constants/badWords';
import { checkContentSafety } from '../utils/aiSafety';
import { debounce } from '../utils/debounce';

const LOW_EFFORT_COMMENTS = new Set([
    '와', '우와', '오', '오오', '우웅', '헉', '대박', '굿', 'good', 'nice',
    '멋져', '최고', '짱', 'ㅋㅋ', 'ㅎㅎ', '^^', '👍', '👏', '❤️', '😆', '😍', '😊',
    '와!', '오!'
]);

const validateCommentQuality = (content) => {
    const trimmed = content.trim();
    const compact = trimmed.replace(/\s+/g, '');

    if (compact.length < 8) {
        return '댓글은 공백을 빼고 8자 이상으로 써야 해요.\n친구 글의 좋은 점이나 느낀 점을 조금 더 자세히 적어 볼까요?';
    }

    if (LOW_EFFORT_COMMENTS.has(compact.toLowerCase())) {
        return '감탄만 있는 짧은 댓글보다는\n친구 글의 좋은 점이나 느낀 점을 함께 써 주세요!';
    }

    return null;
};

/**
 * 역할: 게시글의 반응(좋아요 등) 및 댓글을 관리하는 공통 훅 💬
 */
export const usePostInteractions = (postId, studentId, studentName, classmates = []) => {
    const [reactions, setReactions] = useState([]);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const isFetchingRef = useRef(false);
    const lastFetchAtRef = useRef(0);
    const latestContextRef = useRef({ classmates, studentId, studentName });

    const shouldShowComment = useCallback((comment) => {
        const isTeacherComment = !!comment.teacher_id && !comment.student_id;
        const isOwnComment = comment.student_id === studentId;
        const isApprovedStudentComment =
            comment.status === 'approved' &&
            (!comment.students || comment.students.deleted_at == null);

        return isTeacherComment || isOwnComment || isApprovedStudentComment;
    }, [studentId]);

    useEffect(() => {
        latestContextRef.current = { classmates, studentId, studentName };
    }, [classmates, studentId, studentName]);


    const fetchInteractions = useCallback(async () => {
        if (!postId) return;
        const now = Date.now();
        if (isFetchingRef.current || now - lastFetchAtRef.current < 1500) return;

        isFetchingRef.current = true;
        lastFetchAtRef.current = now;
        setLoading(true);
        try {
            // 공용 RPC 한 번으로 반응·댓글을 함께 받는다.
            // 예전에는 PostgREST 임베드(`students:student_id(name)`)를 썼는데 그 조인이
            // 학생 표 전체를 Seq Scan 했다. 이제 인덱스 조인이라 학생이 늘어도 무거워지지 않는다.
            const { data: interactions, error: rpcError } = await supabase
                .rpc('get_post_interactions', { p_post_id: postId });
            if (rpcError) throw rpcError;

            const rawComments = (interactions?.comments || []).map((comment) => ({
                ...comment,
                students: comment.student_name ? { name: comment.student_name, deleted_at: null } : null
            }));

            // 이름은 서버가 채워 준다. 예전엔 임베드가 비면 학급 명단·학생 표로 다시 찾아 메웠지만
            // 이제 RPC 가 학급 안에서 인덱스 조인으로 붙여 주므로 보강 단계가 필요 없다.
            const normalizedComments = rawComments.map((comment) => (
                comment.students?.name || !comment.student_id
                    ? comment
                    : {
                        ...comment,
                        student_name: comment.student_id === latestContextRef.current.studentId
                            ? (studentName || '내 댓글')
                            : '알 수 없는 친구',
                        students: {
                            name: comment.student_id === latestContextRef.current.studentId
                                ? (studentName || '내 댓글')
                                : '알 수 없는 친구',
                            deleted_at: null
                        }
                    }
            ));

            console.log('[usePostInteractions] 데이터 로드 완료 (postId: ' + postId + ')');
            
            const normalizedReactions = (interactions?.reactions || []).map((reaction) => ({
                ...reaction,
                students: reaction.student_name ? { name: reaction.student_name } : null
            }));

            setReactions(normalizedReactions);
            setComments(
                normalizedComments
                    .map(comment => ({
                        ...comment,
                        student_name: comment.student_name || comment.students?.name || ''
                    }))
                    .filter(shouldShowComment)
            );

            // 탭을 닫거나 통신이 끊겨 판정이 끝나지 않은 **내** 댓글을 다시 물어본다.
            // 이게 없으면 그 댓글은 영영 `pending` 으로 남아 친구에게 보이지 않는다
            // (운영에서 112건이 3~4개월 묶여 있었다). 한 번에 3건까지만 처리해 몰아치지 않게 한다.
            normalizedComments
                .filter((comment) => comment.status === 'pending'
                    && comment.student_id === latestContextRef.current.studentId)
                .slice(0, 3)
                .forEach((comment) => {
                    checkContentSafety(comment.content, { commentId: comment.id }).catch(() => {});
                });
        } catch (err) {
            console.error('[usePostInteractions] ??? ?? ??:', err.message);
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [postId, shouldShowComment, studentName]);
    useEffect(() => {
        fetchInteractions();

        if (!postId) return;

        // [최적화] per-postId Realtime 채널 제거 → 30초 폴링으로 교체
        // 기존: 게시글마다 comments_{postId}, reactions_{postId} 2개 채널 생성
        //       → useClassAgitClass 의 class 레벨 채널이 동일 테이블(post_comments, post_reactions)을
        //         이미 구독 중이어서 이중 구독 발생, Realtime WAL 부하의 63%를 차지
        // 변경: 30초 폴링으로 다른 학생의 새 댓글·반응을 갱신
        //       자신의 액션(댓글 작성·반응)은 기존 optimistic 업데이트로 즉시 UI에 반영됨
        const POLL_INTERVAL_MS = 15000;
        const pollId = window.setInterval(() => {
            if (!document.hidden) {
                fetchInteractions();
            }
        }, POLL_INTERVAL_MS);

        return () => {
            window.clearInterval(pollId);
        };
    }, [fetchInteractions, postId]);

    const syncReactionWithDB = useMemo(() => debounce(async (type, isRemoving) => {
        try {
            if (isRemoving) {
                const { error } = await supabase
                    .from('post_reactions')
                    .delete()
                    .eq('post_id', postId)
                    .eq('student_id', studentId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('post_reactions')
                    .upsert({
                        post_id: postId,
                        student_id: studentId,
                        reaction_type: type
                    }, { onConflict: 'post_id,student_id' });
                if (error) throw error;
            }
        } catch (err) {
            console.error('[usePostInteractions] DB 동기화 실패:', err.message);
            fetchInteractions();
        }
    }, 1000), [postId, studentId, fetchInteractions]);

    const handleReaction = useCallback(async (type) => {
        if (!studentId || !postId) return;

        let isRemoving = false;

        setReactions(prev => {
            const myReaction = prev.find(r => r.student_id === studentId);
            isRemoving = myReaction && myReaction.reaction_type === type;

            if (isRemoving) {
                return prev.filter(r => r.student_id !== studentId);
            } 
            
            if (myReaction) {
                return prev.map(r => r.student_id === studentId ? { ...r, reaction_type: type } : r);
            }
            
            return [...prev, {
                post_id: postId,
                student_id: studentId,
                reaction_type: type,
                students: { name: studentName || '익명' },
                created_at: new Date().toISOString()
            }];
        });

        syncReactionWithDB(type, isRemoving);
    }, [studentId, postId, syncReactionWithDB, studentName]);

    const addComment = useCallback(async (content) => {
        if (!content.trim() || !studentId || !postId) return;

        const qualityMessage = validateCommentQuality(content);
        if (qualityMessage) {
            alert(`댓글을 조금 더 정성껏 써 주세요! ✍️\n${qualityMessage}`);
            return false;
        }

        if (checkBadWords(content)) {
            alert('깨끗한 교실을 위해 나쁜 말을 사용해 주세요! 🚫\n(비속어나 욕설은 등록할 수 없어요)');
            return false;
        }

        const tempId = `temp-${Date.now()}`;
        const optimisticComment = {
            id: tempId,
            post_id: postId,
            student_id: studentId,
            content: content.trim(),
            created_at: new Date().toISOString(),
            isOptimistic: true,
            students: { name: studentName || '익명' }
        };
        setComments(prev => [...prev, optimisticComment]);

        (async () => {
            try {
                const { data: insertedComment, error } = await supabase
                    .from('post_comments')
                    .insert({
                        post_id: postId,
                        student_id: studentId,
                        content: content.trim(),
                        status: 'pending' // [추가] 초기 상태는 대기중
                    }).select('id').single();

                if (error) throw error;
                const newCommentId = insertedComment.id;

                checkContentSafety(content, { commentId: newCommentId }).then(async (safety) => {
                    // 예전에는 부적절 판정이면 댓글을 지웠다. 그러면 학생은 애써 쓴 글을 잃고,
                    // 교사는 무엇이 막혔는지 모르고, 오탐률도 잴 수 없다.
                    // 이제 Edge Function이 지우지 않고 `blocked` 로 기록해 선생님이 보고 풀 수 있게 한다.

                    if (!safety.is_appropriate) {
                        alert(`잠깐! 🛡️\n${safety.reason || '조금 더 고운 표현을 사용해 볼까요?'}\n선생님이 확인한 뒤 친구들에게 보여요.`);
                        fetchInteractions();
                    } else {

                        supabase.rpc('reward_for_comment', { p_post_id: postId }).then(({ data, error: rpcErr }) => {
                            if (!rpcErr && data?.success) {
                                console.log(`✨ [AI 보안관] 안전한 댓글 확인 -> +${data.points_awarded}P 지급 완료!`);
                            }
                        });
                    }
                }).catch(err => {
                    console.error('AI Check failed:', err);
                    fetchInteractions();
                });

            } catch (err) {
                console.error('댓글 비동기 처리 오류:', err.message);
                fetchInteractions();
            }
        })();

        return true;
    }, [postId, studentId, studentName, fetchInteractions]);

    const updateComment = useCallback(async (commentId, newContent) => {
        if (!newContent.trim() || !studentId) return;

        const qualityMessage = validateCommentQuality(newContent);
        if (qualityMessage) {
            alert(`댓글을 조금 더 정성껏 다듬어 주세요! ✍️\n${qualityMessage}`);
            return false;
        }

        if (checkBadWords(newContent)) {
            alert('깨끗한 교실을 위해 나쁜 말을 사용해 주세요! 🚫\n(비속어나 욕설은 입력할 수 없어요)');
            return false;
        }

        setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent.trim(), isOptimistic: true } : c));

        (async () => {
            try {
                const { error } = await supabase
                    .from('post_comments')
                    .update({
                        content: newContent.trim(),
                        status: 'pending',
                        moderation_reason: null,
                        moderated_at: null,
                        moderated_by: null
                    })
                    .eq('id', commentId);
                if (error) throw error;

                checkContentSafety(newContent, { commentId }).then(async (safety) => {
                    if (!safety.is_appropriate) {
                        fetchInteractions(); 
                        console.log(`💬 [AI 보안관] 부적절한 수정 감지 -> 친구 공개 보류: ${newContent}`);
                        alert(`잠깐! 🛡️\n${safety.reason || '조금 더 고운 표현을 사용해 볼까요?'}\n선생님이 확인한 뒤 친구들에게 보여요.`);
                    }
                    fetchInteractions();
                }).catch(err => {
                    console.error('AI Check failed:', err);
                    fetchInteractions();
                });

            } catch (err) {
                console.error('댓글 비동기 수정 오류:', err.message);
                fetchInteractions();
            }
        })();

        return true;
    }, [studentId, fetchInteractions]);

    const deleteComment = useCallback(async (commentId) => {
        if (!commentId) return false;

        setComments(prev => prev.filter(c => String(c.id) !== String(commentId)));

        if (String(commentId).startsWith('temp-')) {
            return true;
        }

        try {
            const { error } = await supabase
                .from('post_comments')
                .delete()
                .eq('id', commentId);
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error('댓글 삭제 처리 실패:', err.message);
            fetchInteractions();
            return false;
        }
    }, [fetchInteractions]);

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
