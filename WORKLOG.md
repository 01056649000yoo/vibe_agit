# 작업 로그 (WORKLOG)

> **목적**: Claude·GPT 등 어떤 AI 모델이 작업하든, 서로의 작업·변경·완료 내역을 이어받기 위한 공유 기록.
> 모델이 바뀌어도 이 파일만 보면 "무엇을 왜 했고, 무엇이 남았는지" 파악 가능해야 한다.
>
> **규칙 (모든 모델 공통)**
> 1. **작업 시작 전**: `ROADMAP.md`(계획·현재 위치)와 이 파일 상단 몇 개 항목을 읽는다.
> 2. **작업 후**: 이 파일 **맨 위**에 새 항목을 추가한다(최신이 위). 아래 형식을 따른다.
> 3. **ROADMAP.md도 함께 갱신**: 완료 항목 `[x]`, 방향 변경은 ROADMAP "결정 기록"에.
> 4. **비밀은 값이 아니라 위치만 기록**(DB 비번·API 키·OAuth 시크릿 등은 절대 본문에 쓰지 않음).
> 5. git 밖 변경(맥미니 인프라: 도커 스택·Caddy·DNS·`~/agit-supabase/` 등)도 반드시 여기 남긴다 — 커밋만으로는 안 보이므로.
>
> **항목 형식**
> ```
> ## YYYY-MM-DD — 제목 (작업 모델)
> - **한 일**: …
> - **변경**: 커밋 해시/범위, 또는 git 밖 인프라 변경
> - **결과/검증**: …
> - **남은 것 / 다음**: …
> ```

---

## 2026-07-24 — Google OAuth 클라이언트 정합화·Auth 재배포 (Codex)
- **한 일**: Google 콘솔 클라이언트와 운영 `agit-auth`의 클라이언트 ID가 달라 발생한 `redirect_uri_mismatch` 진단.
  사용자가 git 밖 시크릿 파일에 올바른 Web OAuth ID·시크릿을 입력한 뒤 값 노출 없이 형식만 검증하고 `agit-auth`만 재생성.
- **변경**: git 밖 인프라 — `~/agit-supabase/secrets.agit.env`의 Google OAuth 자격 증명 정합화(사용자 입력),
  compose project `agit`의 `auth` 서비스만 `--no-deps --force-recreate` 적용. 시크릿 값은 기록하지 않음.
- **결과/검증**: `agit-auth` healthy, 실제 authorize 요청이 새 클라이언트와
  `https://api.xn--vz0ba242ncqcba79xhwx.site/auth/v1/callback`을 사용하는 것 확인. Google 응답 200, mismatch 문구 없음.
- **남은 것 / 다음**: 실제 모바일/브라우저에서 교사 Google 로그인 후 아지트 대시보드 진입·세션 유지 1회 확인.

## 2026-07-24 — www DNS 별칭 TLS 복구·리디렉션 적용 (Codex)
- **한 일**: 사용자가 가비아에 `www` CNAME을 apex로 추가한 뒤 발생한 `ERR_SSL_PROTOCOL_ERROR` 진단.
  공개 DNS 3곳에서 `www`가 apex와 새 IP로 전파된 것을 확인하고, 원인이 호스트 Caddy의 `www` 사이트 블록·인증서 부재임을 확인.
  `www` 요청을 apex로 영구 리디렉션하는 검증된 설정을 실행 중인 Caddy 관리 API에 적용.
- **변경**: git 밖 런타임 Caddy 설정 — `www.xn--vz0ba242ncqcba79xhwx.site` → apex `{uri}` HTTP 301.
  영구 설정 후보는 `/private/tmp/Caddyfile.www-redirect`; `/etc/caddy/Caddyfile` 저장은 sudo 비밀번호가 필요해 아직 미반영.
- **결과/검증**: `www` TLS 정상, HTTP/2 301 및 apex Location 확인. 기존 apex 서비스 영향 없음.
- **남은 것 / 다음**: 사용자 터미널에서 현재 `/etc/caddy/Caddyfile` 백업 후 후보 파일을 복사하고 Caddy reload하여 재부팅 후에도 유지.

## 2026-07-24 — Umami Docker 서비스 중단·제거 (Codex)
- **한 일**: 미사용 Umami 분석 서비스를 Docker에서 제거. 최초 `docker compose down` 후 macOS LaunchAgent가 즉시 재생성하는 것을 발견해
  `com.jarvis.umami`를 bootout하고 plist를 `com.jarvis.umami.plist.disabled`로 변경한 뒤 Umami 앱·PostgreSQL 컨테이너와 전용 네트워크를 제거.
- **변경**: git 밖 인프라 — `umami-umami-1`, `umami-db-1`, `umami_default` 제거. 자동실행 비활성화.
  복구 가능하도록 `~/umami/docker-compose.yml`, Docker 이미지, `umami_umami-db-data` 볼륨, 실행 스크립트는 보존.
- **결과/검증**: Umami 컨테이너 0개, LaunchAgent 미등록, 비활성화 plist 존재, DB 볼륨 보존 확인. 아지트 코드는 Umami를 사용하지 않아 앱 영향 없음.
- **남은 것 / 다음**: 완전 폐기 확정 시 Caddy의 `umami.` 블록·가비아 DNS A 레코드·보존 이미지/볼륨/설정·스크립트를 별도 정리.

