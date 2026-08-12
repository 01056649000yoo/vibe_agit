import { supabase } from '../../lib/supabaseClient';

const callAssignmentRpc = async (name, params) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
};

export const assignmentApi = Object.freeze({
    requestRewrite(postId, feedback = null) {
        return callAssignmentRpc('request_assignment_rewrite_v1', {
            p_post_id: postId,
            p_feedback: feedback || null
        });
    },

    requestRewrites(postIds, feedback = null) {
        return callAssignmentRpc('bulk_request_assignment_rewrite_v1', {
            p_post_ids: postIds,
            p_feedback: feedback || null
        });
    }
});
