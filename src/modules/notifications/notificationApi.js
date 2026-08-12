import { supabase } from '../../lib/supabaseClient';

const callNotificationRpc = async (name, params = {}) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    if (Number(data?.version) !== 1) throw new Error('지원하지 않는 활동 알림 응답입니다.');
    return data;
};

export const notificationApi = Object.freeze({
    listUnread({ limit = 50, beforeCreatedAt = null, beforeId = null } = {}) {
        return callNotificationRpc('get_my_activity_notifications_v1', {
            p_limit: limit,
            p_before_created_at: beforeCreatedAt,
            p_before_id: beforeId
        });
    },

    markRead(ids) {
        return callNotificationRpc('mark_my_activity_notifications_read_v1', { p_ids: ids });
    }
});
