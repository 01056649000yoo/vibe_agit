import { supabase } from '../../../lib/supabaseClient';

const callSeasonRpc = async (name, params) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
};

/** DB의 기존 dragon_* 이름을 숨기는 공용 칭호·학기 시즌 어댑터. */
export const titleSeasonApi = Object.freeze({
    getTeacherDashboard(classId) {
        return callSeasonRpc('get_teacher_dragon_growth_dashboard', { p_class_id: classId });
    },
    openClosing(classId, { seasonName, farewellDeadline }) {
        return callSeasonRpc('open_teacher_dragon_season_closing', {
            p_class_id: classId,
            p_season_name: seasonName,
            p_farewell_deadline: farewellDeadline || null
        });
    },
    finalize(classId) {
        return callSeasonRpc('finalize_teacher_dragon_season', { p_class_id: classId });
    },
    cancelFinalize(classId) {
        return callSeasonRpc('cancel_teacher_dragon_season_finalize', { p_class_id: classId });
    },
    start(classId, seasonName) {
        return callSeasonRpc('start_teacher_dragon_season', {
            p_class_id: classId,
            p_season_name: seasonName
        });
    }
});
