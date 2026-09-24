# 3개 앱 운영·서버·외부 노출 보안 점검 — 2026-08-29

> 대상: 끄적끄적 아지트, 샘링크, 자비스와 이들이 공유하는 맥미니·Docker·통합 Supabase 경계.
> 최초 감사는 읽기 전용으로 진행했고, 같은 날 승인 뒤 되돌릴 수 있는 P0·P1 항목을 운영에 반영했다.
> 비밀 값, 공인 IP, 사용자 데이터는 이 문서에 남기지 않는다.

## 결론

- 서비스와 데이터 계층은 정상이다. 컨테이너 16개가 모두 실행 중이고 DB·백업·복구·운영 경고도 정상이다.
- 아지트 자체 보안 하네스와 운영 DB 권한 검사는 통과했다.
- 자비스·샘링크 운영 의존성, 불필요한 LAN 포트, 비밀파일 권한·Docker 빌드 제외와 자비스 보안 헤더는
  같은 날 보완했다. 세 앱 운영 의존성은 모두 취약점 0건이다.
- 남은 핵심은 **Tailscale SSH 키 등록 뒤 비밀번호 로그인 해제**, **암호화되지 않은 내부 디스크와 기존 외장 평문 사본**,
  **운영 이미지 CVE 갱신 작업**이다. 이미지 검사는 완료했고 결과는
  [별도 보고서](DOCKER_CVE_SCAN_20260829.md)에 정리했다.
- 공유기 포트포워딩 설정은 맥미니 내부 점검만으로 확정할 수 없다. 아래의 `전체 인터페이스` 포트는 LAN 접근을
  실제 확인했으며, 인터넷에서 원시 포트로 직접 들어올 수 있는지는 공유기에서 별도로 대조해야 한다.

## 1. 운영 상태

| 영역 | 결과 |
|---|---|
| 앱 응답 | 아지트 로컬 TLS 가상호스트 200, 샘링크 공개 200, 자비스 공개 로그인 이동 307 후 200 |
| 컨테이너 | 16/16 실행, 필수 health check 정상 |
| DB | 약 152MB, 연결 23/100, 점검 시 활성 1 |
| 호스트 여유 | 디스크 약 117GB 여유, 메모리 가용 약 63%, 즉시 자원 압박 없음 |
| 운영 경고 | 열린 경고 0건 |
| 통합 백업 | `PASS`, 앱 3/3, 산출물 7개, 내장·암호화 Drive·외장 SSD 7/7/7 |
| 실제 복구 | `PASS`, 앱 3/3 |

세 앱은 프런트 컨테이너는 분리돼 있지만 맥미니·Docker Desktop·`agit-db`·Kong을 공유한다. 샘링크와
자비스는 Cloudflare Tunnel → `jarvis-caddy:8001` 경계도 함께 쓴다. 따라서 앱 한 개의 장애는 격리되지만,
맥미니 전원·회선·Docker·통합 DB·Kong 장애는 세 앱 공통 장애가 되는 구조다.

## 2. 외부 인터페이스 포트

| 포트 | 프로세스/용도 | 확인 결과 | 판정 |
|---:|---|---|---|
| TCP 22 | macOS SSH 원격 로그인 | 모든 인터페이스, 방화벽 허용, `publickey,password,keyboard-interactive` 제안 | **높음** — 키 전용 전환과 공유기 22 전달 여부 확인 |
| TCP 80 | 호스트 Caddy HTTP | 모든 인터페이스 | 의도된 공개 경계 |
| TCP·UDP 443 | 호스트 Caddy HTTPS/HTTP3 | 모든 인터페이스 | 의도된 공개 경계 |
| TCP 8001 | Jarvis Caddy의 Cloudflare origin | `127.0.0.1` 전용, 공개 Tunnel 정상 | **완료** — LAN 직접 접근 0 |
| TCP 8080 | `classroom-tools` | `127.0.0.1` 전용, host Caddy 경로 200 | **완료** — LAN 직접 접근 0 |
| TCP·UDP 8444 | 과거 Jarvis Caddy 직접 TLS | 리스너·Docker publish 제거 | **완료** |
| TCP 28198 | Elgato Stream Deck | 모든 인터페이스·두 LAN 주소·Docker에서 연결 성공 | **낮음~중간** — WAN 전달은 공유기 확인 필요 |
| TCP 임시 포트·UDP 41641 | Tailscale | Tailscale 데몬, Serve/Funnel 설정 없음 | 정상 전송 경계 |
| UDP 5353·137·138 | macOS 발견/NetBIOS 계열 | LAN 시스템 서비스 | 파일 공유·발견 기능이 불필요하면 별도 축소 검토 |

