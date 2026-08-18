import { supabase } from '../../../lib/supabaseClient';

const RESULT_KIND_BY_ACTIVITY = Object.freeze({
    outline_builder: 'outline',
    question_voting: 'selected_questions',
    one_line_share: 'one_line'
});

const normalizeTeacherSource = (row) => {
    const resultKind = String(row?.result_kind || RESULT_KIND_BY_ACTIVITY[row?.activity_type] || '');
    if (!row?.room_id || !['outline', 'selected_questions', 'one_line'].includes(resultKind)) return null;

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
    },

    async listQuestionVotingRooms(classId) {
        if (!supabase || !classId) throw new Error('학급 정보를 준비하지 못했습니다.');

        const { data, error } = await supabase.rpc('get_teacher_question_voting_rooms_v1', {
            p_class_id: classId
        });
        if (error) throw error;

        return (Array.isArray(data) ? data : []).map((row) => ({
            roomId: row.room_id,
            title: String(row.title || '').trim() || '좋은 질문 고르기',
            topic: String(row.topic || '').trim(),
            createdAt: row.created_at,
            isActive: row.is_active === true,
            questionCount: Number(row.question_count) || 0,
            participantCount: Number(row.participant_count) || 0
        }));
    },

    async getQuestionVotingRanking(classId, roomId) {
        if (!supabase || !classId || !roomId) throw new Error('활동 정보를 준비하지 못했습니다.');

        const { data, error } = await supabase.rpc('get_teacher_question_voting_ranking_v1', {
            p_class_id: classId,
            p_room_id: roomId
        });
        if (error) throw error;

        return (Array.isArray(data) ? data : []).map((row) => ({
            questionId: row.question_id,
            text: String(row.text || '').trim(),
            votes: Number(row.votes) || 0
        }));
    }
};
