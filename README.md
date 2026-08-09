# 끄적끄적 아지트 (vibe_agit)

> ## 🤝 AI 모델 협업 안내 (Claude · GPT 등 — 읽고 시작할 것)
> 이 저장소는 여러 AI 모델이 번갈아 작업합니다. **무엇을 하든 아래 두 파일을 먼저 읽으세요.**
> 1. **[ROADMAP.md](ROADMAP.md)** — 비전, "현재 위치", 진행할 스테이지, 대원칙, 결정 기록
> 2. **[WORKLOG.md](WORKLOG.md)** — 직전까지의 작업·변경·완료 내역 (최신이 위)
>
> **작업을 마치면 반드시** `WORKLOG.md` 맨 위에 항목을 추가하고 `ROADMAP.md`를 갱신하세요.
> git 밖 인프라 변경(맥미니 도커·Caddy·DNS)도 WORKLOG에 남깁니다. 비밀 값은 문서에 쓰지 않습니다.
> 모델 공통 규칙 전체: **[AGENTS.md](AGENTS.md)** (Claude는 [CLAUDE.md](CLAUDE.md)가 이를 가리킴).

초등 글쓰기 통합 플랫폼. React + Vite 프론트 + 자체호스팅 Supabase(맥미니). 2026 여름 이관·고도화 진행 중.

---

## 현재 인수인계 요약 (2026-07-24 밤)

**Stage 0~1 컷오버는 완료됐고, 교사 Google 로그인 후 아지트 대시보드 진입까지 사용자가 직접 확인했다.**
지금은 신규 기능을 만들 때가 아니라 맥미니 이관 후 기존 기능이 모두 정상인지 확인하는 안정화 기간이다.

오늘 정상화·확인한 범위:

- 본 도메인 `끄적끄적아지트.site`와 API가 맥미니에서 HTTPS로 서비스 중이다.
- 모바일 DNS 전파와 `www` 접속 문제를 해결했다. `www`는 본 도메인으로 리디렉션된다.
- Google OAuth 클라이언트를 운영 Auth와 맞췄고, 실제 교사 로그인과 대시보드 진입이 정상이다.
- 로그인 후 “아지트 문을 열고 있어요”에서 멈추던 원인은 통합 Supabase Realtime 라우팅과 publication 불일치였다.
  내부 네트워크 별칭과 Kong upstream을 맞추고 구독 대상 8개 테이블을 복원했다. WebSocket 101과 실제
  `SUBSCRIBED`까지 검증했다.
- Vite 해시 자산의 `Cache-Control: immutable`, HTTP/2, zstd 압축, 보안 헤더, SPA 폴백을 실응답으로 확인했다.
- 미사용 Umami 컨테이너·네트워크와 자동실행을 제거했다. 복구용 데이터 볼륨·이미지·설정은 아직 보존 중이다.

세부 원인, 명령, 검증 결과는 [WORKLOG.md](WORKLOG.md)의 2026-07-24 항목을 기준으로 한다.

## 다음 작업: 2026-07-25 기능 스모크 테스트

**새 개발보다 아래 순서의 전수 확인이 먼저다.** 가능하면 운영 데이터 대신 테스트 학급·학생을 사용하고,
실패 시 증상·계정 유형·시각·기기·브라우저·네트워크를 WORKLOG에 남긴다.

### 1. 접속·인증 관문

- [ ] 교사 PC와 휴대폰 모바일 데이터에서 본 도메인 접속
- [ ] `www` 주소가 인증서 오류 없이 본 도메인으로 이동
- [ ] 교사 Google 로그인 → 대시보드 → 새로고침 후 세션 유지 → 로그아웃
- [ ] 학생 8자리 코드 로그인 → 학생 홈 → 새로고침 후 세션 유지 → 로그아웃
- [ ] `agit-*` 컨테이너와 Auth·REST·Realtime·Edge Functions 상태 확인

### 2. 핵심 글쓰기 흐름 — 가장 중요

- [ ] 교사: 학급·학생 목록 조회와 테스트 미션 생성·수정
- [ ] 학생: 미션 목록 조회 → 글 작성 → 임시 저장 → 제출
- [ ] 교사: 제출 글 열기 → AI 피드백 1건 → 교사 피드백 → 승인 또는 반려
- [ ] 학생: 피드백·상태 변경·포인트 반영 확인
- [ ] 교사와 학생 화면을 동시에 열어 Realtime 변경이 새로고침 없이 반영되는지 확인

### 3. 기존 기능 회귀 확인

- [ ] 공지, 포인트 내역, 드래곤/게임 보상·사용
- [ ] 어휘의 탑
- [ ] 현재 활성화된 친구 아지트, 한줄 모으기, 회의 안건 만들기
- [ ] 글쓰기 도우미와 클래스룸툴은 아직 별도 앱이므로 각각 독립 접속·핵심 동작만 확인

