import { supabase } from '../../../lib/supabaseClient.js';
import { dataCache, classScope } from '../../../lib/cache.js';
import { assertClassAgitWorkspace, buildClassAgitSavePayload } from './contract.js';

const call = async (name, payload) => {
    const { data, error } = await supabase.rpc(name, payload);
    if (error) throw error;
    return data;
};

export const classAgitApi = {
    async getWorkspace(classId, exhibitionId = null) {
        return assertClassAgitWorkspace(await call('get_class_agit_workspace_v1', { p_class_id: classId, p_exhibition_id: exhibitionId }), classId);
    },
    async getCandidates(classId, query = '', cursor = null) {
        const data = await call('get_class_agit_candidates_v1', { p_class_id: classId, p_query: query,
            p_before_updated_at: cursor?.updated_at || null, p_before_id: cursor?.id || null, p_limit: 20 });
        if (data?.version !== 1 || !Array.isArray(data.items) || data.items.length > 50) throw new Error('전시 후보를 확인할 수 없습니다.');
        return data;
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
