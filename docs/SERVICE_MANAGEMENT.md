# 셀프호스팅 서비스 정기점검·CVE 대시보드

## 운영 원칙

- 관리자 대시보드의 `운영 → 서비스 관리`에서 분기 체크리스트와 Docker 이미지 CVE 추이를 함께 본다.
- 분기 주기는 달력 분기를 억지로 맞추지 않고 **실제 점검 완료 시각 + 3개월**로 계산한다.
- 첫 기준일은 자동으로 만들지 않는다. 2026-08-30 Supabase 업데이트를 확인한 뒤 사용자가 첫 점검을 요청한
  시점에 점검을 시작하고, 모든 항목을 확인해 완료한 시각을 기준으로 삼는다.
- CVE는 첫 점검 때 `npm run service:scan -- --force`로 기준을 만들고, 그 뒤에는 마지막 성공 검사에서 30일이
  지난 날의 02:10 정기 작업이 실행한다. 이미지 변경 뒤에는 월간 일정 전이라도 `--force`로 다시 검사한다.
- 자동화 범위는 수집·비교·표시까지다. 이미지 업데이트, 컨테이너·볼륨 삭제, 서비스 중지는 자동화하지 않는다.

## 데이터 경계

- 실행 중인 이미지는 `docker save`로 임시 tar 하나씩 만들고, digest로 고정한 Trivy 컨테이너에 읽기 전용으로
  전달한다. Trivy에는 Docker 소켓을 마운트하지 않는다.
- 검사기 이미지는 **쓰기 전에 먼저 내려받는다**(고정한 digest 그대로). 2026-09-02에 이 이미지가 로컬에서
  사라진 채 정기 검사가 `No such image`로 시작도 못 하고 죽어 있었다. 월 1회만 도는 작업이라 조용히 밀린다.
