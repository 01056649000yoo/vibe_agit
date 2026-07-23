# 끄적끄적 아지트 × 아지트 연구소 통합 작업 계획 (2026 여름방학)

> 이 문서는 2026-06 Claude 세션에서 분석·합의된 내용의 전체 기록이다.
> 새 세션에서 작업을 이어갈 때 이 문서를 먼저 읽으면 배경 설명 없이 바로 시작할 수 있다.

## 1. 목표

- 끄적끄적 아지트 로그인 **하나**로 교사·학생이 아지트와 연구소를 모두 사용 (SSO)
- 호스팅을 **맥미니 Docker**로, DB를 **로컬 Supabase 하나**로 통합 (비용 0원, 자가 유지보수)
- 여름방학을 "업데이트 기간"으로 공지하고 작업, 테스트 후 URL(DNS) 전환

## 2. 두 앱의 현재 상태

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
- [ ] **(최우선 관문) 학교 태블릿에서 연구소 도메인 접속 품질 테스트** — 여기서 문제면 계획 재검토
- [ ] Supabase Cloud 전체 백업 (`pg_dump`), Vercel 설정 기록
- [ ] 맥미니 Supabase 접미사 스택(`supabase_*_writing-helper`) 제거 — 빈 스택으로 확인 완료(rooms 0건), 무접미사 스택이 실사용
- [ ] 도메인 계획 확정: 본 도메인 / 테스트용 서브도메인(예: `test.`) / API용(예: `api.` → Kong)
- [ ] 연구소 기존 데이터 유지(UUID 수동 매핑) vs 리셋 결정

### Phase 1 — DB 통합 (2~3일)
- [ ] **클라우드 전체 스키마 덤프 기준으로 이관** (마이그레이션 파일 적용 금지 — RPC 13개 누락 드리프트, 4절 참조)
  - `pg_dump --schema-only`(public) + 데이터 덤프 + auth 스키마(교사 비밀번호 해시 보존, 재가입 불필요)
- [ ] **덤프 청소**(클라우드 전용 소유자/롤 구문 제거) → 로컬 복원. 청소·복원을 **반복 실행 가능한 스크립트**로 만들 것 (최종 컷오버 때 재사용)
- [ ] **auth.users 이관은 추가(append) 방식** — 로컬 기존 17명(연구소+타 서비스 공유)을 절대 덮어쓰지 말 것. 이메일 중복(본인 계정 등)은 수동 해소
- [ ] GoTrue **익명 로그인 활성화**: `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true` (현재 false 확인됨. 학생 코드 로그인의 생명줄. 스택 재시작 필요 → 야간 작업)
- [ ] GoTrue **익명 로그인 IP당 속도 제한 상향** (`GOTRUE_RATE_LIMIT_ANONYMOUS_USERS`) — 클라우드 기본값(시간당 30회/IP)이
  학교 공용 IP에서 학급 동시 로그인을 차단하던 원인 (2026-07-09 진단, 아래 8절 참조). 학급 규모 고려해 넉넉히(예: 300/hr) 설정
- [ ] JWT 시크릿·키는 **교체 불필요** (로컬 스택이 이미 커스텀 시크릿 사용 중 확인). 아지트 프론트를 로컬 스택의 URL·anon 키로 다시 빌드하면 됨. 아지트 사용자는 인스턴스가 바뀌므로 어차피 재로그인 필요(공지), 연구소·타 서비스 세션은 영향 없음
- [ ] Edge Functions 4개 로컬 edge-runtime 배포 + 시크릿(OpenAI 키 등) 이전
- [ ] Realtime publication 확인
- [ ] 연구소 소수 사용자 UUID 수동 매핑: `writing_helper.teacher_profiles`, `classes`, `rooms` 등의 FK를 아지트 계정 UUID로 UPDATE
- [ ] RLS 검증: anon 키로 타 학생/타 반 데이터 조회 시도 (`security-test-student.js`를 로컬 대상으로 재활용)

### Phase 2 — 호스팅 구성 (1~2일)
- [ ] 아지트 Dockerfile 작성 (정적 빌드 → Caddy/nginx 서빙)
- [ ] Caddy 라우팅: `/` → 아지트, `/lab/*` → writing-helper 컨테이너, `api.도메인` → Kong
- [ ] Caddy에서 `vercel.json`의 SPA 폴백 + 보안 헤더 5종 재현 (4절 참조)
- [ ] Caddy 압축(brotli/gzip) + 해시 자산 `Cache-Control: immutable` + HTTP/2 — **Vercel이 자동으로 해주던 것들.
      빠뜨리면 이관 후 체감 속도가 오히려 나빠짐** (상세: ROADMAP.md Stage 1.5)
- [ ] writing-helper `basePath: '/lab'` 설정 + 내부 링크·리다이렉트 전수 점검
- [ ] **⚠️ basePath 변경 시 기존 단축링크·QR 깨짐 주의**: 연구소의 `/s/...` 단축링크와 배포된 QR코드가
  기존 `helper.도메인` 경로 기준. 기존 `helper.도메인/*` → 새 `/lab/*` 301 리다이렉트를 Caddy에 유지할 것
- [ ] 기존 webhook 자동 배포를 vibe_agit 레포에도 확장
- [ ] **테스트 서브도메인으로 병행 운영** (본 도메인은 컷오버까지 Vercel 유지)

### Phase 3 — SSO 통합 (3~5일, 개발량 최대)
- [ ] 세션 저장 방식 정렬: 아지트 supabase-js에 **쿠키 storage adapter** 적용 권장 (Next.js SSR까지 세션 인식)
- [ ] 교사: 연구소 첫 진입 시 `teacher_profiles` 자동 생성 (트리거 또는 first-visit upsert)
- [ ] 학생: 아지트 익명 세션(JWT의 student_id 메타데이터) → 연구소 방 입장 시 번호·이름 자동 매핑 RPC
- [ ] 아지트 앱 허브의 연구소 링크를 `/lab` 경로로 교체 (기존 링크 커밋: `46be116`)
- [ ] (기반만) **미션↔room 매핑 테이블 설계** — 2학기 글쓰기 연동 기능 대비 (아래 7절)

### Phase 4 — 검증 & 컷오버 (2~3일)
- [ ] 실데이터 리허설: 교사 로그인 → 미션 → `/lab` 이동 → 학생 코드 로그인 → 글쓰기 전 흐름
- [ ] **안드로이드 크롬 태블릿 실기기 테스트** (테스트 서브도메인으로)
- [ ] 컷오버: 점검 공지(1~2시간) → 최종 `pg_dump` → 복원(테스트 기간 클라우드 신규 데이터 반영) → DNS 전환
- [ ] 롤백 절차 = DNS 되돌리기 (Vercel 살아있음)
- [ ] 1~2주 모니터링 후 Vercel/Supabase Cloud 정리 (Vercel 계정은 비상용으로 유지 가능)

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
3. 아지트 글쓰기 화면(`StudentWriting.jsx`)에서 연구소 `student_sessions`의 답변·개요를
   `studentAnswers`/본문으로 "불러오기"

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

## 10. 일정 (실작업 10~14일)

| 시기 | 작업 |
|---|---|
| 방학 전 | Phase 0 관문(학교망 테스트, 5분) |
| 1주차 | Phase 0 나머지 + Phase 1 (DB) + Phase 2 (호스팅) |
| 2~3주차 | Phase 3 (SSO) + 테스트 서브도메인 통합 테스트 |
| 4주차 | Phase 5 (백업·보안) + Phase 4 (컷오버) |
| 개학 전 1~2주 | 본 도메인 실사용 모니터링 → Vercel/Cloud 정리 |
