import { supabase } from '../../../lib/supabaseClient';

export const fetchTeacherMissionEngagement = async (missionId) => {
    if (!missionId) return [];

    const { data, error } = await supabase.rpc('get_teacher_mission_engagement_v1', {
        p_mission_id: missionId,
    });
    if (error) throw error;
    if (data?.version !== 1 || !Array.isArray(data?.items)) {
        throw new Error('학생 반응 모아보기 응답 형식이 올바르지 않습니다.');
    }
    return data.items;
};

