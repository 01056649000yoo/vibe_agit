# 다했니 쿠키 → 아지트 포인트 연동 계획

> 상태: **구현 완료, 배포 전(2026-09-16).** 마이그레이션 `20261300` + 엣지 함수 2개 + 교사 UI/대시보드 + 테스트까지
> 작성·검증(migrate:check·rpc-surface·lint·unit 통과). 배포 절차는 WORKLOG 2026-09-16 "남은 것" 참조.
> 유효 키·엔드포인트·실제 응답까지 검증 완료.
> 결정: 쿠키 1개 = 10P(교사 조절 가능) · 기존 누적 쿠키도 첫 동기화 때 지급 · 이름+코드 붙여넣기 매칭.
> **키는 교사마다 자기 것을 설정 메뉴에서 직접 입력**한다(서버 공용 키 아님). 교사별 흐름: ①설정에서 API 키 입력 → ②학생 매칭 → ③동기화 사용.
>
> 추가 요구(2026-09-16):
> 1. 이름·접속코드를 **붙여넣으면 자동 인식**(형식 자동 파싱, 실시간 미리보기).
> 2. **자동 정산 주기 설정**(끔/매일/매주 요일·시각) — 교사가 지정.
> 3. 지급 포인트는 **"다했니 포인트"** 이름으로 학생 포인트 지급 내역에 반영(전용 유형으로 분류).
> 4. **다했어요 대시보드** — 교사가 지급 내역을 한눈에 보고 정리, 포인트 이전 통계·그래프 제공.

## 1. 목표

다했니(dahandin) 학생별 **누적 쿠키**를 가져와, 늘어난 만큼을 아지트 학생 **포인트**로 지급한다.
쿠키는 누적값이므로 **delta(증가분)만** 지급해 중복을 막고, 교사가 반별로 켜고 끌 수 있게 한다.

## 2. 검증한 다했니 API (2026-09-16 실측)

- 인증: 헤더 `X-API-Key`. **키는 그 키를 발급한 다했니 계정의 데이터만** 접근 가능 → 교사마다 자기 키 필요(값은 저장소에 쓰지 않음).
- `GET /openapi/v1/get/class/list` — 키만으로 학급·쿠키 합계. 개별 학생 코드는 안 줌.
  - 확인: `여수진남초 4학년`, cookies 794.
- `GET /openapi/v1/get/student/total?code={학생코드}` — 학생 1명.
  - 실측(김단우, `6CHMT29NR`): `cookie:28, usedCookie:20, totalCookie:8`, `chocoChips` 필드는 **실제 응답에 없음**, badges는 빈 목록.
  - ⚠️ **코드가 틀리면 "API KEY 가 올바르지 않습니다"** 라는 오해되는 메시지를 준다(키 문제 아님).
- 속도 제한: 평균 5 req/초·300 req/분. 학생별 순차 호출 + 200ms 간격, `slow down.`/429 시 대기 후 재시도.
- 지급 기준 필드: **`cookie`(전체 누적 발급)**. `totalCookie`(잔여)는 학생이 쓰면 줄어 delta가 음수가 되므로 쓰지 않는다.

## 3. 데이터 모델 (신규 마이그레이션 1개)

`supabase/migrations/2026XXXX_dahandin_cookie_sync.sql`

```sql
-- 학생 ↔ 다했니 코드 매칭 + delta 기준선
CREATE TABLE public.dahandin_student_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    dahandin_code TEXT NOT NULL,
    last_cookie INTEGER NOT NULL DEFAULT 0,   -- 마지막으로 포인트에 반영한 누적 쿠키
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (class_id, student_id),
    UNIQUE (class_id, dahandin_code)
);

-- 교사별 다했니 API 키 (앱단 AES-GCM 암호화 저장, 평문 미보관)
CREATE TABLE public.dahandin_teacher_credentials (
    teacher_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    key_ciphertext TEXT NOT NULL,        -- AES-256-GCM 암호문 (base64)
    key_iv TEXT NOT NULL,                -- 12바이트 IV (base64), 저장마다 새로 생성
    key_last4 TEXT,                      -- 화면 표시용 마지막 4자리 (예: 5f79a)
    key_valid BOOLEAN NOT NULL DEFAULT FALSE, -- 저장 시 /get/class/list 검증 결과
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 반별 연동 설정 (환율/켜짐/자동 정산 주기)
CREATE TABLE public.dahandin_class_settings (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    points_per_cookie INTEGER NOT NULL DEFAULT 10,  -- 결정: 10P
    -- 자동 정산 주기: 'off' | 'daily' | 'weekly'
    auto_schedule TEXT NOT NULL DEFAULT 'off' CHECK (auto_schedule IN ('off','daily','weekly')),
    schedule_weekday SMALLINT CHECK (schedule_weekday BETWEEN 0 AND 6), -- weekly 일 때 요일(0=일)
    schedule_hour SMALLINT NOT NULL DEFAULT 17 CHECK (schedule_hour BETWEEN 0 AND 23), -- KST 기준 시각
    last_run_on DATE,          -- 마지막 자동 정산 실행 날짜(KST) — 하루 1회 중복 방지
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 동기화 실행 로그 (감사·재시도·중복지급 추적)
CREATE TABLE public.dahandin_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    ok_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    total_points_granted INTEGER NOT NULL DEFAULT 0,
    note TEXT
);
```

