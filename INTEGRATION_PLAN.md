# 끄적끄적 아지트 × 아지트 연구소 통합 작업 계획 (2026 여름방학)

> 이 문서는 2026-06 Claude 세션에서 분석·합의된 내용의 전체 기록이다.
> 새 세션에서 작업을 이어갈 때 이 문서를 먼저 읽으면 배경 설명 없이 바로 시작할 수 있다.
> **2026-08-13 현재** Stage 1 컷오버는 끝났고 앱은 맥미니 Docker+Caddy에서만 운영한다.
> 아래 Vercel 언급은 이관 전 상태와 당시 롤백 계획을 설명하는 과거 기록이며 현재 운영 절차가 아니다.

## 1. 목표

- 끄적끄적 아지트 로그인 **하나**로 교사·학생이 아지트와 연구소를 모두 사용 (SSO)
- 호스팅을 **맥미니 Docker**로, DB를 **로컬 Supabase 하나**로 통합 (비용 0원, 자가 유지보수)
- 여름방학을 "업데이트 기간"으로 공지하고 작업, 테스트 후 URL(DNS) 전환

## 1.5 2026-08-13 Stage 2 착수 점검

- 아지트 `main`은 `origin/main`과 동기화됐다. 연구소 `main`도 원격과 같지만 추적 파일 15개와 미추적 경로
  5개에 운영 이미지에 포함된 기존 작업이 남아 있다. 연구소 운영 컨테이너는 커밋 표기가 `local`이고 이 미커밋
  코드의 `target_sentence_index` 조회를 포함하지만 구·신 DB 모두 해당 컬럼이 없다. **통합 코드를 얹기 전에
  이 작업을 별도 브랜치에서 검증·기준 커밋하고 소스·운영 이미지·DB 마이그레이션을 일치시킨다.**
- 연구소 Actions는 호스트 `.env.local`을 체크아웃에 복사하고 Dockerfile은 전체 문맥을 builder에 넣지만
  `.dockerignore`에는 `.env*`가 없다. 현재 최종 이미지에서는 서비스 키와 `.env` 파일이 검출되지 않았으나,
  새 통합 DB로 전환하기 전에 `.env*`를 문맥에서 제외하고 `NEXT_PUBLIC_*`만 공개 build arg로, 서비스 키는
  런타임 `env_file`로만 주입한다.
- 구 스택과 새 통합 스택의 `writing_helper`는 아지트 매핑 열을 제외하면 컬럼 249개·함수 3개·RLS 정책
  21개·인덱스 73개의 지문이 같다. 유지하기로 한 두 교사의 방·세션·학급·질문 카드 자료 지문도 같으므로
  현재는 추가 데이터 복사가 필요 없다. 컷오버 직전에 같은 지문을 다시 비교하고 달라진 보존 대상 행만 옮긴다.
  다른 14개 연구소 교사와 그 자료를 새 DB에 전체 덮어쓰기 하지 않는다.
- 새 DB의 확정 매핑은 학급 2개, 학생 27/29명이다. 매핑 학급의 과거 세션 252건 중 현재 명단으로 확정되는
  것은 234건이고 18건은 이름·번호 모두 일치하지 않는다. `student_sessions.agit_student_id`를 추가해 확정분만
  backfill하고 불확실한 과거 세션은 자동 추정하지 않는다.
- 개요짜기는 현재 AI 큐에 새 작업을 넣지 않고 학생이 작성한 `student_sessions.answers`를 완료 결과로 쓴다.
  `outline_queue.result`는 과거 결과 호환용이다. 표준 결과는 활동 매니페스트가 버전 있는 본문 조각 형태로 저장하고,
  공용 RPC는 그 값만 읽게 해 신규 활동마다 RPC의 활동별 분기를 늘리지 않는다.
- 1차 통합 허용 활동은 `outline_builder`(글 개요짜기)·`question_generator`(질문 만들기)·
  `question_voting`(좋은 질문 고르기)·`one_line_share`(한줄모아)·`hanja_writing`(한자 활용 문장 만들기)
  5종으로 고정한다. `word_game`과 과학·도덕 별도 활동은 신규 생성·통합 결과에서 숨기고 기존 데이터는 보존한다.
  학생 불러오기에는 본인 개요·만든 질문·직접 고른 질문·한 줄·한자 문장만 제공하고 학급 전체 순위와 반응 집계는
  개인 결과에서 분리한다.
