import { supabase } from '../../../lib/supabaseClient';

const assertWorkspace = (data) => {
    if (Number(data?.version) !== 1
        || !data?.class?.id
        || !Array.isArray(data?.memberships)
        || !Array.isArray(data?.activities)
        || !Array.isArray(data?.review_posts)
        || !Array.isArray(data?.public_posts)) {
        throw new Error('지원하지 않는 이웃 아지트 교사 응답입니다.');
    }
    return data;
};

export const neighborAgitTeacherApi = {
    async getWorkspace(classId) {
        const { data, error } = await supabase.rpc('get_neighbor_teacher_workspace_v1', {
            p_class_id: classId
        });
        if (error) throw error;
        return assertWorkspace(data);
    },

    async runAction(classId, action, payload = {}) {
        const { data, error } = await supabase.rpc('run_neighbor_teacher_action_v1', {
            p_class_id: classId,
            p_action: action,
            p_payload: payload
        });
        if (error) throw error;
        if (data?.success !== true || !data?.workspace) {
            throw new Error('이웃 아지트 동작 결과를 확인할 수 없습니다.');
        }
        return {
            result: data.action_result || {},
            workspace: assertWorkspace(data.workspace)
        };
    },

    async getPostDetail({ spaceId, classId, sharedPostId }) {
        const { data, error } = await supabase.rpc('get_neighbor_teacher_post_detail_v1', {
            p_space_id: spaceId,
            p_actor_class_id: classId,
            p_shared_post_id: sharedPostId
        });
        if (error) throw error;
        if (Number(data?.version) !== 1 || data?.shared_post_id !== sharedPostId || !Array.isArray(data?.comments)) {
            throw new Error('이웃 글 관리 응답을 확인할 수 없습니다.');
        }
        return data;
    }
};
