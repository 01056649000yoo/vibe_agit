import { supabase } from '../../../../../lib/supabaseClient';

/*
 * 스크린 위젯이 쓰는 읽기 하나.
 *
 * ⚠️ 배치 도구의 `get_teacher_classroom_arrangement_v1` 을 쓰지 않는다. 그쪽은 설정·명단·지난 기록
 *    50건을 한꺼번에 준다 — 교실 프로젝터에 하루 종일 떠 있는 화면이 읽기에는 너무 크다.
 *    서버에 가장 최근 한 건만 주는 함수를 따로 두었다(마이그레이션 20261233).
 */

export const arrangementBoardApi = Object.freeze({
  async getLatest(classId, kind) {
    const { data, error } = await supabase.rpc('get_class_board_arrangement_result_v1', {
      p_class_id: classId,
      p_kind: kind === 'role' ? 'role' : 'seat',
    });
    if (error) throw error;
    return data || null;
  },
});
