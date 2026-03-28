import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

import { dataCache } from '../lib/cache';

export const useFriendsHideout = (studentSession, params) => {
    const [missions, setMissions] = useState([]);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [viewingPost, setViewingPost] = useState(null);
    const [classmates, setClassmates] = useState([]);
    const pageRef = useRef(0);
    const [hasMore, setHasMore] = useState(true);

    const PAGE_SIZE = 10;

    const fetchClassmates = useCallback(async () => {
        try {
            const classId = studentSession.classId || studentSession.class_id;
            const { data, error } = await supabase
                .from('students')
                .select('id, name, pet_data')
                .eq('class_id', classId)
                .is('deleted_at', null)
                .neq('id', studentSession.id)
                .order('name');

            if (error) throw error;
            setClassmates(data || []);
        } catch (err) {
            console.error('반 친구 목록 로드 실패:', err.message);
        }
    }, [studentSession.classId, studentSession.class_id, studentSession.id]);

    const fetchPosts = useCallback(async (missionId, isAppend = false) => {
        if (!isAppend) {
            setLoading(true);
            pageRef.current = 0;
        } else {
            setLoadingMore(true);
        }

        const currentOffset = isAppend ? (pageRef.current + 1) * PAGE_SIZE : 0;

        const classId = studentSession.classId || studentSession.class_id;

        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, title, content, student_id, mission_id, created_at, char_count, is_confirmed,
                    original_title, original_content,
                    students:student_id!inner(name, class_id, pet_data),
                    writing_missions(allow_comments)
                `)
                .eq('mission_id', missionId)
                .eq('is_submitted', true)
                .neq('student_id', studentSession.id)
                .eq('students.class_id', classId)
                .order('created_at', { ascending: false })
                .range(currentOffset, currentOffset + PAGE_SIZE - 1);

            if (error) throw error;

            if (isAppend) {
                setPosts(prev => [...prev, ...(data || [])]);
                pageRef.current += 1;
            } else {
                setPosts(data || []);
            }

            setHasMore(prev => (data?.length === PAGE_SIZE));
        } catch (err) {
            console.error('친구 글 로드 실패:', err.message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [studentSession.id]);

    const loadMore = useCallback(() => {
        if (!loadingMore && hasMore && selectedMission) {
            fetchPosts(selectedMission.id, true);
        }
    }, [loadingMore, hasMore, selectedMission, fetchPosts]);

    const fetchMissions = useCallback(async (forceRefresh = false) => {
        setLoading(true);
        try {
            const classId = studentSession.classId || studentSession.class_id;
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
    }, [studentSession.classId, studentSession.class_id, selectedMission?.id, fetchPosts]);

    const handleInitialPost = useCallback(async (postId) => {
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select('*, students:student_id(name, pet_data), writing_missions(allow_comments)')
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                setViewingPost(data);
            }
        } catch (err) {
            console.error('초기 포스트 로드 실패:', err.message);
        }
    }, []);

    useEffect(() => {
        fetchMissions(true);
        fetchClassmates();
        if (params?.initialPostId) {
            handleInitialPost(params.initialPostId);
        }
    }, [fetchMissions, fetchClassmates, handleInitialPost, params?.initialPostId]);

    useEffect(() => {
        const classId = studentSession.classId || studentSession.class_id;
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

        // [실시간 3] 새 글 알림 구독 (현재 선택된 미션에 대해서만)
        const postsSubscription = supabase
            .channel(`posts_${classId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'student_posts'
                },
                async (payload) => {
                    // 현재 내가 보고 있는 미션의 글이고, 내가 쓴 글이 아니며, 제출된 상태인 경우
                    if (
                        payload.new.mission_id === selectedMission?.id &&
                        payload.new.student_id !== studentSession.id &&
                        payload.new.is_submitted
                    ) {
                        // 새 글의 경우 작성자 정보를 포함하여 상세 정보를 다시 가져와서 목록 상단에 추가
                        const { data: newPost, error } = await supabase
                            .from('student_posts')
                            .select(`
                                id, title, content, student_id, mission_id, created_at, char_count, is_confirmed,
                                original_title, original_content,
                                students:student_id!inner(name, class_id, pet_data),
                                writing_missions(allow_comments)
                            `)
                            .eq('id', payload.new.id)
                            .single();
                        
                        if (!error && newPost) {
                            setPosts(prev => {
                                // 중복 추가 방지
                                if (prev.some(p => p.id === newPost.id)) return prev;
                                return [newPost, ...prev];
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
    }, [studentSession.class_id, studentSession.classId, studentSession.id, selectedMission?.id, fetchMissions]);

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
