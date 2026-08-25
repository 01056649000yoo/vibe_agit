import { supabase } from '../../../lib/supabaseClient';
import { TEACHER_SUBMISSION_BOARD_RECENT_LIMIT } from './teacherSubmissionBoardPollPolicy';

export const TEACHER_SUBMISSION_HISTORY_LIMIT = 100;

export const teacherSubmissionBoardApi = {
    async getSnapshot(classId) {
        const { data, error } = await supabase.rpc('get_teacher_assignment_submission_board_v1', {
            p_class_id: classId,
            p_recent_limit: TEACHER_SUBMISSION_BOARD_RECENT_LIMIT
        });
        if (error) throw error;
        if (Number(data?.version) !== 1) throw new Error('지원하지 않는 과제 제출 전광판 응답입니다.');
        return data;
    },

    async getHistory(classId) {
        const { data, error } = await supabase.rpc('get_teacher_assignment_submission_history_v1', {
            p_class_id: classId,
            p_limit: TEACHER_SUBMISSION_HISTORY_LIMIT
        });
        if (error) throw error;
        if (Number(data?.version) !== 1 || !Array.isArray(data?.submissions)) {
            throw new Error('지원하지 않는 과제 제출 기록 응답입니다.');
        }
        return data;
    }
};
