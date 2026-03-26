import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { checkBadWords } from '../constants/badWords';
import { checkContentSafety } from '../utils/aiSafety';
import { debounce } from '../utils/debounce';

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
            const [rxRes, cmRes] = await Promise.all([
                supabase
                    .from('post_reactions')
                    .select('*, students:student_id(name)')
                    .eq('post_id', postId),
                supabase
                    .from('post_comments')
                    .select('*, students:student_id(name), teacher_id')
                    .eq('post_id', postId)
                    .order('created_at', { ascending: true })
            ]);

            if (rxRes.error) throw rxRes.error;
            if (cmRes.error) throw cmRes.error;

            console.log(`[usePostInteractions] 조회 성공 (postId: ${postId})`);
            setReactions(rxRes.data || []);
            setComments(cmRes.data || []);
        } catch (err) {
            console.error('[usePostInteractions] 데이터 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchInteractions();
    }, [fetchInteractions]);

    // [신규] DB 동기화 로직 (디바운스 적용)
    const syncReactionWithDB = useMemo(() => debounce(async (type, isRemoving) => {
        if (!studentId || !postId) return;
        
        try {
            if (isRemoving) {
                // 동일한 반응을 클릭하면 삭제 (토글 오프)
                const { error } = await supabase
                    .from('post_reactions')
                    .delete()
                    .eq('post_id', postId)
                    .eq('student_id', studentId);
                if (error) throw error;
            } else {
                // 반응 추가 또는 변경 (unique 제약조건을 활용한 upsert)
                const { error } = await supabase
                    .from('post_reactions')
                    .upsert({
                        post_id: postId,
                        student_id: studentId,
                        reaction_type: type
                    }, { onConflict: 'post_id,student_id' });
                if (error) throw error;
            }
            // 최종적으로 서버 데이터를 다시 불러와서 정합성 맞춤
            fetchInteractions();
        } catch (err) {
            console.error('[usePostInteractions] DB 동기화 실패:', err.message);
            fetchInteractions(); // 에러 발생 시 UI 롤백을 위해 다시 불러오기
        }
    }, 1000), [postId, studentId, fetchInteractions]);

    // 반응 추가/취소 핸들러 (낙관적 업데이트 적용)
    const handleReaction = async (type) => {
        if (!studentId || !postId) return;

        // 현재 나의 반응 상태 확인
        const myReaction = reactions.find(r => r.student_id === studentId);
        const isRemoving = myReaction && myReaction.reaction_type === type;

        // 1. 낙관적 업데이트: UI 상태 먼저 변경
        setReactions(prev => {
            if (isRemoving) {
                // 동일 반응 클릭 -> 삭제
                return prev.filter(r => r.student_id !== studentId);
            } 
            
            if (myReaction) {
                // 다른 반응 클릭 -> 변경
                return prev.map(r => r.student_id === studentId ? { ...r, reaction_type: type } : r);
            }
            
            // 기존 반응 없음 -> 새 추가
            return [...prev, {
                post_id: postId,
                student_id: studentId,
                reaction_type: type,
                students: { name: '나' }, // 임시 표시용
                created_at: new Date().toISOString()
            }];
        });

        // 2. 디바운스된 DB 동기화 호출 (1초 대기)
        syncReactionWithDB(type, isRemoving);
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

                // 3. AI 문맥 분석 및 실시간 상호작용 (백그라운드)
                checkContentSafety(content).then(async (safety) => {
                    if (!safety.is_appropriate) {
                        // 통과 실패 시 DB에서 즉시 삭제 (포인트 보상 안함)
                        await supabase.from('post_comments').delete().eq('id', newCommentId);
                        
                        console.log(`🛡️ [AI 보안관] 부적절한 표현 감지 -> 자동 삭제 완료: ${content}`);
                        alert(`잠깐! ✋\n\n${safety.reason || '조금 더 고운 표현을 사용해 볼까요?'}\n(방금 작성한 댓글은 삭제 처리 되었습니다.)`);
                        fetchInteractions();
                    } else {
                        // 통과 시에만 보상 지급 (RPC 호출)
                        supabase.rpc('reward_for_comment', { p_post_id: postId }).then(({ data, error: rpcErr }) => {
                            if (!rpcErr && data?.success) {
                                console.log(`💰 [AI 보안관] 안전한 댓글 확인 -> +${data.points_awarded}P 지급 완료!`);
                            }
                        });
                        // 정상 댓글 목록으로 새로고침 (tempId 제거)
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

                // AI 문맥 분석 및 자동 원복 (백그라운드)
                checkContentSafety(newContent).then(async (safety) => {
                    if (!safety.is_appropriate) {
                        // 통과 실패 시 이전 내용으로 강제 롤백
                        const originalContent = previousComments.find(c => c.id === commentId)?.content;
                        if (originalContent) {
                            await supabase.from('post_comments').update({ content: originalContent }).eq('id', commentId);
                        }
                        
                        console.log(`🛡️ [AI 보안관] 부적절한 수정 감지 -> 원복 완료: ${newContent}`);
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