- Docker 원격 API 2375/2376 리스너는 없다.
- 앱·Kong의 `8300`, `8100`, `8447`, `3001`, `3002`, `3004`는 loopback 전용이다.
- macOS Application Firewall은 **켜져** 있다. 다만 서명 앱 자동 허용이 켜져 있고 SSH·Docker·Caddy가
  인바운드 허용 목록에 있어, 위 바인딩을 방화벽 하나만으로 격리됐다고 보면 안 된다. Stealth mode는 꺼져 있다.
- Cloudflare Tunnel은 6개 hostname을 모두 `http://localhost:8001`로 전달하며 catch-all은 404다.

## 3. 앱별 보안 결과

### 끄적끄적 아지트

- `npm run test:security` 전체 통과: 정적 검사 71/71, RPC surface 정합, 미적용 마이그레이션 0,
  실제 운영 DB 롤백 권한 스모크와 운영 포트/Edge 허용 목록 통과.
- `npm audit --omit=dev`: 취약점 0건.
- 앱 응답에는 CSP, HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer/Permissions Policy가 있다.
- Supabase REST·관리 후보 경로를 키 없이 요청하면 401, 함수 루트는 400으로 차단된다.
- SPA fallback 때문에 `/.env`·`/.git/config`도 200을 반환하지만 메인과 같은 4,225바이트 HTML이다.
  실제 비밀파일 노출은 아니다. 보안 스캐너 오탐을 줄이려면 이 경로들을 명시 404로 막을 수 있다.
- `agit-app`은 root·쓰기 가능 rootfs·cap drop 없음·`no-new-privileges` 없음이다. 정적 Caddy 이미지이므로
  비root/읽기전용 전환 가능성을 검토한다.

### 샘링크

- 공개 서비스 200, CSP·HSTS·`nosniff`·Referrer/Permissions Policy가 있다.
- 운영 의존성을 Next 16.3.3, nanoid 3.3.18, postcss 8.5.26, sharp 0.35.4로 올렸고
  `npm audit --omit=dev` 0건, host/Docker 프로덕션 빌드와 공개 `/api/stats` 200을 확인했다.
- 현재 코드에는 Middleware·Server Actions가 없고 Next Image는 사용한다. 따라서 보고된 Next 취약점 중
  미들웨어/Server Action 계열의 직접 노출은 자비스보다 낮지만, 이미지 처리와 프레임워크 취약점은 남는다.
- 실제 `.env.local`과 이관 전 백업 파일을 `600`으로 제한했다. `.dockerignore`는 `.env*` 전체를 막고
  example만 허용하며, 재빌드한 실행 이미지에는 실제 env/백업 없이 example 두 개만 있다.
- 컨테이너도 `node` 비root, read-only rootfs, `cap_drop: ALL`, `no-new-privileges`로 전환했다.
  Next 캐시는 uid 1000 전용 tmpfs로 남겼고 메인·통계·공개 응답 200과 소유권 오류 없음까지 확인했다.

### 자비스

- 공개 루트는 로그인으로 307 이동하고 최종 로그인 화면은 200이다.
- CSP·HSTS·X-Frame-Options/`frame-ancestors`·`nosniff`·Referrer/Permissions Policy를 추가했고
  공개 307·로그인 200 양쪽에서 헤더를 확인했다.
- 운영 의존성을 Next 15.5.24, nanoid 3.3.18, postcss 8.5.26, sharp 0.35.4, ws 8.21.3으로
  올렸다. `npm audit --omit=dev` 0건과 TypeScript·Docker 프로덕션 빌드를 통과했다.
- 자비스는 실제 Middleware 인증과 Server Actions 10개를 사용한다. 확인된 Next.js 미들웨어 우회,
  Server Action DoS·SSRF 계열 권고와 기능이 겹치므로 세 앱 중 의존성 패치 우선순위가 가장 높다.
- 실행 컨테이너는 비root `1001:1001`, read-only rootfs, `cap_drop: ALL`,
  `no-new-privileges`로 세 앱 중 가장 잘 격리돼 있다.
- 프런트 `.dockerignore`를 추가해 env·빌드 산출물을 컨텍스트에서 제외했고 실행 이미지에도 env 파일이 없다.
- 인증 뒤 DB를 읽는 대시보드 레이아웃을 강제 동적 렌더링으로 바꿨다. 빌드 중 개인 운영 데이터를 읽거나
  정적 이미지에 굽지 않으며, 모든 대시보드 경로가 `ƒ`로 빌드되는 것을 확인했다.
- 비밀 제외를 확인한 프런트·배포 설정 106개를 로컬 git 첫 기준점 `552d9f2`로 남겼다. private 원격은 아직 없다.

## 4. 비밀·백업·물리 보안

- 통합 스택 시크릿과 Cloudflare tunnel credential 파일 권한은 제한돼 있고, Drive 사본은 파일명과 내용을
  rclone crypt로 암호화한다.
