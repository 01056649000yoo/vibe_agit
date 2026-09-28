# 세션 활성 컨텍스트

> ⚙️ **생성 파일이다 — 직접 고치지 않는다.** 규칙은 [docs/wiki/SESSION_RULES.md](docs/wiki/SESSION_RULES.md) 를 고치고
> `npm run context:build` 를 돌린다. 지금 상태는 ROADMAP `현재 위치`·WORKLOG 최신 항목에서 뽑는다.
> 세션 시작 훅(Claude·Codex)이 이 파일을 주입한다. 훅이 없는 도구(Kiro 등)는 시작할 때 이 파일부터 읽는다.

## 시작 순서

0. [docs/wiki/PITFALLS.md](docs/wiki/PITFALLS.md) 를 훑는다 — 되풀이하지 말 것 한 장. 사고를 겪으면 끝에 한 줄 더한다.
1. `git log --oneline -20`·`git branch -a` 로 다른 모델의 최근 작업과 미병합 브랜치를 본다.
2. 아래 `지금 상태`·`열린 일` 은 요약일 뿐이다. 이어서 할 일은 **실제 코드로 재확인**한 뒤 시작한다.
   열린 일 전체는 [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md), ROADMAP 에서 옮긴 옛 `[ ]` 는 [BACKLOG](docs/roadmap/BACKLOG.md).
3. WORKLOG 는 통째로 읽지 않는다. 필요한 항목만 제목으로 골라 읽고, 옛일은 `grep -n "말" docs/worklog/*.md`.
   무엇을 어디서 찾을지는 [docs/wiki/README.md](docs/wiki/README.md) 라우팅을 따른다.

## 절대 규칙 요약

- 비밀 값은 코드·문서·로그에 쓰지 않는다. 위치만 적는다.
- 사용자가 `배포`·`마무리`·`확정` 을 말하기 전에는 로컬 반복 수정만 한다. `동기화` 는 `[skip ci]` 커밋·푸시만.
- **한 곳만 고치고 끝내지 않는다** — 같은 값을 여러 곳에서 쓰면 원본을 하나로 모으고, 못 모으면 그 곳들을
  한꺼번에 보는 검사 하나를 만든다. 고치기 전에 부르는 곳을 세고 `npm run checklist` 로 대조한다.
- 기능을 바꾸면 [FEATURE_MAP.md](FEATURE_MAP.md) 그 줄과 변경 기록(v1.x), 도움말·활용 안내서를 같은 커밋에서 맞춘다.
- 코어 글쓰기 셸은 모듈·슬롯으로만 확장한다. 연구소 코드는 이식하지 않고 RPC 데이터만 잇는다. 삭제보다 모듈화·기본 OFF.
- 학급 글 조회·학생 홈 RPC·포인트·DB·인증·외부 API 는 각각 PERFORMANCE/SECURITY_HARNESS 계약을 먼저 본다.
- 새 판(`_v2`)을 만들면 옛 판을 같은 마이그레이션에서 지운다. 함수는 마이그레이션으로만 만든다.
- 설명 아이콘은 `GuideInfoButton`, 교사 메뉴 안내는 `TeacherGuideButton`·`teacherGuides.js`.
- **UI를 다듬을 땐 값을 화면에서 직접 적지 않는다** — `src/styles/design-system.css` 의 `--ui-*` 토큰,
  글자는 `--ui-text-xs~3xl` 일곱 단계(바닥 0.8rem), 부품은 `components/common` 먼저.
  상세는 [docs/wiki/DESIGN_GUIDE.md](docs/wiki/DESIGN_GUIDE.md).
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

## 지금 상태 — ROADMAP `현재 위치` 위 6개 (자세한 것은 [ROADMAP.md](ROADMAP.md))

