import { supabase } from '../../../lib/supabaseClient';
import { NEIGHBOR_AGIT_LIMITS } from './policy';

const assertFeedResponse = (data) => {
    if (Number(data?.version) !== 1
        || !data?.space?.id
        || !Array.isArray(data?.activities)
        || !Array.isArray(data?.items)
        || data.items.length > NEIGHBOR_AGIT_LIMITS.maximumFeedRows
        || Number(data?.max_rows) !== NEIGHBOR_AGIT_LIMITS.maximumFeedRows) {
        throw new Error('지원하지 않는 이웃 글 목록 응답입니다.');
    }
    return data;
};

const assertActivityFeedResponse = (data, activityId) => {
    if (Number(data?.version) !== 1
        || data?.activity?.id !== activityId
        || !Array.isArray(data?.items)
        || data.items.length > NEIGHBOR_AGIT_LIMITS.maximumFeedRows
        || Number(data?.max_rows) !== NEIGHBOR_AGIT_LIMITS.maximumFeedRows) {
        throw new Error('지원하지 않는 이웃 활동 글 목록 응답입니다.');
    }
    return data;
};

export const neighborAgitApi = {
    // 이웃 글 마당 반 고르기: 반별 글 수·지난 방문 뒤 새 글 수(20261336). 반 열쇠는 원본 학급 id 가 아니다.
    async getGalleryClasses({ spaceId }) {
        const { data, error } = await supabase.rpc('get_neighbor_gallery_classes_v1', { p_space_id: spaceId });
        if (error) throw error;
        if (Number(data?.version) !== 1 || !Array.isArray(data?.classes)) throw new Error('반 목록 응답을 확인할 수 없습니다.');
        return data.classes;
    },

    // 한 반의 이웃 글 마당 글(요약·주제 이름). 화면이 주제별로 묶는다. 최대 300편.
    async getClassGallery({ spaceId, classKey }) {
        const { data, error } = await supabase.rpc('get_neighbor_class_gallery_v1', { p_space_id: spaceId, p_class_key: classKey });
        if (error) throw error;
        if (Number(data?.version) !== 1 || data?.class_key !== classKey || !Array.isArray(data?.items)
            || data.items.length > Number(data?.max_rows || 0)) {
            throw new Error('반 글 목록 응답을 확인할 수 없습니다.');
        }
        return data;
    },

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

    async getActivityFeed({ spaceId, activityId, limit = NEIGHBOR_AGIT_LIMITS.initialFeedRows, cursor = null }) {
        const safeLimit = Math.min(
            Math.max(Number(limit) || NEIGHBOR_AGIT_LIMITS.initialFeedRows, 1),
            NEIGHBOR_AGIT_LIMITS.maximumFeedRows
        );
        const { data, error } = await supabase.rpc('get_neighbor_activity_feed_v1', {
            p_space_id: spaceId,
            p_activity_id: activityId,
            p_limit: safeLimit,
            p_cursor_at: cursor?.at || null,
            p_cursor_id: cursor?.id || null
        });
        if (error) throw error;
        return assertActivityFeedResponse(data, activityId);
    },

    async saveComment({ spaceId, sharedPostId, content = '', action = 'save' }) {
        const { data, error } = await supabase.rpc('save_neighbor_comment_v1', {
            p_space_id: spaceId,
            p_shared_post_id: sharedPostId,
            p_content: content,
            p_action: action
        });
        if (error) throw error;
        // `pending` 은 검사를 기다리는 상태다. 이웃 댓글도 우리 반 댓글과 같은 검사를 지나므로
        // 저장 직후에는 아직 상대 학급에 보이지 않는다(2026-09-07).
        if (data?.success !== true || !data?.comment_id || !['pending', 'visible', 'deleted'].includes(data?.status)) {
            throw new Error('지원하지 않는 이웃 댓글 응답입니다.');
        }
        // 저장만으로는 검사가 돌지 않는다 — 학급 댓글과 똑같이 큐를 깨운다.
        // 2026-09-17 에 이 한 줄이 없어 이웃 댓글이 pending 에 갇혔다. 실패해도 저장 자체는 끝났으므로
        // 사용자에게 오류를 보이지 않는다(다음 저장이나 학급 댓글 검사 때 이어서 비워진다).
        if (data.status === 'pending') {
            supabase.functions.invoke('vibe-ai', { body: { type: 'COMMENT_QUEUE_DRAIN' } }).catch(() => {});
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
    }
};
