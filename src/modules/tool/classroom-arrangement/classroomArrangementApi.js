import { supabase } from '../../../lib/supabaseClient';

async function call(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

export const classroomArrangementApi = Object.freeze({
  getWorkspace(classId, historyLimit = 50) {
    return call('get_teacher_classroom_arrangement_v1', {
      p_class_id: classId,
      p_history_limit: Math.min(50, Math.max(1, historyLimit))
    });
  },

  saveSettings(classId, { seat, role, studentGroups }) {
    return call('save_teacher_classroom_arrangement_settings_v1', {
      p_class_id: classId,
      p_seat_settings: seat,
      p_role_settings: role,
      p_student_groups: studentGroups
    });
  },

  createHistory(classId, kind, title, payload) {
    return call('create_teacher_classroom_arrangement_history_v1', {
      p_class_id: classId,
      p_kind: kind,
      p_title: title,
      p_payload: payload
    });
  },

  deleteHistory(historyId) {
    return call('delete_teacher_classroom_arrangement_history_v1', { p_history_id: historyId });
  },

  importLegacyArchive({ fingerprint, version, summary, payload }) {
    return call('import_teacher_survival_archive_v1', {
      p_source_fingerprint: fingerprint,
      p_archive_version: version,
      p_summary: summary,
      p_payload: payload
    });
  }
});
