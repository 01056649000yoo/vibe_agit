# LLM 위키 인덱스

이 페이지는 모든 문서를 세션에 넣는 대신, 작업 주제에 맞는 원문만 찾아 읽기 위한 라우팅 지도다.
문서 내용의 정본은 아래 원문이며 이 인덱스에는 상세 규칙을 복사하지 않는다.

## 가장 먼저 보는 문서

| 알고 싶은 것 | 정본 |
|---|---|
| 세션의 최소 활성 정보 | [SESSION_CONTEXT.md](../../SESSION_CONTEXT.md) |
| 작업 방법과 절대 규칙 | [AGENTS.md](../../AGENTS.md) |
| 현재 위치와 앞으로 할 일 | [ROADMAP.md](../../ROADMAP.md) |
| 최근 변경과 변경 이유 | [WORKLOG.md](../../WORKLOG.md) |

## 작업별 라우팅

| 작업 주제 | 먼저 읽을 문서 | 함께 확인할 것 |
|---|---|---|
| 시스템 구조·맥미니 운영 상식 | [ARCHITECTURE.md](../../ARCHITECTURE.md) | ROADMAP 현재 위치 |
| 이관·연구소 통합 | [INTEGRATION_PLAN.md](../../INTEGRATION_PLAN.md) | ARCHITECTURE |
| 학생 홈·목록·쓰기·1,000명 성능 | [PERFORMANCE_HARNESS.md](../../PERFORMANCE_HARNESS.md) | AGENTS의 현재 확장 규칙 |
| RLS·인증·RPC·Edge 함수·외부 API | [SECURITY_HARNESS.md](../../SECURITY_HARNESS.md) | AGENTS의 DB 마이그레이션 규칙 |
| 맥미니 내부 장애 점검 화면 | [OUTAGE_PLAN.md](../OUTAGE_PLAN.md) | 운영 Caddy·상태 기록 스크립트 |
| 백업·복구·자동 리허설 | [backup.md](../../backup.md) | git 밖 변경도 WORKLOG에 기록 |
| 브라우저 실기기 검증 | [MANUAL_ACCEPTANCE_CHECKLIST.md](../../MANUAL_ACCEPTANCE_CHECKLIST.md) | 관련 WORKLOG 항목 |

## 부분 조회 방법

긴 문서는 전체를 읽기 전에 제목과 키워드로 범위를 좁힌다.

```powershell
rg -n "검색어" ROADMAP.md WORKLOG.md docs
rg -n "^## " WORKLOG.md
rg -n "^## |^### " ROADMAP.md
```

검색 결과의 관련 섹션만 읽되, 규칙이 서로 충돌해 보이면 `AGENTS.md`와 더 최근의 ROADMAP 결정 기록을 우선 확인한다.

## 유지 원칙

- `SESSION_CONTEXT.md`는 짧게 유지하고 이력을 쌓지 않는다.
- 완료 과정은 WORKLOG, 미래 계획은 ROADMAP, 설계 이유는 ARCHITECTURE 계열 문서에만 둔다.
- 새 문서가 생기면 이 표에 경로와 사용 시점을 추가한다.
- WORKLOG가 더 커지면 월별 보관 파일로 분리하되, 기존 링크와 검색 경로를 보존하는 별도 작업으로 진행한다.