## 2026-07-24 — 컷오버 모니터링 및 정적 자산 캐시 규칙 수정 (Codex)
- **한 일**: README·ROADMAP 기준으로 컷오버 후 상태를 점검. 가비아 NS와 apex/API A 레코드가 새 공인 IP로 전파된 것을 확인하고,
  로컬 Caddy 경유 앱 HTTP/2 200·SPA 폴백·zstd 압축·보안 헤더 및 `agit-*` 컨테이너 상태를 확인. 실응답에서 Vite 해시 자산에
  `Cache-Control: immutable`이 누락된 원인을 찾아 `Caddyfile.container`의 해시 정규식을 실제 Vite 파일명 형식에 맞게 수정.
- **변경**: `Caddyfile.container`, `ROADMAP.md`. git 밖 운영 앱을 후보 이미지 `agit-app:cache-fix-20260724`로 교체하고
  `agit-app:prod` 태그 적용. 이전 이미지 `agit-app:pre-cache-fix-20260724`와 중지 컨테이너 `agit-app-pre-cache-fix-20260724`를 롤백용으로 보존.
- **결과/검증**: `npm run build` 통과(기존 duplicate key·청크 경고 유지), Caddy 설정 검증 통과. 임시 컨테이너와 후보 이미지 모두
  해시 JS 응답에 `Cache-Control: public, max-age=31536000, immutable` 적용 확인. 배포 후 실제 도메인 경유 앱 HTTP/2 200,
  anon 키 포함 API health 200, 새 컨테이너 로그 오류 없음.
- **남은 것 / 다음**: 외부 공인 IP 접속은 맥미니의 NAT 루프백 제약으로 로컬에서 타임아웃되므로 외부망/업타임 모니터로 별도 확인.
  안정 확인 후 롤백용 이전 컨테이너·이미지 정리.

## 2026-07-24 — 방향 확정: 3대 기둥 + 방학 계획 로드맵 반영 (Claude)
- **한 일**: 제품 집중 "3대 기둥"(교사 글쓰기 지도 / 학생 자율 글쓰기·제출 / 포인트 동기부여) 확정.
  방학 우선순위 4가지와 기능 정리(3기둥 밖 4종: 아지트온클래스·친구 아지트·한줄 모으기·아이디어마켓)를 로드맵에 반영.
  포인트 엔터테인먼트 확장(드래곤 다이나믹화 + 신규 포인트 활동)을 Stage 4d로 구조화.
- **변경**: 커밋 `3fbe601`, `bc4a603` (ROADMAP.md). Stage 3c(기능 정리+코드 청소), Stage 4d(포인트 확장) 신설.
- **결과/검증**: 문서 작업. 실행 코드 변경 없음.
- **남은 것 / 다음**: 정리 후보 삭제 vs 기본OFF, 신규 포인트 활동 종류, 드래곤 이벤트 범위는 🔶 선생님 결정 대기.

## 2026-07-24 — 🎉 Stage 1 컷오버 완료 (Vercel+Cloud → 맥미니) (Claude)
- **한 일**: 본 도메인 `끄적끄적아지트.site`를 맥미니 자체호스팅으로 전환.
  - 새 PG17 통합 Supabase 스택 구축, 클라우드 덤프 복원(users 2896·students 1398·posts 2769·point_logs 17286).
  - 연구소(writing_helper) 스키마 이관 + UUID 매핑(유승현→yoo@gmail, 최원진→wonjinchoi0126, 나머지 삭제).
  - Edge Functions 4개 배포 + 시크릿(OpenAI 공용키·관리자 비번·구글 OAuth) 주입.
  - 아지트 앱 Docker 이미지화 + 호스트 Caddy 라우팅 + 가비아 네임서버 이전 + Let's Encrypt 인증서.
- **변경**:
  - 커밋 `b97283a`~`afc9ef9` (ROADMAP.md·INTEGRATION_PLAN.md 진행기록, `Dockerfile`·`Caddyfile.container`·`.dockerignore` 추가).
  - **git 밖 인프라**: 새 스택 `~/agit-supabase/`(compose project `agit`, PG17, Kong:8100/DB:5433, 시크릿 `secrets.agit.env`). 앱 컨테이너 `agit-app`(127.0.0.1:8300, restart=unless-stopped). 호스트 `/etc/caddy/Caddyfile`에 apex·api 블록 추가. 가비아 DNS: apex/api/helper/survival/umami A→180.228.70.202. 백업 `~/backups/agit-cloud-20260724/`.
- **결과/검증**: 전수 통과 — 학생 익명로그인(signup 200·bind_student_auth 200)·교사 구글OAuth 리다이렉트·HTTPS 5도메인·OpenAI 키 유효(200). auth.users 원복(2896).
- **남은 것 / 다음**: DNS 전 세계 전파 완료 확인(일부 통신사 캐시 최대 24h) → 실사용 1~2주 모니터링 → Vercel/Supabase Cloud 해지 → 노출된 키 회전. 교사 AI피드백 실사용 1건 확인 권장.

## 2026-07-23~24 — Stage 0 대청소 (Claude)
- **한 일**: 이관 전 코드 정리. 루트 잡동사니(디버그 스크립트 등) 삭제, 보안테스트 스크립트 `scripts/` 이동,
  미사용 의존성(`openai`·`react-router-dom`) 제거, 린트 `no-unused-vars` 132→0, 프로덕션 빌드 console 제거.
- **변경**: 커밋 `fb694e9`~`aec63f4`, `1e7df29`. (`.gitignore`, `vite.config.js`, `eslint.config.js`, 다수 컴포넌트).
- **결과/검증**: 각 단계 `vite build` 통과. `react/jsx-uses-vars` 규칙 추가로 motion import 오탐 해결.
- **남은 것 / 다음**: `exhaustive-deps`·대형 파일 분할은 Stage 3c로 이월(의도적).