- RLS:
  - `dahandin_student_links`·`dahandin_class_settings`·`dahandin_sync_runs` → `class.teacher_id = auth.uid()` 또는 ADMIN 만 읽기/쓰기.
  - `dahandin_teacher_credentials` → 본인(`teacher_id = auth.uid()`)만. **단 `key_ciphertext` 컬럼은 클라이언트가 SELECT 못 하게** 한다(뷰/RPC로 `key_last4`·`key_valid`만 노출). 복호화·사용은 엣지 함수(service_role)만.
- `last_cookie` 기본 0 → **첫 동기화 때 누적 전량 지급**(결정한 소급 방식과 일치).
- **포인트 지급·분류**: 코어 `point_engine_apply`는 활동 유형 화이트리스트가 있어 새 유형을 못 넣는다(코어 미변경). 대신 전용 RPC `award_dahandin_cookie_points_v1`(service_role 전용, SECURITY DEFINER)이 `point_engine_apply`를 호출하되 reason=`'다했니 포인트'`(학생 내역 표시), `metadata={"source":"dahandin_cookie", ...}`, `event_key`로 **중복지급 차단**. 대시보드는 `point_logs.metadata->>'source' = 'dahandin_cookie'`로 집계.

### 키 보안 (교사별 키 강력 보호)

- **암호화 저장(AES-256-GCM)**: 프로젝트에 Vault/pgsodium가 없고 자체 호스팅 스택이므로, **엣지 함수가 Web Crypto로 AES-GCM 암호화**해 `key_ciphertext`+`key_iv`만 저장. 평문 컬럼·로그·문서에 절대 남기지 않는다.
  - 마스터 키는 엣지 시크릿 `DAHANDIN_ENC_KEY`(32바이트) 하나. DB가 통째로 유출돼도 이 키 없이는 복호화 불가.
  - IV는 저장마다 새로 생성. GCM 인증 태그로 위·변조 탐지.
- **단방향 노출**: 저장(입력·교체)만 클라이언트에서 하고, 저장 후 **원본 키를 클라이언트로 되돌려주지 않는다**. 화면엔 `key_last4`로 "연결됨 ····5f79a"만 표시.
- **저장 시 검증**: 입력 즉시 엣지 함수가 `/get/class/list`로 유효성 확인 → `key_valid`·`verified_at` 기록. 무효면 저장 거부.
- **접근 최소화**: 복호화·다했니 호출은 엣지 함수(service_role)에서만. 교사는 자기 상태(`key_last4`, `key_valid`)만 조회, `key_ciphertext`·`key_iv`는 클라이언트 SELECT 차단.
- **삭제 지원**: 교사가 언제든 "연결 해제"로 자격증명 행을 삭제할 수 있게 한다.

## 4. 엣지 함수 `supabase/functions/dahandin-cookie-sync/index.ts`

기존 `neis-meal` 패턴(Deno, `Deno.env.get`, ALLOWED_ORIGIN CORS, service_role 클라이언트) 재사용.
두 개의 함수(또는 한 함수의 action 분기)로 나눈다.

**(a) 키 저장·검증 `dahandin-credential`** (action: save / status / delete)
1. 교사 JWT 검증.
2. save: 받은 키로 `/get/class/list` 호출 → 성공 시 AES-GCM으로 암호화해 `key_ciphertext`+`key_iv` 저장, `key_last4`·`key_valid=true`·`verified_at` 기록. 실패 시 저장 거부.
3. status: `key_last4`·`key_valid`만 반환(원본 키는 절대 반환 안 함).
4. delete: 자격증명 행 삭제.

**(b) 동기화 `dahandin-cookie-sync`**
1. 교사 JWT 검증 → 요청한 `class_id`의 담임/ADMIN 인지 확인.
2. 해당 교사의 `key_ciphertext`+`key_iv`를 `DAHANDIN_ENC_KEY`로 **복호화**(AES-GCM). 없거나 무효면 "먼저 키를 연결하세요" 오류.
3. `dahandin_class_settings.enabled` 확인, `points_per_cookie` 로드.
4. `dahandin_student_links`(active) 목록 로드.
5. 학생별로 `GET /get/student/total?code=` **순차 호출(200ms 간격)**. `slow down.`/429 → 대기 후 재시도.
6. `delta = max(0, resp.cookie - link.last_cookie)`.
   - `delta > 0` 이면 `points = delta * points_per_cookie` 를
     `increment_student_points(student_id, points, '다했니 포인트')` 로 지급 → 학생 포인트 내역에 **"다했니 포인트"** 로 표시.
   - 성공 시에만 `last_cookie = resp.cookie` 로 갱신(실패 학생은 다음에 재시도).
