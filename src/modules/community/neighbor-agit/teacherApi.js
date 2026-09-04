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
    },

    async getExchangeRoster({ spaceId, classId, activityId }) {
        const { data, error } = await supabase.rpc('get_neighbor_exchange_roster_v1', {
            p_space_id: spaceId,
            p_actor_class_id: classId,
            p_activity_id: activityId
        });
        if (error) throw error;
        const validClasses = Array.isArray(data?.classes)
            && data.classes.length === 2
            && data.classes.every((item) => Array.isArray(item?.students)
                && item.students.length <= 100
                && item.students.every((student) => (
                    typeof student?.student_key === 'string'
                    && /^[a-f0-9]{64}$/.test(student.student_key)
                    && typeof student?.name === 'string'
                )));
        if (Number(data?.version) !== 1
            || data?.activity_id !== activityId
            || Number(data?.max_students_per_class) !== 100
            || Number(data?.max_partners_per_student) !== 2
            || !validClasses) {
            throw new Error('글짝 매칭 학생 명단 응답을 확인할 수 없습니다.');
        }
        return data;
    }
};
