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

  save({ classId, board, tabPosition = null }) {
    return call('save_teacher_class_board_v1', {
      p_class_id: classId,
      p_board_id: board.id || null,
      p_title: board.title,
      p_layout: board.layout,
      p_widgets: board.widgets,
      p_expected_revision: board.id ? board.revision : null,
      p_tab_position: board.id ? null : tabPosition,
    });
  },

  reorder(classId, boardIds) {
    return call('reorder_teacher_class_boards_v1', {
      p_class_id: classId,
      p_board_ids: boardIds,
    });
  },

  setDefault(boardId) {
    return call('set_teacher_default_class_board_v1', { p_board_id: boardId });
  },

  getDefault(classId) {
    return call('get_teacher_default_class_board_v1', { p_class_id: classId });
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

  // 20초마다 다시 부르는 자리라 교사가 켠 항목만 서버가 계산하도록 함께 보낸다.
  getWritingStatus(classId, missionId = null, sections = null) {
    return call('get_teacher_class_board_status_v1', {
      p_class_id: classId,
      p_mission_id: missionId || null,
      p_sections: Array.isArray(sections) ? sections : null,
    });
  },

  getRoster(classId) {
    return call('get_teacher_class_board_roster_v1', { p_class_id: classId });
  },
});
