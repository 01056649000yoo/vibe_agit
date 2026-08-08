import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useAnnouncements = (role = 'TEACHER', initialAnnouncements = null) => {
    const hasInitialAnnouncements = Array.isArray(initialAnnouncements);
    const [announcements, setAnnouncements] = useState(() => initialAnnouncements || []);
    const [loading, setLoading] = useState(() => !hasInitialAnnouncements);
    const [latestAnnouncement, setLatestAnnouncement] = useState(() => initialAnnouncements?.[0] || null);

    const fetchAnnouncements = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('announcements')
                // UI에서 공지 제목, 내용, 일시, 대상 권한을 보여주기 위해 필수 필드만 선택
                .select('id, title, content, created_at, target_role')
                .or(`target_role.eq.${role},target_role.eq.ALL`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAnnouncements(data || []);

            if (data && data.length > 0) {
                setLatestAnnouncement(data[0]);
            }
        } catch (err) {
            console.error('공지사항 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [role]);

    // [실시간 구독 제거 — 2026-07-30]
    //
    // 예전에는 `announcements` 를 **필터 없이** 구독했다. `announcements` 에는 `class_id` 가 없어
    // 전체 공지라서 필터를 걸 수도 없었는데, 그래서 공지 1건이 바뀌면 **접속한 전원**에게 이벤트가 갔다.
    // 리얼타임 한도(`max_events_per_second=100`)를 아끼려고 빼고, 화면을 열 때 불러오는 것만 남긴다.
    // 공지는 자주 바뀌지 않고 즉시성이 필요하지도 않다. 갱신이 필요하면 `refresh()` 를 부른다.
    useEffect(() => {
        if (!hasInitialAnnouncements) fetchAnnouncements();
    }, [fetchAnnouncements, hasInitialAnnouncements]);

    return { announcements, latestAnnouncement, loading, refresh: fetchAnnouncements };
};
