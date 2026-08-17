import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { studentHomeApi } from '../modules/home/studentHomeApi';
import { FEEDBACK_MODULE_IDS, notificationApi } from '../modules/notifications/notificationApi';

const ACTIVE_MISSION_LIMIT = 500;

export const useStudentDashboard = (studentSession, onNavigate, options = {}) => {
    const { bootstrap = null, bootstrapLoading = false, refreshBootstrap = null } = options;
    const RETURNED_COUNT_CACHE_MS = 30000;
    const [points, setPoints] = useState(0);
    const [hasActivity, setHasActivity] = useState(false);
    const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [feedbackInitialTab, setFeedbackInitialTab] = useState(0);
    const [returnedCount, setReturnedCount] = useState(0);
    const [petData, setPetData] = useState(null); // [추가] 초기 펫 데이터 상태
    const [isLoading, setIsLoading] = useState(true);

    // 내 글 소식은 2026-08-17부터 student_notification_events 원장을 읽는다. 예전에는
    // students.last_feedback_check 시각 하나로 갈랐는데, 선 하나로는 "1번은 읽고 2번은
    // 안 읽음"을 표현할 수 없어 알림별 확인이 불가능했다. 원장은 행마다 read_at을 갖는다.
    const sessionClassId = studentSession?.classId || studentSession?.class_id || null;
    const returnedCountCacheRef = useRef({ value: 0, fetchedAt: 0 });

    const applyBootstrap = useCallback((payload) => {
        if (!payload?.student) return null;
        const student = payload.student;
        setPoints(Number(student.total_points || 0));
        if (student.pet_data) setPetData(student.pet_data);
        const home = payload.home || {};
        const feedbackUnread = Number(payload.feedback_notifications?.unread_count || 0);
        setFeedbackUnreadCount(feedbackUnread);
        setHasActivity(feedbackUnread > 0 || Boolean(home.has_activity));
        const nextReturned = Number(home.returned_count || 0);
        returnedCountCacheRef.current = { value: nextReturned, fetchedAt: Date.now() };
        setReturnedCount(nextReturned);
        setIsLoading(false);
        return student;
    }, []);

    // 읽음 처리 뒤 홈 캐시를 반드시 지운다. 캐시(60초)에 옛 개수가 남아 있으면 학생이
    // 다른 메뉴에 갔다 오는 순간 대시보드가 새로 만들어지면서 그 값을 다시 적용해
    // 방금 지운 배지가 되살아난다. 화면 상태만 바꾸면 안 되는 이유다.
    // 확인할 때마다 홈 RPC를 다시 부르면 왕복이 스무 번 생기므로, 확인 중에는 캐시만
    // 버려 두고(notify: false) 창을 닫을 때 한 번만 다시 부른다.
    const feedbackDirtyRef = useRef(false);
    const invalidateHomeCache = useCallback(({ notify = true } = {}) => {
        if (studentSession?.id) studentHomeApi.invalidate(studentSession.id, { notify });
    }, [studentSession?.id]);

    const fetchActiveMissionIds = useCallback(async () => {
        if (!sessionClassId) return [];

        const { data, error } = await supabase
            .from('writing_missions')
            .select('id')
            .eq('class_id', sessionClassId)
            .eq('is_archived', false)
            .order('created_at', { ascending: false })
            .limit(ACTIVE_MISSION_LIMIT);

        if (error) throw error;
        return (data || []).map((mission) => mission.id);
    }, [sessionClassId]);


    const fetchMyPoints = useCallback(async () => {
        if (!studentSession?.id) return;
        try {
            if (refreshBootstrap) {
                const payload = await refreshBootstrap({ force: true });
                return applyBootstrap(payload);
            }
            const { data: studentSnapshot, error: snapshotError } = await supabase
                .rpc('get_student_dashboard_snapshot');

            if (snapshotError) throw snapshotError;

            if (studentSnapshot?.success && studentSnapshot.student) {
                const currentStudent = studentSnapshot.student;

                if (currentStudent.total_points !== null && currentStudent.total_points !== undefined) {
                    setPoints(currentStudent.total_points);
                }
                if (currentStudent.pet_data) {
                    setPetData(currentStudent.pet_data);
                }
                return currentStudent;
            }
        } catch (err) {
            console.error('학생 대시보드 상태 로드 실패:', err.message);
        }
        return null;
    }, [applyBootstrap, refreshBootstrap, studentSession?.id]);

    // 미확인 개수는 원장을 읽는 홈 RPC 한 곳에서만 나온다. 예전에는 여기서 반응·댓글
    // 두 표를 직접 조인해 다시 셌는데, 서버와 기준이 갈라지면 배지와 목록이 어긋났다.
    const checkActivity = useCallback(async () => {
        if (!studentSession?.id || !refreshBootstrap) return false;
        try {
            const payload = await refreshBootstrap({ force: true });
            applyBootstrap(payload);
            return Number(payload?.feedback_notifications?.unread_count || 0) > 0;
        } catch (err) {
            console.error('활동 확인 실패:', err.message);
            return false;
        }
    }, [applyBootstrap, refreshBootstrap, studentSession?.id]);

    const fetchReturnedCount = useCallback(async (forceRefresh = false) => {
        if (!studentSession?.id || !sessionClassId) return 0;

        const now = Date.now();
        const cached = returnedCountCacheRef.current;

        if (!forceRefresh && now - cached.fetchedAt < RETURNED_COUNT_CACHE_MS) {
            setReturnedCount(cached.value);
            return cached.value;
        }

        try {
            if (refreshBootstrap) {
                const payload = await refreshBootstrap({ force: forceRefresh });
                applyBootstrap(payload);
                return Number(payload?.home?.returned_count || 0);
            }
            const activeMissionIds = await fetchActiveMissionIds();
            if (activeMissionIds.length === 0) {
                returnedCountCacheRef.current = { value: 0, fetchedAt: now };
                setReturnedCount(0);
                return 0;
            }

            const { count, error } = await supabase
                .from('student_posts')
                .select('id', { count: 'exact', head: true })
                .eq('class_id', sessionClassId)
                .eq('student_id', studentSession.id)
                .in('mission_id', activeMissionIds)
                .eq('is_returned', true)
                .eq('is_submitted', false)
                .eq('is_confirmed', false)
                .is('recalled_at', null);

            if (error) throw error;

            const nextCount = count || 0;
            returnedCountCacheRef.current = { value: nextCount, fetchedAt: now };
            setReturnedCount(nextCount);
            return nextCount;
        } catch (err) {
            console.error('반려 글 개수 로드 실패:', err.message);
            return cached.value || 0;
        }
    }, [applyBootstrap, fetchActiveMissionIds, refreshBootstrap, sessionClassId, studentSession?.id]);

    // 알림 한 건만 확인한다. 원본 반응·댓글은 글에 그대로 남고 알림만 정리된다.
    const handleMarkFeedbackRead = useCallback(async (notificationId) => {
        if (!notificationId) return false;
        try {
            await notificationApi.markRead([notificationId]);
            setFeedbacks((current) => current.filter((item) => item.id !== notificationId));
            setFeedbackUnreadCount((current) => {
                const next = Math.max(0, current - 1);
                setHasActivity(next > 0);
                return next;
            });
            feedbackDirtyRef.current = true;
            invalidateHomeCache({ notify: false });
            return true;
        } catch (err) {
            console.error('소식 확인 처리 실패:', err.message);
            return false;
        }
    }, [invalidateHomeCache]);

    // 목록에 보이는 50건이 아니라 서버가 가진 내 글 소식 전체를 확인 처리한다.
    const handleMarkAllFeedbackRead = useCallback(async () => {
        try {
            await notificationApi.markAllRead({ moduleIds: FEEDBACK_MODULE_IDS });
            setFeedbacks([]);
            setFeedbackUnreadCount(0);
            setHasActivity(false);
            feedbackDirtyRef.current = true;
            invalidateHomeCache({ notify: false });
            return true;
        } catch (err) {
            console.error('소식 모두 확인 처리 실패:', err.message);
            return false;
        }
    }, [invalidateHomeCache]);

    // 창을 닫을 때 한 번만 서버 값을 다시 받는다. 이걸 빼면 앱이 들고 있는 옛 홈 데이터가
    // 그대로 남아, 다른 메뉴에 갔다 돌아오는 순간 대시보드가 새로 만들어지며 지운 배지가
    // 되살아난다(홈 복귀 새로고침은 60초가 지나야 돌기 때문에 그 안에 돌아오면 어긋난다).
    const handleCloseFeedback = useCallback(() => {
        setShowFeedback(false);
        if (feedbackDirtyRef.current) {
            feedbackDirtyRef.current = false;
            invalidateHomeCache({ notify: true });
        }
    }, [invalidateHomeCache]);

    const handleDirectRewriteGo = async () => {
        try {
            const fetchLatestReturnedPost = async () => {
                const activeMissionIds = await fetchActiveMissionIds();
                if (activeMissionIds.length === 0) return null;

                const { data, error } = await supabase
                    .from('student_posts')
                    .select('id, mission_id')
                    .eq('class_id', sessionClassId)
                    .eq('student_id', studentSession.id)
                    .in('mission_id', activeMissionIds)
                    .eq('is_returned', true)
                    .eq('is_submitted', false)
                    .eq('is_confirmed', false)
                    .is('recalled_at', null)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                return data;
            };

            let data = await fetchLatestReturnedPost();
            if (!data) {
                await new Promise(resolve => setTimeout(resolve, 250));
                data = await fetchLatestReturnedPost();
            }
            if (data) {
                onNavigate('writing', {
                    missionId: data.mission_id,
                    postId: data.id,
                    mode: 'edit'
                });
                return;
            }
            openFeedback(1);
        } catch (err) {
            console.error('다시 쓰기 페이지 이동 실패:', err.message);
            openFeedback();
        }
    };

    // 미확인 알림만 원장에서 읽는다. 확인한 것은 서버가 이미 걸러 주므로 클라이언트가
    // 다시 거를 필요가 없고, 부분 인덱스 덕에 지난 이력이 쌓여도 비용이 늘지 않는다.
    const fetchFeedbacks = useCallback(async () => {
        setLoadingFeedback(true);
        try {
            const result = await notificationApi.listUnread({
                limit: 50,
                moduleIds: FEEDBACK_MODULE_IDS
            });
            setFeedbacks(result.items || []);
        } catch (err) {
            console.error('소식 로드 실패:', err.message);
            setFeedbacks([]);
        } finally {
            setLoadingFeedback(false);
        }
    }, []);

    const openFeedback = useCallback(async (tabIndex = 0) => {
        setFeedbackInitialTab(tabIndex);
        setLoadingFeedback(true);
        setShowFeedback(true);
        await fetchFeedbacks();
    }, [fetchFeedbacks]);

    useEffect(() => {
        if (studentSession?.id) {
            if (bootstrap) {
                applyBootstrap(bootstrap);
                return;
            }
            if (bootstrapLoading) return;
            const loadData = () => {
                // 블로킹 없이 각 요청을 개별 비동기 실행하도록 뜯어 고쳐 체감 로딩 시간(TTI) 제로화
                setIsLoading(false); // 즉시 렌더링을 허용 (데이터는 각자 도착하는 대로 채워짐)

                fetchMyPoints().then(() => {
                    checkActivity();
                    fetchReturnedCount(true);
                });

            };
            loadData();
        }
    }, [applyBootstrap, bootstrap, bootstrapLoading, studentSession?.id, fetchMyPoints, checkActivity, fetchReturnedCount]);

    return {
        points, setPoints, hasActivity, feedbackUnreadCount, showFeedback, feedbacks,
        loadingFeedback, feedbackInitialTab,
        returnedCount, isLoading, initialPetData: petData,
        handleMarkFeedbackRead, handleMarkAllFeedbackRead, handleCloseFeedback,
        handleDirectRewriteGo, openFeedback,
        fetchMyPoints, checkActivity, fetchReturnedCount // 새로운 훅에 넘기기 위한 내보내기
    };
};
