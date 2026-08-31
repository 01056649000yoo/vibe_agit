import { supabase } from '../../../lib/supabaseClient';
import { NEIGHBOR_AGIT_LIMITS } from './policy';

const assertFeedResponse = (data) => {
    if (Number(data?.version) !== 1
        || !data?.space?.id
        || !Array.isArray(data?.items)
        || data.items.length > NEIGHBOR_AGIT_LIMITS.maximumFeedRows
        || Number(data?.max_rows) !== NEIGHBOR_AGIT_LIMITS.maximumFeedRows) {
        throw new Error('지원하지 않는 이웃 글 목록 응답입니다.');
    }
    return data;
};

export const neighborAgitApi = {
    async getFeed({ spaceId, limit = NEIGHBOR_AGIT_LIMITS.initialFeedRows, cursor = null }) {
        const safeLimit = Math.min(
            Math.max(Number(limit) || NEIGHBOR_AGIT_LIMITS.initialFeedRows, 1),
            NEIGHBOR_AGIT_LIMITS.maximumFeedRows
        );
        const { data, error } = await supabase.rpc('get_neighbor_space_feed_v1', {
            p_space_id: spaceId,
            p_limit: safeLimit,
            p_cursor_at: cursor?.at || null,
            p_cursor_id: cursor?.id || null
        });
        if (error) throw error;
        return assertFeedResponse(data);
    },

    async getDetail({ spaceId, sharedPostId }) {
        const { data, error } = await supabase.rpc('get_neighbor_shared_post_v1', {
            p_space_id: spaceId,
            p_shared_post_id: sharedPostId
        });
        if (error) throw error;
        if (Number(data?.version) !== 1 || data?.shared_post_id !== sharedPostId || !data?.title) {
            throw new Error('지원하지 않는 이웃 글 응답입니다.');
        }
        return data;
    },

    async getShareCandidates({ spaceId, limit = 50 }) {
        const { data, error } = await supabase.rpc('get_neighbor_my_share_candidates_v1', {
            p_space_id: spaceId,
            p_limit: Math.min(Math.max(Number(limit) || 50, 1), 50)
        });
        if (error) throw error;
        if (Number(data?.version) !== 1 || Number(data?.max_rows) !== 50 || !Array.isArray(data?.items)) {
            throw new Error('공개할 내 글 목록 응답을 확인할 수 없습니다.');
        }
        return data.items;
    },

    async requestShare({ spaceId, postId }) {
        const { data, error } = await supabase.rpc('request_neighbor_post_share_v1', {
            p_space_id: spaceId,
            p_post_id: postId
        });
        if (error) throw error;
        if (data?.success !== true || !data?.shared_post_id || !data?.status) {
            throw new Error('글 공개 요청 결과를 확인할 수 없습니다.');
        }
        return data;
    },

    async recallShare({ spaceId, sharedPostId }) {
        const { data, error } = await supabase.rpc('recall_my_neighbor_shared_post_v1', {
            p_space_id: spaceId,
            p_shared_post_id: sharedPostId
        });
        if (error) throw error;
        if (data?.success !== true || data?.status !== 'recalled') {
            throw new Error('글 공개 회수 결과를 확인할 수 없습니다.');
        }
        return data;
    },

    async saveComment({ spaceId, sharedPostId, content = '', action = 'save' }) {
        const { data, error } = await supabase.rpc('save_neighbor_comment_v1', {
            p_space_id: spaceId,
            p_shared_post_id: sharedPostId,
            p_content: content,
            p_action: action
        });
        if (error) throw error;
        if (data?.success !== true || !data?.comment_id || !['visible', 'deleted'].includes(data?.status)) {
            throw new Error('지원하지 않는 이웃 댓글 응답입니다.');
        }
        return data;
    },

    async toggleReaction({ spaceId, sharedPostId }) {
        const { data, error } = await supabase.rpc('toggle_neighbor_reaction_v1', {
            p_space_id: spaceId,
            p_shared_post_id: sharedPostId
        });
        if (error) throw error;
        if (data?.success !== true || typeof data?.active !== 'boolean') {
            throw new Error('지원하지 않는 이웃 공감 응답입니다.');
        }
        return data;
    },

    async toggleSave({ spaceId, sharedPostId }) {
        const { data, error } = await supabase.rpc('toggle_neighbor_save_v1', {
            p_space_id: spaceId,
            p_shared_post_id: sharedPostId
        });
        if (error) throw error;
        if (data?.success !== true || typeof data?.saved !== 'boolean') {
            throw new Error('지원하지 않는 이웃 간직하기 응답입니다.');
        }
        return data;
    }
};
