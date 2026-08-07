/**
 * 어휘의 탑 모듈 (Stage 3b)
 *
 * 3대 기둥 중 ③포인트 동기부여에 해당 — 유지 기능.
 * 학생: 학년별 어휘 퀴즈로 탑 오르기(포인트 보상).
 *
 * 난이도·횟수·보상 설정은 이 모듈 폴더가 소유한다. 최고 층 랭킹은 학습형 탐험과 맞지 않아
 * 교사 화면에서 사용하지 않으며 기존 기록만 호환용으로 보존한다.
 * 학생 노출 여부의 기준은 enabled_modules이며, 기존 vocab_tower_enabled는 미설정 학급의
 * 초기값 및 구버전 롤백 호환용으로만 읽고 모듈 토글 저장 시 함께 동기화한다.
 */
export const vocabTowerManifest = {
  id: 'vocab-tower',
  name: '어휘의 탑',
  description: '틀린 낱말을 다시 배우며 오르는 어휘 탐험',
  icon: '🏰',
  part: 'game',
  audience: 'both',
  defaultEnabled: false,
  // enabled_modules가 아직 NULL인 학급의 기존 상태 및 롤백 호환용 미러 컬럼.
  legacyFlag: 'vocab_tower_enabled',
  studentEntry: () => import('./StudentEntry'),
  teacherEntry: () => import('./TeacherManager'),
  playground: {
    name: '어휘의 탑',
    description: '방을 통과하고 능력을 골라 낱말 익히기',
    background: 'linear-gradient(135deg, #E3F2FD 0%, #F1F8FF 100%)',
    borderColor: '#BBDEFB',
    order: 20,
    entryMode: 'standard'
  },
  management: {
    title: '어휘의 탑 관리',
    subtitle: '오답 복습이 이어지는 선택형 어휘 탐험',
    order: 20,
    activeColor: '#2E7D32',
    ownsCard: true,
    headerBackground: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)'
  }
};

export default vocabTowerManifest;
