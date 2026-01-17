import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

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
                .select('*, students:student_id(name)')
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

        const myReactions = reactions.filter(r => r.student_id === studentId);
        const existing = myReactions.find(r => r.reaction_type === type);

        try {
            if (existing) {
                const { error } = await supabase
                    .from('post_reactions')
                    .delete()
                    .eq('post_id', postId)
                    .eq('student_id', studentId)
                    .eq('reaction_type', type);
                if (error) throw error;
            } else {
                if (myReactions.length >= 2) {
                    alert('이모티콘은 최대 2개까지만 선택할 수 있어요! ✌️');
                    return;
                }
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
        try {
            const { error } = await supabase
                .from('post_comments')
                .insert({
                    post_id: postId,
                    student_id: studentId,
                    content: content.trim()
                });
            if (error) throw error;

            // 포인트 지급 등 추가 로직은 컴포넌트 레벨에서 처리하거나 훅 확장 가능
            fetchInteractions();
            return true;
        } catch (err) {
            console.error('댓글 등록 오류:', err.message);
            return false;
        }
    };

    // 댓글 수정 핸들러
    const updateComment = async (commentId, newContent) => {
        if (!newContent.trim() || !studentId) return;
        try {
            const { error } = await supabase
                .from('post_comments')
                .update({ content: newContent.trim() })
                .eq('id', commentId);
            if (error) throw error;
            fetchInteractions();
            return true;
        } catch (err) {
            console.error('댓글 수정 오류:', err.message);
            return false;
        }
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
