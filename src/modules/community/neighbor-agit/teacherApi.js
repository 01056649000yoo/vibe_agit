import { supabase } from '../../../lib/supabaseClient';

// 알림 카운트 기본값. 서버가 안 내려줘도(옛 배포) 화면이 깨지지 않게 0으로 채운다.
const EMPTY_NOTIFICATIONS = Object.freeze({
    pending_reviews: 0, pending_approvals: 0, pending_joins: 0, new_posts: 0, new_comments: 0, blocked_comments: 0
});

const assertWorkspace = (data) => {
    if (Number(data?.version) !== 1
        || !data?.class?.id
        || !Array.isArray(data?.memberships)
        || !Array.isArray(data?.activities)
        || !Array.isArray(data?.review_posts)
        || !Array.isArray(data?.public_posts)) {
        throw new Error('지원하지 않는 모두의 아지트 교사 응답입니다.');
    }
    return {
        ...data,
        notifications: { ...EMPTY_NOTIFICATIONS, ...(data.notifications || {}) },
        blocked_comments: Array.isArray(data.blocked_comments) ? data.blocked_comments : []
    };
};

export const neighborAgitTeacherApi = {
    async getSourcePost({ spaceId, classId, postId }) {
        const { data, error } = await supabase.rpc('get_neighbor_teacher_source_post_v1', {
            p_space_id: spaceId, p_actor_class_id: classId, p_post_id: postId
        });
        if (error) throw error;
        if (Number(data?.version) !== 1 || data?.post_id !== postId || !data?.source_revision) {
            throw new Error('공유할 글 전문을 확인할 수 없습니다.');
        }
        return data;
    },
    async getWorkspace(classId) {
        const { data, error } = await supabase.rpc('get_neighbor_teacher_workspace_v1', {
            p_class_id: classId
        });
        if (error) throw error;
        return assertWorkspace(data);
    },

    // 교사가 화면·검토함을 열면 "지금까지 봤음"을 남긴다(새 글/새 댓글 배지 기준선 갱신).
    async markSeen(classId) {
        const { data, error } = await supabase.rpc('mark_neighbor_teacher_seen_v1', {
            p_class_id: classId
        });
        if (error) throw error;
        return data;
    },

    // AI가 막은 우리 반 이웃 댓글을 검토함에서 되살리거나(restore) 지운다(delete).
    async reviewBlockedComment({ spaceId, classId, commentId, action }) {
        const { data, error } = await supabase.rpc('review_neighbor_blocked_comment_v1', {
            p_space_id: spaceId, p_actor_class_id: classId, p_comment_id: commentId, p_action: action
        });
        if (error) throw error;
        if (data?.success !== true) throw new Error('차단 댓글 처리 결과를 확인할 수 없습니다.');
        return data;
    },

    async runAction(classId, action, payload = {}) {
        const { data, error } = await supabase.rpc('run_neighbor_teacher_action_v1', {
            p_class_id: classId,
            p_action: action,
            p_payload: payload
        });
        if (error) throw error;
        if (data?.success !== true || !data?.workspace) {
            throw new Error('모두의 아지트 동작 결과를 확인할 수 없습니다.');
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
    },

    async getShareCandidates({ spaceId, classId, limit = 100 }) {
        const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
        const { data, error } = await supabase.rpc('get_neighbor_teacher_share_candidates_v1', {
            p_space_id: spaceId,
            p_actor_class_id: classId,
            p_limit: safeLimit
        });
        if (error) throw error;
        if (Number(data?.version) !== 1
            || Number(data?.max_rows) !== 100
            || !Array.isArray(data?.items)
            || data.items.length > 100) {
            throw new Error('우리 학급 글 목록 응답을 확인할 수 없습니다.');
        }
        return data.items;
    }
};