- 2026-08-13 정리 브랜치 `agent/lab-five-activity-cleanup`에서 기존 작업을 안전 커밋으로 보존한 뒤 5종 외
  실행 코드와 옛 큐·배포 API를 제거했다. 다섯 활동에는 `integration { schemaVersion: 1, resultKind }` 계약을
  등록했고, 과거 DB 테이블·자료는 그대로 뒀다. Docker 비밀값 분리와 Actions 검증도 보강했으며 한자 반응
  마이그레이션은 구·신 DB 양쪽에서 ROLLBACK 검증했다. 아직 `main` 병합·운영 배포·DB 실제 적용은 하지 않았다.
- 실행 순서는 **연구소 기준 정합화 → 새 DB·`/lab` 병행 컨테이너 → 교사 쿠키 SSO → 학생 실제 DB 연결 자동
  입장 → 표준 결과 RPC → Stage 4b 불러오기 UI**다. 기존 `helper.` 서비스는 컷오버 전까지 롤백 경로로 유지하고,
  전환 뒤에는 기존 QR·단축링크를 `https://끄적끄적아지트.site/lab/*`로 영구 리다이렉트한다.

## 1.6 2026-08-13 `/lab` 병행 검증 결과

- 연구소에 빌드 시 고정되는 `NEXT_PUBLIC_BASE_PATH=/lab` 계약과 경로 보조 함수를 추가했다. 서버 액션·인증
  콜백·확인 링크·QR·단축링크가 `/lab`을 보존하며, Next.js 프록시의 basePath 자동 보존으로 생긴
  `/lab/lab/login` 이중 경로는 실행 검증에서 찾아 바로 수정했다.
- `docker-compose.lab.yml`은 별도 `writing-helper-lab` 프로젝트와 `127.0.0.1:3001`만 사용하고
  `agit_default` 네트워크에서 통합 Kong·아지트 AI 함수로 연결한다. 기존 3000번 `writing-helper-app`과 구 DB는
  롤백용으로 그대로 유지한다. 연구소 `main` 푸시는 이후 두 이미지를 각각 빌드·기동·HTTP 검증한다.
- 통합 환경의 별도 회원가입은 화면과 서버 액션에서 모두 차단했다. 통합 Supabase Auth 허용 목록에는
  `https://끄적끄적아지트.site/lab/**`를 추가하고 Compose로 Auth만 재생성했으며 기존 아지트 응답은 유지됐다.
- 공개 도메인 `/lab/login`·정적 자산·보호 화면 리다이렉트와 기존 아지트 `/`·`helper.` 로그인이 모두 정상이다.
  유승현 자료는 학급 2·방 27·세션 179, 최원진 자료는 학급 1·방 10·세션 86으로 구·신 DB가 동일하다.
- 호스트 Caddy는 검증된 후보 설정으로 무중단 reload해 현재 `/lab` 분기가 동작한다. 다만
  `/etc/caddy/Caddyfile`은 root 소유라 현재 세션에서 영구 파일을 덮지 못했다. 같은 내용의 검증된
  `~/agit-supabase/Caddyfile.proposed`를 `sudo cp`한 뒤 `/etc/caddy/Caddyfile` 기준으로 다시 reload해야
  재부팅 후에도 유지된다.

## 2. 두 앱의 이관 전 상태 (2026-06 기준)

### 끄적끄적 아지트 (vibe_agit — 이 레포)
- Vite + React SPA, **Vercel 호스팅**, **Supabase Cloud** (`public` 스키마)
- 교사: 이메일 로그인 / 학생: **익명 인증 + 8자리 코드** (`bind_student_auth` RPC, `trg_sync_student_metadata` 트리거가 JWT 메타데이터 주입)
- Edge Functions 4개: `vibe-ai`(OpenAI 프록시), `send-feedback`, `set-student-metadata`, `verify-admin-mode`
- Realtime 채널 사용 (미션 수정 알림 등)
- 마이그레이션 15개 (`supabase/migrations/`) — 단, **클라우드 실제 스키마와 드리프트 있음**(4절 참조), 이관 기준으로 쓰지 말 것
- 보안 테스트 스크립트 존재: `security-test-student.js`, `security-test-plan.js`

