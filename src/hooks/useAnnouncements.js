import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useAnnouncements = (role = 'TEACHER') => {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [latestAnnouncement, setLatestAnnouncement] = useState(null);

    const fetchAnnouncements = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('announcements')
                .select('*')
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

        // 실시간 구독
        const channel = supabase
            .channel('announcements_realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'announcements'
            }, () => {
                fetchAnnouncements();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [role]);

    return { announcements, latestAnnouncement, loading, refresh: fetchAnnouncements };
};
