import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * 역할: 아지트 아이디어 마켓 - 학급 회의 & 아이디어 제안 관리 훅 🏛️
 * - meeting 타입 미션 조회
 * - 아이디어(student_posts) 조회 및 제출
 * - 투표(찬성/반대/보완) 및 댓글 관리
 * - 상태 전환 (제안중 → 검토중 → 결정됨)
 */
export const useIdeaMarket = (classId, studentId) => {
    const [meetings, setMeetings] = useState([]);          // meeting 타입 미션 목록
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [ideas, setIdeas] = useState([]);                // 선택된 미션의 아이디어 목록
    const [myIdea, setMyIdea] = useState(null);            // 내가 쓴 아이디어
    const [loading, setLoading] = useState(true);
    const [ideasLoading, setIdeasLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [stats, setStats] = useState({ total: 0, decided: 0, reviewing: 0 });

    // 1. 학급의 meeting 타입 미션 목록 조회
    const fetchMeetings = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('id, title, guide, guide_questions, created_at, is_archived, mission_type, base_reward, bonus_reward')
                .eq('class_id', classId)
                .eq('is_archived', false)
                .eq('mission_type', 'meeting')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMeetings(data || []);

            // 가장 최근 회의를 자동 선택
            if (data && data.length > 0 && !selectedMeeting) {
                setSelectedMeeting(data[0]);
            }
        } catch (err) {
            console.error('[useIdeaMarket] 회의 목록 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [classId]);

    // 2. 선택된 미션에 대한 아이디어(제안) 목록 조회
    const fetchIdeas = useCallback(async (meetingId) => {
        if (!meetingId) return;
        setIdeasLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, title, content, student_id, mission_id, status,
                    is_submitted, is_confirmed, student_answers, created_at,
                    students!inner(id, name, pet_data),
                    post_reactions(id, reaction_type, student_id, students(name)),
                    post_comments(id, content, student_id, created_at, students(name))
                `)
                .eq('mission_id', meetingId)
                .eq('is_submitted', true)
                .is('students.deleted_at', null)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const ideaList = data || [];
            setIdeas(ideaList);

            // 내 아이디어 찾기
            if (studentId) {
                const mine = ideaList.find(idea => idea.student_id === studentId);
                setMyIdea(mine || null);
            }

            // 통계 계산
            const total = ideaList.length;
            const decided = ideaList.filter(i => i.status === '결정됨').length;
            const reviewing = ideaList.filter(i => i.status === '검토중').length;
            setStats({ total, decided, reviewing });

        } catch (err) {
            console.error('[useIdeaMarket] 아이디어 목록 로드 실패:', err.message);
        } finally {
            setIdeasLoading(false);
        }
    }, [studentId]);

    // 3. 아이디어 제출 (새 게시물 생성)
    const submitIdea = async ({ title, content, answers, isAnonymous }) => {
        if (!selectedMeeting?.id || !studentId) return false;
        setSubmitting(true);
        try {
            // 기존 게시물 확인 (중복 방지)
            const { data: existing } = await supabase
                .from('student_posts')
                .select('id')
                .eq('mission_id', selectedMeeting.id)
                .eq('student_id', studentId)
                .maybeSingle();

            const postData = {
                title,
                content,
                student_answers: answers || [],
                is_submitted: true,
                status: '제안중',
                mission_id: selectedMeeting.id,
                student_id: studentId,
                original_content: content,
                original_title: title,
                first_submitted_at: new Date().toISOString()
            };

            if (existing?.id) {
                // 업데이트 (수정 — 포인트 중복지급 없음)
                const { error } = await supabase
                    .from('student_posts')
                    .update(postData)
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                // 새로 생성 — 제출 포인트 지급
                const { error } = await supabase
                    .from('student_posts')
                    .insert(postData);
                if (error) throw error;

                // 제출 포인트 지급
                const submitReward = selectedMeeting?.base_reward || 30;
                if (submitReward > 0 && studentId) {
                    try {
                        await supabase.rpc('increment_student_points', {
                            student_id: studentId,
                            points_to_add: submitReward,
                            log_reason: '아이디어 마켓에 제안을 제출했어요! 🏛️💡'
                        });
                    } catch (ptErr) {
                        console.error('[useIdeaMarket] 제출 포인트 지급 실패:', ptErr.message);
                    }
                }
            }

            await fetchIdeas(selectedMeeting.id);
            return true;
        } catch (err) {
            console.error('[useIdeaMarket] 아이디어 제출 실패:', err.message);
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    // 4. 아이디어 상태 변경 (교사용)
    const updateIdeaStatus = async (postId, newStatus) => {
        try {
            const updateData = {
                status: newStatus,
                is_confirmed: newStatus === '결정됨'
            };

            const { error } = await supabase
                .from('student_posts')
                .update(updateData)
                .eq('id', postId);

            if (error) throw error;
            if (selectedMeeting?.id) await fetchIdeas(selectedMeeting.id);
            return true;
        } catch (err) {
            console.error('[useIdeaMarket] 상태 변경 실패:', err.message);
            return false;
        }
    };

    // 5. 투표(반응) 처리 - agree/disagree/supplement
    const handleVote = async (postId, voteType) => {
        if (!studentId || !postId) return;
        try {
            // 기존 반응 확인
            const { data: existing } = await supabase
                .from('post_reactions')
                .select('id, reaction_type')
                .eq('post_id', postId)
                .eq('student_id', studentId)
                .maybeSingle();

            if (existing) {
                if (existing.reaction_type === voteType) {
                    // 동일 투표 취소
                    await supabase.from('post_reactions').delete().eq('id', existing.id);
                } else {
                    // 다른 투표로 변경
                    await supabase.from('post_reactions').update({ reaction_type: voteType }).eq('id', existing.id);
                }
            } else {
                // 새 투표
                await supabase.from('post_reactions').insert({
                    post_id: postId,
                    student_id: studentId,
                    reaction_type: voteType
                });
            }

            if (selectedMeeting?.id) await fetchIdeas(selectedMeeting.id);
        } catch (err) {
            console.error('[useIdeaMarket] 투표 처리 실패:', err.message);
        }
    };

    // 초기 로딩
    useEffect(() => {
        fetchMeetings();
    }, [fetchMeetings]);

    // 미션 선택 시 아이디어 로딩
    useEffect(() => {
        if (selectedMeeting?.id) {
            fetchIdeas(selectedMeeting.id);
        }
    }, [selectedMeeting?.id, fetchIdeas]);

    return {
        meetings,
        selectedMeeting,
        setSelectedMeeting,
        ideas,
        myIdea,
        loading,
        ideasLoading,
        submitting,
        stats,
        submitIdea,
        updateIdeaStatus,
        handleVote,
        refresh: () => {
            fetchMeetings();
            if (selectedMeeting?.id) fetchIdeas(selectedMeeting.id);
        }
    };
};
