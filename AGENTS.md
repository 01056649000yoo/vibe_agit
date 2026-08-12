# AGENTS.md — 끄적끄적 아지트 작업 지침 (모델 공통)

이 저장소는 **여러 AI 모델(Claude, GPT/Codex 등)이 번갈아 작업**한다.
모델이 바뀌어도 맥락이 끊기지 않도록 아래 규칙을 반드시 지킨다. (Claude는 `CLAUDE.md`가 이 파일을 가리킨다.)

## 문서 지도 — 뭐가 어디 있는지

| 문서 | 뭐가 있나 |
|---|---|
| **AGENTS.md**(이 파일) | 어떻게 작업할지 — 읽는 순서, 절대 규칙, 운영 함정, 검증 명령 |
| **[ROADMAP.md](ROADMAP.md)** | 앞으로 할 일만 — 현재 위치, 스테이지별 계획, 결정 기록. 지난 작업 서술은 없다 |
| **[WORKLOG.md](WORKLOG.md)** | 날짜별 작업 이력 — "언제 무엇을 왜 했는지"는 전부 여기 |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | 이 시스템이 왜 이렇게 생겼는지 — 목표 아키텍처, 핵심 설계 불변식, 맥미니 인프라 상식 |
| **[PERFORMANCE_HARNESS.md](PERFORMANCE_HARNESS.md)** | 성능 설계 원칙·1,000명 합격선·측정 기록표 |
| **[SECURITY_HARNESS.md](SECURITY_HARNESS.md)** | 보안 설계 원칙·검사 명령 |
| **[INTEGRATION_PLAN.md](INTEGRATION_PLAN.md)** | 맥미니 이관(Stage 1)의 상세 절차·검증 사실 |
| **[backup.md](backup.md)** | 백업·복구 절차, 매월 1일 자동 리허설 |
| **[MANUAL_ACCEPTANCE_CHECKLIST.md](MANUAL_ACCEPTANCE_CHECKLIST.md)** | 브라우저 없이는 확인 못 하는 실기기 인수 검사표 |

## 세션 시작 시 (필수)
1. **`git log --oneline -20`와 `git branch -a`를 먼저 본다.** 이 저장소는 다른 모델(Claude/GPT)이 세션
   사이에 독립적으로 작업할 수 있다 — 실제로 한쪽이 대규모 작업을 별도 브랜치에 해뒀는데 다른 쪽이 한참
   뒤에야 발견한 적이 있다. 병합 안 된 브랜치, 낯선 최근 커밋이 있으면 먼저 파악하고 시작한다.
2. **`ROADMAP.md`** 를 읽는다 — 비전, "현재 위치", 진행할 스테이지, 대원칙, 결정 기록.
   **단, "다음 할 일" 메모는 실행 전에 실제 코드로 재확인한다.** 다른 모델이 이미 처리했는데 메모만
   안 지워진 경우가 실제로 여러 번 있었다(성능 최적화 항목 4개 연속으로 이미 끝나 있었음).
3. **`WORKLOG.md`** 상단 몇 항목을 읽는다 — 직전까지 무엇을 왜 했는지, 무엇이 남았는지.
4. 시스템이 어떻게 생겼는지 궁금하면 **`ARCHITECTURE.md`**, 이관/인프라 상세가 필요하면 **`INTEGRATION_PLAN.md`**.
5. **백업·복구를 건드릴 일이면 [`backup.md`](backup.md)** — 무엇이 언제 어디로 가는지, 복구 절차,
   매월 1일 자동 리허설. 백업 설정을 바꾸면 그 파일도 함께 고친다.

> **Codex 자동 주입**: `.codex/hooks.json`의 `SessionStart` 훅은 `startup`·`resume`·`clear`·`compact` 때마다
> 짧은 [`SESSION_CONTEXT.md`](SESSION_CONTEXT.md)만 developer context에 넣는다. 상세 규칙과 이력은
> [`docs/wiki/README.md`](docs/wiki/README.md)의 라우팅을 따라 필요한 원문만 읽는다. `AGENTS.md` 전체와
> WORKLOG 항목을 훅에서 중복 주입하지 않는다. 훅이 새로 생겼거나 내용이 바뀌었으면 Codex에서 `/hooks`를 열어
> 현재 해시를 한 번 신뢰해야 한다.

