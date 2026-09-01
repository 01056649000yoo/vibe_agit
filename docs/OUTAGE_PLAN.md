# 맥미니 내부 장애 때 점검 화면 보여 주기

> 2026-08-21 운영 반영·실장애 검증 완료. 앱 컨테이너가 응답하지 않으면 호스트 Caddy가
> 같은 주소에서 정적 점검 화면을 보여 준다. 장애·복구 메일은 보내지 않는다.

## 이번 범위

| 상황 | 결과 |
|---|---|
| `agit-app` 중지·배포 실패·내부 프록시 오류 | Caddy가 `잠시 점검 중이에요` 화면 표시 |
| 맥미니 전원·인터넷·호스트 Caddy 전체 장애 | 이번 범위 밖 — 브라우저 연결 오류 |

본 서비스는 계속 **맥미니 Docker + 호스트 Caddy**로 운영한다. Cloudflare나 GitHub Pages를
본 서비스 앞에 두지 않는다.

## 동작 구조

```text
사용자 → 호스트 Caddy → agit-app(127.0.0.1:8300)
                └─ upstream 오류 → /etc/caddy/static/maintenance.html
```

원본 파일은 저장소의 `ops/caddy/maintenance.html`이다. 운영 파일을 직접 따로 고치지 않고
원본을 수정·검증한 뒤 복사한다.

```bash
sudo mkdir -p /etc/caddy/static
sudo install -m 0644 ops/caddy/maintenance.html /etc/caddy/static/maintenance.html
```

운영 `/etc/caddy/Caddyfile`의 아지트 apex 블록에는 다음 오류 처리가 들어 있다.

```caddyfile
reverse_proxy 127.0.0.1:8300

handle_errors {
	rewrite * /maintenance.html
	file_server {
		root /etc/caddy/static
	}
}
```

적용할 때는 문법을 먼저 확인하고 reload한다.

```bash
sudo /opt/homebrew/bin/caddy validate --config /etc/caddy/Caddyfile
sudo /opt/homebrew/bin/caddy reload --config /etc/caddy/Caddyfile
```

## 실제 장애 검증 결과

2026-08-21 `agit-app`을 중지하고 로컬 TLS 경로로 실제 운영 Caddy를 호출했다.

- 점검 응답: HTTP 502
- 본문: `잠시 점검 중이에요` 확인
- 헤더: `Cache-Control: no-store`, `X-Frame-Options: DENY` 확인
- 앱 재시작 뒤 `127.0.0.1:8300` HTTP 200 복구 확인

HTTP 상태는 장애임을 숨기지 않도록 502로 유지하지만, 브라우저에는 정적 점검 본문이 표시된다.

## 운영 상태 기록 — 외부 발송 없음

`scripts/check-service-health.sh`는 launchd에서 5분마다 실행하며 다음 상태를 관리자
`서비스 현황`에 기록한다.

- 앱 응답
- DB 응답
- 디스크 여유 10GB 기준
- unhealthy·재시작 중인 컨테이너
- 26시간 넘게 새 기록이 없는 일일 백업
- 도커 VM의 실제 메모리 압박: 여유 15% 미만, PSI 지연, 여유 30% 미만에서 직전 점검 뒤 64MB 이상
  새 스왑 아웃, 또는 여유 30% 미만이면서 스왑 90% 이상
- 맥 본체의 실제 메모리 압박: 여유 15% 미만, 또는 여유 30% 미만이면서 스왑 1GB 초과

이미 밀려난 차가운 페이지는 여유가 생겨도 스왑에 남을 수 있으므로, 스왑 사용량만으로는 장애를 열지
않는다. 도커와 맥 경고를 분리하고 현재 여유·새 스왑 아웃·PSI를 함께 판단한다.

이 스크립트는 Resend·GitHub Actions·다른 외부 서비스로 장애 정보를 보내지 않는다. DB가 죽어
기록할 수 없을 때는 `~/Library/Logs/agit-service-health.stderr.log`에만 남긴다.

`RESEND_API_KEY`는 선생님의 의견 제보를 관리자에게 전달하는 `send-feedback` 함수도 사용하므로
운영 시크릿에서 제거하지 않는다. 장애 점검 스크립트만 이 키를 읽지 않는다.

## 오픈클로 텔레그램 낮 상태 보고

