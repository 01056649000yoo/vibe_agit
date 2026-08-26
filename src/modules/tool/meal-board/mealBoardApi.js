import { supabase } from '../../../lib/supabaseClient';

async function call(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message || '요청을 처리하지 못했습니다.');
  return data;
}

export const mealBoardApi = Object.freeze({
  getWorkspace(classId) {
    return call('get_teacher_meal_board_workspace_v1', { p_class_id: classId });
  },

  async getMeal({ officeCode, schoolCode, date, forceRefresh = false }) {
    const { data, error } = await supabase.functions.invoke('neis-meal', {
      body: {
        action: 'get-meal',
        officeCode,
        schoolCode,
        date: String(date || '').replaceAll('-', ''),
        forceRefresh
      }
    });
    if (error) throw new Error(error.message || '급식 정보를 불러오지 못했습니다.');
    if (data?.error) throw new Error(data.error);
    return data;
  },

  saveStudentNote(classId, studentId, note) {
    return call('save_teacher_student_meal_note_v1', {
      p_class_id: classId,
      p_student_id: studentId,
      p_note: note
    });
  },

  saveSchool(classId, scope, school = null) {
    return call('save_teacher_meal_school_v1', {
      p_class_id: classId,
      p_scope: scope,
      p_school_office_code: school?.officeCode || null,
      p_school_code: school?.schoolCode || null,
      p_school_name: school?.schoolName || null,
      p_school_address: school?.address || ''
    });
  }
});
