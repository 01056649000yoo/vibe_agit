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

## V2 문항 검수 작업공간

V2 문항은 현재 운영 `vocab_tower_words`와 분리해 준비한다. `vocab_tower_v2_review_decks`와
`vocab_tower_v2_review_items`는 브라우저 직접 권한이 없으며, 실제 `profiles.role='ADMIN'`인 사용자만 아래 RPC로
조회·초기화·수정·상태 변경할 수 있다.

- `admin_get_vocab_tower_v2_review_deck_v1`
- `admin_seed_vocab_tower_v2_review_deck_v1`
- `admin_save_vocab_tower_v2_review_item_v1`
- `admin_set_vocab_tower_v2_review_status_v1`

관리자 `어휘 V2 검수` 화면은 자동 초안과 검수 뜻·예문을 나란히 보여주고, 품사·뜻 번호·난이도·허용 정답과
다섯 문항을 편집한다. 원래 덱 순서는 `item_order`로 보존한다. 항목 저장은 낙관적 버전을 확인하고 덱을
`1차 검수`로 되돌린다. 다섯 문항의 질문·보기·
단일 정답·직접 입력 허용 정답을 서버가 확인한 뒤에만 `교사 확인`, 이어서 `잠금 완료`로 바꿀 수 있다.

잠금은 검수 산출물을 고정할 뿐 학생 출제를 켜지 않는다. V2 게임 어댑터가 별도 구현되기 전에는 이 표를 학생 홈·
현재 출제 RPC·운영 단어표에 연결하지 않는다. 첫 덱의 직접 편집 재생성 원본은
`docs/vocab-tower/data/grade3-deck01-human-review.json`이다. 전체 40개 덱의 관리자용 생성 산출물은
`docs/vocab-tower/data/grade*-deck??-review.json`, 요약은 `v2-review-manifest.json`이며 화면은 선택한 덱 파일만
지연 로딩한다. 첫 직접 검수 덱과 자동 신호가 없는 보조 덱은 `교사 확인`, 신호가 남은 보조 덱은 `1차 검수`로
시작한다. 자동 신호 항목을 우선 확인하고 나머지를 표본 검사한 뒤에만 교사 확인·잠금을 진행한다.

전체 생성 산출물의 운영 검수 DB 반영은 `npm run vocab:review:seed:check`로 실제 스키마에서 전부 실행·검증한 뒤
롤백하고, 승인 후 `npm run vocab:review:seed`로 같은 트랜잭션을 커밋한다. 기존 덱의 교사 수정값은 덮어쓰지 않고
우선순위 메타데이터만 보강한다. 직접 확인한 첫 덱과 자동 신호가 없는 덱은 `교사 확인`, 신호가 남은 덱은
`1차 검수`로 넣는다. 관리자 목록은 `1차 검수` 덱에서 `확인 필요만`을 기본으로 열며 전체 목록으로 전환할 수 있다.