맥미니의 `scripts/report-service-health.sh`가 기존 5분 건강검진을 한 번 실행한 뒤 앱·DB·핵심 컨테이너와
디스크를 직접 확인한다. 첫 줄은 서비스 중단 여부만 요약하고, 둘째 줄은 핵심 상태, 셋째 줄은 전체 상세를
볼 관리자 화면 위치를 안내한다.

```text
🟢 끄적끄적 아지트 정상
앱 정상 · DB 정상 · 핵심 9/9 · 디스크 64GB
세부 보기: https://끄적끄적아지트.site (관리자 → 서버 상태)
```

다음 중 하나일 때만 첫 줄을 `🔴 끄적끄적 아지트 문제 있음`으로 바꾼다.

- 앱 로컬 HTTP가 200이 아니거나 DB `SELECT 1`이 실패한다.
- 앱·DB·Kong·인증·REST·Realtime·Storage·Imgproxy·Edge Functions 핵심 9개 중 하나가 없거나 비정상이다.
- 루트 디스크 여유가 10GB 미만이거나 기존 건강검진의 지속 메모리 압박 경고가 열려 있다.

백업 점검, 비핵심 컨테이너 경고, 건강검진 기록기 자체 실패는 앱 중단과 구분해 초록 상태를 유지하고
둘째 줄에 `운영 참고 N건`만 붙인다. 원문 로그·경고 상세·비밀 값은 텔레그램으로 보내지 않고, 필요할 때
로그인한 관리자 대시보드의 `서버 상태`에서 확인한다.

OpenClaw command cron은 AI 모델을 호출하지 않고 위 스크립트의 stdout을 현재 연결된 텔레그램
대화로 그대로 전달한다. 한국 시간 `08:00·10:00·12:00·14:00·16:00·18:00`에 실행하며, 선언 원본은
`ops/openclaw/install-agit-daytime-health-report.sh`다. 텔레그램 토큰·대화 ID·환경변수·원문 로그는
저장소와 메시지에 넣지 않는다.

설치 뒤에는 OpenClaw cron 목록에서 선언 키 `agit-daytime-health-report-v1`이 하나만 있는지 확인하고,
즉시 실행을 한 번 해 실제 텔레그램에 세 줄 요약이 도착하는지 확인한다. 중지할 때는 해당 cron ID를 찾아
`openclaw cron disable <id>`, 완전히 없앨 때는 `openclaw cron rm <id>`를 사용한다.

이 보고도 맥미니 안에서 실행되므로 맥미니 전원·가정 인터넷·OpenClaw 자체가 멈추면 메시지를 보낼 수 없다.
예정 시각의 메시지가 오지 않는 경우는 외부에서 접속 상태를 별도로 확인한다.

## 다시 시험할 때

실서비스를 잠시 내리는 작업이므로 수업 영향이 없는 시간에만 진행하고, 실패해도 자동으로 다시
시작하도록 `trap`을 건다. 시험 뒤 반드시 다음 세 가지를 확인한다.

1. 점검 본문과 보안 헤더
2. `agit-app` 실행 상태
3. 앱 직접 주소와 Caddy 주소의 HTTP 200 복구

## 다음 겨울방학 후속 과제

맥미니 전원·호스트 Caddy·가정 인터넷이 모두 불능이어도 평소 서비스 주소에서 점검 화면이 자동으로
나오게 하는 외부 이중화는 **2026–27 겨울방학에 검토·구현**한다. 그전까지는 현재 Caddy 내부 점검 화면만
유지하고 DNS·Cloudflare·GitHub Pages 구성은 변경하지 않는다.

우선 검토안은 `Cloudflare Worker → 맥미니 Caddy 원본`이다. 앱 호스팅은 계속 Caddy가 담당하고,
Worker는 원본 연결 오류 또는 `502/503/504` 때만 정적 점검 화면을 반환한다. 별도 GitHub Pages 주소만으로는
평소 서비스 주소가 자동 전환되지 않으므로 보조 상태 주소가 필요할 때만 후보로 둔다.

적용 전에는 다음을 확인한다.

1. 가비아 DNS 레코드 전체 백업과 `api.`·`helper.`·Google OAuth 영향
2. Worker가 자기 자신을 다시 호출하지 않도록 원본 전용 호스트를 분리하고 접근을 보호하는 방법
3. 실제 요청량과 무료 한도·비용
4. 시험용 하위 도메인에서 맥미니·Caddy·원본 연결 장애와 자동 복구 리허설