## 작업 후 (필수)
1. **`WORKLOG.md` 맨 위에 항목 추가** (형식은 그 파일 상단 규칙 참조). 최신이 위.
2. **`ROADMAP.md` 갱신**: 완료 체크박스 `[x]`, 방향이 바뀌면 "결정 기록"에 한 줄.
3. **git 밖 변경도 WORKLOG에 기록** — 맥미니 인프라(도커·Caddy·DNS·`~/agit-supabase/`)는 커밋에 안 남으므로.
4. 커밋은 작게, 의미 단위로. 변경 후 빌드·핵심 흐름 검증.

## 절대 규칙
- **비밀 값을 문서·코드·로그에 쓰지 않는다** (DB 비번, API 키, OAuth 시크릿). 위치만 참조.
  - 아지트 앱 시크릿: `~/agit-supabase/secrets.agit.env` (git 밖, gitignore 대상). 프론트 빌드에는 공개 anon 키와
    공개 Google OAuth 클라이언트 ID만 주입하며, OAuth 시크릿은 절대 넣지 않는다.
- **코어 셸(글쓰기 파이프라인)은 함부로 수정하지 않는다** — 확장은 모듈/슬롯으로만 (ROADMAP 대원칙 4).
- **연구소 코드를 아지트로 이식하지 않는다** — 데이터(RPC) 연동만 (대원칙 5).
- 기능은 삭제보다 **모듈화 + 기본 OFF** 우선 (되돌릴 수 있게, 대원칙 3).
- 화면에 사용법·도움말 같은 설명을 덧붙이는 정보 아이콘은 `src/components/common/GuideInfoButton.jsx`를
  반드시 사용한다. `ⓘ`·`!`·`?` 문자를 직접 버튼으로 만들거나 화면별 아이콘 버튼을 새로 만들지 않는다.
  교사 메뉴별 사용법은 이 버튼을 포함한 `TeacherGuideButton`과 `constants/teacherGuides.js`를 사용한다.
- **학급 글 조회는 정해진 방식으로만 쓴다** — 새 글쓰기 콘텐츠를 붙일 때도 똑같이.
  요약: ①학급은 그 테이블의 `class_id` 로 **직접** 좁힌다(조인한 테이블의 `class_id` 경유 금지)
  ②학급이 있는 테이블끼리 조인하면 조인 조건에도 `class_id` 를 넣는다
  ③`(class_id, 정렬열 DESC)` 인덱스를 두고 항상 상한(`limit`/페이지)을 건다
  ④캐시는 `src/lib/cache.js` 의 `dataCache` + `classKey()` 로만 만든다.
  **전체 규칙·측정치·이유는 [WORKLOG.md](WORKLOG.md) 의 `학급 글 조회 기준 (2026-07-28 확정)` 항목을 읽을 것.**

## 운영 함정 모음 (실제로 겪은 것들)

- **`docker-compose.yml`은 `docker-compose.pg17.yml` + `docker-compose.agit.yml`과 항상 같이 써야 한다.**
  `~/agit-supabase/.env`에 `COMPOSE_FILE=docker-compose.yml:docker-compose.pg17.yml:docker-compose.agit.yml`이
  걸려 있어 `-f` 없이 `docker compose up -d`만 써도 되지만, 이 설정을 지우거나 다른 방식(예: 컨테이너 개별
  `docker restart`)으로 재기동하면 `secrets.agit.env` 연결이 빠져 함수 시크릿이 통째로 누락될 수 있다.
  실제로 `ADMIN_MODE_PASSWORD`가 이렇게 빠져 관리자 로그인이 안 됐던 적이 있다. 상세는 `ARCHITECTURE.md`.
