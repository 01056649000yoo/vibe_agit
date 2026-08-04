# AGENTS.md — 끄적끄적 아지트 작업 지침 (모델 공통)

이 저장소는 **여러 AI 모델(Claude, GPT/Codex 등)이 번갈아 작업**한다.
모델이 바뀌어도 맥락이 끊기지 않도록 아래 규칙을 반드시 지킨다. (Claude는 `CLAUDE.md`가 이 파일을 가리킨다.)

## 세션 시작 시 (필수)
1. **`ROADMAP.md`** 를 먼저 읽는다 — 비전, "현재 위치", 진행할 스테이지, 대원칙, 결정 기록.
2. **`WORKLOG.md`** 상단 몇 항목을 읽는다 — 직전까지 무엇을 왜 했는지, 무엇이 남았는지.
3. 이관/인프라 상세가 필요하면 **`INTEGRATION_PLAN.md`**.
4. **백업·복구를 건드릴 일이면 [`backup.md`](backup.md)** — 무엇이 언제 어디로 가는지, 복구 절차,
   매월 1일 자동 리허설. 백업 설정을 바꾸면 그 파일도 함께 고친다.

## 작업 후 (필수)
1. **`WORKLOG.md` 맨 위에 항목 추가** (형식은 그 파일 상단 규칙 참조). 최신이 위.
2. **`ROADMAP.md` 갱신**: 완료 체크박스 `[x]`, 방향이 바뀌면 "결정 기록"에 한 줄.
3. **git 밖 변경도 WORKLOG에 기록** — 맥미니 인프라(도커·Caddy·DNS·`~/agit-supabase/`)는 커밋에 안 남으므로.
4. 커밋은 작게, 의미 단위로. 변경 후 빌드·핵심 흐름 검증.

## 절대 규칙
- **비밀 값을 문서·코드·로그에 쓰지 않는다** (DB 비번, API 키, OAuth 시크릿). 위치만 참조.
  - 아지트 앱 시크릿: `~/agit-supabase/secrets.agit.env` (git 밖, gitignore 대상). 프론트 빌드 인자는 공개 anon 키만.
- **코어 셸(글쓰기 파이프라인)은 함부로 수정하지 않는다** — 확장은 모듈/슬롯으로만 (ROADMAP 대원칙 4).
- **연구소 코드를 아지트로 이식하지 않는다** — 데이터(RPC) 연동만 (대원칙 5).
- 기능은 삭제보다 **모듈화 + 기본 OFF** 우선 (되돌릴 수 있게, 대원칙 3).
- **학급 글 조회는 정해진 방식으로만 쓴다** — 새 글쓰기 콘텐츠를 붙일 때도 똑같이.
  요약: ①학급은 그 테이블의 `class_id` 로 **직접** 좁힌다(조인한 테이블의 `class_id` 경유 금지)
  ②학급이 있는 테이블끼리 조인하면 조인 조건에도 `class_id` 를 넣는다
  ③`(class_id, 정렬열 DESC)` 인덱스를 두고 항상 상한(`limit`/페이지)을 건다
  ④캐시는 `src/lib/cache.js` 의 `dataCache` + `classKey()` 로만 만든다.
  **전체 규칙·측정치·이유는 [WORKLOG.md](WORKLOG.md) 의 `학급 글 조회 기준 (2026-07-28 확정)` 항목을 읽을 것.**

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

### 평가·평어
- 성취기준은 **2022 개정 국어과만** 사용하고 `3~4학년군 / 5~6학년군`으로 적용한다.
- 새 설정은 `evaluation_rubric.curriculum.grade_band`에 저장한다. 기존 `curriculum.grade`는 읽기 호환을 유지한다.
- 글쓰기를 독립 교과처럼 평가하지 않는다. 실제 평가 결과·교사 의견과 교사가 고른 국어 성취기준으로
  기존 국어 평어의 앞뒤에 붙일 짧은 문장만 생성한다.

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
- 프론트 빌드: `npm run build` (Vite). 프로덕션 이미지: 레포 `Dockerfile`(build-arg로 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 주입).
- 로컬에서 실도메인 테스트: `/etc/hosts`에 apex·api를 `127.0.0.1`로 매핑(NAT 루프백 우회). 테스트 후 제거.
