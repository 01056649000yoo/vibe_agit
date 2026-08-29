# 3개 앱 운영·서버·외부 노출 보안 점검 — 2026-08-29

> 대상: 끄적끄적 아지트, 샘링크, 자비스와 이들이 공유하는 맥미니·Docker·통합 Supabase 경계.
> 이번 점검은 읽기 전용으로 진행했다. 포트·방화벽·컨테이너·파일 권한·패키지·운영 설정은 바꾸지 않았다.
> 비밀 값, 공인 IP, 사용자 데이터는 이 문서에 남기지 않는다.

## 결론

- 서비스와 데이터 계층은 정상이다. 컨테이너 16개가 모두 실행 중이고 DB·백업·복구·운영 경고도 정상이다.
- 아지트 자체 보안 하네스와 운영 DB 권한 검사는 통과했다.
- 즉시 보완할 핵심은 **자비스·샘링크 운영 의존성**, **SSH 비밀번호 로그인**, **불필요한 LAN 포트**,
  **샘링크 비밀파일 권한과 Docker 빌드 제외 규칙**, **암호화되지 않은 내부·외장 디스크**다.
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
| TCP 8001 | Jarvis Caddy의 Cloudflare origin | 모든 인터페이스, LAN에서 307 응답 | **중간** — Tunnel은 localhost만 쓰므로 loopback 바인딩 후보 |
| TCP 8080 | `classroom-tools` | 모든 인터페이스, LAN에서 200 응답 | **중간** — 호스트 Caddy용 loopback만 남길 수 있음 |
| TCP·UDP 8444 | Jarvis Caddy 직접 TLS | 모든 인터페이스, LAN에서 307 응답 | **중간** — 현재 Tunnel 설정에는 필요하지 않아 제거 후보 |
| TCP 28198 | Elgato Stream Deck | 모든 인터페이스 | **낮음~중간** — 모바일/LAN 기능을 안 쓰면 차단 후보 |
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

- 공개 서비스 200, CSP·`nosniff`·Referrer/Permissions Policy가 있다.
- HSTS가 없고 CSP의 script/style에 `unsafe-inline`이 있어 아지트보다 브라우저 방어가 약하다.
- 운영 의존성: **높음 3, 보통 1**. 현재 Next 16.2.10, nanoid 3.3.16, postcss 8.5.19,
  sharp 0.34.5다. `npm audit fix --dry-run`은 Next 16.3.3, nanoid 3.3.18, postcss 8.5.26,
  sharp 0.35.4로 해결 가능하다고 판정했다.
- 현재 코드에는 Middleware·Server Actions가 없고 Next Image는 사용한다. 따라서 보고된 Next 취약점 중
  미들웨어/Server Action 계열의 직접 노출은 자비스보다 낮지만, 이미지 처리와 프레임워크 취약점은 남는다.
- 실제 `.env.local`과 이관 전 백업 파일이 `644`이며 service-role·관리 토큰·webhook secret 같은 변수를
  가진다. git에서는 무시되지만 같은 맥의 다른 로컬 계정이 읽을 수 있다.
- 현재 실행 이미지에는 실제 env/백업 파일이 없고 example 두 개만 있다. 그러나 `.dockerignore`가
  `.env.local.bak-*`를 일반 패턴으로 제외하지 않으므로 다음 빌드에서 포함될 가능성을 없애야 한다.
- 컨테이너는 root·쓰기 가능 rootfs·cap drop 없음·보안 옵션 없음이다.

### 자비스

- 공개 루트는 로그인으로 307 이동하고 최종 로그인 화면은 200이다.
- HSTS·CSP·X-Frame-Options/`frame-ancestors`·`nosniff`·Referrer/Permissions Policy가 응답에서 보이지 않는다.
- 운영 의존성: **높음 5**. 현재 Next 15.5.15, nanoid 3.3.11, postcss 8.4.31,
  sharp 0.34.5, ws 8.20.0이다. dry-run은 Next 15.5.24, nanoid 3.3.18, sharp 0.35.4,
  ws 8.21.3 등으로 해결 가능하다고 판정했다.
- 자비스는 실제 Middleware 인증과 Server Actions 10개를 사용한다. 확인된 Next.js 미들웨어 우회,
  Server Action DoS·SSRF 계열 권고와 기능이 겹치므로 세 앱 중 의존성 패치 우선순위가 가장 높다.
- 실행 컨테이너는 비root `1001:1001`, read-only rootfs, `cap_drop: ALL`,
  `no-new-privileges`로 세 앱 중 가장 잘 격리돼 있다.
