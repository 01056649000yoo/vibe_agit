import { supabase } from '../../../lib/supabaseClient';
import { normalizeCells } from './timetableModel.js';

/*
 * 학급 시간표 RPC(20261357_class_timetable.sql). 담당 학급 교사만 읽고 쓴다.
 * 도구는 열 때 한 번 + 주를 옮길 때 그 주 한 번, 스크린 위젯은 열 때 한 번(이번 주·다음 주 함께).
 */

const call = async (name, params) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) {
        const failure = new Error(error.message || '시간표를 처리하지 못했습니다.');
        failure.code = error.code;
        throw failure;
    }
    if (Number(data?.version) !== 1) throw new Error('지원하지 않는 시간표 응답입니다.');
    return data;
};

export const timetableApi = Object.freeze({
    /** weekStart 가 든 주부터 weeks(1~2)주. weekStart 가 없으면 이번 주. */
    get(classId, weekStart = null, weeks = 1) {
        return call('get_teacher_class_timetable_v1', {
            p_class_id: classId,
            p_week_start: weekStart || null,
            p_weeks: weeks,
        });
    },

    saveBase(classId, { effectiveFrom, grade, lunchAfter, includeSaturday, cells }) {
        return call('save_teacher_class_timetable_base_v1', {
            p_class_id: classId,
            p_effective_from: effectiveFrom,
            p_grade: grade,
            p_lunch_after: lunchAfter,
            p_include_saturday: Boolean(includeSaturday),
            p_cells: normalizeCells(cells),
        });
    },

    /** cells 가 null 이면 그 주 기록을 지워 기초 시간표로 되돌린다. */
    saveWeek(classId, { weekStart, cells, lunchAfter = null, includeSaturday = null }) {
        return call('save_teacher_class_timetable_week_v1', {
            p_class_id: classId,
            p_week_start: weekStart,
            p_cells: cells === null ? null : normalizeCells(cells),
            p_lunch_after: lunchAfter,
            p_include_saturday: includeSaturday,
        });
    },

    getLog(classId, before = null) {
        return call('get_teacher_class_timetable_log_v1', {
            p_class_id: classId,
            p_before: before || null,
            p_limit: 20,
        });
    },
});
