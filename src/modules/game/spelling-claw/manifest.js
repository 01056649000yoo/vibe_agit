/**
 * 수호룡의 인형뽑기 모듈 (2026-10-01, 1단계 시험).
 *
 * 학생이 키운 수호룡이 맞춤법 문제를 내고(수호룡이 자라면 함께 자란다), 통과하면 코인 → 3D 인형뽑기 → 상품(랜덤 포인트·선생님 선물·수호룡 아이템).
 * 지금은 **관리자만** 교사 `아지트 놀이터` 에서 시험한다(`adminOnly`). 학생 화면에는 어떤 설정으로도 나오지 않는다 —
 * `getEnabledModules` 가 adminOnly 모듈을 늘 뺀다. 코인·상품·포인트는 화면에서만 흉내 내고 DB 에 쓰지 않는다.
 * 이름은 이 파일 한 곳에서만 정한다(놀이터 메뉴·카드가 여기서 읽는다).
 */
export const spellingClawManifest = {
  id: 'spelling-claw',
  name: '수호룡의 인형뽑기',
  description: '내 수호룡이 내는 맞춤법 문제를 맞히고 인형을 뽑아요',
  icon: '🧸',
  part: 'game',
  audience: 'teacher',
  adminOnly: true,
  defaultEnabled: false,
  performance: { home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 0 },
  teacherEntry: () => import('./ClawTestBench'),
  management: { order: 90, badge: '관리자 시험' },
  /*
   * 학생 홈 활동 알림(2026-10-02 선생님 요청). 하루 기회를 다 쓰고 하나도 못 뽑아 최소 포인트를 받으면 알린다.
   * 2단계 서버가 포인트를 줄 때 **같은 트랜잭션에서** notification_emit_v1 로 이 eventType 을 남긴다
   * (event_key 는 학생·날짜로 하루 한 번). payload: { points, plays }. 홈은 폴링 없이 다음 접속·새로고침 때 받는다.
   */
  notifications: [
    {
      eventType: 'spelling-claw.consolation_awarded',
      icon: '🐉',
      tone: 'points',
      title: '수호룡이 포인트를 줬어요',
      message: (payload) => `오늘 인형뽑기 기회 ${Number(payload?.plays) || ''}번을 다 썼어요. 맞춤법 문제를 푼 상으로 ${Number(payload?.points) || 0}P를 받았어요.`.replace('기회 번', '기회'),
      action: 'confirm',
      actionLabel: '확인했어요'
    }
  ]
};