- 원본 JSON은 gzip으로 압축해 `~/Library/Application Support/Agit/service-scans/`에 권한 600으로 둔다.
- DB에는 이미지 참조·digest·서비스 묶음·노출 등급과 CRITICAL/HIGH/수정 가능/긴급/**이유를 적어 뺀 개수**,
  원본 SHA-256만 저장한다. 패키지 경로·원본 로그·파일 경로·시크릿은 저장하지 않는다.
- 원장 테이블은 `anon`·`authenticated`·`service_role` 직접 접근을 모두 막는다. 호스트 기록 RPC와 실제
  `profiles.role='ADMIN'`을 확인하는 관리자 RPC만 사용한다.

## 세지 않는 것 — 두 갈래 (2026-09-02)

검사기는 **라이브러리가 이미지에 들어 있는지**만 본다. 그 코드가 실제로 실행되는지는 못 본다. 그래서 SSH를
켜지도 않는 컨테이너에 SSH 인증 우회 CRITICAL이 뜬다. 이런 것을 그대로 세면 **진짜 볼 것이 잡음에 묻힌다**
(실제로 `지금 확인할 항목` 24건 중 12건이 커널 헤더 하나였다).

세지 않는 것은 **조용히 사라지지 않는다.** 뺀 건수는 `ignored_count`로 함께 기록해 화면에 `이유를 적어 뺀 항목
N건`과 이미지 표의 `숨김` 열로 보여 주고, 원본 보고서에는 모든 항목이 그대로 남는다.

| 갈래 | 원본 | 무엇을 뺄 수 있나 |
|---|---|---|
| 패키지 단위 | `ops/service-management/services.json`의 `ignoredPackages` | 이미지 안에서 실행되지 않는 패키지(예: 커널 헤더 `linux-libc-dev` — 컨테이너는 호스트 커널을 쓴다) |
| 취약점 단위 | `src/constants/serviceFindingNotes.js` | 확인해 보니 실행 경로가 없는 개별 CVE |

두 갈래 모두 **이유를 적어야** 등록된다(검사기가 이유 없는 항목을 거부한다). 취약점 단위 판단에는
**유효기간(3개월, 분기 점검 주기와 맞춤)** 이 붙는다 — 구성은 바뀌므로 오늘의 근거가 반년 뒤에도 참이라는
보장이 없다. 기한이 지나면 검사기가 다시 세고 화면은 `다시 확인 필요`로 바뀐다.

근거는 **확인한 사실만** 적는다. "아마 안 쓸 것"은 여기 적지 않고 그냥 센다.

## 점검 항목

점검 항목의 단일 원본은 `20261198_service_management_dashboard.sql`의
`system_service_review_catalog`이다. 현재 12개 영역은 외부 포트, SSH·Tailscale, 컨테이너 격리, 버전,
비밀파일, HTTPS, 디스크·로그, 재시작, 백업·복구, 복구키·물리 보안, DB/RPC/Realtime, CVE 예외다.

각 항목은 `미확인 / 정상 / 보완 필요 / 해당 없음` 중 하나로 판정한다. 짧은 근거나 다음 조치는 240자 안에서
기록할 수 있지만 비밀번호·키·토큰은 입력하지 않는다. 미확인 항목이 하나라도 있으면 점검을 완료할 수 없다.

## 첫 점검 절차

1. Supabase 예약 업데이트 상태와 새 이미지·서비스 스모크를 확인한다.
2. `npm run service:scan -- --force`를 실행해 첫 CVE 기준을 기록한다.
3. 관리자 대시보드 `운영 → 서비스 관리 → 첫 점검 시작`을 누른다.
4. 12개 항목을 실제 상태와 대조하고 항목별 결과를 저장한다.
5. `점검 완료`를 누른다. 이 완료 시각의 3개월 뒤가 다음 점검일이 된다.
6. 월간 검사 LaunchAgent가 로드됐는지 확인한다.

## 판정

- `긴급`: 공개 요청 경로에 있는 수정 가능한 CRITICAL 탐지 횟수
- `조치`: 노출 등급과 무관하게 수정 가능한 CRITICAL·HIGH 탐지 횟수
- `수집 실패`: 이미지 하나라도 tar 생성·Trivy 검사에 실패한 경우. 0건으로 오해하지 않도록 전체 실행을 FAIL로 남긴다.
- CVE 개수는 취약 패키지 탐지 횟수이며 원격 공격 가능한 취약점 수와 같지 않다. 분기 점검에서 사용 경로와
  예외 사유를 다시 판정한다.

## 텔레그램 점검 알림 — 오픈클로 (2026-10-04)

선생님 결정: 오픈클로에는 **① 알림 ② 묻고 답하기**만 맡긴다. 조치(재시작·업데이트·삭제)는 맥미니에서 관문·되돌림이 있는 스크립트로.

- `scripts/server-status-summary.mjs` — 백업·복구 점검·관리자 경고·서비스 5개 응답·컨테이너·디스크·자동 업데이트 3종·보안 취약점·인증서를 **읽기만** 해서 한 장으로. AI 를 안 불러 토큰 0.
- ① `com.agit.server-status-brief`(매일 07:30, `--send`) · `com.agit.server-status-watch`(30분마다, `--alert-only` — 문제 항목이 새로 생기거나 풀릴 때만).
- ② 오픈클로 스킬 `server-status`(원본 `ops/openclaw/skills/server-status/SKILL.md` → `~/.openclaw/workspace/skills/`에 복사). "서버 괜찮아?" 에 위 스크립트 결과를 그대로 답한다.
- 텔레그램 받는 사람은 오픈클로에 짝지은 사용자를 그때 읽는다(번호를 저장소에 적지 않는다).
- **실행 제한(2026-10-04, 선생님 결정: 텔레그램에서 끄적끄적아지트·자비스·쌤링크 재시작·종료 금지)** — 두 겹.
  1. 오픈클로 실행 허용 목록 `ops/openclaw/exec-approvals.json` + `tools.exec.mode ask` + `channels.telegram.execApprovals.enabled false`
     → 목록 밖 명령은 **승인 카드 없이 자동 거절**(받을 곳이 없어 `askFallback: deny`). docker·python3·curl·node 는 인자까지 제한(DB 조회·자비스 스크립트·노션·서버 점검만).
     적용: `openclaw approvals set --gateway --file ops/openclaw/exec-approvals.json`. 검사 `tests/openclawExecPolicy.test.mjs`.
  2. docker 앞문 `ops/docker-guard/docker` → `/opt/homebrew/bin/docker` 에 복사 설치. 오픈클로가 부를 때만 세 앱 restart·stop·kill·rm·compose up/down 등을 막는다(로그 `~/Library/Logs/agit-docker-guard.log`).
  - ⚠️ `tools.exec.mode allowlist`(카드 없음)로 두면 **자비스(Codex 엔진)가 아예 실행을 거부**한다 — 반드시 `ask` + 텔레그램 카드 끄기 조합.
  - 자비스 기능이 "실행 정책에 막혔다" 고 답하면, 그 명령을 확인해 목록에 좁게 더한다(셸·인터프리터 전체 허용 금지).
    막힌 명령 기록: `sqlite3 ~/.openclaw/state/openclaw.sqlite "select json_extract(presentation_json,'$.commandText') from operator_approvals order by rowid desc limit 10"`.

## 관련 파일

- 화면: `src/components/admin/AdminServiceManagementPanel.jsx`
- DB 원장·RPC: `supabase/migrations/20261198_service_management_dashboard.sql`
- 호스트 검사기: `scripts/scan-service-images.mjs`
- 서비스 노출 분류 원본: `ops/service-management/services.json`
- 정기 작업: `ops/launchd/com.agit.service-vulnerability-scan.plist`
