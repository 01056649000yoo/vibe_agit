# Supabase self-hosted 월간 업데이트 정책

> 기준일: 2026-08-29
> 대상: 맥미니 `~/agit-supabase/` 통합 스택과 이를 함께 쓰는 아지트·샘링크·자비스·통합 연구소

## 결론

> **일정 변경(2026-08-29 사용자 결정)**: 10월까지 기다리지 않고 이번 주말에 먼저 정상화한다.
> `self-hosted/v0.8.0` 구성 버전과 Kong 호환 구조를 고정했고, 8월 29일 격리 복원·전체 스모크를 통과했다.
> 8월 30일 04:00 백업과 05:00 모니터가 모두 PASS일 때만 05:30 운영에 반영한다. 어느 게이트든 실패하면
> 운영은 그대로 두며 10월 계획을 대체 일정으로 유지한다.

- 서비스별 Docker Hub 최신 태그를 따로 올리지 않고, Supabase가 함께 검증해 공개한
  **`self-hosted/vX.Y.Z` 릴리스 태그 하나를 묶음 기준**으로 삼는다.
- 평상시에는 릴리스 뒤 **14일 관찰 후 매월 둘째 일요일 00:00~02:00 KST**에 반영한다.
  03:30 보조 백업과 04:00 통합 백업 전에 정상화·롤백할 여유를 둔다.
- 공개 Auth·Storage·Realtime·Gateway에 영향을 주는 보안 수정은 별도 판정해 **72시간 안의 긴급 변경 창**을
  잡는다. 긴급 변경도 백업·격리 검증·롤백 준비는 생략하지 않는다.
- 최초 정상화 대상은 **`self-hosted/v0.8.0` 구성 버전 + Kong 호환 구조**로 고정했다. 운영 서비스명
  `kong`, 컨테이너명 `agit-kong`, loopback 8100을 유지해 Caddy·연구소·배포/건강검진 참조를 바꾸지 않는다.
  2026-08-30 예약이 게이트에서 중단되면 10월 3~5일 연휴를 대체 변경 창으로 사용한다.
- 전체 묶음 반영 전이라도 공식 릴리스가 명시한 작은 보안 설정은 따로 선반영한다. Realtime 관리 경로
  `/openapi`·`/tenants`의 Kong 403 차단은 2026-08-29 적용을 마쳤다.
- **Envoy 전환은 서비스 버전 갱신과 분리한 별도 작업**으로 한다.

