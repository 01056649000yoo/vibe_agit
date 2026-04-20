import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

import { dataCache } from '../lib/cache';

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
            students: normalizeEmbeddedStudent(post?.students)
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
            const cacheKey = `classmates_${classId}`;
            const data = await dataCache.get(cacheKey, async () => {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_student_classmates_for_hideout');

                if (!rpcError && Array.isArray(rpcData)) {
                    return rpcData;
                }

                const { data, error } = await supabase
                    .from('students')
                    .select('id, name, pet_data')
                    .eq('class_id', classId)
                    .is('deleted_at', null)
                    .neq('id', studentSession.id)
                    .order('name');

                if (error) throw error;
                return data || [];
            }, CLASSMATES_CACHE_MS);

            setClassmates(data || []);
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
                    id, title, content, student_id, mission_id, created_at, char_count, is_confirmed,
                    original_title, original_content,
                    students:student_id(name, pet_data),
                    writing_missions(allow_comments)
                `)
                .eq('mission_id', missionId)
                .eq('is_submitted', true)
                .neq('student_id', studentSession.id)
                .order('created_at', { ascending: false })
                .range(currentOffset, currentOffset + PAGE_SIZE - 1);

            if (error) throw error;
            const normalizedPosts = await normalizePostsWithAuthors(data || []);

            if (isAppend) {
                setPosts(prev => [...prev, ...normalizedPosts]);
                pageRef.current += 1;
            } else {
                setPosts(normalizedPosts);
            }

            setHasMore(prev => (data?.length === PAGE_SIZE));
        } catch (err) {
            console.error('친구 글 로드 실패:', err.message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [studentSession.id, normalizePostsWithAuthors]);

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
                const { data, error } = await supabase
                    .from('writing_missions')
                    .select('id, title, class_id, genre, allow_comments, is_archived, created_at, base_reward, bonus_threshold, bonus_reward')
                    .eq('class_id', classId)
                    .eq('is_archived', false)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return data || [];
            });

            setMissions(data);
            if (data?.length > 0) {
                const nextMission =
                    data.find(m => m.id === selectedMission?.id) ||
                    data[0];

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
    }, [resolveClassId, selectedMission?.id, fetchPosts]);

    const handleInitialPost = useCallback(async (postId) => {
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select('*, students:student_id(name, pet_data), writing_missions(allow_comments)')
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                const [normalizedPost] = await normalizePostsWithAuthors([data]);
                setViewingPost(normalizedPost || data);
            }
        } catch (err) {
            console.error('초기 포스트 로드 실패:', err.message);
        }
    }, [normalizePostsWithAuthors]);

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
        fetchMissions(true);
        fetchClassmates();
        if (params?.initialPostId) {
            handleInitialPost(params.initialPostId);
        }
    }, [fetchMissions, fetchClassmates, handleInitialPost, params?.initialPostId]);

    useEffect(() => {
        const classId = resolvedClassId || studentSession.classId || studentSession.class_id;
        if (!classId) return;

        // [실시간 1] 친구들의 드래곤 데이터 및 프로필 업데이트 구독
        const classmateSubscription = supabase
            .channel(`classmates_${classId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'students',
                    filter: `class_id=eq.${classId}`
                },
                (payload) => {
                    if (payload.new.id !== studentSession.id) {
                        dataCache.invalidate(`classmates_${classId}`);
                        setClassmates(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
                    }
                }
            )
            .subscribe();

        // [실시간 2] 미션 복구/보관 반영
        const missionsSubscription = supabase
            .channel(`hideout_missions_${classId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'writing_missions',
                    filter: `class_id=eq.${classId}`
                },
                () => {
                    fetchMissions(true);
                }
            )
            .subscribe();

        // [실시간 3] 새 글 알림 구독 (class_id 필터로 범위 제한 + 콜백 내부에서 현재 미션 체크)
        const postsSubscription = supabase
            .channel(`posts_${classId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'student_posts',
                    filter: `class_id=eq.${classId}`
                },
                async (payload) => {
                    const currentMissionId = selectedMissionIdRef.current;
                    if (
                        payload.new.mission_id === currentMissionId &&
                        payload.new.student_id !== studentSession.id &&
                        payload.new.is_submitted
                    ) {
                        const { data: newPost, error } = await supabase
                            .from('student_posts')
                            .select(`
                                id, title, content, student_id, mission_id, created_at, char_count, is_confirmed,
                                original_title, original_content,
                                students:student_id(name, pet_data),
                                writing_missions(allow_comments)
                            `)
                            .eq('id', payload.new.id)
                            .single();

                        if (!error && newPost) {
                            const normalizer = normalizePostsRef.current;
                            const [normalizedPost] = normalizer ? await normalizer([newPost]) : [newPost];
                            setPosts(prev => {
                                if (prev.some(p => p.id === newPost.id)) return prev;
                                return [normalizedPost || newPost, ...prev];
                            });
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(classmateSubscription);
            supabase.removeChannel(missionsSubscription);
            supabase.removeChannel(postsSubscription);
        };
        // [주의] deps에는 구독 식별자(classId/studentId)만 둡니다.
        // selectedMission.id / normalizePostsWithAuthors 변경 시 재구독하지 않도록 ref 사용.
    }, [resolvedClassId, studentSession.class_id, studentSession.classId, studentSession.id, fetchMissions]);

    const handleMissionChange = (mission) => {
        setSelectedMission(mission);
        fetchPosts(mission.id);
    };

    return {
        missions,
        selectedMission,
        posts,
        classmates,
        loading,
        loadingMore,
        hasMore,
        loadMore,
        viewingPost,
        setViewingPost,
        handleMissionChange
    };
};
