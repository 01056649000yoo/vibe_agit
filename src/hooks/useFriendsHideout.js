import { useState, useEffect, useCallback } from 'react';
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
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const PAGE_SIZE = 10;

    const fetchClassmates = useCallback(async () => {
        try {
            const classId = studentSession.classId || studentSession.class_id;
            const { data, error } = await supabase
                .from('students')
                .select('id, name, pet_data')
                .eq('class_id', classId)
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
            setPage(0);
        } else {
            setLoadingMore(true);
        }

        const currentOffset = isAppend ? (page + 1) * PAGE_SIZE : 0;

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
                .order('created_at', { ascending: false })
                .range(currentOffset, currentOffset + PAGE_SIZE - 1);

            if (error) throw error;

            if (isAppend) {
                setPosts(prev => [...prev, ...(data || [])]);
                setPage(prev => prev + 1);
            } else {
                setPosts(data || []);
            }

            setHasMore(data?.length === PAGE_SIZE);
        } catch (err) {
            console.error('친구 글 로드 실패:', err.message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [studentSession.id, page]);

    const loadMore = () => {
        if (!loadingMore && hasMore && selectedMission) {
            fetchPosts(selectedMission.id, true);
        }
    };

    const fetchMissions = useCallback(async () => {
        setLoading(true);
        try {
            const classId = studentSession.classId || studentSession.class_id;
            const data = await dataCache.get(`missions_${classId}`, async () => {
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
                const initialMission = data[0];
                setSelectedMission(initialMission);
                fetchPosts(initialMission.id);
            }
        } catch (err) {
            console.error('미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [studentSession.classId, studentSession.class_id, fetchPosts]);

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
        fetchMissions();
        fetchClassmates();
        if (params?.initialPostId) {
            handleInitialPost(params.initialPostId);
        }
    }, [params, fetchMissions, fetchClassmates, handleInitialPost]);

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
