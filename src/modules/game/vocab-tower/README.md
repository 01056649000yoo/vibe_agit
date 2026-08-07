# 어휘의 탑

포인트 동기부여용 학년별 어휘 퀴즈 모듈이다. `manifest.js`가 교사·학생 진입을 등록하고,
`TeacherManager.jsx`가 학급 설정·현재 랭킹·지난 시즌을, `StudentEntry.jsx`가 학생 진입 시 설정 조회를 소유한다.

- 노출: `classes.enabled_modules`의 `vocab-tower`
- 설정: `classes.vocab_tower_*`
- 기록: `vocab_tower_rankings`, `vocab_tower_history`
- 보상: `reward_for_vocab_tower` RPC
- 조회는 항상 모듈을 연 학급의 `class_id`로 직접 제한하고 반환 상한을 둔다.

학생 전용 하드코딩을 `StudentDashboard`에 추가하지 말고, 새 설정·기록도 이 폴더 안에서 연결한다.