### 4. 기기·성능 기록

- [ ] 교사 PC, Android 휴대폰/태블릿, 모바일 데이터, 가능한 경우 학교와 비슷한 Wi-Fi에서 확인
- [ ] 교사·학생 첫 화면 시간을 각각 3회 기록해 Stage 1.5 개선 전 기준선으로 사용
- [ ] 치명적 오류가 없으면 1~2주 안정화 후에만 Stage 1.5와 연구소 통합으로 진행

## 현재 운영 구조

```text
끄적끄적아지트.site
  └─ 호스트 Caddy (/etc/caddy/Caddyfile)
       └─ agit-app Docker (127.0.0.1:8300)

api.끄적끄적아지트.site
  └─ 호스트 Caddy
       └─ 통합 Supabase Kong (127.0.0.1:8100)
            └─ ~/agit-supabase/ · compose project agit · PostgreSQL 17

helper.끄적끄적아지트.site
  └─ 구 연구소 스택 — 현재 별도 운영, Stage 2에서 SSO/RPC로만 연동
```

- 앱 저장소: 이 디렉터리
- 통합 Supabase: `~/agit-supabase/` (git 밖)
- 앱 시크릿: `~/agit-supabase/secrets.agit.env` (값을 문서·코드·로그에 기록하지 않음)
- 글쓰기 도우미·클래스룸툴: 현재 별도 Docker 앱. 아지트 코드로 합치지 않았으며 추후 모듈 경계를 먼저 설계한다.
- 연구소: 코드를 아지트에 복사하지 않고 같은 인증과 표준 결과물 RPC로 연결한다.

## 반드시 이어서 처리할 운영 항목

### `www` Caddy 설정 영구 저장

현재 `www` 리디렉션은 실행 중인 Caddy 관리 API에는 반영됐지만, sudo 권한이 없어
`/etc/caddy/Caddyfile`에는 아직 저장하지 못했다. **재부팅·설정 reload 전에** 후보 파일이 남아 있는지 확인한 뒤 아래를 실행한다.

```bash
test -f /private/tmp/Caddyfile.www-redirect
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-www-20260724
sudo cp /private/tmp/Caddyfile.www-redirect /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

적용 후 `https://www.끄적끄적아지트.site`가 본 도메인으로 301 이동하는지 다시 확인한다. 후보 파일이 없으면
기존 Caddyfile을 임의로 덮지 말고 WORKLOG의 `www DNS 별칭 TLS 복구` 항목부터 읽는다.

### 정리 보류 항목

- Umami 완전 폐기 확정 후에만 Caddy `umami.` 블록, 가비아 DNS, 보존 볼륨·이미지·설정을 제거한다.
- 안정화가 끝난 뒤 롤백용 `agit-app:pre-cache-fix-20260724` 이미지와 중지 컨테이너를 정리한다.
- Vercel/Cloud는 실사용 1~2주 무사고 확인 전까지 해지하지 않는다.
- 구 연구소 스택에도 `realtime-dev.supabase-realtime` 컨테이너가 있다. 통합 스택 컨테이너를 같은 이름으로 바꾸지 않는다.
  통합 스택 내부 네트워크 별칭은 의도된 충돌 회피책이다.

## Claude ↔ Codex 교대 규칙

1. 시작할 때 `README.md` → `ROADMAP.md` 현재 위치 → `WORKLOG.md` 최신 항목 순으로 읽는다.
2. 실제 상태는 추측하지 말고 코드, Docker, Caddy, 응답으로 확인한다. git 밖 변경도 작업 범위에 포함한다.
3. 기존 변경을 되돌리거나 코어 글쓰기 셸을 수정하지 않는다. 확장은 모듈/슬롯으로만 한다.
4. 작업 후 `WORKLOG.md` 맨 위에 **한 일 / 변경 / 결과·검증 / 남은 것**을 기록한다.
5. 완료 체크나 순서·방향 변경이 있으면 같은 세션에서 `ROADMAP.md`도 갱신한다.
6. 비밀 값은 절대 기록하지 않는다. 커밋 전 `git diff`와 빌드·핵심 흐름을 확인한다.

## 로컬 개발·빌드

```bash
npm install
npm run dev
npm run build
```

프로덕션 이미지는 저장소의 `Dockerfile`을 사용하며 `VITE_SUPABASE_URL`, 공개 anon key와 공개 Google OAuth
클라이언트 ID를 build-arg로 주입한다. Google OAuth 시크릿은 프론트 빌드에 넣지 않는다.
운영 배포·롤백의 최신 절차와 실제 이미지 이름은 README를 추측해서 실행하지 말고 WORKLOG의 최신 배포 항목을 따른다.
