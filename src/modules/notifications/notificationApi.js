import { supabase } from '../../lib/supabaseClient';

// 알림 갈래. 'feedback'은 헤더 `내 글 소식`(친구 반응·댓글), 나머지는 홈 `활동 알림`
// (승인·반려·포인트)이 본다. 승인 같은 할 일이 반응 스무 개에 묻히지 않도록 나눠 둔다.
export const FEEDBACK_MODULE_IDS = Object.freeze(['feedback']);

const callNotificationRpc = async (name, params = {}) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    if (Number(data?.version) !== 1) throw new Error('지원하지 않는 활동 알림 응답입니다.');
    return data;
};

export const notificationApi = Object.freeze({
    listUnread({
        limit = 50,
        beforeCreatedAt = null,
        beforeId = null,
        moduleIds = null,
        excludeModuleIds = null
    } = {}) {
        return callNotificationRpc('get_my_activity_notifications_v1', {
            p_limit: limit,
            p_before_created_at: beforeCreatedAt,
            p_before_id: beforeId,
            p_module_ids: moduleIds,
            p_exclude_module_ids: excludeModuleIds
        });
    },

    markRead(ids) {
        return callNotificationRpc('mark_my_activity_notifications_read_v1', { p_ids: ids });
    },

    // `모두 확인`은 목록에 보이는 50건이 아니라 서버가 가진 갈래 전체를 처리한다.
    // 화면에 보이는 id만 넘기면 51번째부터 남아 배지가 안 지워진다.
    markAllRead({ moduleIds = null, excludeModuleIds = null } = {}) {
        return callNotificationRpc('mark_my_activity_notifications_read_all_v1', {
            p_module_ids: moduleIds,
            p_exclude_module_ids: excludeModuleIds
        });
    }
});
