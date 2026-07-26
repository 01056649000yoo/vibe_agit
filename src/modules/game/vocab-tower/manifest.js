/**
 * 어휘의 탑 모듈 (Stage 3b)
 *
 * 3대 기둥 중 ③포인트 동기부여에 해당 — 유지 기능.
 * 학생: 학년별 어휘 퀴즈로 탑 오르기(포인트 보상).
 *
 * 참고: 교사 설정(GameManager의 vocab_tower_* 컬럼)과 학급 설정 로딩(useClassAgitClass)은
 * 아직 기존 위치에 있다. Stage 3b 후속에서 교사 설정 이전 + enabled_modules 흡수 예정.
 * (기존 개별 플래그 `classes.vocab_tower_enabled`가 현재 on/off를 담당 → defaultEnabled는 false)
 */
export const vocabTowerManifest = {
  id: 'vocab-tower',
  name: '어휘의 탑',
  description: '어휘 퀴즈로 탑을 오르고 포인트 획득',
  icon: '🏰',
  part: 'game',
  audience: 'student',
  defaultEnabled: false, // 기존 동작 보존: vocab_tower_enabled 기본값이 false
  // 이 모듈은 아직 학급 컬럼 `vocab_tower_enabled`로도 켜고 끈다(교사 설정 화면).
  // 메뉴는 두 설정을 함께 보고 판단한다 — 자세한 내용은 DashboardMenu 참조.
  legacyFlag: 'vocab_tower_enabled',
  studentEntry: () => import('./VocabularyTowerGame'),
};

export default vocabTowerManifest;
