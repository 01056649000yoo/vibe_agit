import { supabase } from '../../../lib/supabaseClient';

const ALLOWED_STATUSES = new Set(['not_started', 'in_progress', 'done']);

const normalizeActivity = (row) => {
    if (!row?.id || !row?.activity_type) return null;

    return {
        id: row.id,
        activityType: String(row.activity_type),
        title: String(row.title || '').trim() || '글쓰기 연구소 활동',
        topic: String(row.topic || '').trim(),
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        sessionId: row.session_id || null,
        status: ALLOWED_STATUSES.has(row.participation_status)
            ? row.participation_status
            : 'not_started',
        hasMore: row.has_more === true
    };
};

export const labActivitiesApi = {
    async list({ limit = 20, before = null } = {}) {
        if (!supabase) throw new Error('연구소 활동 연결을 준비하고 있습니다.');

        const { data, error } = await supabase.rpc('get_my_lab_activities_v1', {
            p_limit: Math.min(Math.max(Number(limit) || 20, 1), 50),
            p_before_created_at: before?.createdAt || null,
            p_before_id: before?.id || null
        });
        if (error) throw error;

        const items = (Array.isArray(data) ? data : [])
            .map(normalizeActivity)
            .filter(Boolean);
        const last = items.at(-1);

        return {
            items,
            hasMore: items[0]?.hasMore === true,
            nextCursor: last ? { id: last.id, createdAt: last.createdAt } : null
        };
    }
};
