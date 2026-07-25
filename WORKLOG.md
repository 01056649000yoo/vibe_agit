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

## 2026-07-25 — 자동 백업 체계 구축 (구글 드라이브, 압축 방식) (Claude)
- **한 일**: 백업 범위를 "GitHub에 없는 것만"으로 압축. 끄적끄적아지트·연구소·샘링크·서바이벌은 GitHub 버전관리 확인 → 제외.
  백업 대상=①자비스(Jarvis_Brain_Local, 원격 없음) ②agit-supabase 설정·시크릿(git 아님) ③양 스택 DB 덤프.
  최초에 rclone이 `.git` 소파일 수천개를 개별 업로드해 매우 느렸던 문제 → **tar.gz 압축 방식으로 전환**(앱당 파일 1개).
- **변경**: git 밖 — `~/scripts/sh_mirror_backup.sh`(신규), LaunchAgent `com.agit.backup`(매일 04:00) 이 스크립트 실행.
  rclone remote `gdrive`(구글드라이브, scope=drive). 업로드 경로 `gdrive:SH맥미니/<날짜>/`, 30일 보존.
- **결과/검증**: 전체 백업 **~15초 완료**(자비스 34MB + 설정 60KB + DB덤프 7MB). 드라이브 `SH맥미니/20260725/` 확인.
- **남은 것 / 다음**: ⚠️ rclone이 공용 client_id 사용 중 → **2026년 중 종료 예정**. 장기 안정성 위해 본인 Google Cloud client_id 발급 권장.
  대안: 자비스를 private GitHub에 올리면 드라이브 백업은 DB덤프+시크릿(~7MB)만 남아 더 가벼워짐.
  복원: DB=`pg_restore`, 자비스/설정=tar 해제. DB는 raw 파일이 아닌 논리 덤프라 일관성 보장.

## 2026-07-25 — Docker 데이터 SSD 이전 성공 (수동 복사 방식) (Claude)
- **한 일**: Docker 데이터(이미지·컨테이너, Docker.raw 20GB)를 내장→외장 SSD(APFS, `/Volumes/SHmaegmini`)로 이전.
  Docker Desktop GUI 디스크이동이 3회 실패(12GB·3.3GB·0에서 revert)한 원인은 앱이 `Docker 2.app`이라는 비정상 이름으로 설치돼 있던 것.
  → 앱을 `Docker.app`으로 개명 후, **수동 복사 방식**으로 이전: Docker 정상종료 → Docker.raw를 SSD로 rsync 복사(원본 보존)
  → settings-store.json의 DataFolder를 SSD로 변경 → Docker 시작(복사본 인식) → 전수 검증 통과 후 내장 원본 삭제.
- **변경**: git 밖 인프라 — Docker DataFolder `~/DockerDesktop` → `/Volumes/SHmaegmini/DockerDesktop`.
  설정 백업 `settings-store.json.bak-before-ssd` 보존. **DB는 여전히 내장 bind mount**(B안: 이미지만 SSD, 운영DB 내장 유지).
- **결과/검증**: 이미지 22·컨테이너 36개 전부 SSD raw에서 정상 기동. DB 데이터 온전(users 2919·students 1415),
  bind mount 경로 내장 확인, 프로덕션 200 OK. **내장 여유 58GB→78GB**(20GB 확보). SSD 사용 20GB/911GB 여유.
- **남은 것 / 다음**: ①docker CLI 심링크가 옛 이름(`Docker 2.app`) 가리켜 깨짐 → sudo로 재연결 필요(사용자).
  ②rclone 구글드라이브 인증(`rclone config`, 브라우저) → 자동백업 업로드 활성화(스크립트·매일4시 스케줄은 이미 등록됨).
  ③80GB+ 완전 달성 및 "프로그래밍 파일 SSD" 위해 개발 레포·node_modules SSD 이동은 추후(현재 78GB).
  ⚠️ 운영 Docker가 외장 SSD 의존 → SSD 절대 분리 금지. 분리 시 서비스 다운(단 내장 DB데이터는 안전).

## 2026-07-24 — 🚨 Docker SSD 이동 실패 → 전 서비스 복구 (Claude)
- **한 일**: 사용자가 Docker를 외장 SSD로 옮기려다 실패한 상황 점검·복구. Docker Desktop이 데이터 폴더를
  `~/DockerDesktop`(빈 새 Docker.raw, sparse 9.5M)로 바뀌어 재시작 → **모든 컨테이너·이미지·네임드볼륨 소실, 사이트 502**.
  원본 Docker.raw는 유실(내장/외장/휴지통 어디에도 없음). **원인=수동 이동 중 원본 소실, 외장 SSD엔 실제로 안 옮겨짐.**
  - **데이터 생존 확인**: 모든 DB 스택이 **bind mount** 사용 → DB 실데이터는 Docker.raw 밖(디스크)에 있어 무사.
    (`~/agit-supabase/volumes/db/data` 162M, `~/Jarvis_Brain_Local/self-hosted-supabase/volumes/db/data` 278M)
  - **복구**: 각 스택 `docker compose up -d`로 재구축(이미지 재다운로드, 살아있는 bind-mount DB 연결) + `agit-app:prod` 이미지 재빌드.