- **`git add -A -- <경로1> <경로2> ...`에서 경로 하나라도 안 맞으면 명령 전체가 조용히 실패한다.**
  이미 `git rm`으로 스테이징된 경로를 같은 `-A --` 목록에 다시 넣으면 "did not match any files" 에러로
  전체가 실패하는데, 다른 파일들은 스테이징된 것처럼 착각하기 쉽다. 커밋 전 `git status -s`의 **앞 칸**
  (스테이징 여부)과 **뒤 칸**(작업트리 수정 여부)을 반드시 구분해서 본다 — `M ` 은 스테이징됨, ` M` 은
  안 됨. 실제로 이 실수로 커밋 하나에서 파일 6개가 빠진 적이 있다(다행히 빌드 테스트 게이트가 잡아줬다).
- **`agit-db`(아지트) vs `supabase-db`(다른 앱 Jarvis)** — 이름이 비슷해 실제로 헷갈렸다. 자세한 건 아래.

## 현재 운영 구조 (2026-07-24 컷오버 후)
- 본 서비스: 맥미니. 앱=Docker `agit-app`(127.0.0.1:8300) ← 호스트 Caddy(`/etc/caddy/Caddyfile`) 프록시.
- DB/인증/함수: 새 통합 스택 `~/agit-supabase/` (compose project `agit`, PG17, Kong 8100 / DB 5433).
- 도메인: `끄적끄적아지트.site`(apex, 앱) / `api.…`(Supabase Kong) / `helper.…`(연구소, 별도 구 스택) — 가비아 네임서버.
- 구 스택(`supabase-db` PG15.8 + writing-helper)은 연구소용으로 계속 가동. 통합(SSO)은 Stage 2에서.

## 현재 확장 규칙 (2026-07-29 갱신)

### 포인트·놀이 모듈
- 신규 게임은 `src/modules/game/<module-id>/`에 두고 `manifest.js`를 `src/modules/registry.js`에 등록한다.
- 교사 관리는 `teacherEntry`, 학생 놀이터 진입은 `studentEntry`로 연결한다. **`GameManager.jsx`나
  `StudentDashboard.jsx`에 신규 게임 전용 카드·열기 상태·DB 조회를 하드코딩하지 않는다.**
- 공통 셸이 학급 ON/OFF(`classes.enabled_modules`)·카드·지연 로딩·오류 격리를 담당하고, 모듈은 자기 설정·기록·RPC만 소유한다.
- OFF는 학생 노출만 중단하며 기존 데이터는 삭제하지 않는다. 포인트 지급·차감은 권한 검증 RPC를 사용한다.
- 기존 드래곤·어휘의 탑 교사 관리는 `src/modules/game/legacy/LegacyGameManager.jsx`의 운영 호환 영역이다.
  실기기 스모크 전에는 기능을 섣불리 분할하지 말고, 이후 각각의 `teacherEntry`로 옮긴다.
- 상세 계약과 예시는 `src/modules/game/README.md`를 읽는다.

### 1,000명 성능 하네스
- 새 콘텐츠는 등록 매니페스트에 `performance` 성능표를 반드시 작성한다. 홈 요약 여부, 열 때 로드, RPC 쓰기,
  Realtime 사용, 첫 목록 상한(최대 100)을 선언하며 누락하면 `npm run test:architecture`와 Docker 빌드가 실패한다.
- 학생 홈에 새 `supabase.from()`·`supabase.rpc()`를 직접 추가하지 않는다. 코어 요약은
  `get_student_home_bootstrap_v1`, 선택 콘텐츠 상세는 **그 콘텐츠를 실제로 열 때** 전용 RPC로 읽는다.
- 새 콘텐츠는 홈에서 자체 폴링·`postgres_changes` 구독을 시작하지 않는다. 갱신은 공용 bootstrap 무효화,
  화면 복귀 또는 사용자 동작 응답으로 한다. 불가피한 예외는 `PERFORMANCE_HARNESS.md`에 근거와 부하 예산을 기록한다.
