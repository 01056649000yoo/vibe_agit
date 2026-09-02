/*
 * 알림을 저장한 쪽이 화면에 그려진 알림장 위젯에게 알려 주는 통로.
 *
 * 알림은 보드 저장과 따로 저장되므로, 설정창·발표 화면·알림장 도구에서 알림만 고치면 위젯은
 * 자기 내용이 바뀐 줄 모른다. 저장한 쪽이 여기로 결과를 넘기면 위젯이 다시 조회하지 않고
 * 그대로 반영한다(같은 내용을 한 번 더 읽지 않는다).
 *
 * 교사는 알림장 도구를 본 창에서 열어 두고 교실 화면은 다른 창(프로젝터)에 띄우는 일이 많다.
 * 그 경우 창이 달라 위 통로가 닿지 않으므로 같은 브라우저의 다른 창까지 BroadcastChannel로
 * 이어 준다. 서버를 거치지 않고 같은 기기·같은 사이트 안에서만 오가며, 폴링은 하지 않는다.
 * 지원하지 않는 브라우저에서는 조용히 자기 창 안에서만 동작한다(화면을 다시 열면 서버에서 읽는다).
 */

const CHANNEL_NAME = 'class-board-notice';

const listeners = new Set();

const channel = (() => {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  } catch {
    return null;
  }
})();

const notify = (payload) => {
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // 한 구독자가 실패해도 나머지 화면은 계속 갱신한다.
    }
  });
};

if (channel) {
  // 받은 것은 알리기만 하고 다시 내보내지 않는다(돌고 도는 것을 막는다).
  channel.onmessage = (event) => {
    const data = event?.data;
    if (!data?.classId) return;
    notify({ classId: data.classId, date: data.date, body: data.body || '' });
  };
}

export const subscribeClassBoardNotice = (listener) => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const publishClassBoardNotice = ({ classId, date, body }) => {
  const payload = { classId, date, body: body || '' };
  notify(payload);
  try {
    channel?.postMessage(payload);
  } catch {
    // 다른 창에 알리지 못해도 이 창의 화면은 이미 갱신했다.
  }
};
