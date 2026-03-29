import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

import { dataCache } from '../lib/cache';

export const useStudentDashboard = (studentSession, onNavigate) => {
    const RETURNED_COUNT_CACHE_MS = 30000;
    const [points, setPoints] = useState(0);
    const [hasActivity, setHasActivity] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [feedbackInitialTab, setFeedbackInitialTab] = useState(0);
    const [returnedCount, setReturnedCount] = useState(0);
    const [petData, setPetData] = useState(null); // [추가] 초기 펫 데이터 상태
    const [stats, setStats] = useState({ totalChars: 0, completedMissions: 0, monthlyPosts: 0 });
    const [levelInfo, setLevelInfo] = useState({ level: 1, name: '새싹 작가', emoji: '🌱', next: 1401 });
    const [isLoading, setIsLoading] = useState(true);
    const [dragonConfig, setDragonConfig] = useState({ feedCost: 80, degenDays: 14 });

    const lastCheckRef = useRef('1970-01-01T00:00:00.000Z');
    const returnedCountCacheRef = useRef({ value: 0, fetchedAt: 0 });

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
            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            // [최적화] 두 가지 통계를 DB 레벨 필터링을 통해 병렬로 가져옴
            const [lifetimeData, monthlyCount] = await Promise.all([
                // 1. 전체 승인된 글 (최대 100개 제한)
                dataCache.get(`stats_lifetime_${studentSession.id}`, async () => {
                    const { data, error } = await supabase
                        .from('student_posts')
                        .select('mission_id, char_count')
                        .eq('student_id', studentSession.id)
                        .eq('is_confirmed', true)
                        .limit(100);
                    if (error) throw error;
                    return data || [];
                }, 300000), // 5분 캐시
                
                // 2. 이번 달 승인된 글 개수 (DB 레벨 필터링)
                dataCache.get(`stats_monthly_${studentSession.id}`, async () => {
                    const { count, error } = await supabase
                        .from('student_posts')
                        .select('id', { count: 'exact', head: true })
                        .eq('student_id', studentSession.id)
                        .eq('is_confirmed', true)
                        .gte('created_at', firstDayOfMonth);
                    if (error) throw error;
                    return count || 0;
                }, 60000) // 1분 캐시
            ]);

            if (lifetimeData) {
                // [최적화] 이미 DB에서 승인된 것만 가져왔으므로 미션별 중복만 제거
                const missionMap = new Map();
                lifetimeData.forEach(post => {
                    if (!missionMap.has(post.mission_id)) {
                        missionMap.set(post.mission_id, post);
                    }
                });

                const finalPosts = Array.from(missionMap.values());
                const totalChars = finalPosts.reduce((sum, post) => sum + (post.char_count || 0), 0);
                const completedMissions = finalPosts.length;
                
                setStats({ 
                    totalChars, 
                    completedMissions, 
                    monthlyPosts: monthlyCount 
                });
                setLevelInfo(getLevelInfo(totalChars));
            }
            openFeedback(1);
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

            const [reactionsResult, commentsResult] = await Promise.all([
                supabase
                    .from('post_reactions')
                    .select('id, student_posts!inner(student_id)')
                    .eq('student_posts.student_id', studentSession.id)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheckTime)
                    .limit(1),
                supabase
                    .from('post_comments')
                    .select('id, student_id, teacher_id, student_posts!inner(student_id)')
                    .eq('student_posts.student_id', studentSession.id)
                    .gt('created_at', lastCheckTime)
                    .order('created_at', { ascending: false })
                    .limit(20)
            ]);

            if (reactionsResult.error) console.error("Reactions Check Error:", reactionsResult.error);
            if (commentsResult.error) console.error("Comments Check Error:", commentsResult.error);

            const hasNewReaction = (reactionsResult.data?.length || 0) > 0;
            const hasNewComment = (commentsResult.data || []).some(comment =>
                comment.teacher_id != null ||
                (comment.student_id != null && comment.student_id !== studentSession.id)
            );

            setHasActivity(hasNewReaction || hasNewComment);
        } catch (err) {
            console.error('활동 확인 실패:', err.message);
        }
    }, [studentSession?.id]);

    const fetchReturnedCount = useCallback(async (forceRefresh = false) => {
        if (!studentSession?.id) return 0;

        const now = Date.now();
        const cached = returnedCountCacheRef.current;

        if (!forceRefresh && now - cached.fetchedAt < RETURNED_COUNT_CACHE_MS) {
            setReturnedCount(cached.value);
            return cached.value;
        }

        try {
            const { count, error } = await supabase
                .from('student_posts')
                .select('id', { count: 'exact', head: true })
                .eq('student_id', studentSession.id)
                .eq('is_returned', true);

            if (error) throw error;

            const nextCount = count || 0;
            returnedCountCacheRef.current = { value: nextCount, fetchedAt: now };
            setReturnedCount(nextCount);
            return nextCount;
        } catch (err) {
            console.error('반려 글 개수 로드 실패:', err.message);
            return cached.value || 0;
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
                returnedCountCacheRef.current = {
                    value: Math.max(0, (returnedCountCacheRef.current?.value || 1) - 1),
                    fetchedAt: Date.now()
                };
                setReturnedCount(prev => Math.max(0, prev - 1));
                onNavigate('writing', {
                    missionId: data.mission_id,
                    postId: data.id,
                    mode: 'edit'
                });
                return;
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

            const [reactionsResult, commentsResult] = await Promise.all([
                // 반응
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
                    .gt('created_at', lastCheck)
                    .order('created_at', { ascending: false })
                    .limit(50)
            ]);

            const reactions = reactionsResult.data || [];
            const comments = (commentsResult.data || []).filter(comment =>
                comment.teacher_id != null ||
                (comment.student_id != null && comment.student_id !== studentSession.id)
            );

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
                    fetchReturnedCount(true);
                });

                fetchClassSettings();
                fetchStats();
            };
            loadData();
        }
    }, [studentSession?.id, fetchMyPoints, fetchClassSettings, fetchStats, checkActivity, fetchReturnedCount]);

    return {
        points, setPoints, hasActivity, showFeedback, setShowFeedback, feedbacks,
        loadingFeedback, feedbackInitialTab,
        returnedCount, stats, levelInfo, isLoading, dragonConfig, initialPetData: petData,
        handleClearFeedback, handleDirectRewriteGo, openFeedback,
        fetchMyPoints, fetchStats, checkActivity, fetchReturnedCount // 새로운 훅에 넘기기 위한 내보내기
    };
};