Supabase는 Docker Compose의 안정 스냅샷을 대략 월 1회 공개하며, 포함 이미지들이 함께 테스트되므로 개별
Docker Hub 최신판보다 늦을 수 있다고 설명한다. 따라서 이 서버에서는 개별 최신성보다 묶음 호환성을 우선한다.
[공식 Docker self-hosting 문서](https://supabase.com/docs/guides/self-hosting/docker#updating)

## 무엇을 한 묶음으로 볼 것인가

공식 릴리스의 아래 구성과 설정 파일을 한 변경 단위로 다룬다.

- Postgres, Auth, PostgREST, Realtime, Storage, imgproxy
- postgres-meta, Edge Runtime, Studio
- API gateway(Kong 또는 Envoy), Supavisor
- `docker-compose*.yml`, gateway 설정, 함수 main worker, DB 초기화·역할 SQL
- 새로 추가되거나 의미가 바뀐 `.env.example` 키

현재 사용하지 않는 Analytics·Vector·Supavisor 같은 서비스는 업데이트 뒤에도 켜지 않는다. 다만 Compose에 남기는
이미지 태그와 설정은 같은 공식 묶음에 맞춰, 나중에 켰을 때 혼합 버전이 되지 않게 한다.

다음은 Supabase 묶음 밖이므로 같은 날 자동으로 끼워 넣지 않는다.

- 호스트 Caddy와 Caddyfile
- 아지트·샘링크·자비스·연구소·classroom-tools 애플리케이션 이미지
- Stream Deck와 macOS 서비스
- 백업·모니터링 LaunchAgent

이들은 자체 보안 수정이 필요할 때 별도 작은 변경으로 처리한다. 단, Supabase API 주소·서비스 이름을 참조하는
Caddy와 앱 설정은 묶음 업데이트의 호환성 검사 대상에는 포함한다.

## 현재 서버의 첫 적용 후보

### 완료: Realtime 관리 경로 차단

2026-08-29 변경 전 로컬 Kong 실응답을 공개 anon 키로 확인한 결과는 다음과 같았다.

- `/realtime/v1/api/openapi` → `200`
- `/realtime/v1/api/tenants` → `403`

아지트·샘링크·자비스 본앱 소스에는 `.channel()`·`postgres_changes` 구독이 없다. 다만 통합 연구소의
교사용 질문 결과 화면은 활동 중인 `question_generator` 결과 창을 열었을 때만
`writing_helper.activity_events`를 구독하며, 실패하면 5초 조회로 전환한다. 해당 테이블은 실제
`supabase_realtime` publication에도 등록돼 있다. 점검 순간 Realtime 4000 포트의 연결 세션은 0개였다.
따라서 Realtime은 상시 핵심 경로는 아니지만 완전 미사용 서비스도 아니다.

공식 v0.6.0 방식의 `request-termination` 규칙 두 개를 운영 `kong.yml`에 추가하고 Kong만 재생성했다.
변경 뒤 두 관리 경로는 모두 403이며 일반 Realtime WebSocket handshake는 101을 유지했다. 운영 보안 검사는
설정 파일의 두 차단 규칙과 실제 403 응답을 함께 확인한다.
[공식 변경 기록](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md#060---2026-06-17)

### 최소 정상화 기준: `self-hosted/v0.7.2` + Kong

| 구성 | 현재 | 1차 묶음 |
|---|---|---|
| Studio | `2026.04.08-sha-205cbe7` | `2026.08.03-sha-022b374` |
| Kong | `3.9.1` | `3.9.3` |
| Auth | `v2.186.0` | `v2.189.0` |
| PostgREST | `v14.8` | `v14.12` |
| Realtime | `v2.76.5` | `v2.102.3` |
| Storage | `v1.48.26` | `v1.60.4` |
| imgproxy | `v3.30.1` | `v3.30.1` |
| postgres-meta | `v0.96.3` | `v0.96.6` |
| Edge Runtime | `v1.71.2` | `v1.74.0` |
| Postgres | `17.6.1.084` | `17.6.1.136` |
| Supavisor(현재 미기동) | `2.7.4` | `2.9.5` |

v0.7.2는 필요한 서비스 이미지들을 포함하면서 Kong을 기본 게이트웨이로 유지하므로, 현재 혼합 설치와
v0.8.0 사이 변경을 읽는 비교 기준으로 사용했다. 운영에는 v0.7.2를 먼저 재기동하지 않고 v0.8.0 구성 버전
한 묶음만 반영한다.
[v0.7.2 공식 Compose](https://github.com/supabase/supabase/blob/self-hosted/v0.7.2/docker/docker-compose.yml)

### 확정 운영 도착 태그: `self-hosted/v0.8.0` 구성 버전 + Kong 호환 구조

2026-08-29의 최신 공식 묶음은 `self-hosted/v0.8.0`이다. 이 릴리스는 Envoy를 기본 게이트웨이로 바꾸지만
공식 Kong override를 계속 제공한다. 이번 최초 정상화는 게이트웨이 서비스까지 Envoy형 `api-gw`로 바꾸지
않고, 공식 v0.8.0의 서비스 이미지·Kong 설정·Auth URL·healthcheck·Edge main worker를 현재 `kong` 서비스에
반영한다. 그러므로 `agit-kong`, 내부 `kong:8000`, 호스트 8100 참조가 유지되며 v0.7.2를 중간에 재기동하지 않는다.
[공식 변경 기록](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md#080---2026-08-11)

Envoy로 실제 전환하려면 먼저 다음 참조를 모두 `api-gw` 호환 이름 또는 외부 API 주소로 정리하고 별도
스모크를 통과해야 한다.

- 호스트 Caddy의 `127.0.0.1:8100`
- 아지트 배포·건강검진·부하검사 스크립트의 8100 및 `agit-kong`
- 통합 연구소의 `SUPABASE_INTERNAL_URL=http://agit-kong:8000`
- 다른 앱 Compose·호스트 설정의 통합 API 내부 주소

## 매달 업데이트 여부를 결정하는 기준

매월 새 릴리스를 발견하면 아래 순서로 판정한다.

| 판정 | 조건 | 처리 시점 |
|---|---|---|
| 긴급 | 활성 공개 경로의 인증 우회, 데이터 노출·변조, 원격 코드 실행 또는 공식 보안 권고 | 원칙적으로 72시간 이내 |
| 정기 | 호환 서비스 패치·버그 수정·이미지 CVE 감소, 파괴적 변경 없음 | 릴리스 14일 뒤 둘째 일요일 00:00~02:00 |
| 분리 작업 | Postgres 메이저, Gateway 교체, JWT/키 방식, 공개 스키마·URL 의미 변경 | 일반 업데이트와 분리해 별도 계획 |
| 보류 | 현재 쓰지 않는 기능만 변경되거나, 복구·스모크 게이트가 실패 | 한 달 보류 후 다시 판정 |

보류는 “아무것도 하지 않음”이 아니다. ROADMAP에 대상 태그·보류 이유·다음 재검토일을 남긴다. 두 번 연속
보류하면 임시 버전 고정이 아니라 호환성 문제를 해결하는 별도 작업으로 승격한다.

판정할 때는 다음 네 자료를 함께 본다.

1. 공식 self-hosted changelog의 파괴적 변경과 보안 권고
2. 현재 활성 서비스와 실제 외부 노출 경로
3. 직전 Docker CVE 보고서 대비 수정 가능 CRITICAL/HIGH 변화
4. 아지트·샘링크·자비스·통합 연구소의 API·인증·Storage·Realtime 사용 여부

## 반영 전 통과 조건

하나라도 만족하지 못하면 운영 반영을 미룬다.

- 04:00 통합 백업이 앱 3/3·사본 7/7/7 `PASS`
- 가장 최근 실제 복구 리허설이 3/3 `PASS`
- 외장 SSD와 Google Drive 암호화 사본 모두 읽기 검증 성공
- 새 공식 태그와 현재 파일의 3-way merge dry-run 완료, 미해결 충돌 0
- `docker compose config` 결과에서 세 Compose 파일과 `secrets.agit.env` 연결 유지
- 새 포트·새 공개 route·새 env 키·기본값 변경을 사람이 검토
- 격리 시험 스택에서 로그인·REST·Storage·Edge·Realtime·세 앱 핵심 흐름 통과
- 새 이미지 CVE 재검사와 이전 결과 비교 완료
- 이전 Compose/config, 이미지 digest, DB·Storage 백업으로 롤백 가능

공식 `update.sh`는 base/new/yours를 비교하는 3-way merge이며 `.env`와 데이터를 유지하지만, DB와 Storage를
백업해 주지는 않는다. 현재 설치에는 `.supabase-version`이 없으므로 먼저 가장 가까운 공식 기준점을 찾아야
의미 있는 dry-run이 가능하다.
[공식 업데이트 절차](https://supabase.com/docs/guides/self-hosting/updating)

## 최초 정상화 절차

현재 Compose는 여러 시점의 파일과 PG17 override가 섞여 있어 임의로 `.supabase-version`을 최신 태그로 쓰면
안 된다. 아래 한 번의 정상화가 끝난 뒤부터 월간 업데이트가 단순해진다.

1. **기준점 찾기**: 현재 vendor 파일을 과거 공식 태그들과 비교해 가장 가까운 base를 정한다.
2. **격리 사본 만들기**: 현재 세 Compose 파일과 비밀을 제외한 설정을 복제하고, 최신 백업을 임시 DB·Storage에
   실제 복원한다.
3. **단계별 dry-run**: 현재 파일에서 v0.7.2와 v0.8.0까지의 파괴적 변경을 순서대로 검토한다. 특히
   v0.7.0의 `API_EXTERNAL_URL`·노출 스키마·Realtime 암호화 키와 v0.8.0 gateway 기본값을 확인한다.
4. **사용자 변경 재적용**: loopback 포트, `agit-*` 컨테이너 이름, PG17·아지트 secret override,
   외부 Storage 볼륨과 비활성 profile을 보존한다.
5. **격리 스모크**: 관리자·교사·학생 인증, 각 앱 읽기/쓰기, 파일 업로드·다운로드, Edge 함수, Realtime을
   시험 데이터로 확인한다.
6. **운영 변경 창**: 앱 쓰기를 잠시 멈추고 새 백업을 만든 뒤 이미지를 미리 pull한다. DB health 확인 후
   API 계층과 Kong을 재생성하고, 모든 검사가 끝난 뒤 앱 쓰기를 다시 연다.
7. **기준점 기록**: 성공한 공식 태그를 `~/agit-supabase/.supabase-version`에 기록한다. 이후에는
   `update.sh --dry-run --to <tag>`를 표준 경로로 쓴다.
8. **7일 관찰**: 이전 이미지는 prune하지 않고 보존한다. 오류율·컨테이너 재시작·DB 연결·백업 3/3·사본
   7/7/7·복구 결과를 본 뒤 롤백 자산을 정리한다.

## 이번 일정

| 시점 | 할 일 |
|---|---|
| 2026-08-29 | Realtime `openapi`·`tenants` 관리 경로의 Kong 403 차단 완료 |
| 2026-08-29 | v0.8.0 고정 staging·체크섬 생성, 이미지 선다운로드, 최신 백업 격리 복원과 전체 스모크 PASS |
| 2026-08-30 04:00 | 통합 백업 앱 3/3·사본 7/7/7 PASS 확인 |
| 2026-08-30 05:00 | 자동 백업 모니터 PASS 확인 — 실패면 05:30 작업 자동 중단 |
| 2026-08-30 05:30 | 고정한 v0.8.0 구성 버전 + Kong 호환 구조 반영, 실패 시 설정·이미지 자동 롤백 |
| 반영 후 7일 | 일일 백업·오류·재시작 추이 관찰 후 롤백 자산 정리 판단 |
| 예약 중단 시 | 운영을 유지하고 2026-10-03~05 연휴를 대체 변경 창으로 사용 |

이 일정에는 기능 배포, Envoy 전환, 오래된 이미지 prune을 함께 넣지 않는다. 문제가 생겼을 때 원인과 되돌릴
대상을 하나로 유지하기 위해서다.

2026년 개천절 연휴는 10월 3~5일이다.
[우주항공청 2026년 월력요항](https://www.kasa.go.kr/prog/bbsArticle/BBSMSTR_000000000010/view.do?bbsId=B000000000010&nttId=B000000001860Pe2zT3)

## 기록해야 할 것

각 회차마다 WORKLOG와 이 문서의 실행 이력에 다음만 남긴다. 비밀 값은 기록하지 않는다.

- 검토한 공식 태그와 결정: 적용 / 보류 / 긴급
- 실제 image tag와 digest
- changelog의 파괴적 변경과 우리 서버 영향
- 백업·복구 실행 ID와 PASS/FAIL
- dry-run 충돌 수와 해결한 사용자 override
- 스모크 결과와 중단 시간
- 롤백 여부, 7일 관찰 종료일

## 실행 이력

| 검토일 | 공식 최신 | 결정 | 이유 | 다음 확인 |
|---|---|---|---|---|
| 2026-08-29 | `self-hosted/v0.8.0` | 전체 묶음은 10/3~5로 이월, Kong 관리 경로만 선반영 | 현재 설치 기준점 없음, Kong 직접 참조, Realtime 제출 확인 유지 | 2026-09-25 후보 고정 |
| 2026-08-29 | `self-hosted/v0.8.0` | 사용자 결정으로 8/30 05:30 조건부 반영 예약 | 격리 복원·전체 스모크 PASS, 운영 이름/8100 유지, 04:00·05:00 백업 게이트와 자동 롤백 준비 | 2026-08-30 결과 확인 |