7. `dahandin_sync_runs` 에 집계 기록 후 결과 요약 반환.

복호화된 키는 함수 실행 중 메모리에만 두고 응답·로그에 절대 싣지 않는다.

**(c) 자동 정산 (cron)**
- 새 컬럼(`auto_schedule`/`schedule_weekday`/`schedule_hour`/`last_run_on`)으로 "지금 정산할 학급"을 판정.
- 판정 SQL 함수 `dahandin_due_class_ids_v1()` — KST 현재 시각 기준 daily/weekly 조건 + `last_run_on <> today` 인 `enabled` 학급 반환.
- 트리거 배선(배포 시 되는 것으로 확정):
  - **우선**: pg_cron(이미 있음)이 5~10분마다 돌며, 각 due 학급에 대해 `dahandin-cookie-sync`를 `CRON_SECRET` 헤더로 호출(pg_net `net.http_post` 사용 가능 시).
  - **대안**: `pg_net`이 없으면 맥미니 스케줄러(launchd)가 같은 엔드포인트를 호출(예약 미션 migration 주석의 fallback 관례와 동일).
- 엣지 함수는 **cron 모드**(교사 JWT 대신 `CRON_SECRET` 검증)를 지원해 due 학급 각각을 (b) 흐름으로 처리하고 `last_run_on` 갱신.

## 5. 교사 UI (아지트)

교사 **설정 메뉴 안에 "다했니 연동" 항목**을 새로 만든다(코어 셸 직접 확장 대신 모듈로 연결, 기본 OFF).
교사별 단계 흐름:
1. **① API 키 연결** — 자기 다했니 키 입력 → 저장 시 서버 검증 → "연결됨 ····5f79a" 표시. 원본 키는 다시 안 보여줌. "연결 해제" 버튼 제공.
2. **② 학생 매칭 (자동 인식)** — "이름  코드"(엑셀/표 복사)를 붙여넣으면 **즉시 자동 파싱** — 탭·쉼표·공백 구분 모두 인식, 인식된 이름·코드를 표로 미리보기, 아지트 학생과 이름으로 자동 매칭(애매한 건 수동 지정).
3. **③ 사용·자동 정산** — 환율(`points_per_cookie`)·`enabled` 토글, **자동 정산 주기 선택(끔/매일/매주 요일·시각)**, **지금 동기화** 버튼 → 학생별 결과 표(이름·이번 delta·지급 P·실패 사유).
- 키 미연결/무효면 ②③ 단계를 잠그고 ①로 유도.
- 안내는 `TeacherGuideButton`/`teacherGuides.js`, 값은 `--ui-*` 토큰·`components/common` 공용 부품 사용.

### 5-1. 다했어요 대시보드 (신규)

교사가 다했니 포인트 지급 현황을 한눈에 보는 화면.
- **요약 카드**: 이번 주/누적 지급 포인트, 대상 학생 수, 마지막 정산 시각, 다음 예정.
- **그래프**: 기간별 지급 포인트 추이(막대/선), 학생별 지급 순위. `point_logs`(activity_type=`dahandin_cookie`)와 `dahandin_sync_runs` 집계.
- **내역 표**: 정산 실행(run)별·학생별 지급 목록, 실패 사유, CSV 정리.
- 데이터는 교사용 조회 RPC로 제공(자기 학급만, RLS). 차트는 저장소 차트 관례를 따른다.

## 6. 비밀 값·환경

- **다했니 키는 교사별로 DB에 AES-GCM 암호화 저장**(위 3절 `dahandin_teacher_credentials`). 서버 공용 다했니 키 없음.
- 암호화 마스터 키 **`DAHANDIN_ENC_KEY`(32바이트)** 하나만 엣지 시크릿으로 설정. 값은 코드/문서/로그 미기재, 위치만 `~/agit-supabase/secrets.agit.env` 관례 참조.
- `.env`(`VITE_*`)에는 어떤 다했니 키도, 마스터 키도 넣지 않는다 — 브라우저 노출 금지.

## 7. 테스트·관문

- `tests/` 에 delta 계산·중복지급 방지·음수 방지 단위 테스트(`dahandinCookieSync.test.mjs`).
- 엣지 함수는 응답 파싱(`chocoChips` 부재, badges 빈값, `slow down.`)에 견고해야 함.
- 커밋 전 `npm run checklist` / `npm run test:all`(도커 관문 동일 환경).
- 작업 후 `WORKLOG.md`·`ROADMAP.md` 갱신.

## 8. 열린 사항

- 초코칩·배지: 이 학급은 미사용. 필요해지면 `points_per_choco` 등으로 확장(현재 범위 밖).
- 자동 예약(하루 1회) 동기화: 수동 버튼 안정화 후 cron/스케줄로 확장.
- 소급 지급 규모 주의: 794쿠키×10P=7,940P 등 큰 금액이 한 번에 들어갈 수 있음(결정대로 진행, 환율로 조절).