- 학생 상시 WebSocket은 두지 않는다. 즉시성이 필요한 기능도 해당 상세 화면을 연 동안만 연결할 수 있으며,
  연결 전 동시 사용자·초당 이벤트·재연결 폭주 예산을 `PERFORMANCE_HARNESS.md`에 먼저 기록한다.
- 학생 데이터 폴링은 60초 미만 금지이며 고정 `setInterval` 대신 공용 지연 정책+무작위 분산을 쓴다.
- 목록 RPC는 학급/학생 직접 범위, 안정 정렬, 페이지 상한을 갖는다. 사용자 동작 1회는 기능 전용 RPC 1회로
  상태 변경을 끝내며 포인트가 있으면 내부 `point_engine_apply()`까지 같은 트랜잭션에서 처리한다.
- 여러 학생용 화면이나 데이터 훅을 고친 뒤 `npm run test:architecture`를 실행한다. Docker 빌드도 이 검사를
  자동 실행하므로 규칙 위반 코드는 운영 이미지가 되지 못한다. 상세 계약은 `PERFORMANCE_HARNESS.md`를 읽는다.
- DB/RPC 변경은 운영 적용 전에 `npm run migrate:check`로 실제 스키마+기능 스모크를 실행하고 전체 롤백을 확인한다.
  학생 홈 읽기 부하는 격리된 시험 학급에서 `npm run load:test:student-home`으로 측정한다.
- **포인트는 `src/modules/points/`의 코어 계약을 쓴다.** 새 콘텐츠 화면에서 `students.total_points`,
  `point_logs`, `increment_student_points`를 직접 쓰거나 호출하지 않는다. 콘텐츠 전용 RPC가 권한·완료 조건을 검증한 뒤
  DB 내부 전용 `point_engine_apply()`를 호출한다. 화면 호출은 `pointApi.js`에 전용 메서드를 추가한다.
- 전용 RPC 한 번 안에서 콘텐츠 상태와 포인트를 함께 처리하고, 재클릭·재시도 중복을 막는 안정적인 `event_key`를 반드시 둔다.
  새 콘텐츠 연결 예시와 활동 유형 추가 절차는 `src/modules/points/README.md`를 읽는다.

### 평가·평어
- 성취기준은 **2022 개정 국어과만** 사용하고 `3~4학년군 / 5~6학년군`으로 적용한다.
- 새 설정은 `evaluation_rubric.curriculum.grade_band`에 저장한다. 기존 `curriculum.grade`는 읽기 호환을 유지한다.
- 글쓰기를 독립 교과처럼 평가하지 않는다. 실제 평가 결과·교사 의견과 교사가 고른 국어 성취기준으로
  기존 국어 평어의 앞뒤에 붙일 짧은 문장만 생성한다.

### 장르형 글쓰기 PDF
- 일반 글 PDF는 공용 양식을 유지한다. `studentEditorEntry`로 별도 학생 입력 틀을 추가하는 장르는 같은 작업에서
  장르 전용 PDF도 반드시 등록한다. 매니페스트에 `usesStructuredContent: true`와 지연 로딩 `pdfExport { id, load }`를
  두고, `load()`가 반환하는 `renderEntry`와 인쇄 `styles`는 해당 장르 폴더가 소유한다.
- 공용 `writingPdfExport.js`에 장르별 분기를 하드코딩하지 않는다. `input_template` 또는 구조화 콘텐츠의
  `template`으로 매니페스트 렌더러를 찾는다. 사진 같은 지연 자산은 장르 렌더러의 수집·로딩 훅으로만 연결한다.
- 12pt 미만 축소 금지, 긴 글의 자연스러운 페이지 넘김, 과거 평문 호환을 지킨다. `tests/genreWritingPdf.test.mjs`에
  계약·구조·호환 회귀 검사를 추가하고 실제 A4 PDF를 렌더링해 확인한다. 상세 계약은
  `src/modules/writing/export/README.md`를 읽는다.

