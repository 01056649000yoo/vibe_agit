import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { checkBadWords } from '../constants/badWords';
import { checkContentSafety } from '../utils/aiSafety';
import { debounce } from '../utils/debounce';
// 서버(vibe-ai)와 같은 글자 내용 판정을 쓴다 — 기호가 아니라 낱말을 보고 판단한다.
import { commentTextIssue } from '../../supabase/functions/_shared/commentQuality.js';

const LOW_EFFORT_COMMENTS = new Set([
    '와', '우와', '오', '오오', '우웅', '헉', '대박', '굿', 'good', 'nice',
    '멋져', '최고', '짱', 'ㅋㅋ', 'ㅎㅎ', '^^', '👍', '👏', '❤️', '😆', '😍', '😊',
    '와!', '오!'
]);

// RPC 가 직접 올린 안내는 이미 아이가 읽을 수 있는 말이라 그대로 보여 준다.
// 그 밖의 실패(통신 끊김 등)는 원인을 숨기고 다시 해 보라고만 알린다.
// 이게 없으면 저장이 실패해도 화면에 아무 말도 뜨지 않아 아이는 왜 안 되는지 알 수 없다.
// PT429: 학생 한 명의 AI 검사 요청이 10분에 20번을 넘었다(20261340) — 서버 문구를 그대로 보인다.
const RAISED_BY_RPC = new Set(['22023', '42501', '55000', 'P0001', 'P0002', 'PT429']);

const commentErrorMessage = (error) => {
    if (RAISED_BY_RPC.has(String(error?.code || '')) && error?.message) return error.message;
    return '지금은 댓글을 저장하지 못했어요. 잠시 뒤에 다시 해 주세요.';
};

