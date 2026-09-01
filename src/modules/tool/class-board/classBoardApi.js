import { supabase } from '../../../lib/supabaseClient';

const call = async (name, params) => {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message || '요청을 처리하지 못했습니다.');
  return data;
};

export const classBoardApi = Object.freeze({
  getWorkspace(classId) {
    return call('get_teacher_class_board_workspace_v1', { p_class_id: classId, p_limit: 20 });
  },

  getHidden(classId) {
    return call('get_teacher_archived_class_boards_v1', { p_class_id: classId, p_limit: 20 });
  },

  save({ classId, board }) {
    return call('save_teacher_class_board_v1', {
      p_class_id: classId,
      p_board_id: board.id || null,
      p_title: board.title,
      p_layout: board.layout,
      p_widgets: board.widgets,
      p_expected_revision: board.id ? board.revision : null,
    });
  },

  duplicate(boardId) {
    return call('duplicate_teacher_class_board_v1', { p_board_id: boardId });
  },

  archive(boardId) {
    return call('archive_teacher_class_board_v1', { p_board_id: boardId });
  },

  restore(boardId) {
    return call('restore_teacher_class_board_v1', { p_board_id: boardId });
  },

  getPresentation(boardId) {
    return call('get_teacher_class_board_presentation_v1', { p_board_id: boardId });
  },

  getWritingStatus(classId, missionId = null) {
    return call('get_teacher_class_board_status_v1', {
      p_class_id: classId,
      p_mission_id: missionId || null,
    });
  },

  getRoster(classId) {
    return call('get_teacher_class_board_roster_v1', { p_class_id: classId });
  },
});
