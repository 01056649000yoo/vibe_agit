/**
 * 수호룡의 인형뽑기 모듈 (2026-10-01 시험 → 2026-10-02 학생 공개).
 *
 * 학생이 키운 수호룡이 맞춤법 문제를 내고(수호룡이 자라면 함께 자란다), 통과하면 코인 → 3D 인형뽑기 → 상품(랜덤 포인트·선생님 선물·수호룡 아이템).
 * 학생 노출은 다른 놀이와 같이 **학급별 켜기/끄기**(enabled_modules, 기본 꺼짐)로 선생님이 정한다.
 * 문제·채점·코인·상품은 서버가 정한다(Edge 함수 `spelling-claw` + `20261363_spelling_claw_server.sql`).
 * 이름은 이 파일 한 곳에서만 정한다(놀이터 메뉴·카드가 여기서 읽는다).
 */
/** 이름 뒤 조사 이/가 — 받침이 있으면 `이`. */
const subjectParticle = (name) => {
  const code = String(name || '').charCodeAt(String(name || '').length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가';
};

export const spellingClawManifest = {
  id: 'spelling-claw',
  name: '수호룡의 인형뽑기',
  description: '내 수호룡이 내는 맞춤법 문제를 맞히고 인형을 뽑아요',
  icon: '🧸',
  part: 'game',
  audience: 'both',
  defaultEnabled: false,
  // 열 때 오늘 상태 RPC 1회(최근 기록 30건), 문제 받기·답마다 Edge 1회, 코인 넣기 RPC 1회, 한 판 끝 Edge 1회. 폴링 없음.
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 30 },
  studentEntry: () => import('./StudentEntry'),
  teacherEntry: () => import('./TeacherManager'),
  playground: {
    name: '수호룡의 인형뽑기',
    description: '수호룡의 맞춤법 문제를 맞히고 인형 뽑기',
    background: 'linear-gradient(135deg, #FFF1F2 0%, #FFF7ED 100%)',
    borderColor: '#FECDD3',
    economy: 'earn',
    pointLabel: '포인트 얻기',
    ctaLabel: '도전하기',
    order: 25,
    entryMode: 'standard'
  },
  management: { order: 90 },
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
    },
    /*
     * 뽑은 본인에게: 인형을 뽑아 받은 상품(포인트·선생님 선물·수호룡 아이템). 2단계 서버가 상품을 줄 때 같은 트랜잭션에서
     * 남긴다(event_key = 판 id). payload: { kind, points?, gift_name?, item_name?, plush_name }.
     */
    {
      eventType: 'spelling-claw.prize_awarded',
      icon: '🧸',
      tone: 'points',
      title: '인형뽑기 상품을 받았어요',
      message: (payload) => {
        const plush = payload?.plush_name ? `${payload.plush_name} 인형을 뽑아 ` : '';
        if (payload?.kind === 'gift') return `${plush}선생님 선물 ‘${payload.gift_name || '선물'}’에 당첨됐어요! 선생님께 보여 드려요.`;
        if (payload?.kind === 'decor') return `${plush}수호룡 아이템 ‘${payload.item_name || '아이템'}’을 받았어요. 나의 아지트에서 꾸며 보세요.`;
        return `${plush}${Number(payload?.points) || 0}P를 받았어요.`;
      },
      action: 'confirm',
      actionLabel: '확인했어요'
    },
    /*
     * 반 전체에: 누가 선생님 선물에 당첨되면 같은 반 친구 모두에게 알린다(2026-10-02 선생님 요청).
     * 2단계 서버가 선물을 줄 때 같은 트랜잭션에서 **같은 반 다른 학생마다** 한 건씩 남긴다(event_key = 판 id).
     * 교사 설정 `선물 당첨을 반 전체에 알리기`(기본 켬)로 끌 수 있다. payload: { winner_name, gift_name }.
     */
    {
      eventType: 'spelling-claw.class_gift_won',
      icon: '🎉',
      tone: 'positive',
      title: '우리 반에 선생님 선물 당첨자가 나왔어요',
      message: (payload) => `${payload?.winner_name || '친구'}${subjectParticle(payload?.winner_name || '친구')} 수호룡의 인형뽑기에서 ‘${payload?.gift_name || '선생님 선물'}’에 당첨됐어요! 축하해 주세요.`,
      action: 'confirm',
      actionLabel: '축하해요!'
    }
  ]
};
