import { supabase } from '../../lib/supabaseClient';

const callPointRpc = async (name, params = {}) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
};

const createRequestId = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return undefined;
};

export const pointApi = Object.freeze({
    approveAssignment(postId, feedback = null) {
        return callPointRpc('approve_assignment_post', {
            p_post_id: postId,
            p_feedback: feedback || null
        });
    },

    approveAssignments(postIds) {
        return callPointRpc('bulk_approve_posts', {
            p_submissions: postIds.map((postId) => ({ post_id: postId }))
        });
    },

    recoverAssignment(postId, feedback = null) {
        return callPointRpc('recover_assignment_post_approval', {
            p_post_id: postId,
            p_feedback: feedback || null
        });
    },

    recoverAssignments(postIds, feedback = null) {
        return callPointRpc('bulk_recover_assignment_posts', {
            p_post_ids: postIds,
            p_feedback: feedback || null
        });
    },

    adjustStudents(studentIds, amount, reason, requestId = createRequestId()) {
        const params = {
            p_student_ids: studentIds,
            p_amount: amount,
            p_reason: reason
        };
        if (requestId) params.p_request_id = requestId;
        return callPointRpc('teacher_manage_points_bulk', params);
    },

    getTeacherSnapshot(classId) {
        return callPointRpc('get_teacher_point_manager_snapshot', { p_class_id: classId });
    },

    getStudentHistory(studentId, { limit = 100, offset = 0 } = {}) {
        return callPointRpc('get_teacher_student_point_history', {
            p_student_id: studentId,
            p_limit: limit,
            p_offset: offset
        });
    },

    getMyHistory({ limit = 20 } = {}) {
        return callPointRpc('get_my_point_history_v1', { p_limit: limit });
    },

    setMeetingIdeaStatus(postId, status) {
        return callPointRpc('set_meeting_idea_status', {
            p_post_id: postId,
            p_status: status
        });
    }
});
