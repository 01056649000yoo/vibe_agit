# 스택 통합 — 조사 결과와 계획

> **진행 상황**: 자비스는 2026-08-28 에 **이전 완료**. 샘링크만 남았다.
> 이전하며 배운 것은 아래 `실제로 해 보니` 절에 적었다.

> 2026-08-28 조사. 옛 `supabase` 스택을 아지트 스택으로 합치기 위한 사전 조사다.
> 실행 전에 이 문서를 먼저 읽는다. 여기 적힌 충돌 세 가지를 모르고 덤프를 복원하면 **자료가 날아간다.**

## 왜 두 벌인가 — 일부러 나눈 것이 아니다

[INTEGRATION_PLAN.md](../INTEGRATION_PLAN.md) `구조 확정 (2026-07-24, B안)`:

> 기존 라이브 스택(PG 15.8)을 제자리 업그레이드하지 않는다. 새 PG 17 스택을 별도 포트로 신설하고 …
> **기존 스택은 롤백용으로 보존 후 제거** (blue-green — 연구소 무중단, 실패 시 즉시 복귀)

blue-green 이전의 잔재다. **제거가 원래 계획**이었는데, 그때 뒤늦게 "옛 스택은 이미 멀티앱 공유 DB"임을
발견해(`app`·`literacy` 스키마) 미뤄졌고 그대로 굳었다.

## 지금 무엇이 어디에 있나

| | agit 스택 (PG17) | supabase 스택 (PG15.8) |
|---|---|---|
| 쓰는 앱 | 아지트, 글쓰기 연구소 | **샘링크, 자비스** |
| 메모리 | 1,438 MB | 545 MB |
| 컨테이너(실행) | 10 / 14 | 4 / 14 |

옛 스택 스키마별 실태(2026-08-28):

| 스키마 | 행수 | 정체 |
|---|---|---|
| `public` | 5,283 | **샘링크** 단축링크 215개 + 방문 기록 |
| `app` | 3 | **자비스** — 표 9개(`projects`·`vault_items`·`class_journals` 등) |
| `auth.users` | 18 | 옛 연구소 교사. 그중 **6명은 아지트에도 같은 이메일로 있다** |
| `writing_helper` | **0** | 연구소 — 아지트로 완전히 이전, 빈 껍데기 28개 |
| `literacy` | **0** | 서바이벌 잔재 |

**두 앱 다 살아 있다.** 최근 72시간 옛 Kong 요청 22,463건:
`short_links` 7,532 · `rpc` 6,710 · `short_link_device_access` 5,072 ·
`projects`/`project_updates` 14 · `class_journals`/`vault_items` 등 9.

> ⚠️ 표의 행 수만 보고 "안 쓴다"고 판정하면 안 된다. 2026-08-28 에 실제로 그렇게 잘못 짚었다 —
> 자비스는 읽기 위주라 행이 적고, `jarvis-caddy` 에는 **접근 로그 설정이 아예 없어** 로그도 조용하다.
> 판단은 **Kong 요청 수**로 한다: `docker logs supabase-kong --since 72h | grep -oE '/rest/v1/[a-z_]+' | sort | uniq -c | sort -rn`

## ⚠️ 옮길 때 터지는 곳 세 군데

### ① `classes` 표 이름 충돌 — 가장 위험

| | 옛 스택 | 아지트 |
|---|---|---|
| 행 | 1 | **373** |
| 칼럼 | 4 (`id`·`name`·`description`·`created_at`) | 35 |

**이름만 같고 완전히 다른 표다.** 아지트의 `classes` 는 학급 373개가 든 핵심 표다.
덤프를 `public` 에 그대로 복원하면 충돌하거나 **덮어써서 학급이 날아간다.**

### ② `auth.users` 6명 겹침

옛 18명 중 **6명이 아지트에도 같은 이메일**로 있다(양쪽에 각각 가입).
이메일이 고유해야 하므로 그대로 넣으면 중복 키 오류가 난다. 두 계정의 `id`(UUID)가 달라,
옛 자료가 그 id 를 참조하면 연결이 끊긴다.

- **샘링크는 무관하다** — `short_links` 에 사용자 칼럼이 없다(로그인을 쓰지 않는다).
- **자비스만 해당한다** — 겹치는 6명은 아지트 계정을 쓰고, 나머지 12명만 추가한 뒤
  자비스 자료의 사용자 참조를 새 id 로 바꾼다.

