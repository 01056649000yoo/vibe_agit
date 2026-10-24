/**
 * 우리반 수호룡 광장 모듈 (2026-10-24 선생님 결정).
 *
 * 반 친구의 수호룡이 한 교실에 모여 책상에 앉아 있고, 자리를 누르면 그 친구의 아지트가 열린다.
 * 친구 아지트를 서로 구경하며 교류하는 곳이라 "내 아지트를 꾸밀 동기"가 된다. 교사가 정하거나 올릴 것은 없다
 * (기본 켜짐, 안 쓰는 선생님은 놀이터 관리에서 끈다). 계획: docs/CLASS_DRAGON_ROOM_PLAN.md
 */
export const dragonPlazaManifest = {
  id: 'dragon-plaza',
  name: '우리반 수호룡 광장',
  description: '우리 반 수호룡이 모인 교실에서 친구 아지트를 구경해요',
  icon: '🏫',
  part: 'game',
  audience: 'student',
  defaultEnabled: true,
  // 열 때 친구 목록 1회 + 새 글 목록 1회 + 이번 주 방문자 1회. 폴링·실시간 구독 없음.
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100 },
  studentEntry: () => import('./DragonPlazaEntry'),
  teacherEntry: () => import('./TeacherManager'),
  playground: {
    name: '우리반 수호룡 광장',
    description: '우리 반 수호룡이 모인 교실 구경하기',
    background: 'linear-gradient(135deg, #E8F5E9 0%, #F1F8E9 100%)',
    borderColor: '#C5E1A5',
    // 놀이터는 `얻기`·`쓰기` 두 묶음뿐이다. 광장은 공방에서 쓴 포인트로 꾸민 아지트를 뽐내는 곳이라 `쓰기` 묶음, `나의 작가 수호룡` 바로 아래.
    economy: 'spend',
    pointLabel: '꾸민 아지트 뽐내기',
    ctaLabel: '교실 들어가기',
    // 놀이터 목록에서 `나의 작가 수호룡`(10) 바로 아래
    order: 11,
    entryMode: 'standard'
  },
  management: { title: '우리반 수호룡 광장', subtitle: '켜고 끄기만 있어요', order: 11, activeColor: '#2E7D32' }
};
