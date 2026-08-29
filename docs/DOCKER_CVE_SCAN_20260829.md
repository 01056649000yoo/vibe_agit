# 운영 Docker 이미지 CVE 점검 — 2026-08-29

## 결론

- 실행 중인 컨테이너가 사용하는 **고유 이미지 15개를 전수 검사**했다.
- Docker Scout 1.24.0은 설치돼 있었지만 Docker ID 로그인을 요구해 검사를 진행하지 못했다.
- 대체 도구로 Trivy 0.74.0 이미지를 digest로 고정해 사용했다.
  `aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`
- 외부 스캐너에 Docker 소켓을 주지 않았다. 각 운영 이미지를 임시 tar로 내보내 읽기 전용 스캔한 뒤
  tar를 제거했다.
- `CRITICAL` 77회·`HIGH` 1,017회가 탐지됐다. 같은 CVE가 여러 이미지·패키지에 중복돼 있으며,
  고유 ID는 각각 42개·586개다. 이 중 771회는 스캐너가 수정 버전을 제시한다.
- 이 숫자는 곧바로 원격 공격 가능한 취약점 수를 뜻하지 않는다. 빌드 도구·헤더 패키지·사용하지 않는
  런타임 경로도 포함된다. 다만 현재 운영 이미지를 `취약점 0건`으로 판정할 수는 없고, 이미지 갱신 작업이
  필요하다.

## 검사 결과

아래 숫자는 패키지별 탐지 횟수다. `고유 C/H`는 이미지 안에서 중복을 제거한 CVE ID 수이고,
`수정 가능`은 고정 버전이 제시된 CRITICAL+HIGH 패키지 탐지 횟수다.

| 운영 이미지 | CRITICAL | HIGH | 고유 C/H | 수정 가능 |
|---|---:|---:|---:|---:|
| `agit-app:prod` | 0 | 21 | 0 / 17 | 21 |
| `caddy:2-alpine`·`caddy:latest` 동일 이미지 | 0 | 21 | 0 / 17 | 21 |
| `classroom-tools-classroom-tools` | 0 | 21 | 0 / 17 | 21 |
| `curlimages/curl:8.12.1` | 2 | 22 | 1 / 13 | 24 |
| `darthsim/imgproxy:v3.30.1` | 2 | 49 | 2 / 46 | 51 |
| `jarvis_brain_local-frontend` | 1 | 23 | 1 / 21 | 24 |
| `kong/kong:3.9.1` | 0 | 3 | 0 / 2 | 3 |
| `postgrest/postgrest:v14.8` | 24 | 352 | 24 / 351 | 218 |
| `supabase/gotrue:v2.186.0` | 4 | 64 | 3 / 55 | 67 |
| `supabase/edge-runtime:v1.71.2` | 9 | 45 | 7 / 19 | 24 |
| `supabase/postgres:17.6.1.084` | 6 | 70 | 5 / 65 | 76 |
| `supabase/realtime:v2.76.5` | 22 | 171 | 11 / 82 | 59 |
| `supabase/storage-api:v1.48.26` | 5 | 120 | 3 / 69 | 125 |
| `url-app`(샘링크) | 1 | 12 | 1 / 10 | 13 |
| `writing-helper:integrated-lab` | 1 | 23 | 1 / 21 | 24 |

## 해석과 조치 우선순위

### 1. 먼저 갱신할 공개 API 계층

`gotrue`, `storage-api`, `edge-runtime`, `realtime`, `imgproxy`에는 crypto/TLS, gRPC, protobuf 및 각 OS
런타임 패키지의 수정 가능 CRITICAL이 있다. Kong 뒤에 있지만 공개 요청을 처리하는 계층이므로 Supabase
호환 버전을 확인한 뒤 새 공식 이미지로 올리고 기능·권한·복구 스모크를 다시 해야 한다.

### 2. 직접 빌드하는 Node 이미지

자비스·샘링크·글쓰기 연구소의 CRITICAL 1건은 애플리케이션 의존성이 아니라 Node 기본 이미지에 포함된
전역 npm의 `tar` 패키지다. 경로는 `/usr/local/lib/node_modules/npm/node_modules/tar`이며, 현재 서비스가
사용자 tar 압축을 해제하는 기능은 없다. 직접 노출도는 낮지만 다음 재빌드에서 다음 중 하나로 없앤다.

- 패치된 Node 런타임 베이스 사용
- 최종 runner 이미지에서 사용하지 않는 npm 제거
- 빌드와 실행 이미지를 더 엄격히 분리

애플리케이션 `npm audit --omit=dev` 0건과 이미지 OS/도구 CVE 검사는 서로 다른 검사이므로 둘 다 유지한다.

### 3. PostgREST 숫자 해석

PostgREST의 CRITICAL 24건은 모두 이미지에 포함된 Ubuntu `linux-libc-dev` 헤더 패키지에서 탐지됐다.
이 맥미니가 그 이미지의 커널을 실행하는 것이 아니므로 24건을 곧바로 PostgREST 원격 취약점 24개로 보면
안 된다. 그러나 불필요한 빌드 패키지가 runtime 이미지에 남아 있고 오래된 보안 메타데이터를 끌어오는
신호이므로, 공식 이미지 갱신 또는 더 작은 runtime 이미지 사용 여부를 확인한다.

### 4. 내부·예약 작업 이미지

- `curlimages/curl:8.12.1`은 2025-02 생성 이미지로 가장 오래됐고 수정 가능 CRITICAL이 있다. 인바운드
  서비스는 아니지만 교체가 쉬우므로 우선 갱신한다.
- Postgres는 외부 publish 없이 Docker 내부망에서만 사용하지만, 데이터 핵심 계층이므로 공식 Supabase
  스택 호환 버전 검증 후 함께 갱신한다.
- Caddy 계열·아지트 정적 앱·classroom-tools는 CRITICAL은 없지만 동일한 HIGH 21건을 공유한다. 최신
  베이스를 pull한 뒤 재빌드·무중단 교체한다.

## 권장 실행 순서

1. `curlimages/curl` 갱신과 cleanup 작업 스모크
2. 직접 빌드하는 자비스·샘링크·연구소·아지트·classroom-tools를 최신 고정 base digest로 재빌드
3. `imgproxy`와 Caddy 공식 이미지 갱신
4. Supabase 공식 self-hosted 버전 호환표를 기준으로 Auth·Storage·Edge·Realtime·PostgREST·Postgres를
   한 변경 창에서 순서대로 갱신
5. 각 단계에서 백업 → 새 이미지 scan → Compose 재생성 → 인증·REST·Storage·Edge·Realtime·앱 3개
   스모크 → 실패 시 이전 digest로 롤백

## 재검사 기준

- 태그만 기록하지 않고 실제 image digest와 스캔 날짜를 함께 남긴다.
- CRITICAL은 직접 노출 경로·사용 패키지·수정 가능 여부를 하나씩 판정한다.
- HIGH는 공개 입력을 처리하는 패키지와 내부 빌드 도구를 구분한다.
- `npm audit`, Trivy 이미지 검사, 실제 권한/기능 스모크 중 하나로 다른 둘을 대신하지 않는다.
- 원본 JSON은 점검 세션의 임시 경로에만 두며 개인정보·비밀은 포함하지 않는다. 장기 기록은 이 요약을
  기준으로 한다.