### 아지트 연구소 (writing-helper — `~/writing-helper`)
- Next.js 16 + TypeScript + Tailwind, **맥미니 Docker 호스팅**, **로컬 Supabase** (`writing_helper` 전용 스키마)
- 교사: `auth.users` + `writing_helper.teacher_profiles` / 학생: 로그인 없이 방(room) 입장 시 번호·이름 입력
- 글쓰기 흐름: `rooms`(글감·질문) → `student_sessions`(답변 jsonb, GPT 개요) — 글쓰기 전 단계(개요) 도구
- GitHub 푸시 → 맥미니 webhook 자동 배포 체계 이미 구축 (`scripts/deploy-webhook-server.mjs`, 포트 4010)
- 공개 도메인: `helper.끄적끄적아지트.site` (punycode `helper.xn--vz0ba242ncqcba79xhwx.site`)
- **사용자가 몇 명 안 됨** → auth 매핑은 수동으로 충분

### 맥미니 서버
- UPS(보조배터리) 연결됨 → 정전 리스크 낮음
- **Supabase 스택 2벌 → 실사용 확정 완료 (2026-06 검증)**:
  - **무접미사 스택(`supabase-db` 등) = 실사용.** `writing_helper` 스키마에 rooms 34건(최신 데이터 존재), auth.users 17명
  - 접미사 스택(`supabase_*_writing-helper`) = CLI 개발용 잔재, `writing_helper.rooms` **0건** → **안전하게 제거 가능**
- **⚠️ 무접미사 스택은 이미 멀티앱 공유 DB다**: `app` 스키마(9개 테이블), `literacy` 스키마(5개 테이블)가 별도 서비스에서 사용 중.
  auth.users 17명도 이들과 공유 → **클라우드 auth.users 이관은 기존 사용자를 건드리지 않는 추가(append) 방식**이어야 하고,
  스택 재시작이 필요한 설정 변경(GoTrue 플래그 등)은 다른 서비스에도 영향 → 야간 작업 권장
- 로컬 GoTrue 검증 결과 (2026-06): JWT 시크릿 **커스텀 사용 중(양호, 교체 불필요)** / 익명 로그인 **현재 false → 활성화 필수** / **SMTP 이미 설정됨**(비밀번호 재설정 메일 로컬에서 동작 가능)
- 기타 컨테이너: jarvis-frontend/caddy, classroom-tools, samlink 등

## 3. 확정된 설계 결정

1. **코드베이스는 합치지 않는다.** 두 앱 유지, 인증·DB·도메인 레벨에서 통합 (Vite SPA ↔ Next.js 병합은 사실상 재작성이라 배제)
2. **한 도메인 + 경로 분리**: `/` → 아지트 SPA, `/lab` → 연구소 (Next.js `basePath: '/lab'`).
   same-origin이므로 세션 저장소가 공유되어 SSO가 자연 성립
3. **로컬 Supabase 하나에 두 스키마 공존** — 충돌 없음 검증 완료 (아래 4절)
4. **Vercel/Supabase Cloud는 컷오버 후 정리.** 전환기에는 안전망으로 유지, 롤백 = DNS 되돌리기
5. 연구소 기존 사용자 UUID 매핑은 **수동** (사용자 소수). 기존 연구소 데이터를 버리고 빈 상태로 시작하는 옵션도 있음 → **방학 시작 시 결정**

## 4. 검증 완료된 사실 (2026-06 코드 조사)