### ③ 확장(extension)

옛 스택에 깔린 것: `hypopg`, `index_advisor`, `pg_graphql`, `pg_net`, `pg_stat_statements`,
`pgcrypto`, `pgjwt`, `supabase_vault`, `uuid-ossp`, `vector`.
아지트에 없는 것은 **옮기기 전에 먼저 설치**한다.

### 충돌하지 않는 것

- **함수**: 옛 스택의 실제 함수 31개(`vector` 확장이 만든 130개 제외)와 아지트 함수가 하나도 안 겹친다.
- **Storage 파일**: 0개.

## 안전한 방법 — `public` 에 섞지 않는다

```
아지트 DB
├── public      ← 아지트 자료. 건드리지 않는다
├── samlink     ← 옛 public 의 단축링크 표 7개
└── jarvis      ← 옛 app 스키마 표 9개
```

스키마를 나누면 `classes` 충돌이 **원천적으로 사라진다**(`samlink.classes` vs `public.classes`).
대신 두 가지가 따라온다.

- 앱 코드에서 스키마를 지정해야 한다(`supabase.schema('jarvis')`).
- PostgREST 가 그 스키마를 노출하도록 `PGRST_DB_SCHEMAS` 에 더해야 한다.

## 순서

1. **옛 스택 전체 백업** — 되돌릴 유일한 수단. 이것 없이는 시작하지 않는다.
2. 아지트에 없는 확장 설치.
3. 스키마 하나씩 옮긴다(`jarvis` → 검증 → `samlink` → 검증). 한 번에 둘 다 옮기지 않는다.
4. 앱 코드의 URL·키·스키마 수정 후 재배포.
5. `jarvis-caddy` 가 넘기던 **서바이벌 경로를 호스트 Caddy 로 이관**한다.
6. 며칠 지켜본 뒤 옛 스택 제거.

## 아직 확인하지 않은 것

- 자비스가 쓰는 **Edge Functions 6개**(`get-openai-key-status`·`save-openai-key`·`realtime-token` 등)를
  아지트로 옮길지, 다시 만들지.
- 자비스는 **오픈클로와 연동**된다. 그쪽 설정에 옛 스택 주소·키가 박혀 있는지.
- 샘링크의 `samlink-cleanup` 컨테이너가 주기적으로 무엇을 부르는지.


## 실제로 해 보니 (자비스, 2026-08-28)

**앱 코드는 한 줄도 안 고쳤다.** 자비스가 모든 호출에 `.schema("app")` 을 명시하고 있었기 때문이다.
스키마를 통째로 옮기고 접속 주소만 바꾸면 끝이었다.

### 걸린 곳 — 권한이 따라오지 않는다

`pg_dump --no-privileges` 로 뜨면 **역할 권한이 빠진다.** 복원 직후
`permission denied for schema app` 으로 REST 가 401 을 냈다. 원본 권한을 조회해 그대로 부여해야 한다.

```bash
# 원본에서 확인
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT nspacl FROM pg_namespace WHERE nspname='app';"

# 새 DB 에 같게 부여
docker exec agit-db psql -U postgres -d postgres -c "
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA app TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO anon, authenticated, service_role;"
```

### 네트워크는 둘 다 붙인다

`jarvis-caddy` 가 `frontend:3000` 을 컨테이너 이름으로 부른다. 프론트를 아지트 네트워크로만 옮기면
Caddy 가 못 찾는다. **두 네트워크에 모두** 붙여야 한다.

### 잊지 말 것

- `PGRST_DB_SCHEMAS` 에 새 스키마를 더하고 `rest` 컨테이너를 재생성한다.
- 동기화 스크립트 등 **DB 컨테이너 이름을 직접 쓰는 곳**을 함께 고친다(`supabase-db` → `agit-db`).
- 옮긴 뒤 행 수를 원본과 표별로 대조한다.

### 샘링크는 이만큼 쉽지 않다

자비스와 달리 자료가 `public` 에 있어 **`samlink` 스키마로 옮기고 앱 코드도 고쳐야 한다.**
`classes` 이름 충돌도 그때 실제로 부딪힌다.
