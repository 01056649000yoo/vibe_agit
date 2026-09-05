import { supabase } from '../../../lib/supabaseClient.js';
import { dataCache, classKey, classScope } from '../../../lib/cache.js';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { assertClassAgitWorkspace, buildClassAgitSavePayload } from './contract.js';

const call = async (name, payload) => {
    const { data, error } = await supabase.rpc(name, payload);
    if (error) throw error;
    return data;
};


// Keep only bounded summaries in memory. Errors must never fall back to a stale success.
async function browse(classId, name, params, version, maximum, rpcName) {
    const key = classKey(classId, `class-agit-${name}`, { params: JSON.stringify(params) });
    const result = await dataCache.get(key, async () => {
        try {
            const data = await call(rpcName, params);
            if (data?.version !== version || data.class_id !== classId || !Array.isArray(data.items) || data.items.length > maximum) throw new Error('작품 탐색 응답을 확인할 수 없습니다.');
            return { data };
        } catch (error) { return { error }; }
    }, 30000);
    if (result.error) { dataCache.invalidate(key); throw result.error; }
    return result.data;
}

export const classAgitApi = {
    async getWorkspace(classId, exhibitionId = null) {
        return assertClassAgitWorkspace(await call('get_class_agit_workspace_v1', { p_class_id: classId, p_exhibition_id: exhibitionId }), classId);
    },
    async getMissions(classId, { query = '', scope = 'all', cursor = null } = {}) {
        const params = { p_class_id: classId, p_query: query, p_scope: scope, p_cursor: cursor, p_limit: limits.missionPage };
        return browse(classId, 'missions', params, 1, 100, 'get_class_agit_missions_v1');
    },
    async getCandidates(classId, filters = {}) {
        return browse(classId, 'candidates', { p_class_id: classId, p_filters: { ...filters, limit: limits.candidatePage } }, 2, 50, 'get_class_agit_candidates_v2');
    },
    async getSources(classId, ids) {
        if (!ids.length || ids.length > limits.selectionBatch || new Set(ids).size !== ids.length) throw new Error('서로 다른 작품을 1~50편 선택해 주세요.');
        const data = await call('get_class_agit_sources_v1', { p_class_id: classId, p_post_ids: ids });
        if (data?.version !== 1 || data.class_id !== classId || !Array.isArray(data.items) || data.items.length !== ids.length
            || data.items.some((item, index) => item.id !== ids.at(index) || (item.source
                ? item.source.id !== item.id || item.source.class_id !== classId || !item.source.source_revision : !item.reason))) throw new Error('선택 작품의 검토 결과를 확인할 수 없습니다.');
        return data.items;
    },
    async getSource(classId, postId) {
        const data = await call('get_class_agit_source_v1', { p_class_id: classId, p_post_id: postId });
        if (data?.version !== 1 || data.source?.id !== postId || data.source?.class_id !== classId || !data.source?.source_revision) throw new Error('작품 전문을 확인할 수 없습니다.');
        return data.source;
    },
    async runAction(classId, action, payload) {
        const data = assertClassAgitWorkspace(await call('run_class_agit_action_v1', { p_class_id: classId, p_action: action, p_payload: payload }), classId);
        dataCache.invalidatePrefix(classScope(classId));
        return data;
    },
    save(classId, draft, revision) { return this.runAction(classId, 'save', buildClassAgitSavePayload(draft, revision)); },
    async getPublication(classId, exhibitionId, room = 1) {
        const data = await call('get_class_agit_publication_v1', { p_class_id: classId, p_exhibition_id: exhibitionId, p_room: room });
        if (data?.version !== 1 || data.room !== room || !Array.isArray(data.exhibition?.works) || data.exhibition.works.length > 12) throw new Error('공개 전시를 확인할 수 없습니다.');
        return data;
    },
};
