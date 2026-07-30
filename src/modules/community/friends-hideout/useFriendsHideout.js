import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';

import { dataCache } from '../../../lib/cache';

const getClassmatesCacheKey = (classId, studentId) => `classmates_${classId}_${studentId}`;

// 화면에 다시 들어올 때 너무 잦게 다시 부르지 않도록 두는 최소 간격.
const HIDEOUT_REFRESH_COOLDOWN_MS = 5000;

export const useFriendsHideout = (studentSession, params) => {
    const CLASSMATES_CACHE_MS = 300000;
    const [missions, setMissions] = useState([]);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [viewingPost, setViewingPost] = useState(null);
    const [classmates, setClassmates] = useState([]);
    const [resolvedClassId, setResolvedClassId] = useState(studentSession.classId || studentSession.class_id || null);
    const pageRef = useRef(0);
    const [hasMore, setHasMore] = useState(true);

    // [Realtime] 구독 콜백이 최신 값을 읽되, deps로 인한 재구독은 피하기 위한 ref
    const selectedMissionIdRef = useRef(null);
    const normalizePostsRef = useRef(null);
    // 화면에 다시 들어올 때 갱신하는 길. 실시간 구독을 뺀 뒤로는 이것이 새 글을 받는 주된 길이다.
    const fetchPostsRef = useRef(null);
    const lastHideoutRefreshAtRef = useRef(0);

    const PAGE_SIZE = 10;

    const normalizePostsWithAuthors = useCallback(async (rawPosts = []) => {
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

        const classmateMap = new Map(
            (classmates || []).map(classmate => [classmate.id, classmate])
        );

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
            const { data: studentRows, error } = await supabase
                .from('students')
                .select('id, name, pet_data')
                .in('id', allStudentIds);

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
    }, [classmates]);

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

    const fetchClassmates = useCallback(async () => {
        try {
            const classId = await resolveClassId();
            if (!classId) {
                setClassmates([]);
                return;
            }
            const currentStudentId = studentSession.id;
            if (!currentStudentId) {
                setClassmates([]);
                return;
            }

            const excludeCurrentStudent = (rows = []) =>
                rows.filter((student) => student?.id !== currentStudentId);
            const cacheKey = getClassmatesCacheKey(classId, currentStudentId);
            const data = await dataCache.get(cacheKey, async () => {
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
                    .order('name');

                if (error) throw error;
                return excludeCurrentStudent(data || []);
            }, CLASSMATES_CACHE_MS);

            setClassmates(excludeCurrentStudent(data || []));
        } catch (err) {
            console.error('반 친구 목록 로드 실패:', err.message);
        }
    }, [resolveClassId, studentSession.id]);

    const fetchPosts = useCallback(async (missionId, isAppend = false) => {
        if (!isAppend) {
            setLoading(true);
            pageRef.current = 0;
        } else {
            setLoadingMore(true);
        }

        const currentOffset = isAppend ? (pageRef.current + 1) * PAGE_SIZE : 0;

        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, title, content, student_id, mission_id, created_at, updated_at, char_count, is_confirmed,
                    writing_context, self_writing_type, visibility, structured_content, show_original,
                    original_title, original_content,
                    students:student_id(name, pet_data),
                    writing_missions(allow_comments, mission_type, input_template),
                    post_reactions(id, reaction_type, student_id)
                `)
                .eq('mission_id', missionId)
                .eq('is_submitted', true)
                .eq('visibility', 'class')
                .order('created_at', { ascending: false })
                .range(currentOffset, currentOffset + PAGE_SIZE - 1);

            if (error) throw error;
            const normalizer = normalizePostsRef.current;
            const normalizedPosts = normalizer
                ? await normalizer(data || [])
                : (data || []);

            if (isAppend) {
                setPosts(prev => [...prev, ...normalizedPosts]);
                pageRef.current += 1;
            } else {
                setPosts(normalizedPosts);
            }

            setHasMore(data?.length === PAGE_SIZE);
        } catch (err) {
            console.error('친구 글 로드 실패:', err.message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    const loadMore = useCallback(() => {
        if (!loadingMore && hasMore && selectedMission) {
            fetchPosts(selectedMission.id, true);
        }
    }, [loadingMore, hasMore, selectedMission, fetchPosts]);

    const fetchMissions = useCallback(async (forceRefresh = false) => {
        setLoading(true);
        try {
            const classId = await resolveClassId();
            if (!classId) {
                setMissions([]);
                setSelectedMission(null);
                setPosts([]);
                return;
            }
            const cacheKey = `missions_${classId}`;

            if (forceRefresh) {
                dataCache.invalidate(cacheKey);
            }

            const data = await dataCache.get(cacheKey, async () => {
                const { data: missionRows, error } = await supabase
                    .from('writing_missions')
                    .select('id, title, class_id, genre, mission_type, input_template, allow_comments, is_archived, created_at, base_reward, bonus_threshold, bonus_reward')
                    .eq('class_id', classId)
                    .eq('is_archived', false)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return missionRows || [];
            });

            setMissions(data);
            if (data?.length > 0) {
                let nextMission =
                    data.find(m => m.id === selectedMissionIdRef.current) ||
                    data.find(m => m.id === params?.missionId);

                // 처음 들어왔을 때는 단순히 최신 미션이 아니라,
                // 실제로 우리 반의 제출 글이 있는 최신 미션을 먼저 보여준다.
                if (!nextMission) {
                    const missionIds = data.map(mission => mission.id);
                    const { data: sharedPostRows, error: sharedPostError } = await supabase
                        .from('student_posts')
                        .select('mission_id')
                        .eq('class_id', classId)
                        .eq('is_submitted', true)
                        .eq('visibility', 'class')
                        .in('mission_id', missionIds);

                    if (sharedPostError) {
                        console.warn('공유 글이 있는 미션 확인 실패:', sharedPostError.message);
                    }

                    const missionsWithSharedPosts = new Set(
                        (sharedPostRows || []).map(post => post.mission_id)
                    );
                    nextMission =
                        data.find(mission => missionsWithSharedPosts.has(mission.id)) ||
                        data[0];
                }

                selectedMissionIdRef.current = nextMission.id;
                setSelectedMission(nextMission);
                fetchPosts(nextMission.id);
            } else {
                setSelectedMission(null);
                setPosts([]);
            }
        } catch (err) {
            console.error('미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [resolveClassId, fetchPosts, params?.missionId]);

    const handleMeetingPick = useCallback(async (postId) => {
        if (!postId || !studentSession.id || !selectedMission?.id) return false;

        try {
            const { data: existingReaction, error: existingError } = await supabase
                .from('post_reactions')
                .select('id, reaction_type')
                .eq('post_id', postId)
                .eq('student_id', studentSession.id)
                .maybeSingle();

            if (existingError) throw existingError;

            if (existingReaction?.reaction_type === 'agree') {
                const { error } = await supabase
                    .from('post_reactions')
                    .delete()
                    .eq('id', existingReaction.id);
                if (error) throw error;
            } else if (existingReaction?.id) {
                const { error } = await supabase
                    .from('post_reactions')
                    .update({ reaction_type: 'agree' })
                    .eq('id', existingReaction.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('post_reactions')
                    .insert({
                        post_id: postId,
                        student_id: studentSession.id,
                        reaction_type: 'agree'
                    });
                if (error) throw error;
            }

            await fetchPosts(selectedMission.id);
            return true;
        } catch (err) {
            console.error('회의 안건 선택 실패:', err.message);
            return false;
        }
    }, [fetchPosts, selectedMission?.id, studentSession.id]);

    const handleInitialPost = useCallback(async (postId) => {
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select('*, students:student_id(name, pet_data), writing_missions(allow_comments, mission_type, input_template), post_reactions(id, reaction_type, student_id)')
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                const normalizer = normalizePostsRef.current;
                const [normalizedPost] = normalizer ? await normalizer([data]) : [data];
                setViewingPost(normalizedPost || data);
            }
        } catch (err) {
            console.error('초기 포스트 로드 실패:', err.message);
        }
    }, []);

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
        selectedMissionIdRef.current = selectedMission?.id || null;
    }, [selectedMission?.id]);

    useEffect(() => {
        normalizePostsRef.current = normalizePostsWithAuthors;
    }, [normalizePostsWithAuthors]);

    useEffect(() => {
        fetchPostsRef.current = fetchPosts;
    }, [fetchPosts]);

    useEffect(() => {
        fetchMissions(true);
        fetchClassmates();
        if (params?.initialPostId) {
            handleInitialPost(params.initialPostId);
        }
    }, [fetchMissions, fetchClassmates, handleInitialPost, params?.initialPostId]);

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
            fetchMissions(true);
            fetchClassmates();
            const missionId = selectedMissionIdRef.current;
            if (missionId) fetchPostsRef.current?.(missionId);
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
        // [주의] deps에는 구독 식별자(classId/studentId)만 둡니다.
        // selectedMission.id / normalizePostsWithAuthors 변경 시 재구독하지 않도록 ref 사용.
    }, [resolvedClassId, studentSession.class_id, studentSession.classId, studentSession.id, fetchMissions]);

    const handleMissionChange = (mission) => {
        selectedMissionIdRef.current = mission.id;
        setSelectedMission(mission);
        fetchPosts(mission.id);
    };

    return {
        missions,
        selectedMission,
        posts,
        classmates,
        resolvedClassId,   // 친구 서재 등 학급 범위 조회에 쓴다
        loading,
        loadingMore,
        hasMore,
        loadMore,
        viewingPost,
        setViewingPost,
        handleMissionChange,
        handleMeetingPick
    };
};
