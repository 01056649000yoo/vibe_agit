import { supabase } from '../../../lib/supabaseClient';

const RESULT_KIND_BY_ACTIVITY = Object.freeze({
    outline_builder: 'outline',
    question_voting: 'selected_questions'
});

const normalizeTeacherSource = (row) => {
    const resultKind = String(row?.result_kind || RESULT_KIND_BY_ACTIVITY[row?.activity_type] || '');
    if (!row?.room_id || !['outline', 'selected_questions'].includes(resultKind)) return null;

    return {
        roomId: row.room_id,
        activityType: String(row.activity_type || ''),
        resultKind,
        title: String(row.title || '').trim() || '글쓰기 연구소 활동',
        topic: String(row.topic || '').trim(),
        createdAt: row.created_at,
        isActive: row.is_active === true,
        isLinked: row.is_linked === true
    };
};

export const labReferenceApi = {
    async listTeacherSources(missionId) {
        if (!supabase || !missionId) throw new Error('연구소 활동 연결 정보를 준비하지 못했습니다.');

        const { data, error } = await supabase.rpc('get_teacher_mission_lab_sources_v1', {
            p_mission_id: missionId
        });
        if (error) throw error;

        return (Array.isArray(data) ? data : [])
            .map(normalizeTeacherSource)
            .filter(Boolean);
    },

    async setTeacherSource({ missionId, resultKind, roomId = null }) {
        if (!supabase || !missionId) throw new Error('연구소 활동 연결 정보를 준비하지 못했습니다.');

        const { error } = await supabase.rpc('set_teacher_mission_lab_source_v1', {
            p_mission_id: missionId,
            p_result_kind: resultKind,
            p_room_id: roomId
        });
        if (error) throw error;
    }
};
