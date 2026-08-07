# 어휘의 탑

틀린 낱말을 다시 만나며 10층을 오르는 선택형 어휘 탐험 모듈이다. `manifest.js`가 교사·학생 진입을 등록하고,
`TeacherManager.jsx`가 학급별 출제·횟수·시간·보상 설정을, `StudentEntry.jsx`가 학생 진입 시 설정 조회를 소유한다.

- 노출: `classes.enabled_modules`의 `vocab-tower`
- 설정: `classes.vocab_tower_*`
- 진행 기록: `vocab_tower_runs`, `vocab_tower_answers`
- 보존 기록: `vocab_tower_rankings`, `vocab_tower_history`(현재 교사 화면에서는 사용하지 않음)
- 출제 기준: `vocab_tower_words`(3~6학년 1,573개 낱말)
- 보상 기록: `game_point_grants`의 게임 공용 하루 80P·주 250P 상한
- 학생 RPC: `get_my_vocab_tower_status`, `start_my_vocab_tower_run`,
  `submit_my_vocab_tower_answer`, `finish_my_vocab_tower_run`
- 조회는 항상 모듈을 연 학급의 `class_id`로 직접 제한하고 반환 상한을 둔다.

한 층은 뜻·문장·구별의 방 세 개로 구성하며 5층·10층 마지막 방은 복습 보스가 된다. 층을 통과하면
시간 추가·보기 제거·첫 글자·정답 경험치·오답 경험치 중 하나를 고른다. 틀려도 경험치를 빼지 않고,
틀린 낱말은 보스에서 다시 맞혀 `새로 익힌 낱말`로 기록한다.

도전 횟수·문제별 결과·보상·최고 기록은 서버가 저장하고 계산한다. 구버전의 클라이언트 지정 보상 RPC와
임의 층수 갱신 RPC는 학생에게 열지 않는다. 학생 전용 하드코딩을 `StudentDashboard`에 추가하지 말고,
새 설정·기록도 이 폴더 안에서 연결한다.

교사 화면은 최고 층 경쟁 대신 현재 탐험 구조와 학급별 설정을 설명한다. 설정 저장은 진행 중인 판을 바꾸지 않고
새 탐험부터 적용하며, 오늘 기회 초기화는 별도 확인 동작으로 분리한다. 기존 랭킹·시즌 데이터는 삭제하지 않는다.