- **테이블 충돌 없음**: 연구소 테이블은 전부 `writing_helper` 스키마, 아지트는 `public`
- 연구소가 `public`에 만든 함수는 `wh_` 접두사 3개뿐 (`wh_vault_upsert_secret`, `wh_vault_get_secret`, `wh_vault_has_secret`) → 아지트 RPC와 이름 충돌 없음
- **Supabase Storage는 양쪽 다 미사용** → 파일 이관 작업 없음 (localStorage 사용 코드와 혼동 주의, 재확인 완료)
- 유일한 공유 테이블 = `auth.users` → 수동 매핑으로 해결
- **⚠️ 아지트 마이그레이션 파일에 심각한 드리프트 존재**: 앱이 사용하는 RPC 24개 중 **13개가 마이그레이션 파일에 없음**
  (클라우드 SQL 에디터에서 직접 생성된 것으로 추정). 누락 목록: `add_student_with_bonus`, `bulk_approve_posts`,
  `delete_student_immediately`, `get_class_activity_stats`, `increment_student_points`, `mark_feedback_as_read`,
  `purge_expired_students`, `reward_for_comment`, `reward_for_idea_submission`, `reward_for_vocab_tower`,
  `spend_student_points`, `teacher_manage_points`, `update_tower_max_floor`
  → **마이그레이션 파일 적용 방식은 불가. 반드시 클라우드에서 전체 스키마 덤프(`pg_dump --schema-only` 또는 `supabase db dump`)를 떠서 이관할 것.** 트리거·뷰·시퀀스도 같은 이유로 덤프 기준
- `vercel.json` 내용: SPA 폴백 리라이트(`/(.*) → /index.html`) + 보안 헤더 5종(X-Frame-Options DENY, HSTS 등)
  → **Caddy 설정에서 동일하게 재현 필요** (`try_files` + `header` 블록)

## 5. 단계별 작업 리스트

### Phase 0 — 사전 준비 (방학 전~1일차)
- [x] **(최우선 관문) 학교 태블릿에서 연구소 도메인 접속 품질 테스트** — 학교에서 정상 접속 확인 (2026-07-24, 기호스팅 중인 연구소로 검증)
- [x] Supabase Cloud 전체 백업 + Vercel 설정 기록 (2026-07-24) — `~/backups/agit-cloud-20260724/`
  (public+auth+storage 덤프 5.4MB, 행수 검증 완료. 상세·복원법은 그 폴더 README 참조)
  ⚠️ 발견: 클라우드 **PG 17.6** vs 로컬 스택 **PG 15.8** → Phase 1 복원 전 로컬 스택 버전 정합 필요.
  접속은 direct host 불가(IPv6 전용), Session pooler `aws-1-ap-northeast-2` 사용
- [x] 맥미니 Supabase 접미사 스택(`supabase_*_writing-helper`) 제거 — 완료 (2026-07-24, 빈 DB 재확인 후 `supabase stop --no-backup`. writing-helper-app이 무접미사 스택 사용 중임을 env로 재확인, 서비스 정상)
- [x] 도메인 계획 확정 (2026-07-24):
  - 본 도메인 `끄적끄적아지트.site` — 컷오버 시 Vercel→맥미니 전환, Caddy `/`→아지트, `/lab/*`→연구소
  - 테스트 `test.끄적끄적아지트.site` — 맥미니 통합 스택 병행 검증용 (본 도메인은 컷오버까지 Vercel 유지)
  - API `api.끄적끄적아지트.site` 신설 → Kong. 기존 `supabase.샘링크.kr`은 전환 기간 병행 유지
  - 기존 `helper.끄적끄적아지트.site` → `/lab/*` 301 리다이렉트 유지 (배포된 QR·단축링크 보존)
- [x] 연구소 기존 데이터 결정 (2026-07-24): **유승현·최원진 두 계정만 UUID 매핑으로 유지, 나머지 데이터·계정은 삭제**

### Phase 1 — DB 통합 (2~3일)

> **구조 확정 (2026-07-24, B안)**: 기존 라이브 스택(PG 15.8)을 제자리 업그레이드하지 않는다.
> **새 PG 17 스택을 별도 포트로 신설**하고 (JWT 시크릿·키 재사용), 거기에 ①클라우드 덤프(아지트)
> ②로컬 덤프(연구소 유지분)를 복원한 뒤, 검증 완료 시 Kong/Caddy 라우팅만 전환한다.
> 기존 스택은 롤백용으로 보존 후 제거 (blue-green — 연구소 무중단, 실패 시 즉시 복귀).

