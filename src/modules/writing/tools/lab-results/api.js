import { supabase } from '../../../../lib/supabaseClient';

const normalizeChunk = (chunk) => {
    if (!chunk || typeof chunk !== 'object') return null;
    const id = String(chunk.id || '').trim();
    const kind = String(chunk.kind || '').trim();
    const text = String(chunk.text || '').trim();
    if (!id || !kind || !text) return null;

    return {
        id,
        kind,
        text,
        label: String(chunk.label || '').trim(),
        section: ['처음', '가운데', '끝'].includes(chunk.section) ? chunk.section : null
    };
};

const normalizeResult = (row) => {
    const chunks = Array.isArray(row?.chunks)
        ? row.chunks.map(normalizeChunk).filter(Boolean).slice(0, 100)
        : [];
    if (!row?.id || chunks.length === 0) return null;

    return {
        id: row.id,
        sessionId: row.session_id,
        activityType: row.activity_type,
        activityVersion: row.activity_version,
        schemaVersion: row.schema_version,
        resultKind: row.result_kind,
        title: String(row.title || '').trim() || '글쓰기 연구소 활동',
        topic: String(row.topic || '').trim(),
        chunks,
        completedAt: row.completed_at,
        hasMore: row.has_more === true
    };
};

export const labResultsApi = {
    async list({ limit = 20, before = null } = {}) {
        if (!supabase) throw new Error('연구소 결과 연결을 준비하고 있습니다.');

        const params = {
            p_limit: Math.min(Math.max(Number(limit) || 20, 1), 50),
            p_before_completed_at: before?.completedAt || null,
            p_before_id: before?.id || null,
            p_result_kinds: null
        };
        const { data, error } = await supabase.rpc('get_my_lab_results_v1', params);
        if (error) throw error;

        const items = (Array.isArray(data) ? data : [])
            .map(normalizeResult)
            .filter(Boolean);
        const last = items.at(-1);
        return {
            items,
            hasMore: items[0]?.hasMore === true,
            nextCursor: last ? { id: last.id, completedAt: last.completedAt } : null
        };
    }
};