- 내부 APFS는 FileVault가 꺼져 있다. 2026-08-29 외장 SSD 신규 사본은 `agitssdcrypt:` 파일 단위
  암호화로 전환해 파일 7개 cryptcheck와 실제 복구 리허설을 통과했다. 다만 전환 전 평문 사본은
  `/Volumes/SHmaegmini/backups/`에 안전망으로 남아 있어 7일 관측 뒤 별도 삭제 결정이 필요하다.
- 이관 전 Jarvis self-hosted Supabase `.env`도 `600`으로 제한했다.
- Drive 암호화 키가 있는 rclone 설정의 맥미니 외부 사본은 아직 사용자 확인 항목이다. 이 사본이 없으면
  맥 고장 시 암호화 Drive 백업을 복구할 수 없다.

## 5. 우선순위

### P0 — 다음 운영 변경 창에서 먼저

1. **완료** — 자비스 의존성 패치·타입검사·보안 헤더·동적 렌더링·재빌드·배포.
2. **완료** — 샘링크 의존성 패치·Docker 빌드·재배포·공개 응답 확인.
3. **대기** — SSH 공개키 접속 시험이 실패했다. 키 접속을 먼저 준비한 뒤 password와 keyboard-interactive를 끈다. 공유기에서 TCP 22 전달이
   없는지도 확인한다. SSH를 쓰지 않으면 macOS 원격 로그인을 끈다.
4. **완료** — secret env 권한 600, 두 저장소 `.dockerignore` 보강, 실행 이미지 env 미포함 확인.

### P1 — 포트·전송·보관

1. **완료** — Jarvis Caddy 8001 loopback 제한, 8444 TCP/UDP 제거, Tunnel·공개 응답 정상.
2. **완료** — `classroom-tools` 8080 loopback 제한, host Caddy survival 200.
3. **완료** — 자비스 보안 헤더와 샘링크·샘링크 API HSTS에 이어 아지트 API HSTS도 root 소유 호스트
   Caddyfile에 반영했다. 무중단 reload 뒤 공개·로컬 TLS 401 응답에서 헤더를 확인했다.
4. **부분 완료** — 외장 SSD 신규 사본은 `agitssdcrypt:`로 암호화했다. FileVault는 UPS·무인 재부팅·
   Docker 자동 복구를 우선해 보류하고 물리 접근 제한으로 보완한다. 기존 외장 평문 사본은 7일 관측과
   9월 1일 리허설 뒤 삭제 여부를 결정하며, rclone 복구키의 독립 사본은 계속 확인 대상이다.
5. **부분 완료** — 자비스 비밀 제외 로컬 초기 커밋 완료. private 원격 연결·push는 별도 승인 대상이다.

### P2 — 방어 심화

1. **부분 완료** — 샘링크는 비root/read-only/cap drop/NNP 적용. 아지트·연구소·classroom-tools와
   기능별 적정 메모리 제한은 남았다.
2. Stream Deck 28198은 macOS 방화벽 허용 상태이며 두 LAN 주소와 Docker에서 연결된다. 공유기 TCP 전달을
   확인하고 LAN 기능을 쓰지 않으면 인바운드를 차단한다.
3. **검사 완료** — Docker Scout 로그인 제한 때문에 Docker 소켓 없는 Trivy 임시 tar 방식으로 운영 고유
   이미지 15개를 검사했다. 0건이 아니며 공식/베이스 이미지 갱신은
   [CVE 보고서](DOCKER_CVE_SCAN_20260829.md)의 순서로 별도 진행한다.

## 6. 확인한 권고 근거와 점검 한계

- 주요 패키지 근거: [Next.js Server Action DoS](https://github.com/advisories/GHSA-m99w-x7hq-7vfj),
  [Next.js Middleware 우회](https://github.com/advisories/GHSA-26hh-7cqf-hhc6),
  [ws 메모리 고갈](https://github.com/advisories/GHSA-96hv-2xvq-fx4p),
  [sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).
- `npm audit`은 운영 의존성만 검사했다. 개발 의존성은 이번 공개 런타임 판정에서 제외했다.
- Docker Scout는 Docker ID 로그인 제한으로 쓰지 못했다. 대신 Trivy 0.74.0 고정 digest를 사용해 Docker
  소켓 없이 15개 운영 이미지를 검사했다. 결과는 0건이 아니며 패키지 존재와 실제 노출 경로를 나눠 해석한다.
- 브라우저 연결 후보가 0개이고 `agent-browser` 실행 파일도 없어 실제 화면 눈검사는 못 했다. 공개 HTTP,
  CSP/HSTS 헤더, 로그인 보호, 세 앱 빌드와 컨테이너 로그로 대체 검증했다.
- 원시 포트의 WAN 도달 여부는 공유기/NAT 외부 시점 검사가 필요하다. 이 문서의 비표준 포트 판정은
  host bind·방화벽 허용·실제 LAN 응답에 근거한다.