- [x] 새 PG 17 Supabase 스택 신설 (2026-07-24) — `~/agit-supabase/`, compose project `agit`, 포트 Kong 8100 / DB 5433 / pooler 6544, 컨테이너 `agit-*`. **익명 로그인 ON + 속도제한 300/hr**(`docker-compose.agit.yml`). JWT 시크릿·anon/service 키는 기존 스택 값 재사용
- [x] 로컬 기존 스택 `writing_helper`+`writing_helper_internal` 덤프 → 새 스택 복원 (행수 100% 일치 검증)
- [ ] **클라우드 전체 스키마 덤프 기준으로 이관** (마이그레이션 파일 적용 금지 — RPC 13개 누락 드리프트, 4절 참조)
  - `pg_dump --schema-only`(public) + 데이터 덤프 + auth 스키마(교사 비밀번호 해시 보존, 재가입 불필요)
- [ ] **덤프 청소**(클라우드 전용 소유자/롤 구문 제거) → 로컬 복원. 청소·복원을 **반복 실행 가능한 스크립트**로 만들 것 (최종 컷오버 때 재사용)
- [x] **auth 병합**: 클라우드 users 2,896 + identities 429 복원. 연구소 유지 2명은 아지트 계정으로 UUID 매핑(아래)이라 로컬 auth 사용자 append는 불필요
- [ ] GoTrue **익명 로그인 활성화**: `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true` (현재 false 확인됨. 학생 코드 로그인의 생명줄. 스택 재시작 필요 → 야간 작업)
- [ ] GoTrue **익명 로그인 IP당 속도 제한 상향** (`GOTRUE_RATE_LIMIT_ANONYMOUS_USERS`) — 클라우드 기본값(시간당 30회/IP)이
  학교 공용 IP에서 학급 동시 로그인을 차단하던 원인 (2026-07-09 진단, 아래 8절 참조). 학급 규모 고려해 넉넉히(예: 300/hr) 설정
- [ ] JWT 시크릿·키는 **교체 불필요** (로컬 스택이 이미 커스텀 시크릿 사용 중 확인). 아지트 프론트를 로컬 스택의 URL·anon 키로 다시 빌드하면 됨. 아지트 사용자는 인스턴스가 바뀌므로 어차피 재로그인 필요(공지), 연구소·타 서비스 세션은 영향 없음
- [~] Edge Functions 4개 로컬 배포 완료 (2026-07-24): send-feedback/set-student-metadata/verify-admin-mode/vibe-ai를 `~/agit-supabase/volumes/functions/`에 배치, main 라우터 동적 디스패치로 실행 확인(함수 자체 코드까지 도달). AI 개인키는 `profile_secrets`(9/20 교사) 이관 완료. **잔여: 전역 시크릿 2개** — `RESEND_API_KEY`(피드백 메일), `ADMIN_MODE_PASSWORD`(관리자 모드) → `~/agit-supabase/secrets.agit.env`에 채우면 됨. OPENAI 공용키·ALLOWED_ORIGIN은 설정됨
- [x] Realtime publication 확인 (2026-07-24) — 통합 스택 네트워크 별칭·Kong upstream 정합화,
  앱 구독 8개 RLS 테이블 publication 등록, WebSocket 101·supabase-js SUBSCRIBED 검증
- [x] 연구소 UUID 매핑 완료 (2026-07-24): 유승현 `098d553a`→`2f5e2cf5`(01056649000yoo@gmail.com, 방27), 최원진 `4507af34`→`bbf421da`(wonjinchoi0126@gmail.com, 방10). 나머지 13명 연구소 데이터 삭제. `rooms.teacher_id` FK 재생성, 고아 참조 0
- [x] RLS 검증 (2026-07-24): anon으로 students·student_posts 조회 시 **노출 0건**(`Content-Range: */0`), public 19/19 테이블 RLS 활성. 익명 signup 200 확인(학생 로그인 생명줄)

