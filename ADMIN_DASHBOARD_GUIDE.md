# 관리자 대시보드 — 사용량·정리 기능 안내

> 2026-07-27 추가. 선생님 계정이 늘어나면서 "누가 실제로 쓰고 있는지", "가입만 하고 안 쓰는 계정은
> 어떻게 정리하는지"를 관리자 화면에서 바로 볼 수 있게 만든 기능입니다.

---

## 1. 무엇이 생겼나

관리자 대시보드에 탭 4개가 추가되었습니다.

| 탭 | 무엇을 보나 |
|---|---|
| 📊 **사용량** | 선생님 한 명당 학급·학생·미션·학생 글이 몇 개인지 한 줄로 |
| 🧑‍🎓 **학생 활동** | 학생별로 글을 몇 편 썼는지, 마지막 활동이 언제인지 |
| 😴 **장기 미접속** | 오래 로그인하지 않은 선생님만 모아 보기 |
| 🧹 **정리 대상** | 가입만 하고 학급/학생을 안 만든 계정 정리 |

맨 위 통계 카드에도 `장기 미접속`, `정리 대상` 두 칸이 추가됩니다.

---

## 2. 선생님 상태는 이렇게 나뉩니다

표의 `상태` 칸에 붙는 배지입니다. 위에서부터 먼저 판정됩니다.

| 배지 | 뜻 | 판정 기준 |
|---|---|---|
| 🔴 **학급 미개설** | 가입만 하고 아무것도 안 만듦 | 살아있는 학급 0개 + 학생 0명 |
| 🟠 **학생 미등록** | 학급은 만들었는데 학생이 없음 | 학급 1개 이상 + 학생 0명 |
| 🟡 **장기 미접속** | 쓰던 분인데 한참 안 옴 | 마지막 로그인이 기준일(기본 60일)보다 오래됨 |
| 🟢 **활동 중** | 최근에 학생 글이 올라옴 | 최근 기준일(기본 30일) 안에 쓴 글이 1개 이상 |
| ⚪ **조용함** | 데이터는 있는데 최근 활동만 없음 | 위 어디에도 안 걸림 |

기준 일수는 화면 오른쪽 위 드롭다운에서 바꿉니다.
- **활동 기준**: 7일 / 30일 / 90일
- **미접속 기준**: 30일 / 60일 / 90일 / 180일

---

## 3. 정리하는 방법 (안전장치 3중)

가입만 하고 안 쓰는 계정은 **🧹 정리 대상** 탭에서 처리합니다.

1. **`학급 미개설` / `학생 미등록` 중에 고릅니다.** 둘 다 삭제할 수 있습니다.
   빈 학급은 계정과 함께 정리되고, 이 계정들에는 학생 글이 애초에 없습니다.
2. **`가입 후 경과` 를 고릅니다.** 기본 14일입니다.
   방금 가입한 선생님이 실수로 목록에 섞이지 않게 막아 줍니다.
3. **체크박스로 고르고 버튼을 누릅니다.**
   - `선택 승인 취소` — 계정은 남고 사용만 막힙니다. **언제든 되돌릴 수 있습니다.**
   - `선택 계정 영구 삭제` — 확인 창이 두 번 뜹니다. 되돌릴 수 없습니다.

> **서버에서 한 번 더 막습니다.** 삭제 요청이 가더라도, **학생이나 학생 글이 하나라도 있는 계정**은
> DB 함수(`p_only_empty = TRUE`)가 자동으로 건너뜁니다. 결과 메시지에 `제외됨 N개`로 표시됩니다.
> 즉, 실수로 실제 사용 중인 선생님을 지우는 일은 구조적으로 일어나지 않습니다.

**장기 미접속 탭에서는 삭제 버튼을 아예 만들지 않았습니다.** 그분들은 학급·학생 자료가 있으니
`승인 취소`로 접속만 막았다가, 돌아오시면 `승인 복구`로 그대로 되살리는 방식입니다.

### 삭제하면 실제로 무엇이 지워지나 (완전 탈퇴)

운영 DB의 외래키를 실측해 보니 예전 방식에는 구멍이 있어서, 아래 순서로 바로잡았습니다.

1. **포인트 로그** — `auth.users` 를 참조하면서 자동 삭제가 안 되는 테이블이라 직접 지웁니다
2. **학급** — `classes.teacher_id` 는 `profiles` 가 아니라 `auth.users` 를 보고 있고 삭제 규칙이
   `NO ACTION` 이라, 예전 코드로는 **주인 없는 빈 학급이 계속 남았습니다**
3. **프로필** — 미션·교사정보·생기부 기록은 여기에 딸려 함께 삭제됩니다
4. **로그인 계정(`auth.users`)** — 예전에는 이게 남아서, 그 사람이 다시 구글 로그인하면
   프로필이 새로 만들어지고 자동 승인까지 되어 **되살아났습니다**

> ⚠️ 4번 때문에 연구소(`writing_helper`)의 방·질문세트도 함께 삭제됩니다.
> 정리 대상 계정들은 실측 결과 연구소 데이터가 0건이라 영향이 없었습니다.

