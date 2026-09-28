# 세션 규칙 (SESSION_CONTEXT 의 손으로 쓰는 부분)

> 이 파일을 고치면 `npm run context:build` 로 [SESSION_CONTEXT.md](../../SESSION_CONTEXT.md) 를 다시 만든다.
> SESSION_CONTEXT 는 **직접 고치지 않는다** — 검사가 생성 결과와 다르면 막는다.
> 여기에는 **오래 가는 규칙과 운영 상식만** 둔다. 날짜가 붙은 "지금 상태"는 적지 않는다 — 곧 틀린 말이 된다.
> 지금 상태는 생성기가 ROADMAP `현재 위치`·WORKLOG 최신 항목에서 뽑아 붙인다. 상한 4,500자(검사).

## 시작 순서

0. [docs/wiki/PITFALLS.md](PITFALLS.md) 를 훑는다 — 되풀이하지 말 것 한 장. 사고를 겪으면 끝에 한 줄 더한다.
1. `git log --oneline -20`·`git branch -a` 로 다른 모델의 최근 작업과 미병합 브랜치를 본다.
2. 아래 `지금 상태`·`열린 일` 은 요약일 뿐이다. 이어서 할 일은 **실제 코드로 재확인**한 뒤 시작한다.
   열린 일 전체는 [docs/OPEN_ITEMS.md](../OPEN_ITEMS.md), ROADMAP 에서 옮긴 옛 `[ ]` 는 [BACKLOG](../roadmap/BACKLOG.md).
3. WORKLOG 는 통째로 읽지 않는다. 필요한 항목만 제목으로 골라 읽고, 옛일은 `grep -n "말" docs/worklog/*.md`.
   무엇을 어디서 찾을지는 [docs/wiki/README.md](README.md) 라우팅을 따른다.

## 절대 규칙 요약

- 비밀 값은 코드·문서·로그에 쓰지 않는다. 위치만 적는다.
- 사용자가 `배포`·`마무리`·`확정` 을 말하기 전에는 로컬 반복 수정만 한다. `동기화` 는 `[skip ci]` 커밋·푸시만.
- **한 곳만 고치고 끝내지 않는다** — 같은 값을 여러 곳에서 쓰면 원본을 하나로 모으고, 못 모으면 그 곳들을
  한꺼번에 보는 검사 하나를 만든다. 고치기 전에 부르는 곳을 세고 `npm run checklist` 로 대조한다.
- 기능을 바꾸면 [FEATURE_MAP.md](../../FEATURE_MAP.md) 그 줄과 변경 기록(v1.x), 도움말·활용 안내서를 같은 커밋에서 맞춘다.
- 코어 글쓰기 셸은 모듈·슬롯으로만 확장한다. 연구소 코드는 이식하지 않고 RPC 데이터만 잇는다. 삭제보다 모듈화·기본 OFF.
- 학급 글 조회·학생 홈 RPC·포인트·DB·인증·외부 API 는 각각 PERFORMANCE/SECURITY_HARNESS 계약을 먼저 본다.
- 새 판(`_v2`)을 만들면 옛 판을 같은 마이그레이션에서 지운다. 함수는 마이그레이션으로만 만든다.
- 설명 아이콘은 `GuideInfoButton`, 교사 메뉴 안내는 `TeacherGuideButton`·`teacherGuides.js`.
- **UI를 다듬을 땐 값을 화면에서 직접 적지 않는다** — `src/styles/design-system.css` 의 `--ui-*` 토큰,
  글자는 `--ui-text-xs~3xl` 일곱 단계(바닥 0.8rem), 부품은 `components/common` 먼저.
  상세는 [docs/wiki/DESIGN_GUIDE.md](DESIGN_GUIDE.md).
- 화면을 바꿨으면 배포 전에 실제로 렌더링해 본다(`?dev-lab=`, `npm run test:render`).
- 말은 우리 말로 — `git push` 로 도는 것은 **자동 배포**, 손으로 하는 것은 **로컬 배포**(`npm run deploy:local`).

## 작업 중 도구

- 파일을 고치기 전: `npm run recall -- <파일>` — 최근 커밋·작업 기록·관련 교훈·지키는 검사·열린 일.
- 고치는 중: `npm run test:related` — 바뀐 파일을 지키는 검사만 몇 초 안에. 전체는 푸시 전 검사가 돈다.
- 새 검사를 넣었으면: `npm run verify:guard` — 고치기 전 코드에서 실패하는지(잡는지) 본다.
- 커밋 제목은 `fix(범위): …` 처럼 범위를 쓴다. 고친 일의 WORKLOG `한 일` 에는 `[원인: …]` 하나(회고가 센다).
- 매월 1일 전후: `npm run retro` 로 지난달 회고 초안 → `## 판단` 세 줄만 쓴다.

## 운영 상식 (맥미니)

- 운영 DB 는 `agit-db` 하나. 적용 여부는 추측하지 말고 `npm run migrate:status`. **마이그레이션 → 배포** 순서.
- 통합 스택은 `cd ~/agit-supabase && docker compose up -d`(필수 9개). 시크릿을 바꾸면 `docker restart` 가 아니라
  `up -d --force-recreate --no-deps functions`.
- 맥에서 본 도메인은 공유기 헤어핀 미지원으로 타임아웃이 정상이다. 확인은
  `curl -k --resolve "xn--vz0ba242ncqcba79xhwx.site:443:127.0.0.1" https://xn--vz0ba242ncqcba79xhwx.site/`.
- 도커 VM 디스크가 작다. 배포 전 `npm run preflight:disk`(10GB 미만이면 막힘), 캐시는 `docker system df`.
- 푸시 전 검사는 기기마다 `npm run hooks:install` 한 번. 하루 배포가 열 번을 넘으면 GitHub 429 — 묶어서 민다.
- 학생 상시 Realtime 구독·60초 미만 폴링은 없다. 되살리지 않는다.

## 마감

- `npm run wrap -- --model <모델>` 한 번 — 초안·옛 WORKLOG 옮기기·형식·ROADMAP 옮기기·검사 수·이 파일 재생성·확인표.
- WORKLOG 새 항목은 네 칸·15줄 이하, `남은 것` 은 OPEN_ITEMS ID. ROADMAP 은 완료 체크와 결정 기록만.