### Phase 2 — 호스팅 구성 (1~2일)
- [x] 아지트 Dockerfile 작성 (2026-07-24) — `Dockerfile`(Vite 빌드 → Caddy 서빙, build-arg로 Supabase URL/키 주입) + `Caddyfile.container`(SPA 폴백·보안헤더 5종·zstd/gzip 압축·해시자산 immutable 캐시). **end-to-end 검증 완료**: 컨테이너 프론트→새 스택 익명로그인 200·bind_student_auth RPC 200
- [~] Caddy 라우팅: `/` → 아지트, `/lab/*` → writing-helper 컨테이너, `api.도메인` → Kong — 런타임 적용·실응답 검증 완료, root 소유 `/etc/caddy/Caddyfile` 영구 반영만 남음
- [x] Caddy에 SPA 폴백과 보안 헤더를 적용하고 현재 운영 설정의 단일 기준으로 확정
- [x] Caddy 압축(zstd/gzip) + 해시 자산 `Cache-Control: immutable` + HTTP/2 적용·실응답 검증
- [x] writing-helper `basePath: '/lab'` 설정 + 내부 링크·리다이렉트 전수 점검, 루트형 기존 빌드 호환과 `/lab` 실행 응답 검증
- [ ] **⚠️ basePath 변경 시 기존 단축링크·QR 깨짐 주의**: 연구소의 `/s/...` 단축링크와 배포된 QR코드가
  기존 `helper.도메인` 경로 기준. 기존 `helper.도메인/*` → 새 `/lab/*` 301 리다이렉트를 Caddy에 유지할 것
- [x] vibe_agit에 GitHub Actions self-hosted 러너 자동 배포 구축 (`main` 푸시 → Docker 빌드·교체·HTTP 검증)
- [x] **테스트 서브도메인으로 병행 운영 후 본 도메인 컷오버 완료**

### Phase 3 — SSO 통합 (3~5일, 개발량 최대)
- [ ] 세션 저장 방식 정렬: 아지트 supabase-js에 **쿠키 storage adapter** 적용 권장 (Next.js SSR까지 세션 인식)
- [ ] 교사: 연구소 첫 진입 시 `teacher_profiles` 자동 생성 (트리거 또는 first-visit upsert)
- [ ] 학생: JWT 메타데이터를 직접 신뢰하지 않고 `public.auth_student_id()`가 검증한 실제
      `students.auth_id=auth.uid()` 연결 → 연구소 방 입장 시 번호·이름 자동 매핑 RPC
- [ ] 아지트 앱 허브의 연구소 링크를 `/lab` 경로로 교체 (기존 링크 커밋: `46be116`)
- [ ] (기반만) **미션↔room 매핑 테이블 설계** — 2학기 글쓰기 연동 기능 대비 (아래 7절)

### Phase 4 — 검증 & 컷오버 (2~3일)
- [ ] 실데이터 리허설: 교사 로그인 → 미션 → `/lab` 이동 → 학생 코드 로그인 → 글쓰기 전 흐름
- [ ] **안드로이드 크롬 태블릿 실기기 테스트** (테스트 서브도메인으로)
- [ ] 컷오버: 점검 공지(1~2시간) → 최종 `pg_dump` → 복원(테스트 기간 클라우드 신규 데이터 반영) → DNS 전환
- [x] 컷오버 당시 DNS 원복 경로를 확보하고 전환 완료
- [x] 안정화 모니터링 후 앱 호스팅을 맥미니 Docker+Caddy로 단일화하고 Vercel 저장소 설정 제거
- [ ] Supabase Cloud 잔여 자원 정리는 앱 호스팅과 분리해 백업·복구 기준에 따라 확인

### Phase 5 — 운영·백업 체계 (1~2일)
- [ ] **야간 자동 백업**: launchd/cron → `pg_dump`(public + writing_helper + auth) → 압축 → **rclone crypt 암호화** → Google Drive 업로드
- [ ] 보관 정책: 14~30일치 유지, 이전 자동 삭제 / 백업 실패 시 알아차릴 수단(알림·로그 루틴)
- [ ] **복구 리허설 1회**: Drive 덤프 → 빈 DB 복원 → 앱 동작 확인, 절차 문서화
- [ ] 정전 후 자동 부팅(macOS 에너지 설정) + 전 컨테이너 `restart: unless-stopped` 확인
- [ ] 업타임 모니터링 (UptimeRobot 등 무료)