### 장르형 글쓰기 이미지 내보내기
- 사진을 가진 장르는 PDF 자산 로더와 별도로 매니페스트의 지연 `imageExport { id, load }` 계약을 등록한다.
  장르 폴더가 글별 사진 순서·경로·크기 수집과 비공개 서명 URL 로딩을 소유하며, 공용 `useDataExport.js`에
  `report` 같은 장르 이름이나 Storage 경로를 하드코딩하지 않는다.
- Excel은 기존 데이터 열을 유지하고 `내용` 뒤 사진 열에 실제 이미지를 같은 글 행으로 넣는다. Google Docs는
  제목·글쓴이·본문 다음, 해당 글의 마지막에 사진을 원래 순서대로 넣는다. 이미지가 없는 글의 기존 내보내기
  경로는 바꾸지 않는다.
- WebP처럼 Google Docs가 직접 받지 않는 형식은 브라우저에서 JPEG로 변환한다. Drive 임시 파일이 필요하면
  교사의 명시적 내보내기 동작에서만 검색 불가 공개 권한으로 만들고, 문서 삽입 직후 파일 삭제와 실패 시 공개
  권한 삭제까지 시도한다. 사진·서명 URL·Google 토큰은 로그나 DB에 남기지 않는다.
- `tests/writingOfficeImages.test.mjs`에서 실제 XLSX 이미지와 Google Docs 요청 순서·임시 파일 정리를 검증한다.
  외부 Google API origin을 추가했다면 운영 Caddy CSP와 `test:security:static`도 함께 갱신한다. 상세 계약은
  `src/modules/writing/export/README.md`를 읽는다.

### 글 반응 모듈
- 반응 아이콘·문구·유형은 `src/modules/writing/reactions/registry.js`의 프로필에만 등록한다. 학생·친구·알림·교사
  화면에 반응 배열이나 장르별 조건문을 하드코딩하지 않는다.
- 모든 장르 매니페스트는 `reactionProfile`을 명시한다. 전용 반응이 없는 장르는 `standard`, 전용 반응이 있는
  장르는 장르 ID와 같은 프로필을 사용한다. 새 장르 때문에 반응 프로필 DB 조회·폴링·Realtime을 추가하지 않는다.
- 학생 한 명은 글 한 편에 반응 하나만 선택한다. 쓰기는 `toggle_my_post_reaction_v1` RPC 한 번만 사용하고,
  서버가 실제 글의 학급·공개 상태·`input_template`과 허용 반응을 다시 검증한다. `post_reactions` 직접 쓰기는 금지한다.
- 교사 반응 모아보기는 창을 열 때 전용 RPC 한 번으로 최대 100편을 읽는다. 과제 목록이나 학생 홈에 반응·댓글
  본문을 상시 싣지 않는다. 상세 계약은 `src/modules/writing/reactions/README.md`를 읽는다.

### 친구 아지트 공개 글 피드
- `우리 반 새 글 탐색`의 1차 분류는 `전체 새 글 / 선생님 과제 / 자율 글`로 고정한다. 시·보고서·회의처럼
  미션으로 추가되는 장르는 `선생님 과제` 안에서 과제별로 찾고, 장르마다 최상위 탭을 새로 만들지 않는다.
- 독서록·일기 같은 자율 글 모듈은 자기 매니페스트의 `communityFeed`를 선언한다. 친구 아지트에 유형 ID·문구·
  아이콘 배열이나 `self_writing_type` 분기를 하드코딩하지 않는다. 일기는 학생이 `class` 공개한 글만 포함한다.
- 공개 목록은 `get_class_public_writing_feed_v1` 한 번으로 읽는다. RPC는 실제 학생 학급, 제출·공개 상태,
  학급 직접 범위, 최대 50행, 공개 시각+글 ID 커서를 보장한다. 새 유형마다 목록 RPC를 추가하거나 클라이언트에서
  글·작성자·미션·반응을 별도 조회하지 않는다. 상세 계약은 `src/modules/community/friends-hideout/README.md`를 읽는다.