const validateCommentQuality = (content) => {
    const issue = commentTextIssue(content, { lowEffort: LOW_EFFORT_COMMENTS });
    if (issue === 'long') return '댓글은 200자 이내로 적어 주세요.';
    if (issue === 'short') {
        return content.trim().replace(/\s+/g, '').length < 8
            ? '댓글은 공백을 빼고 8자 이상으로 써야 해요.\n친구 글의 좋은 점이나 느낀 점을 조금 더 자세히 적어 볼까요?'
            : '감탄만 있는 짧은 댓글보다는\n친구 글의 좋은 점이나 느낀 점을 함께 써 주세요!';
    }
    if (issue === 'no_words') return '기호나 이모티콘만 쓰지 말고\n친구에게 전하고 싶은 말을 글자로 써 주세요.';
    if (issue === 'repeat' || issue === 'gibberish') return '같은 말이나 의미 없는 글자를 반복하지 말고\n친구에게 전하고 싶은 내용을 문장으로 써 주세요.';
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
    // 내 댓글이 `확인 중이에요` 인 동안 **짧게 두 번만** 다시 불러온다(2026-10-21 — 승인돼도 나갔다 들어와야 보였다).
    // 상시 폴링이 아니다: 내가 댓글을 달았거나 대기 중인 내 댓글이 있을 때만, 4초 뒤와 6초 뒤(최대 2회 추가 RPC).
    // 이웃 아지트가 이미 쓰는 "검사 대기면 창이 열린 채 몇 초 뒤 상세 RPC 를 더 부른다" 와 같은 방식이다.
    const fetchRef = useRef(null);
    const followUpRef = useRef({ timer: null, left: 0 });
    const armFollowUp = useCallback((delay) => {
        window.clearTimeout(followUpRef.current.timer);
        followUpRef.current.timer = window.setTimeout(() => {
            followUpRef.current.timer = null;
            // 탭이 가려져 있으면 부르지 않는다. 돌아오면 화면 복귀 갱신이 한다.
            if (!document.hidden) void fetchRef.current?.();
        }, delay);
    }, []);
    const startFollowUp = useCallback((attempts = 2) => {
        followUpRef.current.left = attempts;
        armFollowUp(4000);
    }, [armFollowUp]);

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

            // 아직 확인 중인 내 댓글이 있으면 남은 횟수만큼만 다시 불러온다(위 설명).
            const myPending = normalizedComments.some((comment) => comment.status === 'pending'
                && comment.student_id === latestContextRef.current.studentId);
            if (myPending && followUpRef.current.left > 0) {
                followUpRef.current.left -= 1;
                armFollowUp(6000);
            }

            // 탭을 닫거나 통신이 끊겨 대기열을 못 깨운 **내** 댓글이 있으면 한 번만 다시 알린다.
            // 서버 작업기 하나가 전역 대기열을 이어서 비우므로 댓글마다 반복 호출할 필요는 없다.
            normalizedComments
                .filter((comment) => comment.status === 'pending'
                    && comment.student_id === latestContextRef.current.studentId)
                .slice(0, 1)
                .forEach((comment) => {
                    checkContentSafety('', { commentId: comment.id }).catch(() => {});
                });
        } catch (err) {
            console.error('[usePostInteractions] 상호작용을 불러오지 못했습니다:', err.message);
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [postId, shouldShowComment, studentName, armFollowUp]);
    useEffect(() => { fetchRef.current = fetchInteractions; }, [fetchInteractions]);
    useEffect(() => {
        void fetchInteractions();
        if (!postId) return undefined;

        // 내 반응·댓글은 optimistic UI로 즉시 보이고, 다른 학생의 변화는 화면 복귀 때만 갱신한다.
        // 상세 화면 하나당 15초 고정 폴링을 없애 1,000명 동시 열람 시의 지속 요청을 제거한다.
        const refreshOnReturn = () => {
            if (!document.hidden && Date.now() - lastFetchAtRef.current >= 60000) {
                void fetchInteractions();
            }
        };
        window.addEventListener('focus', refreshOnReturn);
        document.addEventListener('visibilitychange', refreshOnReturn);
        return () => {
            window.removeEventListener('focus', refreshOnReturn);
            document.removeEventListener('visibilitychange', refreshOnReturn);
            window.clearTimeout(followUpRef.current.timer);
            followUpRef.current = { timer: null, left: 0 };
        };
    }, [fetchInteractions, postId]);

    const syncReactionWithDB = useMemo(() => debounce(async (type) => {
        try {
            const { error } = await supabase.rpc('toggle_my_post_reaction_v1', {
                p_post_id: postId,
                p_reaction_type: type
            });
            if (error) throw error;
        } catch (err) {
            console.error('[usePostInteractions] DB 동기화 실패:', err.message);
            fetchInteractions();
        }
    }, 1000), [postId, fetchInteractions]);

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

        syncReactionWithDB(type);
    }, [studentId, postId, syncReactionWithDB, studentName]);

    const addComment = useCallback(async (content) => {
        if (!content.trim() || !studentId || !postId) return;

        const qualityMessage = validateCommentQuality(content);
        if (qualityMessage) {
            alert(`댓글을 조금 더 정성껏 써 주세요! ✍️\n${qualityMessage}`);
            return false;
        }

        if (checkBadWords(content)) {
            alert('깨끗한 교실을 위해 고운 말을 사용해 주세요! 🚫\n(비속어나 욕설은 등록할 수 없어요)');
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
            status: 'pending',
            students: { name: studentName || '익명' }
        };
        setComments(prev => [...prev, optimisticComment]);

        try {
            const { data: result, error } = await supabase.rpc('create_my_post_comment_v1', {
                p_post_id: postId,
                p_content: content.trim()
            });
            if (error) throw error;
            const newCommentId = result?.comment?.id;
            if (!newCommentId) throw new Error('저장된 댓글 ID를 받지 못했습니다.');
            setComments((current) => current.map((comment) => (
                comment.id === tempId ? { ...comment, ...result.comment, id: newCommentId, isOptimistic: false } : comment
            )));

            // 응답을 기다리지 않는다. 서버는 즉시 202를 돌려주고 전역 3칸 대기열에서 검사한다.
            void checkContentSafety('', { commentId: newCommentId });
            startFollowUp(2);
            return true;
        } catch (err) {
            console.error('댓글 등록 실패:', err.message);
            setComments((current) => current.filter((comment) => comment.id !== tempId));
            alert(commentErrorMessage(err));
            void fetchInteractions();
            return false;
        }
    }, [postId, studentId, studentName, fetchInteractions, startFollowUp]);

    const updateComment = useCallback(async (commentId, newContent) => {
        if (!newContent.trim() || !studentId) return;

        const qualityMessage = validateCommentQuality(newContent);
        if (qualityMessage) {
            alert(`댓글을 조금 더 정성껏 다듬어 주세요! ✍️\n${qualityMessage}`);
            return false;
        }

        if (checkBadWords(newContent)) {
            alert('깨끗한 교실을 위해 고운 말을 사용해 주세요! 🚫\n(비속어나 욕설은 입력할 수 없어요)');
            return false;
        }

        setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent.trim(), isOptimistic: true } : c));

        try {
            const { data: result, error } = await supabase.rpc('update_my_post_comment_v1', {
                p_comment_id: commentId,
                p_content: newContent.trim()
            });
            if (error) throw error;
            setComments((current) => current.map((comment) => (
                comment.id === commentId
                    ? { ...comment, ...result?.comment, content: newContent.trim(), status: 'pending', isOptimistic: false }
                    : comment
            )));
            void checkContentSafety('', { commentId });
            startFollowUp(2);
            return true;
        } catch (err) {
            console.error('댓글 수정 실패:', err.message);
            alert(commentErrorMessage(err));
            void fetchInteractions();
            return false;
        }
    }, [studentId, fetchInteractions, startFollowUp]);

    const deleteComment = useCallback(async (commentId) => {
        if (!commentId) return false;

        setComments(prev => prev.filter(c => String(c.id) !== String(commentId)));

        if (String(commentId).startsWith('temp-')) {
            return true;
        }

        try {
            const { error } = await supabase.rpc('delete_my_post_comment_v1', {
                p_comment_id: commentId
            });
            
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