## 6. 보안 체크리스트

### 필수 (컷오버 전)
- [ ] 공유기 포트포워딩 **80/443 → Caddy만**. Kong의 `0.0.0.0:8000/8443` 직접 공개 제거, Caddy 뒤로
- [ ] Studio / pg_meta / inbucket / analytics **외부 공개 절대 금지**
- [ ] 관리 접속(Studio, SSH)은 **Tailscale**로만 (무료, 사설망)
- [ ] `service_role` 키: 로컬 스택의 기존 키 사용(신규 발급 불필요 — Phase 1 참조). 프론트·Git에 절대 금지, Edge Functions·서버 env에만
- [ ] RLS 전수 테스트 (Phase 1 항목과 동일)
- [ ] 백업 파일 암호화 (rclone crypt)

### 강력 권장
- [ ] **Cloudflare 무료 프록시**: 집 IP 은닉 + 기본 DDoS 방어 + TLS. Realtime 웹소켓도 무료 플랜 지원
- [ ] 공유기: UPnP 끄기, 관리자 비밀번호 변경, 펌웨어 업데이트
- [ ] SSH 키 인증만 (Tailscale 쓰면 SSH 외부 노출 자체가 불필요)
- [ ] FileVault는 **끔** — 켜면 정전 후 무인 재부팅 불가 (가용성 우선)

### 선택
- [ ] Supabase 이미지·Caddy 분기 1회 업데이트
- [ ] Caddy 접근 로그 정기 확인

## 7. 이후 기능: 연구소 ↔ 아지트 글쓰기 연동 (컷오버 안정화 후)

두 앱의 글쓰기 흐름이 자연스럽게 이어짐:
- 연구소 = 글쓰기 **전 단계** (질문 답변 → GPT 개요) / 아지트 = **본 글쓰기 + 평가·포인트**

설계안:
1. 미션↔room 매핑 테이블 (교사가 미션 생성 시 연구소 활동 연결)
2. 학생: 아지트 미션 → "연구소에서 생각 정리하기" 버튼 → `/lab` 방 자동 입장(SSO) → 복귀
3. 아지트 글쓰기 화면(`StudentWriting.jsx`)에서 연구소 `student_sessions`의 표준 결과(신규 개요는 `answers`,
   과거 AI 개요는 `outline_queue.result` 호환)를
   `studentAnswers`/본문으로 "불러오기"
4. 교사 대시보드에 **`학생 글쓰기 지도` 탭**을 새로 만들고 연구소 기능을 관리한다:
   - 아지트 학급↔연구소 class/room 연결
   - 학생 글쓰기 지도 활동 준비·운영
   - 학생 진행 상황과 연구소 결과 확인
5. `설정 → 글쓰기 창 관리`는 연구소 관리 화면으로 쓰지 않는다. 여기에는 학생 입력창의
   **`연구소 결과 불러오기` ON/OFF와 실제 공용 입력창 기반 미리보기만** 둔다.
   `writing_editor_settings.enabled_tools`와 글쓰기 도구 매니페스트를 사용하며, OFF는 결과 데이터를 지우지 않고
   학생 글쓰기 창의 불러오기 진입만 숨긴다.
6. 과제별 room 연결과 질문 활용의 실제 동선은 `학생 글쓰기 지도`를 중심으로 설계하되, 미션 생성 화면에는
   필요한 선택·삽입 진입점만 연결한다. 연구소 방·활동 코드를 아지트에 복제하지 않고 표준 RPC로 연동한다.

**주의**: 인프라 이전과 기능 개발을 한 방학에 몰지 말 것. 방학 중에는 Phase 3의 매핑 기반까지만,
연동 UI는 안정화 후(방학 말 여유 시 또는 2학기 초).

## 8. 운영 장애 진단 기록 (2026-07-09, 클라우드 대시보드 24h 데이터)

수업 중 "동시접속 시 접속 안 됨/느려짐" 증상의 원인 분석 결과:

- **Auth 경고 100건 (경고율 4.4%)** — 수업 시작 시간대에 집중. 학교 공용 IP에서 익명 로그인이 몰려
  **IP당 시간당 30회 속도 제한**에 걸린 것으로 추정 → 일부 학생 로그인 거부. 이관 시 GoTrue 설정으로 해결 (Phase 1 항목)
- **Postgres 에러 130건 (로그 이벤트의 20%)** — 수업 시간대 클러스터에 집중. 무료 티어 최소사양 DB의 부하 한계로 추정.
  정확한 에러 메시지(statement timeout / connection slots / RPC exception) 확인 후 확정 → 앞의 둘이면 이관으로 해결,
  RPC exception이면 코드 수정 필요
- **Realtime 경고 2건 / 에러 0** — 당초 1순위 용의자였으나 **무혐의 확정**. 채널 감축(학생당 구독 3~5개,
  writing_missions 4중 구독 등)은 급하지 않은 이관 후 개선 과제로 격하
- Edge Functions·Storage 정상. 전체 요청 81k/24h, 성공률 99.4%

## 9. 리스크 요약

| 리스크 | 대응 |
|---|---|
| 학교망에서 맥미니 도메인 차단/저속 | Phase 0 관문 테스트로 사전 확인 (실패 시 계획 재검토) |
| 인터넷 회선 장애 | 감수 (학교 회선도 동일 조건). Cloudflare로 부분 완화 |
| 맥미니 하드웨어 고장 | 암호화 외부 백업 + 복구 리허설 → "새 장비 + 어제 백업" 복구 |
| 클라우드 덤프 청소 시행착오 | 반나절 각오, 스크립트화해서 반복 가능하게 |
| 인스턴스 변경으로 아지트 사용자 재로그인 | 컷오버 공지에 "재로그인 필요" 포함 (연구소·타 서비스는 무영향) |
| 마이그레이션 파일 드리프트 (RPC 13개 누락) | 파일 적용 금지, 클라우드 전체 덤프 기준 이관 |
| 로컬 DB가 타 서비스와 공유 (app/literacy 스키마) | auth 이관은 append만, 스택 재시작은 야간에 |
| 정전 | UPS 연결됨 + 자동 부팅 + restart 정책 |

## 9.5 컷오버 런북 (2026-07-24, 방학 중 본 도메인 직접 전환)

**전제**: 새 스택·앱 컨테이너·구글 OAuth·Edge 시크릿 모두 준비/검증 완료. 연구소는 구 스택에서 무중단 유지(통합은 Stage 2).

**적용 순서 (반드시 Caddy 먼저, DNS 나중)**:
1. Caddy 블록 2개 적용 (apex→`127.0.0.1:8300` 앱, `api.`→`127.0.0.1:8100` Kong):
   - `sudo cp ~/agit-supabase/Caddyfile.proposed /etc/caddy/Caddyfile`
   - `sudo caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`
2. 구글 콘솔 승인 리디렉션 URI 추가: `https://api.xn--vz0ba242ncqcba79xhwx.site/auth/v1/callback` ✅(완료)
3. DNS 전환 → 맥미니 `180.228.70.202`:
   - `끄적끄적아지트.site` (apex) A: Vercel → 180.228.70.202
   - `api.끄적끄적아지트.site` A: → 180.228.70.202
4. 전환 후 검증: 학생 익명로그인 / 교사 구글로그인→대시보드 / AI 피드백(SYSTEM·PERSONAL) / 연구소 정상
**롤백**: DNS를 Vercel로 되돌리면 즉시 원복 (Caddy 블록은 남겨둬도 무해).

## 10. 일정 (실작업 10~14일)

| 시기 | 작업 |
|---|---|
| 방학 전 | Phase 0 관문(학교망 테스트, 5분) |
| 1주차 | Phase 0 나머지 + Phase 1 (DB) + Phase 2 (호스팅) |
| 2~3주차 | Phase 3 (SSO) + 테스트 서브도메인 통합 테스트 |
| 4주차 | Phase 5 (백업·보안) + Phase 4 (컷오버) |
| 개학 전 1~2주 | 본 도메인 실사용 모니터링 → Vercel/Cloud 정리 |