- 프런트 실제 env와 백업은 `600`이고 실행 이미지 안에서 env 파일은 발견되지 않았다. 다만 프런트 빌드
  컨텍스트에 `.dockerignore`가 없어 비밀파일이 BuildKit 컨텍스트·캐시에 들어갈 여지가 있다.
- 저장소 `main`에 커밋이 하나도 없고 전체 파일이 untracked다. 일일 tar 백업은 있지만 변경 이력·안전한
  롤백 기준이 없으므로 운영 복구성과 감사 가능성이 낮다.

## 4. 비밀·백업·물리 보안

- 통합 스택 시크릿과 Cloudflare tunnel credential 파일 권한은 제한돼 있고, Drive 사본은 파일명과 내용을
  rclone crypt로 암호화한다.
- 내부 APFS는 FileVault가 꺼져 있고, 외장 백업 SSD도 암호화되지 않았다. 두 위치의 백업은 평문이며 DB,
  계정 비밀번호 해시, 스택 env/시크릿을 포함하므로 맥이나 SSD 분실 시 세 앱 자료가 함께 노출될 수 있다.
- 이관 전 Jarvis self-hosted Supabase `.env`도 `644`이고 DB/JWT/service-role 등 민감 변수를 가진다.
  스택이 꺼져 있어도 값이 재사용되거나 보존 목적이면 권한 제한이 필요하다.
- Drive 암호화 키가 있는 rclone 설정의 맥미니 외부 사본은 아직 사용자 확인 항목이다. 이 사본이 없으면
  맥 고장 시 암호화 Drive 백업을 복구할 수 없다.

## 5. 우선순위

### P0 — 다음 운영 변경 창에서 먼저

1. 자비스 의존성을 안전 버전으로 올리고 테스트·재빌드·배포한다.
2. 샘링크 의존성도 audit 제안 버전으로 올리고 단축링크 생성·삭제·리다이렉트·iframe을 회귀 확인한다.
3. SSH 공개키 접속을 먼저 재확인한 뒤 password와 keyboard-interactive를 끈다. 공유기에서 TCP 22 전달이
   없는지도 확인한다. SSH를 쓰지 않으면 macOS 원격 로그인을 끈다.
4. 샘링크 실제 env/백업과 옛 Jarvis Supabase env를 `600`으로 제한한다. 두 저장소의 `.dockerignore`에
   `.env*`·백업 패턴을 넣고 example만 필요 시 예외로 둔다.

### P1 — 포트·전송·보관

1. Jarvis Caddy 8001은 `127.0.0.1`로 제한하고 8444 TCP/UDP는 소비자 재확인 후 제거한다.
2. `classroom-tools` 8080은 9월 21일 종료 전까지 host Caddy가 쓰므로 loopback 바인딩으로 바꾼다.
3. 자비스에 아지트 수준의 보안 헤더를 추가하고 샘링크·API 경계에 HSTS를 추가한다.
4. FileVault를 켜고 외장 SSD를 암호화 APFS로 이전하는 별도 유지보수 계획을 세운다. 암호화 전에는 기존
   백업과 rclone 복구키의 독립 사본을 먼저 확인한다.
5. 자비스를 비밀 제외가 검증된 private git 저장소로 초기 커밋해 배포 기준점을 만든다.

### P2 — 방어 심화

1. 아지트·샘링크·연구소·classroom-tools에 비root, read-only, `cap_drop`,
   `no-new-privileges`, 적정 메모리 제한을 기능별로 적용한다.
2. Stream Deck의 LAN 기능을 쓰지 않으면 28198 인바운드를 차단한다.
3. Docker Scout 로그인 또는 별도 승인된 이미지 스캐너로 앱 3개와 Kong/Caddy/Supabase 이미지의 OS 패키지
   CVE를 검사한다.

## 6. 확인한 권고 근거와 점검 한계

- 주요 패키지 근거: [Next.js Server Action DoS](https://github.com/advisories/GHSA-m99w-x7hq-7vfj),
  [Next.js Middleware 우회](https://github.com/advisories/GHSA-26hh-7cqf-hhc6),
  [ws 메모리 고갈](https://github.com/advisories/GHSA-96hv-2xvq-fx4p),
  [sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).
- `npm audit`은 운영 의존성만 검사했다. 개발 의존성은 이번 공개 런타임 판정에서 제외했다.
- Docker Scout는 설치돼 있지만 Docker ID 로그인이 없어 이미지 CVE 검사를 수행하지 못했다. 따라서
  “이미지 취약점 0건”으로 판정하지 않는다.
- 원시 포트의 WAN 도달 여부는 공유기/NAT 외부 시점 검사가 필요하다. 이 문서의 비표준 포트 판정은
  host bind·방화벽 허용·실제 LAN 응답에 근거한다.
