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
  management: { order: 90, badge: '관리자 시험' }
};
