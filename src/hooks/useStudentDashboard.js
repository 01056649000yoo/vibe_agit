import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

import { dataCache } from '../lib/cache';

export const useStudentDashboard = (studentSession, onNavigate) => {
    const [points, setPoints] = useState(0);
    const [hasActivity, setHasActivity] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [feedbackInitialTab, setFeedbackInitialTab] = useState(0);
    const [teacherNotify, setTeacherNotify] = useState(null);
    const [returnedCount, setReturnedCount] = useState(0);
    const [petData, setPetData] = useState(null); // [추가] 초기 펫 데이터 상태
    const [stats, setStats] = useState({ totalChars: 0, completedMissions: 0, monthlyPosts: 0 });
    const [levelInfo, setLevelInfo] = useState({ level: 1, name: '새싹 작가', emoji: '🌱', next: 1401 });
    const [isLoading, setIsLoading] = useState(true);
    const [dragonConfig, setDragonConfig] = useState({ feedCost: 80, degenDays: 14 });

    const lastCheckRef = useRef('1970-01-01T00:00:00.000Z');

    const getLevelInfo = (totalChars) => {
        if (totalChars >= 14001) return { level: 5, name: '전설의 작가', emoji: '✨', next: null };
        if (totalChars >= 8401) return { level: 4, name: '대문호', emoji: '👑', next: 14001 };
        if (totalChars >= 4201) return { level: 3, name: '숙련 작가', emoji: '🌳', next: 8401 };
        if (totalChars >= 1401) return { level: 2, name: '초보 작가', emoji: '🌿', next: 4201 };
        return { level: 1, name: '새싹 작가', emoji: '🌱', next: 1401 };
    };

    const fetchStats = useCallback(async () => {
        if (!studentSession?.id) return;
        try {
            const data = await dataCache.get(`stats_${studentSession.id}`, async () => {
                const { data, error } = await supabase
                    .from('student_posts')
                    .select('mission_id, char_count, created_at, is_submitted, is_confirmed, writing_missions!inner(mission_type)')
                    .eq('student_id', studentSession.id);
                if (error) throw error;
                return data || [];
            });

            if (data) {
                // 1. 미션별로 그룹화하여 '최종' 제출물만 추출
                const missionMap = new Map();
                data.forEach(post => {
                    const missionId = post.mission_id;
                    const existing = missionMap.get(missionId);

                    // 우선순위: 승인완료(confirmed) > 제출됨(submitted) > 최신순
                    let isBetter = false;
                    if (!existing) {
                        isBetter = true;
                    } else if (post.is_confirmed && !existing.is_confirmed) {
                        isBetter = true;
                    } else if (!existing.is_confirmed && post.is_submitted && !existing.is_submitted) {
                        isBetter = true;
                    } else if (post.is_submitted === existing.is_submitted && post.is_confirmed === existing.is_confirmed) {
                        if (new Date(post.created_at) > new Date(existing.created_at)) {
                            isBetter = true;
                        }
                    }

                    if (isBetter) {
                        missionMap.set(missionId, post);
                    }
                });

                const finalPosts = Array.from(missionMap.values());

                // 2. 제출되었거나 승인된 글의 글자수 합산
                const totalChars = finalPosts
                    .filter(p => p.is_confirmed || p.is_submitted)
                    .reduce((sum, post) => sum + (post.char_count || 0), 0);

                // 3. 완료한 미션 수 (제출/승인 기준)
                const completedMissions = finalPosts.filter(p => p.is_confirmed || p.is_submitted).length;

                // 4. 이번 달 작성 수 (제출/승인 기준)
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const monthlyPosts = finalPosts.filter(p => {
                    if (!(p.is_confirmed || p.is_submitted)) return false;
                    const postDate = new Date(p.created_at);
                    return postDate.getMonth() === currentMonth && postDate.getFullYear() === currentYear;
                }).length;

                setStats({ totalChars, completedMissions, monthlyPosts });
                setLevelInfo(getLevelInfo(totalChars));
            }
        } catch (err) {
            console.error('글쓰기 통계 로드 실패:', err.message);
        }
    }, [studentSession?.id]);

    const fetchMyPoints = useCallback(async () => {
        if (!studentSession?.id) return;
        try {
            // 포인트 정보는 실시간성이 중요하므로 캐시 없이 매번 최신 정보를 가져옵니다.
            const { data, error } = await supabase
                .from('students')
                .select('total_points, pet_data, last_feedback_check')
                .eq('id', studentSession.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                if (data.total_points !== null && data.total_points !== undefined) {
                    setPoints(data.total_points);
                }
                if (data.pet_data) {
                    setPetData(data.pet_data);
                }
                if (data.last_feedback_check) {
                    lastCheckRef.current = data.last_feedback_check;
                }
                return data;
            }
        } catch (err) {
            console.error('포인트 로드 실패:', err.message);
        }
        return null;
    }, [studentSession?.id]);

    const fetchClassSettings = useCallback(async () => {
        let classId = studentSession.classId || studentSession.class_id;

        if (!classId && studentSession?.id) {
            const { data: studentData } = await supabase
                .from('students')
                .select('class_id')
                .eq('id', studentSession.id)
                .single();
            if (studentData?.class_id) {
                classId = studentData.class_id;
            }
        }

        if (!classId) return null;

        try {
            const data = await dataCache.get(`class_settings_${classId}`, async () => {
                const { data, error } = await supabase
                    .from('classes')
                    .select('dragon_feed_points, dragon_degen_days')
                    .eq('id', classId)
                    .single();
                if (error) throw error;
                return data;
            });

            if (data) {
                const config = {
                    feedCost: data.dragon_feed_points || 80,
                    degenDays: data.dragon_degen_days || 14
                };
                setDragonConfig(config);
                return config;
            }
        } catch (err) {
            console.error('드래곤 설정 로드 오류:', err);
        }
        return null;
    }, [studentSession.classId, studentSession.class_id, studentSession.id]);

    const checkActivity = useCallback(async () => {
        try {
            if (!studentSession?.id) return;

            const lastCheckTime = lastCheckRef.current || '1970-01-01T00:00:00.000Z';

            const [reactionsResult, commentsResult, returnedResult] = await Promise.all([
                // Inner join과 head: true를 브라우저 환경에서 동시 사용 시 반환값 누락 버그 발생 가능성 우려.
                // 활동 유무(1개라도 있는지)만 알면 되므로 head 대신 limit(1) 사용
                supabase
                    .from('post_reactions')
                    .select('id, student_posts!inner(student_id)')
                    .eq('student_posts.student_id', studentSession.id)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheckTime)
                    .limit(1),
                supabase
                    .from('post_comments')
                    .select('id, student_posts!inner(student_id)')
                    .eq('student_posts.student_id', studentSession.id)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheckTime)
                    .limit(1),
                supabase
                    .from('student_posts')
                    .select('id', { count: 'exact', head: true })
                    .eq('student_id', studentSession.id)
                    .eq('is_returned', true)
            ]);

            if (reactionsResult.error) console.error("Reactions Check Error:", reactionsResult.error);
            if (commentsResult.error) console.error("Comments Check Error:", commentsResult.error);

            const hasNewReaction = (reactionsResult.data?.length || 0) > 0;
            const hasNewComment = (commentsResult.data?.length || 0) > 0;
            const returnedCountVal = returnedResult.count || 0;

            setReturnedCount(returnedCountVal);
            setHasActivity(hasNewReaction || hasNewComment);
        } catch (err) {
            console.error('활동 확인 실패:', err.message);
        }
    }, [studentSession?.id]);

    const handleClearFeedback = async () => {
        try {
            // [수정] RLS 정책으로 인해 직접 update가 불가능하므로 RPC(mark_feedback_as_read) 사용
            const { error } = await supabase.rpc('mark_feedback_as_read', {
                p_student_id: studentSession.id
            });

            if (error) throw error;

            lastCheckRef.current = new Date().toISOString();
            setFeedbacks([]);
            setHasActivity(false);
        } catch (err) {
            console.error('알림 확인 시간 저장 실패:', err);
        }
    };

    const handleDirectRewriteGo = async () => {
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, mission_id')
                .eq('student_id', studentSession.id)
                .eq('is_returned', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                onNavigate('writing', {
                    missionId: data.mission_id,
                    postId: data.id,
                    mode: 'edit'
                });
            }
        } catch (err) {
            console.error('다시 쓰기 페이지 이동 실패:', err.message);
            openFeedback();
        }
    };

    const fetchFeedbacks = async () => {
        setLoadingFeedback(true);
        try {
            const lastCheck = lastCheckRef.current || '1970-01-01T00:00:00.000Z';

            // ★ [성능 최적화] Inner Join과 조건을 DB 레벨로 내려서 쿼리 횟수를 줄이고 페이로드를 최소화
            const [reactionsResult, commentsResult] = await Promise.all([
                supabase
                    .from('post_reactions')
                    .select('*, students:student_id(name), student_posts!inner(title, id, student_id)')
                    .eq('student_posts.student_id', studentSession.id)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheck)
                    .order('created_at', { ascending: false })
                    .limit(50),
                supabase
                    .from('post_comments')
                    .select('*, students:student_id(name), student_posts!inner(title, id, student_id)')
                    .eq('student_posts.student_id', studentSession.id)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheck)
                    .order('created_at', { ascending: false })
                    .limit(50)
            ]);

            const reactions = reactionsResult.data || [];
            const comments = commentsResult.data || [];

            const combined = [
                ...reactions.map(r => ({ ...r, type: 'reaction' })),
                ...comments.map(c => ({ ...c, type: 'comment' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setFeedbacks(combined);
        } catch (err) {
            console.error('피드백 로드 실패:', err.message);
        } finally {
            setLoadingFeedback(false);
        }
    };

    const openFeedback = (tabIndex = 0) => {
        setFeedbackInitialTab(tabIndex);
        setShowFeedback(true);
        fetchFeedbacks();
    };

    useEffect(() => {
        if (studentSession?.id) {
            const loadData = () => {
                // 블로킹 없이 각 요청을 개별 비동기 실행하도록 뜯어 고쳐 체감 로딩 시간(TTI) 제로화
                setIsLoading(false); // 즉시 렌더링을 허용 (데이터는 각자 도착하는 대로 채워짐)

                // fetchMyPoints에서 lastCheckRef를 세팅한 이후에 활동 내역을 체크해야 함 (알림 메시지 버그 방지)
                fetchMyPoints().then(() => {
                    checkActivity();
                });

                fetchClassSettings();
                fetchStats();
            };
            loadData();

            const notificationChannel = supabase
                .channel(`student_realtime_v3_${studentSession.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'point_logs',
                        filter: `student_id=eq.${studentSession.id}`
                    },
                    (payload) => {
                        const newLog = payload.new;
                        if (newLog.amount !== 0) {
                            setPoints(prev => (prev || 0) + newLog.amount);
                        }

                        let bannerMsg = "";
                        let bannerIcon = "🎁";

                        if (newLog.amount > 0 || newLog.amount < 0) {
                            // [수정] 상세 사유에서 PostID 식별용 문자열 제거 후 출력
                            const cleanReason = (newLog.reason || '').replace(/\(PostID:[^)]+\)/, '').trim();

                            if (newLog.amount < 0) {
                                bannerMsg = `⚠️ ${cleanReason} (${newLog.amount}P)`;
                                bannerIcon = "⚠️";
                            } else if (newLog.reason?.includes('아이디어 마켓') && newLog.reason?.includes('결정')) {
                                bannerMsg = `🏛️✅ 내 아이디어가 최종 결정되었어요! (+${newLog.amount}P)`;
                                bannerIcon = "🏛️";
                            } else if (newLog.reason?.includes('아이디어 마켓') && newLog.reason?.includes('제출')) {
                                bannerMsg = `🏛️💡 아이디어 제출 보상! (+${newLog.amount}P)`;
                                bannerIcon = "💡";
                            } else if (newLog.reason?.includes('아이디어 마켓') && newLog.reason?.includes('토론')) {
                                bannerMsg = `🏛️💬 아이디어 토론 참여 보상! (+${newLog.amount}P)`;
                                bannerIcon = "💬";
                            } else if (newLog.reason?.includes('승인')) {
                                bannerMsg = `🎉 글이 승인되어 +${newLog.amount}P를 받았어요!`;
                                bannerIcon = "🎉";
                            } else {
                                bannerMsg = `🎁 ${cleanReason} (+${newLog.amount}P)`;
                                bannerIcon = "🎁";
                            }
                        }

                        if (bannerMsg) {
                            setTeacherNotify({
                                type: 'point',
                                message: bannerMsg,
                                icon: bannerIcon,
                                timestamp: Date.now()
                            });
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'student_posts',
                        filter: `student_id=eq.${studentSession.id}`
                    },
                    (payload) => {
                        const updatedPost = payload.new;
                        const oldPost = payload.old;

                        // [debug] REPLICA IDENTITY FULL을 통해 이전 상태(payload.old)와 비교

                        // 1. 반려(다시 쓰기) 요청이 새로 설정된 경우
                        if (updatedPost.is_returned && !oldPost.is_returned) {
                            setTeacherNotify({
                                type: 'rewrite',
                                message: "♻️ 선생님의 다시 쓰기 요청이 있습니다.",
                                icon: "♻️",
                                timestamp: Date.now()
                            });
                            checkActivity();
                        }
                        // 2. 승인 완료 (is_confirmed: false -> true)
                        else if (updatedPost.is_confirmed && !oldPost.is_confirmed) {
                            setTeacherNotify({
                                type: 'approve',
                                message: `🎉 글이 승인되었습니다! 축하해요!`,
                                icon: "🎉",
                                timestamp: Date.now()
                            });
                            fetchMyPoints();
                            fetchStats();
                        }
                        // 3. 승인 취소 또는 회수 (is_confirmed: true -> false)
                        else if (!updatedPost.is_confirmed && oldPost.is_confirmed) {
                            setTeacherNotify({
                                type: 'recovery',
                                message: "⚠️ 글의 승인이 취소되거나 회수되었습니다.",
                                icon: "⚠️",
                                timestamp: Date.now()
                            });
                            fetchMyPoints();
                            fetchStats();
                        }
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(notificationChannel);
            };
        }
    }, [studentSession?.id, fetchMyPoints, fetchClassSettings, fetchStats, checkActivity]);

    return {
        points, setPoints, hasActivity, showFeedback, setShowFeedback, feedbacks,
        loadingFeedback, feedbackInitialTab, teacherNotify, setTeacherNotify,
        returnedCount, stats, levelInfo, isLoading, dragonConfig, initialPetData: petData,
        handleClearFeedback, handleDirectRewriteGo, openFeedback
    };
};