- **변경**: git 밖 인프라만 — agit 스택(15)·구 supabase 스택(14)·앱 5종(agit-app/writing-helper/classroom-tools/jarvis/samlink) 전부 재생성.
  코드/커밋 변경 없음. Docker 데이터는 현재 **내장 디스크**에 있음(SSD 이동은 안 됨).
- **결과/검증**: 전 도메인 외부 200/307 정상(아지트·helper·survival). DB 데이터 온전 — 오히려 이관 스냅샷보다 최신
  (auth.users 2896→2918, students 1398→1415, point_logs 17286→17510, 연구소 학생매핑 27/40 보존). 익명 로그인 200. 전 앱 restart=unless-stopped.
- **남은 것 / 다음**: ⚠️ **SSD 이동 재시도 시 수동 금지** — 반드시 ①Docker Desktop Settings→Resources 디스크 위치 변경(안전)
  또는 ②bind-mount 볼륨 디렉토리를 SSD로 옮기고 compose 경로 수정, 둘 다 **사전 백업·컨테이너 정지 후**. survival 웹훅(9000)은
  LaunchAgent(`com.jarvis.survival`)/별도 프로세스라 미기동 상태(사이트 서빙 무관). dev OAuth 작업(.env.local api도메인 전환)은 이 사고로 중단됨 — 재개 필요.

## 2026-07-24 — dev 서버 구글 로그인 복구 (redirect allow-list) (Claude)
- **한 일**: `npm run dev`(localhost:5173)에서 교사 구글 로그인이 인증 후 되돌아오지 못하던 문제 해결.
  원인=GoTrue `ADDITIONAL_REDIRECT_URLS`에 아지트 dev 포트 5173 누락(연구소 3000·3002만 있었음).
- **변경**: git 밖 인프라 — `~/agit-supabase/.env`의 `ADDITIONAL_REDIRECT_URLS`에 `http://localhost:5173/**`,
  `http://192.168.219.102:5173/**` 추가 후 `agit-auth`만 재생성.
- **결과/검증**: 허용 목록 반영 확인, dev에서 "선생님으로 시작" → accounts.google.com 정상 이동.
- **남은 것 / 다음**: dev 구글 로그인은 구글 콜백이 `api.끄적끄적아지트.site`(→ hosts로 127.0.0.1)로 오므로,
  개발 중엔 `/etc/hosts`의 api 매핑을 유지해야 함(제거 시 dev OAuth 깨짐, 학생 익명로그인은 무관).

## 2026-07-24 — Stage 2 착수: 연구소↔아지트 학생 매핑 (Claude)
- **한 일**: 연구소 통합(Stage 2) 시작. 두 앱이 아직 다른 DB(아지트=새 스택 8100, 연구소=구 스택 8000)지만 JWT 시크릿·anon 키
  동일 확인(SSO 기반). 새 스택의 이관된 연구소 스키마에 학생/학급 매핑 컬럼 추가·채움 (운영 연구소 무영향).
  학급쌍(선생님 확정): 여수진남초4→진남초 AI글쓰기 대회 4학년, 동백 5학년1반→26년 동백 5-1. 테스트 학급 제외.
- **변경**: `supabase/integration/2026-07-24_lab_student_mapping.sql` (신규). 새 스택 agit-db `writing_helper.classes.agit_class_id`,
  `writing_helper.class_students.agit_student_id` 컬럼 추가 + 매핑. 되돌리기: 두 컬럼 DROP.
