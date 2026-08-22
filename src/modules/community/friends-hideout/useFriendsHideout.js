import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';

import { classKey, dataCache } from '../../../lib/cache';

// 화면에 다시 들어올 때 너무 잦게 다시 부르지 않도록 두는 최소 간격.
const HIDEOUT_REFRESH_COOLDOWN_MS = 5000;
const PAGE_SIZE = 10;

export const useFriendsHideout = (studentSession, params) => {
    // 공방에서 바꾼 장착 상태가 친구 화면에 오래 남지 않게 짧게 유지한다.
    const CLASSMATES_CACHE_MS = 30000;
    const initialMissionId = params?.missionId || null;
    const [missions, setMissions] = useState([]);
    const [selectedMission, setSelectedMission] = useState(null);
    const [missionsLoading, setMissionsLoading] = useState(false);
    const [missionsError, setMissionsError] = useState('');
    const [feedGroup, setFeedGroup] = useState(initialMissionId ? 'assignment' : 'all');
    const [selfFeedType, setSelfFeedType] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [feedError, setFeedError] = useState('');
    const [viewingPost, setViewingPost] = useState(null);
    const [classmates, setClassmates] = useState([]);
    const [classmatesLoading, setClassmatesLoading] = useState(false);
    const [classmatesError, setClassmatesError] = useState('');
    const [resolvedClassId, setResolvedClassId] = useState(studentSession.classId || studentSession.class_id || null);
    const cursorRef = useRef(null);
    const [hasMore, setHasMore] = useState(true);

    // [Realtime] 구독 콜백이 최신 값을 읽되, deps로 인한 재구독은 피하기 위한 ref
    const selectedMissionIdRef = useRef(initialMissionId);
    const feedSelectionRef = useRef({
        group: initialMissionId ? 'assignment' : 'all',
        selfType: null,
        missionId: initialMissionId
    });
    const normalizePostsRef = useRef(null);
    const hydratePostsRef = useRef(null);
    const lastHideoutRefreshAtRef = useRef(0);
    const postsRequestIdRef = useRef(0);
    const pendingFeedRequestsRef = useRef(new Map());
    const missionsLoadedRef = useRef(false);
    const missionsRef = useRef([]);
    const classmatesLoadedRef = useRef(false);
    const classmatesRef = useRef([]);

    const normalizePostsWithAuthors = useCallback(async (rawPosts = [], classIdOverride = null) => {
        if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
            return [];
        }

        const normalizeEmbeddedStudent = (studentValue) => {
            if (Array.isArray(studentValue)) {
                return studentValue[0] || null;
            }
            return studentValue || null;
        };

        const postsWithNormalizedShape = rawPosts.map(post => ({
            ...post,
            students: normalizeEmbeddedStudent(post?.students),
            original_title: post?.show_original ? post.original_title : null,
            original_content: post?.show_original ? post.original_content : null
        }));

        const classmateMap = new Map((classmates || []).map(classmate => [classmate.id, classmate]));
        classmateMap.set(studentSession.id, {
            id: studentSession.id,
            name: studentSession.name || '나',
            pet_data: studentSession.pet_data || null
        });

        const postsWithClassmateFallback = postsWithNormalizedShape.map(post => {
            if (post?.students?.name) {
                return post;
            }

            const classmate = classmateMap.get(post.student_id);
            if (!classmate?.name) {
                return post;
            }

            return {
                ...post,
                student_name: classmate.name,
                students: {
                    name: classmate.name,
                    pet_data: classmate.pet_data ?? null
                }
            };
        });

        const allStudentIds = [
            ...new Set(
                postsWithClassmateFallback
                    .filter(post => post?.student_id)
                    .map(post => post.student_id)
            )
        ];

        if (allStudentIds.length === 0) {
            return postsWithClassmateFallback.map(post => ({
                ...post,
                student_name: post?.student_name || post?.students?.name || ''
            }));
        }

        try {
            const classId = classIdOverride || studentSession.classId || studentSession.class_id;
            if (!classId) throw new Error('학급 정보를 찾지 못했어요.');
            const { data: studentRows, error } = await supabase
                .from('students')
                .select('id, name, pet_data')
                .eq('class_id', classId)
                .in('id', allStudentIds)
                .limit(allStudentIds.length);

            if (error) throw error;

            const studentMap = new Map((studentRows || []).map(student => [student.id, student]));

            return postsWithClassmateFallback.map(post => {
                const fallbackStudent = studentMap.get(post.student_id);
                const resolvedName =
                    post?.student_name ||
                    post?.students?.name ||
                    classmateMap.get(post.student_id)?.name ||
                    fallbackStudent?.name ||
                    '';

                return {
                    ...post,
                    student_name: resolvedName,
                    students: {
                        name: resolvedName,
                        pet_data:
                            post?.students?.pet_data ??
                            classmateMap.get(post.student_id)?.pet_data ??
                            fallbackStudent?.pet_data ??
                            null
                    }
                };
            });
        } catch (err) {
            console.error('친구 글 작성자 보강 실패:', err.message);
            return postsWithClassmateFallback.map(post => ({
                ...post,
                student_name: post?.student_name || post?.students?.name || ''
            }));
        }
    }, [classmates, studentSession.classId, studentSession.class_id, studentSession.id, studentSession.name, studentSession.pet_data]);

    // 학급 테이블끼리의 임베드 조인을 피하고 각각 class_id로 직접 좁힌 뒤 메모리에서 합친다.
    const hydratePostRelations = useCallback(async (rawPosts = [], classId) => {
        if (!rawPosts.length || !classId) return [];
        const missionIds = [...new Set(rawPosts.map((post) => post.mission_id).filter(Boolean))];
        const postIds = rawPosts.map((post) => post.id).filter(Boolean);

        const [missionResult, reactionResult] = await Promise.all([
            missionIds.length
                ? supabase
                    .from('writing_missions')
                    .select('id, title, allow_comments, mission_type, input_template')
                    .eq('class_id', classId)
                    .in('id', missionIds)
                    .limit(missionIds.length)
                : Promise.resolve({ data: [], error: null }),
            postIds.length
                ? supabase
                    .from('post_reactions')
                    .select('id, post_id, reaction_type, student_id')
                    .eq('class_id', classId)
                    .in('post_id', postIds)
                    .limit(Math.min(500, postIds.length * 50))
                : Promise.resolve({ data: [], error: null })
        ]);

        if (missionResult.error) throw missionResult.error;
        if (reactionResult.error) throw reactionResult.error;

        const missionMap = new Map((missionResult.data || []).map((mission) => [mission.id, mission]));
        const reactionsByPost = new Map();
        (reactionResult.data || []).forEach((reaction) => {
            const list = reactionsByPost.get(reaction.post_id) || [];
            list.push(reaction);
            reactionsByPost.set(reaction.post_id, list);
        });

        const hydrated = rawPosts.map((post) => ({
            ...post,
            writing_missions: post.mission_id ? (missionMap.get(post.mission_id) || null) : null,
            post_reactions: reactionsByPost.get(post.id) || []
        }));
        const normalizer = normalizePostsRef.current;
        return normalizer ? normalizer(hydrated, classId) : hydrated;
    }, []);

    const resolveClassId = useCallback(async () => {
        const sessionClassId = studentSession.classId || studentSession.class_id;
        if (sessionClassId) {
            setResolvedClassId(sessionClassId);
            return sessionClassId;
        }

        if (!studentSession?.id) return null;

        try {
            const { data, error } = await supabase
                .from('students')
                .select('class_id')
                .eq('id', studentSession.id)
                .maybeSingle();

            if (error) throw error;

            const fallbackClassId = data?.class_id || null;
            if (fallbackClassId) {
                setResolvedClassId(fallbackClassId);
            }
            return fallbackClassId;
        } catch (err) {
            console.error('친구 아지트 반 정보 조회 실패:', err.message);
            return null;
        }
    }, [studentSession.classId, studentSession.class_id, studentSession?.id]);

    const fetchClassmates = useCallback(async (forceRefresh = false) => {
        if (classmatesLoadedRef.current && !forceRefresh) {
            return classmatesRef.current;
        }

        setClassmatesLoading(true);
        setClassmatesError('');
        try {
            const classId = await resolveClassId();
            if (!classId) {
                setClassmates([]);
                classmatesRef.current = [];
                classmatesLoadedRef.current = true;
                return [];
            }
            const currentStudentId = studentSession.id;
            if (!currentStudentId) {
                setClassmates([]);
                classmatesRef.current = [];
                classmatesLoadedRef.current = true;
                return [];
            }

            const excludeCurrentStudent = (rows = []) =>
                rows.filter((student) => student?.id !== currentStudentId);
            const cacheKey = classKey(classId, 'friends-hideout-directory', { studentId: currentStudentId });
            if (forceRefresh) {
                dataCache.invalidate(cacheKey);
            }
            const data = await dataCache.get(cacheKey, async () => {
                const { data: directoryData, error: directoryError } = await supabase
                    .rpc('get_student_hideout_directory');

                if (!directoryError && Array.isArray(directoryData)) {
                    return excludeCurrentStudent(directoryData);
                }

                if (directoryError && !['PGRST202', '42883'].includes(directoryError.code)) {
                    console.warn('친구 칭호 목록 RPC 폴백:', directoryError.message);
                }

                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_student_classmates_for_hideout');

                if (!rpcError && Array.isArray(rpcData)) {
                    return excludeCurrentStudent(rpcData);
                }

                const { data, error } = await supabase
                    .from('students')
                    .select('id, name, pet_data')
                    .eq('class_id', classId)
                    .is('deleted_at', null)
                    .neq('id', studentSession.id)
                    .order('name')
                    .limit(100);

                if (error) throw error;
                return excludeCurrentStudent(data || []);
            }, CLASSMATES_CACHE_MS);

            const nextClassmates = excludeCurrentStudent(data || []);
            classmatesRef.current = nextClassmates;
            classmatesLoadedRef.current = true;
            setClassmates(nextClassmates);
            return nextClassmates;
        } catch (err) {
            console.error('반 친구 목록 로드 실패:', err.message);
            classmatesLoadedRef.current = false;
            setClassmatesError('반 친구 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
            return [];
        } finally {
            setClassmatesLoading(false);
        }
    }, [resolveClassId, studentSession.id]);

    const fetchFeed = useCallback(async (selection = feedSelectionRef.current, isAppend = false) => {
        const requestId = ++postsRequestIdRef.current;
        const group = ['all', 'assignment', 'self'].includes(selection?.group) ? selection.group : 'all';
        const selfType = group === 'self' ? (selection?.selfType || null) : null;
        const missionId = group === 'assignment' ? (selection?.missionId || null) : null;
        const cursor = isAppend ? cursorRef.current : null;
        const requestKey = [group, selfType || '', missionId || '', cursor?.at || '', cursor?.id || ''].join('|');
        if (!isAppend) {
            setLoading(true);
            setFeedError('');
            cursorRef.current = null;
        } else {
            setLoadingMore(true);
        }

        try {
            let requestPromise = pendingFeedRequestsRef.current.get(requestKey);
            if (!requestPromise) {
                requestPromise = supabase.rpc('get_class_public_writing_feed_v1', {
                    p_group: group,
                    p_self_type: selfType,
                    p_mission_id: missionId,
                    p_limit: PAGE_SIZE,
                    p_cursor_at: cursor?.at || null,
                    p_cursor_id: cursor?.id || null,
                }).then(
                    (result) => {
                        pendingFeedRequestsRef.current.delete(requestKey);
                        return result;
                    },
                    (error) => {
                        pendingFeedRequestsRef.current.delete(requestKey);
                        throw error;
                    }
                );
                pendingFeedRequestsRef.current.set(requestKey, requestPromise);
            }

            const { data, error } = await requestPromise;

            if (error) throw error;
            if (requestId !== postsRequestIdRef.current) return;
            const nextItems = Array.isArray(data?.items) ? data.items : [];

            if (isAppend) {
                setPosts((current) => [...current, ...nextItems]);
            } else {
                setPosts(nextItems);
            }
            const nextCursor = data?.has_more && data?.next_cursor_at && data?.next_cursor_id
                ? { at: data.next_cursor_at, id: data.next_cursor_id }
                : null;
            cursorRef.current = nextCursor;
            setHasMore(Boolean(nextCursor));
        } catch (err) {
            console.error('우리 반 공개 글 피드 로드 실패:', err.message);
            if (requestId === postsRequestIdRef.current) {
                if (isAppend) {
                    setHasMore(false);
                } else {
                    setFeedError('우리 반 공개 글을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
                    setPosts([]);
                    setHasMore(false);
                }
            }
        } finally {
            if (requestId === postsRequestIdRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, []);

    const loadMore = useCallback(() => {
        if (loadingMore || loading || !hasMore) return;
        fetchFeed(feedSelectionRef.current, true);
    }, [loadingMore, loading, hasMore, fetchFeed]);

    const fetchMissions = useCallback(async (forceRefresh = false) => {
        if (missionsLoadedRef.current && !forceRefresh) {
            return missionsRef.current;
        }

        setMissionsLoading(true);
        setMissionsError('');
        try {
            const classId = await resolveClassId();
            if (!classId) {
                setMissions([]);
                setSelectedMission(null);
                missionsRef.current = [];
                missionsLoadedRef.current = true;
                return [];
            }
            const cacheKey = classKey(classId, 'friends-hideout-missions');

            if (forceRefresh) {
                dataCache.invalidate(cacheKey);
            }

            const data = await dataCache.get(cacheKey, async () => {
                const { data: missionRows, error } = await supabase
                    .from('writing_missions')
                    .select('id, title, class_id, genre, mission_type, input_template, allow_comments, is_archived, created_at, base_reward, bonus_threshold, bonus_reward')
                    .eq('class_id', classId)
                    .eq('is_archived', false)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (error) throw error;
                return missionRows || [];
            });

            missionsRef.current = data;
            missionsLoadedRef.current = true;
            setMissions(data);

            const currentMissionId = selectedMissionIdRef.current;
            const nextMission = currentMissionId
                ? data.find((mission) => mission.id === currentMissionId) || null
                : null;
            setSelectedMission(nextMission);
            return data;
        } catch (err) {
            console.error('미션 로드 실패:', err.message);
            missionsLoadedRef.current = false;
            setMissionsError('과제 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
            return [];
        } finally {
            setMissionsLoading(false);
        }
    }, [resolveClassId]);

    const handleMeetingPick = useCallback(async (postId) => {
        if (!postId || !studentSession.id) return false;

        try {
            const classId = await resolveClassId();
            if (!classId) return false;
            const { data: result, error } = await supabase.rpc('toggle_my_post_reaction_v1', {
                p_post_id: postId,
                p_reaction_type: 'agree'
            });
            if (error) throw error;
            setPosts((current) => current.map((post) => {
                if (post.id !== postId) return post;
                const withoutMine = (post.post_reactions || []).filter((reaction) => reaction.student_id !== studentSession.id);
                return {
                    ...post,
                    post_reactions: result?.selected
                        ? [...withoutMine, { post_id: postId, student_id: studentSession.id, reaction_type: 'agree' }]
                        : withoutMine
                };
            }));
            return true;
        } catch (err) {
            console.error('안건 선택 실패:', err.message);
            return false;
        }
    }, [resolveClassId, studentSession.id]);

    const handleInitialPost = useCallback(async (postId) => {
        try {
            const classId = await resolveClassId();
            if (!classId) return;
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, title, content, student_id, mission_id, created_at, updated_at, char_count, is_confirmed, is_submitted, writing_context, self_writing_type, visibility, structured_content, show_original, original_title, original_content')
                .eq('class_id', classId)
                .eq('id', postId)
                .eq('is_submitted', true)
                .eq('visibility', 'class')
                .maybeSingle();

            if (error) throw error;
            if (data) {
                const hydrator = hydratePostsRef.current;
                const [normalizedPost] = hydrator ? await hydrator([data], classId) : [data];
                setViewingPost(normalizedPost || data);
            }
        } catch (err) {
            console.error('초기 포스트 로드 실패:', err.message);
        }
    }, [resolveClassId]);

    useEffect(() => {
        setResolvedClassId(studentSession.classId || studentSession.class_id || null);
    }, [studentSession.classId, studentSession.class_id]);

    useEffect(() => {
        if (classmates.length === 0) return;

        setPosts(prev =>
            prev.map(post => {
                if (post?.students?.name) return post;

                const classmate = classmates.find(friend => friend.id === post.student_id);
                if (!classmate?.name) return post;

                return {
                    ...post,
                    students: {
                        name: classmate.name,
                        pet_data: classmate.pet_data ?? null
                    }
                };
            })
        );

        setViewingPost(prev => {
            if (!prev || prev?.students?.name) return prev;

            const classmate = classmates.find(friend => friend.id === prev.student_id);
            if (!classmate?.name) return prev;

            return {
                ...prev,
                students: {
                    name: classmate.name,
                    pet_data: classmate.pet_data ?? null
                }
            };
        });
    }, [classmates]);

    useEffect(() => {
        normalizePostsRef.current = normalizePostsWithAuthors;
    }, [normalizePostsWithAuthors]);

    useEffect(() => {
        hydratePostsRef.current = hydratePostRelations;
    }, [hydratePostRelations]);

    useEffect(() => {
        // 기본 진입은 공개 글 RPC 한 번만 사용한다. 과제·친구 명단은 해당 탭을 열 때 지연 조회한다.
        lastHideoutRefreshAtRef.current = Date.now();
        void fetchFeed(feedSelectionRef.current);
        if (initialMissionId) {
            void fetchMissions();
        }
        if (params?.initialPostId) {
            void handleInitialPost(params.initialPostId);
        }
    }, [fetchFeed, fetchMissions, handleInitialPost, initialMissionId, params?.initialPostId]);

    useEffect(() => {
        const classId = resolvedClassId || studentSession.classId || studentSession.class_id;
        if (!classId) return;

        // [실시간 구독 제거 — 2026-07-30]
        //
        // 예전에는 여기서 `students`·`writing_missions`·`student_posts` 를 **학급 단위**로 구독했다.
        // 친구가 글을 하나 올리면 같은 학급 접속자 전원(최대 30명)에게 이벤트가 퍼져서,
        // 이벤트 수가 접속자 수에 비례해 늘었다. 리얼타임 한도가 `max_events_per_second=100`,
        // `max_concurrent_users=200` 이라 동시 500명 목표에서 여기가 먼저 막힌다.
        //
        // 앱의 핵심 흐름(학생 제출 → 교사 확인·피드백 → 승인)은 학생 본인으로 좁혀 구독하는
        // `useRealtimeNotifications` 가 담당하고, 친구 아지트는 핵심이 아니라 구독을 뺐다.
        // 대신 **화면에 다시 들어올 때 갱신**한다 — 예전에는 이 화면에 그 길이 아예 없어서
        // 구독만 빼면 나갔다 들어와야 새 글이 보였다.
        const refreshIfStale = () => {
            if (Date.now() - lastHideoutRefreshAtRef.current < HIDEOUT_REFRESH_COOLDOWN_MS) return;
            lastHideoutRefreshAtRef.current = Date.now();
            void fetchFeed(feedSelectionRef.current);
            if (missionsLoadedRef.current) void fetchMissions(true);
            if (classmatesLoadedRef.current) void fetchClassmates(true);
        };
        const handleFocus = () => refreshIfStale();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshIfStale();
        };
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
        // selectedMission.id / normalizePostsWithAuthors 변경 시 재등록하지 않도록 ref 사용.
    }, [resolvedClassId, studentSession.class_id, studentSession.classId, studentSession.id, fetchFeed, fetchMissions, fetchClassmates]);

    const handleMissionChange = useCallback((mission) => {
        const nextSelection = { group: 'assignment', selfType: null, missionId: mission?.id || null };
        feedSelectionRef.current = nextSelection;
        setFeedGroup('assignment');
        setSelfFeedType(null);
        selectedMissionIdRef.current = mission?.id || null;
        setSelectedMission(mission || null);
        fetchFeed(nextSelection);
    }, [fetchFeed]);

    const handleFeedGroupChange = useCallback((group) => {
        const normalizedGroup = ['all', 'assignment', 'self'].includes(group) ? group : 'all';
        const nextSelection = { group: normalizedGroup, selfType: null, missionId: null };
        feedSelectionRef.current = nextSelection;
        setFeedGroup(normalizedGroup);
        setSelfFeedType(null);
        selectedMissionIdRef.current = null;
        setSelectedMission(null);
        void fetchFeed(nextSelection);
        if (normalizedGroup === 'assignment') {
            void fetchMissions();
        }
    }, [fetchFeed, fetchMissions]);

    const handleSelfFeedTypeChange = useCallback((type) => {
        const normalizedType = type || null;
        const nextSelection = { group: 'self', selfType: normalizedType, missionId: null };
        feedSelectionRef.current = nextSelection;
        setFeedGroup('self');
        setSelfFeedType(normalizedType);
        selectedMissionIdRef.current = null;
        setSelectedMission(null);
        fetchFeed(nextSelection);
    }, [fetchFeed]);

    const retryFeed = useCallback(() => {
        fetchFeed(feedSelectionRef.current);
    }, [fetchFeed]);

    return {
        missions,
        missionsLoading,
        missionsError,
        selectedMission,
        feedGroup,
        selfFeedType,
        posts,
        classmates,
        classmatesLoading,
        classmatesError,
        resolvedClassId,   // 친구 서재 등 학급 범위 조회에 쓴다
        loading,
        loadingMore,
        feedError,
        hasMore,
        loadMore,
        viewingPost,
        setViewingPost,
        handleMissionChange,
        handleFeedGroupChange,
        handleSelfFeedTypeChange,
        loadClassmates: fetchClassmates,
        retryMissions: fetchMissions,
        retryFeed,
        handleMeetingPick
    };
};
