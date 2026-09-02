import { supabase } from '../../../../../lib/supabaseClient';

/*
 * 알림장은 보드 저장과 따로 움직인다.
 *
 * 내용은 학급+날짜 표에 있고 보드 JSON에는 제목·색만 남는다. 그래서 알림만 고칠 때
 * 화면 배치를 다시 저장하지 않으며, 발표 화면에서도 보드 revision을 건드리지 않고 쓸 수 있다.
 * 화면을 열 때 부르는 것은 `getNotices` 한 번뿐이고 자동 새로고침은 하지 않는다.
 */

const call = async (name, params) => {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message || '알림장을 처리하지 못했습니다.');
  if (Number(data?.version) !== 1) throw new Error('지원하지 않는 알림장 응답입니다.');
  return data;
};

export const noticeBoardApi = Object.freeze({
  getNotices(classId, date = null, limit = 14) {
    return call('get_teacher_class_board_notices_v1', {
      p_class_id: classId,
      p_date: date || null,
      p_limit: limit,
    });
  },

  saveNotice(classId, date, body) {
    return call('save_teacher_class_board_notice_v1', {
      p_class_id: classId,
      p_date: date || null,
      p_body: body ?? '',
    });
  },
});
