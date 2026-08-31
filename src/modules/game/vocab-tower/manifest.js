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
import { VOCAB_TOWER_STUDENT_GUIDE } from './towerGuide';

export const vocabTowerManifest = {
  id: 'vocab-tower',
  name: '어휘의 탑',
  description: '틀린 낱말을 다시 배우며 오르는 어휘 탐험',
  icon: '🏰',
  part: 'game',
  audience: 'both',
  defaultEnabled: false,
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100 },
  // enabled_modules가 아직 NULL인 학급의 기존 상태 및 롤백 호환용 미러 컬럼.
  legacyFlag: 'vocab_tower_enabled',
  studentRecommendation: {
    icon: '🏰', title: '어휘의 탑에 올라가 봐',
    message: '낱말을 여러 번 정확히 익히면 층을 열고 포인트도 모을 수 있어.',
    ctaLabel: '어휘의 탑 가보기', order: 20,
    action: { type: 'module', moduleId: 'vocab-tower' }
  },
  studentEntry: () => import('./StudentEntry'),
  teacherEntry: () => import('./TeacherManager'),
  playground: {
    name: '어휘의 탑',
    description: '낱말 문제에 도전하고 포인트 모으기',
    background: 'linear-gradient(135deg, #E3F2FD 0%, #F1F8FF 100%)',
    borderColor: '#BBDEFB',
    economy: 'earn',
    pointLabel: '포인트 얻기',
    ctaLabel: '도전하기',
    order: 20,
    entryMode: 'standard',
    // 놀이터 카드에서 바로 열 수 있는 학생 안내. 다른 게임 모듈도 같은 자리에 두면 버튼이 붙는다.
    guide: VOCAB_TOWER_STUDENT_GUIDE
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
