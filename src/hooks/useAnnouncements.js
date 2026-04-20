import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const REFRESH_DEBOUNCE_MS = 3000;

export const useAnnouncements = (role = 'TEACHER') => {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [latestAnnouncement, setLatestAnnouncement] = useState(null);
    const debounceTimerRef = useRef(null);

    const fetchAnnouncements = async () => {
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
    };

    useEffect(() => {
        fetchAnnouncements();

        // [Realtime] 채널 이름을 role로 분리하여 교사/학생/관리자가 서로의 이벤트로 refetch하지 않도록 함
        // 관리자가 공지 1건만 수정해도 전원 동시 refetch로 썬더링 허드 유발하던 문제를 해결
        const channelName = `announcements_${role}`;

        const duplicate = supabase.getChannels().find(c => c.name === channelName);
        if (duplicate) {
            supabase.removeChannel(duplicate);
        }

        const scheduleRefresh = () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            if (debounceTimerRef.current) return; // 이미 예약됨
            debounceTimerRef.current = window.setTimeout(() => {
                debounceTimerRef.current = null;
                fetchAnnouncements();
            }, REFRESH_DEBOUNCE_MS);
        };

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'announcements'
            }, scheduleRefresh)
            .subscribe();

        return () => {
            if (debounceTimerRef.current) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            supabase.removeChannel(channel);
        };
    }, [role]);

    return { announcements, latestAnnouncement, loading, refresh: fetchAnnouncements };
};
