/*
 * 알림을 저장한 쪽이 화면에 그려진 알림장 위젯에게 알려 주는 통로.
 *
 * 알림은 보드 저장과 따로 저장되므로, 설정창이나 발표 화면에서 알림만 고치면 위젯은
 * 자기 내용이 바뀐 줄 모른다. 저장한 쪽이 여기로 결과를 넘기면 위젯이 다시 조회하지 않고
 * 그대로 반영한다(같은 내용을 한 번 더 읽지 않는다).
 */

const listeners = new Set();

export const subscribeClassBoardNotice = (listener) => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const publishClassBoardNotice = ({ classId, date, body }) => {
  listeners.forEach((listener) => {
    try {
      listener({ classId, date, body: body || '' });
    } catch {
      // 한 구독자가 실패해도 나머지 화면은 계속 갱신한다.
    }
  });
};
