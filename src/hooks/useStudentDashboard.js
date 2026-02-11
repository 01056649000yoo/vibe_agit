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
                    .select('mission_id, char_count, created_at, is_submitted, is_confirmed')
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

                // 2. 최종 '승인'된 글의 글자수만 합산 (is_confirmed 기준)
                const totalChars = finalPosts
                    .filter(p => p.is_confirmed)
                    .reduce((sum, post) => sum + (post.char_count || 0), 0);

                // 3. 완료한 미션 수 (승인 기준)
                const completedMissions = finalPosts.filter(p => p.is_confirmed).length;

                // 4. 이번 달 작성 수 (승인 기준)
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const monthlyPosts = finalPosts.filter(p => {
                    if (!p.is_confirmed) return false;
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
            // 포인트 정보는 캐시보다 최신성이 중요하므로 TTL을 짧게(5초) 잡거나 생략 가능하지만, 잦은 리렌더링 방지를 위해 5초 캐시 적용
            const data = await dataCache.get(`points_${studentSession.id}`, async () => {
                const { data, error } = await supabase
                    .from('students')
                    .select('total_points, pet_data, last_feedback_check')
                    .eq('id', studentSession.id)
                    .maybeSingle();

                if (error) throw error;
                return data;
            }, 5000);

            if (data) {
                if (data.total_points !== null && data.total_points !== undefined) {
                    setPoints(data.total_points);
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

            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) return;
            const postIds = myPosts.map(p => p.id);

            const lastCheckTime = lastCheckRef.current || '1970-01-01T00:00:00.000Z';

            const [reactionsResult, commentsResult, returnedResult] = await Promise.all([
                supabase
                    .from('post_reactions')
                    .select('id', { count: 'exact', head: true })
                    .in('post_id', postIds)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheckTime),
                supabase
                    .from('post_comments')
                    .select('id', { count: 'exact', head: true })
                    .in('post_id', postIds)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheckTime),
                supabase
                    .from('student_posts')
                    .select('id', { count: 'exact', head: true })
                    .eq('student_id', studentSession.id)
                    .eq('is_returned', true)
            ]);

            const reactionCount = reactionsResult.count || 0;
            const commentCount = commentsResult.count || 0;
            const returnedCountVal = returnedResult.count || 0;

            setReturnedCount(returnedCountVal);
            setHasActivity(reactionCount + commentCount > 0);
        } catch (err) {
            console.error('활동 확인 실패:', err.message);
        }
    }, [studentSession?.id]);

    const handleClearFeedback = async () => {
        const now = new Date().toISOString();
        try {
            await supabase
                .from('students')
                .update({ last_feedback_check: now })
                .eq('id', studentSession.id);

            lastCheckRef.current = now;
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
            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) {
                setFeedbacks([]);
                return;
            }
            const postIds = myPosts.map(p => p.id);

            const [reactionsResult, commentsResult] = await Promise.all([
                supabase
                    .from('post_reactions')
                    .select('*, students:student_id(name), student_posts(title, id)')
                    .in('post_id', postIds)
                    .neq('student_id', studentSession.id),
                supabase
                    .from('post_comments')
                    .select('*, students:student_id(name), student_posts(title, id)')
                    .in('post_id', postIds)
                    .neq('student_id', studentSession.id)
            ]);

            const reactions = reactionsResult.data || [];
            const comments = commentsResult.data || [];

            const combined = [
                ...reactions.map(r => ({ ...r, type: 'reaction' })),
                ...comments.map(c => ({ ...c, type: 'comment' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const lastCheck = lastCheckRef.current || '1970-01-01T00:00:00.000Z';
            const newFeedbacks = combined.filter(f => new Date(f.created_at) > new Date(lastCheck));

            setFeedbacks(newFeedbacks);
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
            const loadData = async () => {
                setIsLoading(true);
                try {
                    await fetchMyPoints();
                    const classConfig = await fetchClassSettings();
                    fetchStats();
                    checkActivity();
                } catch (e) {
                    console.error('데이터 로드 중 오류:', e);
                } finally {
                    setIsLoading(false);
                }
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

                        if (newLog.amount < 0) {
                            bannerMsg = `⚠️ ${newLog.reason} (${newLog.amount}P)`;
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
                        } else if (newLog.amount > 0) {
                            bannerMsg = `🎁 ${newLog.reason} (+${newLog.amount}P)`;
                            bannerIcon = "🎁";
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
                        // 반려(다시 쓰기) 요청이 새로 설정된 경우
                        if (updatedPost.is_returned && !payload.old.is_returned) {
                            setTeacherNotify({
                                type: 'rewrite',
                                message: "♻️ 선생님의 다시 쓰기 요청이 있습니다.",
                                icon: "♻️",
                                timestamp: Date.now()
                            });
                            checkActivity();
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
        returnedCount, stats, levelInfo, isLoading, dragonConfig,
        handleClearFeedback, handleDirectRewriteGo, openFeedback
    };
};
