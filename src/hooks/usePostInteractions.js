import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { checkBadWords } from '../constants/badWords';
import { checkContentSafety } from '../utils/aiSafety';
import { debounce } from '../utils/debounce';

/**
 * 역할: 게시글의 반응(좋아요 등) 및 댓글을 관리하는 공통 훅 💬
 */
export const usePostInteractions = (postId, studentId, studentName) => {
    const [reactions, setReactions] = useState([]);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);

    const shouldShowComment = useCallback((comment) => {
        const isTeacherComment = !!comment.teacher_id && !comment.student_id;
        const isOwnComment = comment.student_id === studentId;
        const isApprovedStudentComment =
            comment.status === 'approved' &&
            (!comment.students || comment.students.deleted_at == null);

        return isTeacherComment || isOwnComment || isApprovedStudentComment;
    }, [studentId]);

    const fetchInteractions = useCallback(async () => {
        if (!postId) return;
        setLoading(true);
        try {
            const [rxRes, cmRes] = await Promise.all([
                supabase
                    .from('post_reactions')
                    .select('*, students!inner(name, deleted_at)')
                    .eq('post_id', postId)
                    .is('students.deleted_at', null),
                supabase
                    .from('post_comments')
                    .select('*, students:student_id(name, deleted_at), teacher_id')
                    .eq('post_id', postId)
                    .order('created_at', { ascending: true })
            ]);

            if (rxRes.error) throw rxRes.error;
            if (cmRes.error) throw cmRes.error;

            const rawComments = cmRes.data || [];
            const missingStudentIds = [...new Set(
                rawComments
                    .filter((comment) => comment.student_id && !comment.students?.name)
                    .map((comment) => comment.student_id)
            )];

            let studentNameMap = new Map();
            if (missingStudentIds.length > 0) {
                const { data: studentRows, error: studentError } = await supabase
                    .from('students')
                    .select('id, name, deleted_at')
                    .in('id', missingStudentIds);

                if (studentError) {
                    console.warn('[usePostInteractions] ?? ??? ?? ?? ??:', studentError.message);
                } else {
                    studentNameMap = new Map((studentRows || []).map((student) => [student.id, student]));
                }
            }

            const normalizedComments = rawComments.map((comment) => {
                if (comment.students?.name || !comment.student_id) {
                    return comment;
                }

                if (comment.student_id === studentId) {
                    return {
                        ...comment,
                        students: {
                            name: studentName || '내 댓글',
                            deleted_at: null
                        }
                    };
                }

                const studentInfo = studentNameMap.get(comment.student_id);
                if (!studentInfo) {
                    return comment;
                }

                return {
                    ...comment,
                    students: {
                        name: studentInfo.name,
                        deleted_at: studentInfo.deleted_at ?? null
                    }
                };
            });

            console.log('[usePostInteractions] ?? ?? (postId: ' + postId + ')');
            setReactions(rxRes.data || []);
            setComments(normalizedComments.filter(shouldShowComment));
        } catch (err) {
            console.error('[usePostInteractions] ??? ?? ??:', err.message);
        } finally {
            setLoading(false);
        }
    }, [postId, shouldShowComment, studentId, studentName]);
    useEffect(() => {
        fetchInteractions();

        if (!postId) return;

        // [실시간 1] 댓글 실시간 구독
        const commentsChannel = supabase
            .channel(`comments_${postId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'post_comments',
                    filter: `post_id=eq.${postId}`
                },
                async (payload) => {
                    if (payload.eventType === 'INSERT') {
                        await fetchInteractions();
                    } else if (payload.eventType === 'UPDATE') {
                        await fetchInteractions();
                    } else if (payload.eventType === 'DELETE') {
                        setComments(prev => prev.filter(c => c.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        // [실시간 2] 반응 실시간 구독
        const reactionsChannel = supabase
            .channel(`reactions_${postId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'post_reactions',
                    filter: `post_id=eq.${postId}`
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const newReaction = {
                            ...payload.new,
                            students: payload.new.student_id === studentId
                                ? { name: studentName || '익명 친구' }
                                : null
                        };
                        setReactions(prev => [...prev.filter(r => r.id !== newReaction.id), newReaction]);
                    } else if (payload.eventType === 'UPDATE') {
                        setReactions(prev => {
                            const existing = prev.find(r => r.id === payload.new.id);
                            const updatedReaction = existing ? { ...existing, ...payload.new } : payload.new;

                            if (!existing) {
                                return [...prev, updatedReaction];
                            }

                            return prev.map(r => r.id === updatedReaction.id ? updatedReaction : r);
                        });
                    } else if (payload.eventType === 'DELETE') {
                        setReactions(prev => prev.filter(r => r.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(commentsChannel);
            supabase.removeChannel(reactionsChannel);
        };
    }, [postId, fetchInteractions, shouldShowComment, studentId, studentName]);

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

                checkContentSafety(content).then(async (safety) => {
                    if (!safety.is_appropriate) {
                        await supabase.from('post_comments').delete().eq('id', newCommentId);
                        console.log(`💬 [AI 보안관] 부적절한 표현 감지 -> 자동 삭제 완료: ${content}`);
                        alert(`잠깐! 🛡️\n${safety.reason || '조금 더 고운 표현을 사용해 볼까요?'}\n(방금 작성한 댓글은 삭제 처리 되었어요)`);
                    } else {
                        // [추가] 안전한 경우 승인 상태로 변경
                        await supabase
                            .from('post_comments')
                            .update({ status: 'approved' })
                            .eq('id', newCommentId);

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

        if (checkBadWords(newContent)) {
            alert('깨끗한 교실을 위해 나쁜 말을 사용해 주세요! 🚫\n(비속어나 욕설은 입력할 수 없어요)');
            return false;
        }

        setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent.trim(), isOptimistic: true } : c));

        (async () => {
            try {
                const { error } = await supabase
                    .from('post_comments')
                    .update({ content: newContent.trim() })
                    .eq('id', commentId);
                if (error) throw error;

                checkContentSafety(newContent).then(async (safety) => {
                    if (!safety.is_appropriate) {
                        fetchInteractions(); 
                        console.log(`💬 [AI 보안관] 부적절한 수정 감지 -> 원복 완료: ${newContent}`);
                        alert(`잠깐! 🛡️\n${safety.reason || '조금 더 고운 표현을 사용해 볼까요?'}\n(수정 내용이 차단 및 복구되었습니다)`);
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