## DB 마이그레이션 (2026-08-04 도구화)
- **적용 여부는 추측하지 말고 물어본다**: `npm run migrate:status` — 아직 적용 안 된 파일만 보여준다(DB를 건드리지 않음).
- **적용**: `npm run migrate` — 안 된 것만 파일명 순서대로 적용하고 `public.applied_migrations` 에 기록한다.
- 붙는 DB는 맥미니의 **`agit-db`** 컨테이너다. **`supabase-db` 는 다른 앱의 DB** — 헷갈리지 말 것.
- 스키마 소유 역할은 **`supabase_admin`** 이다. 마이그레이션 도구도 이를 기본값으로 사용한다(`AGIT_DB_USER`로 변경 가능).
- **운영 적용 전에는 롤백되는 트랜잭션에서 먼저 검증한다**:
  파일의 `BEGIN;`/`COMMIT;` 을 빼고 `BEGIN; … ROLLBACK;` 으로 감싸 돌려 본다.
- 이미 적용된 파일은 **고치지 않는다.** 고쳐야 하면 새 파일을 만든다
  (도구가 내용 변경을 `checksum` 으로 감지해 경고하지만 자동으로 다시 적용하지는 않는다).
- 마이그레이션은 두 번 돌려도 안전하게 쓴다 — `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
  `ON CONFLICT DO NOTHING`.

## 빌드/실행 요령
- 프론트 빌드: `npm run build` (Vite). 프로덕션 이미지: 레포 `Dockerfile`(build-arg로
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_GOOGLE_CLIENT_ID` 주입).
- 로컬에서 실도메인 테스트: `/etc/hosts`에 apex·api를 `127.0.0.1`로 매핑(NAT 루프백 우회). 테스트 후 제거.

## 보안 변경 규칙 (2026-08-08)
- 새 테이블·RPC·Edge 함수·외부 API·브라우저 저장 항목을 추가하면 [`SECURITY_HARNESS.md`](SECURITY_HARNESS.md)를 먼저 확인한다.
- 권한은 DB의 실제 연결·승인 상태로 판정하며 JWT `app_metadata`만 믿지 않는다. 학생은 본인 쓰기, 교사는 담당 학급으로 제한한다.
- AI·메일처럼 비용이나 외부 전송이 있는 기능은 승인 확인·입력 상한·서버 속도 제한이 모두 있어야 한다.
- 작업 후 정적·마이그레이션·핵심 역할 스모크·운영 설정을 묶은 `npm run test:security`를 실행한다.
- 운영 의존성은 `npm audit --omit=dev` 0건을 기준으로 하고, 새 Edge 함수는 운영 허용 목록에 의도적으로 등록한다.

## 커밋 전 검증 치트시트

코드를 고쳤으면 관련 있는 것만 골라 돌린다. 전부 통과해야 커밋한다.

| 언제 | 명령 |
|---|---|
| 항상 | `npm run lint` (0경고·0오류 기준), `npm run build` |
| 학생 홈·목록·쓰기 화면을 고쳤으면 | `npm run test:architecture` — 1,000명 하네스 규칙(폴링·N+1·Realtime 재도입 등) 자동 검사 |
| 보안 관련(RLS·Edge 함수·인증)을 고쳤으면 | `npm run test:security` (정적 검사+`migrate:check`+권한 스모크+운영 설정 검사) |
| 새 SQL 마이그레이션을 만들었으면 | `npm run migrate:check` (ROLLBACK 검증) → 승인 후 `npm run migrate` |
| 관련 기능 단위 테스트 | `npm run test:<영역>` (예: `test:dragon`, `test:points`, `test:reading-log` — `npm run`으로 전체 목록 확인) |
| 학생 홈 부하가 걱정되면 | `npm run load:test:student-home` (격리된 시험 학급 계정으로, 결과는 `PERFORMANCE_HARNESS.md` 측정 기록표에 추가) |
| 맞춤법 규칙을 고쳤으면 | `npm run spelling:check` (오탐 0 기준) |
