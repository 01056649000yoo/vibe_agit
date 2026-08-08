/**
 * 드래곤 기르기 모듈 (Stage 3b 첫 이전 대상)
 *
 * 3대 기둥 중 ③포인트 동기부여에 해당 — 유지 기능.
 * 학생: 작가 칭호 연동 성장·교감·꾸미기 / 교사: 전용 시즌·학급 성장 대시보드.
 *
 * 주의: 학생 아바타로 쓰이는 `pet_data` 자체는 친구목록·글 작성자 표시 등
 * 여러 곳에서 쓰이므로 코어 데이터로 남긴다. 이 모듈은 "드래곤 기르기 기능"만 담당.
 */
export const dragonManifest = {
  id: 'dragon',
  name: '작가 수호룡',
  description: '글쓰기와 함께 성장하고 포인트로 아지트 꾸미기',
  icon: '🐉',
  part: 'game',
  audience: 'student',
  defaultEnabled: true, // 기존 동작 보존: 지금까지 모든 학급에 노출돼 있었음
  performance: { home: 'summary', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 0 },
  studentEntry: () => import('./DragonHideoutModal'),
  myAgitEntry: () => import('./MyAgitCard'),
  teacherEntry: () => import('./TeacherManager'),
  myAgit: {
    order: 10
  },
  playground: {
    name: '나의 작가 수호룡',
    description: '나의 글과 함께 자라는 아지트 친구',
    background: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)',
    borderColor: '#FFE082',
    order: 10,
    entryMode: 'legacy'
  },
  management: {
    title: '작가 수호룡 관리',
    subtitle: '시즌 운영과 학생별 작가 수호룡 성장 확인',
    order: 10,
    activeColor: '#E65100',
    ownsCard: true,
    headerBackground: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)'
  }
};