- **결과/검증**: 학급 2쌍, 학생 27/29명 매핑. 미매핑 2명은 규칙("큰 명단 유지, 짝 없으면 없는걸로")대로 NULL —
  최원진(동백 #16, 아지트 없음)·신율희(여수진남초4 #6, 아지트 동명이인 2명 → 수동확인 대기).
- **남은 것 / 다음**: ①신율희 동명이인 수동 확정 ②연구소를 새 스택으로 이전(운영 전환: 데이터 재동기화→env 전환→SSO 확인, 롤백=구 스택 env)
  ③SSO 세션 정렬(2a) ④결과물 RPC(2c). ⚠️ 연구소 이전은 운영 변경이라 dev 검증/롤백 경로 확보 후.

## 2026-07-24 — 로컬 개발 워크플로우 확립 (dev 서버 + .env.local) (Claude)
- **한 일**: "맥미니에서 공개 도메인이 NAT 루프백으로 안 열려 개발 불편" 문제 해결. 개발은 공개 도메인이 아니라
  **`npm run dev`(Vite, http://localhost:5173, 핫리로드)**로 하는 것이 정석임을 확립. dev 서버가 로컬 통합 스택을 바라보도록 설정.
- **변경**: `.env.local` 생성(git 무시, `.env.*`) — `VITE_SUPABASE_URL=http://127.0.0.1:8100` + 로컬 스택 anon 키.
  (프로덕션 빌드는 Dockerfile build-arg를 쓰므로 `.env.local` 영향 없음.) 코드/커밋 변경 없음.
- **결과/검증**: `npm run dev` 200, 앱 로컬 스택 연결 확인. 같은 WiFi 기기 테스트는 `npm run dev -- --host` → `http://192.168.219.102:5173`.
- **남은 것 / 다음**: ⚠️ 로컬 스택(8100)은 **운영 DB**다 — dev에서 쓰기·스키마 실험은 실데이터 위험.
  Stage 4(DB 스키마 변경) 착수 전 **별도 개발용 DB 스택**을 다른 포트로 분리 권장(미착수). UI 작업은 테스트 계정만 사용.

## 2026-07-24 — Claude·Codex 교대용 README 인수인계 정리 (Codex)
- **한 일**: 사용자가 교사 Google 로그인 후 아지트 대시보드 진입 정상화를 최종 확인. 두 AI 모델이 번갈아 작업해도
  운영 상태와 다음 순서를 놓치지 않도록 README의 기본 Vite 안내를 실제 인수인계 문서로 교체. 오늘 해결한 DNS·TLS·OAuth·Realtime·캐시·Umami
  상태, 운영 구조, 보류 항목, 비밀 관리 규칙을 요약하고 2026-07-25 기능 스모크 테스트를 접속·핵심 글쓰기·기존 기능·기기/성능 순으로 체크리스트화.
- **변경**: `README.md`, `ROADMAP.md` 문서 갱신. git 밖 인프라 변경 없음.
- **결과/검증**: 로그인과 대시보드 진입에 대한 사용자 실기기 확인을 현재 상태에 반영. README에서 영구 저장되지 않은
  `www` Caddy 런타임 설정과 안정화 후 정리할 항목을 완료 사항과 분리해 다음 작업자가 오판하지 않도록 정리.
- **남은 것 / 다음**: README 체크리스트에 따라 테스트 계정으로 전수 스모크 테스트. 우선 `/private/tmp/Caddyfile.www-redirect` 존재를 확인해
  `/etc/caddy/Caddyfile`에 영구 반영하고, 테스트 실패는 기기·계정·시각·네트워크와 함께 이 파일 상단에 기록.

## 2026-07-24 — 로그인 후 무한 로딩 진단·Realtime 완전 복구 (Codex)
- **한 일**: Google 로그인 후 “아지트 문을 열고 있어요”가 지속되는 현상 진단. Auth callback·세션 `/user`·프로필/교사 조회는 모두
  200이고 관리자 프로필도 정상임을 확인. 같은 시각 Realtime WebSocket이 503을 반복한 원인을 Kong의 이전 upstream 이름과
  통합 스택 Realtime 컨테이너 이름 불일치로 확정. 구 연구소 스택이 공식 컨테이너 이름을 이미 사용하므로 통합 스택 내부에만
  `realtime-dev.supabase-realtime` 네트워크 별칭을 추가하고 Kong upstream을 정합화. 비어 있던 `supabase_realtime` publication에는
  코드가 실제 구독하며 RLS가 활성화된 8개 테이블만 등록.
- **변경**: git 밖 인프라 — `~/agit-supabase/docker-compose.yml` Realtime 네트워크 별칭,
  `~/agit-supabase/volumes/api/kong.yml` Realtime WS/REST upstream, DB publication 8개
  (`announcements`, `classes`, `point_logs`, `post_comments`, `post_reactions`, `student_posts`, `students`, `writing_missions`).
  변경 전 Compose/Kong 파일은 같은 경로의 `*.pre-realtime-*-20260724`로 보존.
- **결과/검증**: `agit-realtime`·`agit-kong` healthy, Auth health·REST OpenAPI 200, WebSocket 101 Switching Protocols,
  DNS/TenantNotFound 오류 0, 실제 supabase-js `announcements` 구독 `SUBSCRIBED` 확인.
- **남은 것 / 다음**: 사용자 모바일 브라우저 새로고침 후 교사 대시보드 진입과 실시간 채널 재연결 최종 확인.

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
