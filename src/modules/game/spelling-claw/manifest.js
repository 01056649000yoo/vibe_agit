/**
 * 맞춤법 인형뽑기 모듈 (2026-10-01, 1단계 시험).
 *
 * 맞춤법 퀴즈를 통과하면 코인 → 3D 인형뽑기 → 상품(랜덤 포인트·선생님 선물·수호룡 아이템).
 * 지금은 **관리자만** 교사 `아지트 놀이터` 에서 시험한다(`adminOnly`). 학생 화면에는 어떤 설정으로도 나오지 않는다 —
 * `getEnabledModules` 가 adminOnly 모듈을 늘 뺀다. 코인·상품·포인트는 화면에서만 흉내 내고 DB 에 쓰지 않는다.
 * 이름은 이 파일 한 곳에서만 정한다(놀이터 메뉴·카드가 여기서 읽는다).
 */
export const spellingClawManifest = {
  id: 'spelling-claw',
  name: '쏙쏙 맞춤법 뽑기',
  description: '맞춤법 퀴즈로 코인을 모아 인형을 뽑는 놀이',
  icon: '🧸',
  part: 'game',
  audience: 'teacher',
  adminOnly: true,
  defaultEnabled: false,
  performance: { home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 0 },
  teacherEntry: () => import('./ClawTestBench'),
  management: { order: 90, badge: '관리자 시험' }
};