### 승인 취소도 되돌려지지 않게 고쳤습니다

자동 승인(`auto_approval`)이 켜져 있으면, 승인 취소된 선생님이 대기 화면에서
`정보 다시 입력`을 눌러 저장하는 것만으로 **관리자 승인 없이 부활**했습니다.

이제 `profiles.approval_revoked_at` 에 취소 시각을 남기고, `setup_teacher_profile` 이
그 계정을 자동 승인에서 제외합니다. **관리자가 직접 승인해야만** 다시 쓸 수 있습니다.

승인 대기 탭도 **`🆕 신규 가입 대기`** 와 **`🧹 관리자 정리함`** 으로 나뉘어서,
정리한 계정이 쌓여도 진짜 신규 가입자가 묻히지 않습니다.

---

## 4. 배포 순서 (중요)

**DB 마이그레이션을 먼저 적용한 뒤에 앱을 배포해야 합니다.** 순서가 바뀌면 새 탭에서
`함수를 찾을 수 없다`는 오류가 뜹니다.

`main`에 push하면 GitHub Actions가 맥미니 러너에서 곧바로 앱을 배포하는데,
**마이그레이션은 자동으로 적용되지 않습니다.** 그래서 아래 순서를 지켜야 합니다.

### ① 맥미니에서 마이그레이션 적용

```bash
# 컨테이너 이름 확인 (문서 기준 agit-db)
docker ps --format '{{.Names}}' | grep agit

# 비밀번호는 파일에서 읽어 쓰고, 값을 화면·로그에 남기지 않는다
PGPW=$(grep '^POSTGRES_PASSWORD=' "$HOME/agit-supabase/.env" | cut -d= -f2-)

docker exec -i -e PGPASSWORD="$PGPW" agit-db \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260727_admin_usage_dashboard_rpc.sql
```

적용되는 것:
- 함수 5개 (`admin_get_teacher_usage`, `admin_get_usage_overview`, `admin_get_student_activity`,
  `admin_bulk_set_teacher_approval`, `admin_bulk_force_teacher_withdrawal`)
- 집계용 인덱스 5개 (`IF NOT EXISTS`라 여러 번 실행해도 안전)

### ② 적용 확인

함수가 만들어졌는지:
```sql
\df public.admin_get_teacher_usage
\df public.admin_bulk_force_teacher_withdrawal
```

> ⚠️ `SELECT * FROM admin_get_teacher_usage(60, 30);` 를 psql에서 **그냥 실행하면 실패합니다.**
> 모든 함수가 `auth_user_role() = 'ADMIN'` 을 검사하는데, psql 세션에는 JWT가 없어
> `Only admins can read teacher usage` 예외가 납니다. **이건 정상 동작입니다.**

실제로 돌려보려면 관리자 JWT 조건을 세션에 흉내 내고, 트랜잭션 안에서 확인 후 롤백합니다:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
    json_build_object(
        'sub', (SELECT id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1),
        'app_metadata', json_build_object('role', 'ADMIN')
    )::text, true);
SET LOCAL ROLE authenticated;

SELECT display_name, usage_status, class_count, student_count, recent_post_count
FROM public.admin_get_teacher_usage(60, 30) LIMIT 5;

SELECT public.admin_get_usage_overview(60, 30);
ROLLBACK;
```

권한 검사가 살아 있는지 반대 방향도 한 번 확인해 두면 좋습니다 — 아래는 **예외가 나야 정상**입니다:
```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT * FROM public.admin_get_teacher_usage(60, 30);  -- Only admins ... 예외 기대
ROLLBACK;
```

### ③ 앱 배포

마이그레이션 확인이 끝난 뒤에 `main`으로 push하면 자동 배포가 돕니다.
(`.github/workflows/deploy.yml` → 러너에서 `docker build` → `agit-app` 재시작 → HTTP 200 검증)

---

## 5. 왜 집계를 DB로 옮겼나

이전 관리자 화면은 `classes` 전부 + `students` 전부를 브라우저로 받아와서 세었습니다.
코드에도 "전체 학생 row 풀스캔이 반복되어 DB 타임아웃을 유발함"이라는 주석이 남아 있었습니다.

이제는 `admin_get_teacher_usage` RPC가 DB 안에서 한 번에 집계해 결과 줄만 보냅니다.
학생 수가 늘어도 브라우저로 오는 데이터 양은 **선생님 수만큼**으로 고정됩니다.

관련 파일:
- SQL: [supabase/migrations/20260727_admin_usage_dashboard_rpc.sql](supabase/migrations/20260727_admin_usage_dashboard_rpc.sql)
- 데이터 훅: [src/hooks/useAdminUsage.js](src/hooks/useAdminUsage.js)
- 화면: `src/components/admin/AdminUsagePanel.jsx`, `AdminStudentActivityPanel.jsx`,
  `AdminDormantPanel.jsx`, `AdminCleanupPanel.jsx`
