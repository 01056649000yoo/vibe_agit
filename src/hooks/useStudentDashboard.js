import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const ACTIVE_MISSION_LIMIT = 500;

export const useStudentDashboard = (studentSession, onNavigate, options = {}) => {
    const { bootstrap = null, bootstrapLoading = false, refreshBootstrap = null } = options;
    const RETURNED_COUNT_CACHE_MS = 30000;
    const [points, setPoints] = useState(0);
    const [hasActivity, setHasActivity] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [feedbackInitialTab, setFeedbackInitialTab] = useState(0);
    const [returnedCount, setReturnedCount] = useState(0);
    const [petData, setPetData] = useState(null); // [추가] 초기 펫 데이터 상태
    const [isLoading, setIsLoading] = useState(true);

    const lastCheckRef = useRef('1970-01-01T00:00:00.000Z');
    // 기준선(last_feedback_check)을 **실제로 읽었는지** 표시한다.
    // 못 읽었는데 1970년 기본값으로 조회하면 지난 소식이 전부 다시 뜬다.
    // 스냅샷 RPC 는 students.auth_id = auth.uid() 로 학생을 찾는데, 학생 로그인은
    // 기기마다 새 익명 세션을 만들어 auth_id 를 덮어쓴다 → 바인딩 직후나 다른 기기에서
    // 이 조회가 실패할 수 있다. 실패하면 학생 id 로 직접 읽는 폴백을 탄다.
    const lastCheckLoadedRef = useRef(false);
    // 소식 조회는 학급으로 먼저 좁힌다. student_posts 를 거쳐서만 거르면
    // 학급 인덱스를 못 써 전 학급 반응·댓글을 훑는다 (WORKLOG '학급 글 조회 기준' ①).
    // 다만 세션에 학급이 아직 없을 수 있어(아래 폴백 조회 참고) **있을 때만** 건다 —
    // null 로 걸면 소식이 통째로 안 보인다.
    const sessionClassId = studentSession?.classId || studentSession?.class_id || null;
    const scopeToClass = useCallback(
        (query) => (sessionClassId ? query.eq('class_id', sessionClassId) : query),
        [sessionClassId]
    );
    const returnedCountCacheRef = useRef({ value: 0, fetchedAt: 0 });

    const applyBootstrap = useCallback((payload) => {
        if (!payload?.student) return null;
        const student = payload.student;
        setPoints(Number(student.total_points || 0));
        if (student.pet_data) setPetData(student.pet_data);
        if (student.last_feedback_check) {
            lastCheckRef.current = student.last_feedback_check;
            lastCheckLoadedRef.current = true;
        }
        const home = payload.home || {};
        setHasActivity(Boolean(home.has_activity));
        const nextReturned = Number(home.returned_count || 0);
        returnedCountCacheRef.current = { value: nextReturned, fetchedAt: Date.now() };
        setReturnedCount(nextReturned);
        setIsLoading(false);
        return student;
    }, []);

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
                if (currentStudent.last_feedback_check) {
                    lastCheckRef.current = currentStudent.last_feedback_check;
                    lastCheckLoadedRef.current = true;
                }
                return currentStudent;
            }
        } catch (err) {
            console.error('학생 대시보드 상태 로드 실패:', err.message);
        }
        return null;
    }, [applyBootstrap, refreshBootstrap, studentSession?.id]);
    // 스냅샷이 기준선을 못 준 경우의 폴백. 학생 id 로 직접 읽는다.
    const ensureLastCheckLoaded = useCallback(async () => {
        if (lastCheckLoadedRef.current || !studentSession?.id) return;
        const { data, error } = await supabase
            .from('students')
            .select('last_feedback_check')
            .eq('id', studentSession.id)
            .maybeSingle();
        if (error) {
            console.error('소식 기준 시각 로드 실패:', error.message);
            return;
        }
        if (data) {
            lastCheckRef.current = data.last_feedback_check || '1970-01-01T00:00:00.000Z';
            lastCheckLoadedRef.current = true;
        }
    }, [studentSession?.id]);

    const checkActivity = useCallback(async () => {
        try {
            if (!studentSession?.id) return;
            if (refreshBootstrap) {
                const payload = await refreshBootstrap({ force: true });
                applyBootstrap(payload);
                return Boolean(payload?.home?.has_activity);
            }

            const lastCheckTime = lastCheckRef.current || '1970-01-01T00:00:00.000Z';

            const [reactionsResult, commentsResult] = await Promise.all([
                scopeToClass(supabase
                    .from('post_reactions')
                    .select('id, student_posts!inner(student_id)'))
                    .eq('student_posts.student_id', studentSession.id)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheckTime)
                    .limit(1),
                scopeToClass(supabase
                    .from('post_comments')
                    .select('id, student_id, teacher_id, student_posts!inner(student_id)'))
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
    }, [applyBootstrap, refreshBootstrap, studentSession?.id, scopeToClass]);

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

    const handleClearFeedback = async () => {
        try {
            // [수정] RLS 정책으로 인해 직접 update가 불가능하므로 RPC(mark_feedback_as_read) 사용
            const { error } = await supabase.rpc('mark_feedback_as_read', {
                p_student_id: studentSession.id
            });

            if (error) throw error;

            lastCheckRef.current = new Date().toISOString();
            lastCheckLoadedRef.current = true;
            setFeedbacks([]);
            setHasActivity(false);
        } catch (err) {
            console.error('알림 확인 시간 저장 실패:', err);
        }
    };

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

    const fetchFeedbacks = async () => {
        setLoadingFeedback(true);
        try {
            const lastCheck = lastCheckRef.current || '1970-01-01T00:00:00.000Z';

            const [reactionsResult, commentsResult] = await Promise.all([
                // 반응
                scopeToClass(supabase
                    .from('post_reactions')
                    .select('*, students:student_id(name), student_posts!inner(title, id, student_id)'))
                    .eq('student_posts.student_id', studentSession.id)
                    .neq('student_id', studentSession.id)
                    .gt('created_at', lastCheck)
                    .order('created_at', { ascending: false })
                    .limit(50),
                scopeToClass(supabase
                    .from('post_comments')
                    .select('*, students:student_id(name), student_posts!inner(title, id, student_id)'))
                    .eq('student_posts.student_id', studentSession.id)
                    .gt('created_at', lastCheck)
                    .order('created_at', { ascending: false })
                    .limit(50)
            ]);

            const normalizeEmbeddedStudent = (studentValue) => {
                if (Array.isArray(studentValue)) return studentValue[0] || null;
                return studentValue || null;
            };

            const reactions = (reactionsResult.data || []).map(r => ({
                ...r,
                type: 'reaction',
                students: normalizeEmbeddedStudent(r.students)
            }));
            const comments = (commentsResult.data || [])
                .filter(comment =>
                    comment.teacher_id != null ||
                    (comment.student_id != null && comment.student_id !== studentSession.id)
                )
                .map(c => ({
                    ...c,
                    type: 'comment',
                    students: normalizeEmbeddedStudent(c.students)
                }));

            const combined = [...reactions, ...comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setFeedbacks(combined);
        } catch (err) {
            console.error('피드백 로드 실패:', err.message);
        } finally {
            setLoadingFeedback(false);
        }
    };

    const openFeedback = async (tabIndex = 0) => {
        setFeedbackInitialTab(tabIndex);
        setShowFeedback(true);
        // 기준선을 못 읽은 채 조회하면 1970년 기준이 되어 지난 소식이 전부 뜬다.
        await ensureLastCheckLoaded();
        fetchFeedbacks();
    };

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

                // fetchMyPoints에서 lastCheckRef를 세팅한 이후에 활동 내역을 체크해야 함 (알림 메시지 버그 방지)
                fetchMyPoints().then(async () => {
                    await ensureLastCheckLoaded();
                    checkActivity();
                    fetchReturnedCount(true);
                });

            };
            loadData();
        }
    }, [applyBootstrap, bootstrap, bootstrapLoading, studentSession?.id, fetchMyPoints, checkActivity, fetchReturnedCount, ensureLastCheckLoaded]);

    return {
        points, setPoints, hasActivity, showFeedback, setShowFeedback, feedbacks,
        loadingFeedback, feedbackInitialTab,
        returnedCount, isLoading, initialPetData: petData,
        handleClearFeedback, handleDirectRewriteGo, openFeedback,
        fetchMyPoints, checkActivity, fetchReturnedCount // 새로운 훅에 넘기기 위한 내보내기
    };
};
