import { supabase } from '../../../lib/supabaseClient';

// 알림 카운트 기본값. 서버가 안 내려줘도(옛 배포) 화면이 깨지지 않게 0으로 채운다.
const EMPTY_NOTIFICATIONS = Object.freeze({
    pending_reviews: 0, pending_approvals: 0, pending_joins: 0, new_posts: 0, new_comments: 0, blocked_comments: 0,
    pending_guestbook: 0
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
        blocked_comments: Array.isArray(data.blocked_comments) ? data.blocked_comments : [],
        // 우리 반 문집에 들어온, 확인할 방문록(20261335)
        pending_guestbook: Array.isArray(data.pending_guestbook) ? data.pending_guestbook : []
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

    // 함께 쓰는 주제의 기한을 정한다. changes 에 넣은 키만 바뀐다(값 null = 기한 없음).
    //   writing_close_at  : 글쓰기 마감 — 지나면 서버가 활동을 저절로 종료한다(호스트·제안 학급만).
    //   comments_close_at : 댓글·반응 마감 — 지난 시각을 주면 "지금 마감" 이다.
    async setActivitySchedule({ spaceId, classId, activityId, changes }) {
        const { data, error } = await supabase.rpc('set_neighbor_activity_schedule_v1', {
            p_space_id: spaceId, p_actor_class_id: classId, p_activity_id: activityId, p_changes: changes
        });
        if (error) throw error;
        if (data?.success !== true || data?.activity_id !== activityId) {
            throw new Error('기한 설정 결과를 확인할 수 없습니다.');
        }
        return data;
    },

    // ③ 댓글·반응을 반별로: 공간의 공개 글(kind 'gallery' | 'topic')을 반마다 묶어 댓글·공감 수와 함께(20261336).
    async getEngagement({ spaceId, classId, kind }) {
        const { data, error } = await supabase.rpc('get_neighbor_teacher_engagement_v1', {
            p_space_id: spaceId, p_actor_class_id: classId, p_kind: kind
        });
        if (error) throw error;
        if (Number(data?.version) !== 1 || data?.kind !== kind || !Array.isArray(data?.classes)) {
            throw new Error('반별 댓글·반응 응답을 확인할 수 없습니다.');
        }
        return data.classes;
    },

    // 교사가 한 활동(주제)의 우리 학급 제출 글을 직접 골라 공개하기 위한 후보.
    async getActivityCandidates({ spaceId, classId, activityId }) {
        const { data, error } = await supabase.rpc('get_neighbor_teacher_activity_candidates_v1', {
            p_space_id: spaceId,
            p_actor_class_id: classId,
            p_activity_id: activityId
        });
        if (error) throw error;
        if (Number(data?.version) !== 1 || data?.activity_id !== activityId || !Array.isArray(data?.items)) {
            throw new Error('활동 글 목록 응답을 확인할 수 없습니다.');
        }
        return data.items;
    },

    async getShareCandidates({ spaceId, classId, limit = 500 }) {
        const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 500);
        const { data, error } = await supabase.rpc('get_neighbor_teacher_share_candidates_v1', {
            p_space_id: spaceId,
            p_actor_class_id: classId,
            p_limit: safeLimit
        });
        if (error) throw error;
        if (Number(data?.version) !== 1
            || Number(data?.max_rows) !== 500
            || !Array.isArray(data?.items)
            || data.items.length > 500) {
            throw new Error('우리 학급 글 목록 응답을 확인할 수 없습니다.');
        }
        return data.items;
    }
};