- [x] **앱 전체 점검과 상시 검사 보강** (2026-09-28, v1.13.1~v1.13.2). 린트 경고 0(경고도 막음), 브라우저 공개 RPC 전수 권한 호출,
- [x] **동행 모드 효과 분석 → 첫 글쓰기 수업 순서 바꿈** (2026-09-27, v1.13). 첫 주 학생 등록 40% → 67%(명단 붙여넣기와 섞임), 첫 학생 글은 19% → 20% 그대로.
- [x] **확장 지점 등록 검사·평일 부하 장부·모듈 뼈대 도구** (2026-09-27). `npm run new:module` 로 새 모듈을 시작한다(ARCHITECTURE).
- [x] **승인된 글의 처음 글 → 고친 글 형광펜 비교** (2026-09-26, v1.9). 비교 화면 여섯 곳 공통 부품 `WritingChangeHighlight`
- [ ] **학생 글쓰기 성장 리포트 — 보류** (2026-09-26). 글이 적어(1학기 학생 74%가 3편 이하) 그래프·능력치가 성립하지 않아 보류하고
- [x] **교사 화면 정돈 — 제목·왼쪽 메뉴·배지 통일, 모두의 아지트 자리 옮김** (2026-09-26, v1.8).

## 열린 일 — 결정·운영 10건 (전체는 [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md), 작업 전에 관련 행을 본다)

- OI-001 결정 · `auto_approval`(구글 계정이면 곧바로 승인 교사) 유지 여부. 익명 경로는 `20261355` 로 막혔다
- OI-004 운영 · 🔴 `~/.config/rclone/rclone.conf` 사본을 맥미니 밖(비밀번호 관리자)에 보관 — 없으면 Drive 백업을 못 연다
- OI-005 운영 · 맥미니 없이 새 기계에서 전체 복구 리허설 — **2026-27 겨울방학**
- OI-006 운영 · macOS 업데이트로 재부팅되면 로그인 전까지 백업·서비스가 멈춘다 — 자동 로그인 또는 업데이트 시간 조정 검토
- OI-008 결정 · 모두의 아지트 정식 공개 전환 — 인수 점검 6항목은 2026-09-25 통과(`public_beta`). 정식으로 바꿀 때 메뉴의 `Beta` 떼고 FEATURE_MAP 상태 바꾸기
- OI-012 결정 · 작가 칭호 급간 조정(Lv7→8 간격이 Lv8→9 보다 큼) — 한 학기 사용량을 보고 **방학 중에** `writerLevels.js` 한 곳에서
- OI-013 결정 · 연구소 옛 방 `expires_at` — 기한 개념은 없앴는데 학생 목록 RPC 는 만료된 옛 방을 거른다. 다시 보일지(재확인 전)
- OI-016 운영 · 맥미니 전체 장애 때 점검 안내 이중화(Cloudflare Worker → Caddy 원본 우선안) — 겨울방학
- OI-017 결정 · 학생 글쓰기 성장 리포트 — 보류. 다음 학기 학생당 글 수를 보고 다시 판단
- OI-020 운영 · Codex 에서 `/hooks` 를 열어 바뀐 세션 시작 훅을 한 번 다시 신뢰(주석이 바뀌어 해시가 달라졌다)

## 최근 작업 5건 — 제목과 남은 것 (자세한 것은 [WORKLOG.md](WORKLOG.md) 에서 골라 읽는다)

- 2026-09-29 — 실기 점검표 12~19절 자동 사전 점검 (Kiro, 읽기 전용)
  - 남은 것: OI-018(점검표 1-2절 6줄 — 실제 폰·카카오톡·두 반 댓글·프로젝터 확대·새 교사 계정으로만 확인).
- 2026-09-29 — 단축 단추에 급식판을 고정하면 곧바로 전체화면(v1.14.1) (Kiro)
  - 남은 것: OI-018(실기 점검표 14절에 한 줄 더함).
- 2026-09-28 — 머리말 단축 단추에 학급운영도구 고정(v1.14) + 실기 점검표 9월 기능 반영 (Kiro)
  - 남은 것: OI-018(점검표 1-2절부터 실기 점검). 다른 도구를 고정한 뒤 동행 모드를 다시 보면 안내 문구(`우리 반 스크린`)와 단추 이름이 다르다 — 처음 값에서는 같다.
- 2026-09-28 — 작업 기억 정리: 열린 일 한 곳·ROADMAP 857줄·SESSION_CONTEXT 생성·마감 한 명령 (Kiro)
  - 남은 것: OI-019(BACKLOG 재확인), OI-020(Codex `/hooks` 재신뢰). 푸시 전 훅 변경은 기기마다 `npm run hooks:install`.
- 2026-09-28 — 점검 후속: 보안 구멍·알림 잔존·폰 하단 메뉴 고침, 스모크 174개·화면 스모크 80개 상시 검사로 (Kiro)
