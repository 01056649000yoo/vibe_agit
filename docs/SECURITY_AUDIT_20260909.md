# 보안 점검 — 2026-09-09 (외부 접근·내부 권한 중심)

> 대상: 끄적끄적 아지트의 DB 권한 계층, 외부 노출 경계, 비밀 관리, 의존성.
> **이웃 아지트는 작업 중이라 점검 범위에서 뺐다**(발견한 것은 참고로만 적는다).
> 읽기 전용으로 진행했다. 운영 DB에 쓰기는 하지 않았다.
> 비밀 값·공인 IP·사용자 데이터는 이 문서에 남기지 않는다.
> 직전 감사: [SECURITY_AUDIT_20260829.md](SECURITY_AUDIT_20260829.md)

## 결론

권한 설계의 **뼈대는 튼튼하다**. 모든 RLS 정책이 `authenticated` 로 한정되고 `uid()` 를 기준으로 쓰여 있어,
공개 anon 키로는 민감한 표에서 한 줄도 못 읽는 것을 실제 호출로 확인했다. 컨테이너 포트는 전부 loopback
전용이고, 직전 감사의 P0였던 **SSH 비밀번호 로그인은 해제되어 공개키 전용**이 되었다.

다만 **RLS를 우회하는 SECURITY DEFINER 함수 한 개가 비로그인 사용자에게 열려 있다.** 나머지는
방어 심화 항목과 위생 문제다.

## 1. 확인한 취약점

### P1 — `notification_emit_v1` 이 비로그인 사용자에게 열려 있다

| 항목 | 내용 |
|---|---|
| 위치 | `public.notification_emit_v1` (SECURITY DEFINER) |
| 권한 | `=X/supabase_admin` — **PUBLIC 전체**에 EXECUTE. anon 포함 |
| 내부 검사 | **호출자 권한 검사가 없다.** 입력 형식만 본다 |
| 설계 의도 | `src/modules/notifications/README.md` 는 이 함수를 **"내부 전용"** 이라고 적고 있다 |
| 브라우저 호출 | 없다. `src/` 어디에서도 부르지 않는다. 다른 RPC 7개가 DB 안에서만 부른다 |

**실제로 닿는 것을 확인했다.** 공개 anon 키로 호출했을 때:

- `notification_emit_v1` → HTTP 500 (함수 본문까지 실행됨)
- 대조군 `bulk_approve_posts` → HTTP 401 `permission denied for function` (정상 차단)

즉 권한 계층에서 걸리지 않고 통과한다.

**영향**: 학생 UUID를 아는 사람이 그 아이의 알림함에 임의의 알림을 넣을 수 있다.
`p_payload` 는 8KB JSON이고 `p_actor_student_id` 로 **보낸 사람을 사칭**할 수 있다. 속도 제한이 없고
`event_key` 를 바꾸면 `ON CONFLICT` 중복 제거도 우회되어 행이 무한히 쌓인다.

**현실적인 경로**: UUID는 추측할 수 없으므로 완전한 외부인보다는 **같은 학급 학생**이 위험하다.
로그인한 학생은 친구 목록·피드에서 다른 학생 UUID를 얻을 수 있다.

**완화 요인**: 앱에 `dangerouslySetInnerHTML`·`innerHTML` 사용처가 하나도 없어 React 기본 이스케이프가
걸린다. 스크립트가 실행되는 XSS는 아니다. 남는 위험은 **거짓 알림·사칭·글 밀어넣기와 행 폭증**이다.

**고칠 방법**: 이 함수에서 PUBLIC·anon·authenticated 의 EXECUTE 를 회수한다. 브라우저가 부르지 않고
DB 안 다른 SECURITY DEFINER 함수만 부르므로, 회수해도 기능은 그대로다.

**조치 완료 (2026-09-09)**: `20261272_internal_only_notification_emit.sql` 운영 적용(316/316·대기 0).
스모크 검사를 `smoke:security-boundary`(= `test:security`)에 등록했다.

적용 뒤 확인한 것:
- 같은 공격 호출을 그대로 재시도 → **HTTP 401 `permission denied for function`** (조치 전에는 500으로 본문까지 실행됐다)
- DB 권한: `anon: false / authenticated: false / service_role: true`
- 기능 무사: 내부 경로로 실제 알림 발행이 성공하는 것을 `BEGIN…ROLLBACK` 으로 확인했고,
  알림을 부르는 기능 함수 7개가 모두 그대로다. 시험 행은 남기지 않았다(0건).
- `npm run test:security` 전체 통과(301/301, 실패 0).

### P2 — 학생 소유 검사 없이 `p_student_id` 를 받는 조회 함수

| 함수 | 문제 |
|---|---|
| `learning_engine_retry_gate_v1` | 임의 학생의 도전 통과 상태를 조회 |
| `vocab_tower_v2_summit_status_v1` | 임의 학생의 어휘탑 정상 진행도를 조회 |

둘 다 `authenticated` 전용이고 UUID를 알아야 하며 학습 진도만 나온다. 심각하지는 않지만
"내 것인지" 확인을 넣는 편이 낫다.

### P2 — 공개 git 이력에 Google API 키가 남아 있다

`GitHub 저장소는 PUBLIC 이다.` 2026-02-01 커밋 `c548220a` 에 `.env_backup` 이 들어갔다가 뒤에 지워졌다.
파일에는 `VITE_GOOGLE_API_KEY` (`AIzaSy…`) 가 들어 있었다. **지우기 전 커밋이 그대로 남아 있어 누구나 볼 수 있다.**

- 현재 `.env`·`.env.local` 에는 이 변수가 없다(앱은 더 이상 쓰지 않는다).
- 함께 있던 Supabase anon 키는 **이미 교체됐다**(해시 대조로 확인).
- 남은 위험: **그 Google 키가 Google Cloud 에서 아직 살아 있으면** 제3자가 쓸 수 있다(요금 발생).

**조치 완료 (2026-09-09)**: 사용자가 Google Cloud 에서 해당 키를 **삭제했다.**
공개 이력에는 문자열이 남지만 더는 쓸 수 없다. 이력 자체를 지우려면 강제 푸시가 필요해 남겨 둔다.

### P2 — `agit-app` 컨테이너가 격리되지 않았다 (직전 감사에서 이월) — 조치 완료

```
User=(root)  ReadonlyRootfs=false  CapDrop=[]  SecurityOpt=[]  Memory=무제한
```

샘링크·자비스는 비root·read-only·`cap_drop: ALL`·`no-new-privileges` 로 전환됐는데 아지트만 남았다.
정적 Caddy 이미지라 전환 난이도는 낮다.

## 2. 위생 항목 (P3)

- **`profile_secrets` 에 교사 API 키가 평문으로 있다.** (`gemini_api_key`, `personal_openai_api_key`)
  RLS는 `id = uid()` 로 올바르게 걸려 있어 남의 것은 못 본다. 다만 DB 덤프·백업이 유출되면 그대로 노출된다.
- **anon 에게 불필요한 표 GRANT 17개가 남아 있다.** 17개 전부 anon 으로 읽어 `[]` 인 것을 확인했다.
  **회수하지 않기로 했다(2026-09-09)** — 세션이 생기기 전 호출이 `[]` 대신 401 을 받아 화면에 오류가
  뜰 수 있는데, 호출 지점이 206곳이라 전수 확인 전에는 단정할 수 없다. 얻는 것은 방어 심화뿐이라
  바꾸는 위험이 더 크다. 대신 **진짜 위험만 막았다** — "앞으로 anon 에 통하는 정책이 생기면 실패"하는
  검사를 `20261273` 스모크에 넣었다(일부러 뚫은 정책으로 실제로 잡히는 것까지 확인). 전수 확인을
  마치면 그때 회수한다.
- **`student_title_test_overrides` 만 RLS 가 꺼져 있다.** anon/authenticated GRANT 가 없어 지금은 노출되지 않지만
  public 스키마에서 유일한 예외다. 켜 두는 편이 낫다.
- **`search_path` 를 고정하지 않은 SECURITY DEFINER 함수 3개**
  (`protect_sensitive_data`, `sync_student_class_id`, `sync_teacher_class_id`).
  **악용 불가**로 확인했다 — 셋 다 트리거 전용이고, anon·authenticated 는 어느 스키마에도 CREATE 권한이 없다.
- **`check-rpc-surface.mjs` 는 이름으로만 대조한다.** 같은 이름의 옛 판(overload)이 약한 권한으로 남아도 못 잡는다.
  오늘은 실제 사례가 없었다(옛 판 3개는 모두 새 판을 부르는 껍데기였다). 검사에 서명까지 넣으면 좋다.
- **이웃 아지트(범위 밖, 참고)**: `create_neighbor_activity_v1` 도 PUBLIC 에 EXECUTE 가 열려 있다.
  `notification_emit_v1` 과 같은 유형이므로 작업이 끝나면 같이 본다.

## 3. 정상 확인된 것

| 영역 | 확인 내용 |
|---|---|
| RLS 실효성 | 공개 anon 키로 `students`·`teachers`·`profiles`·`profile_secrets`·`student_posts`·`point_logs` 조회 → 모두 `[]` |
| RLS 설계 | anon 에 적용되는 정책은 1개뿐이고 그마저 `auth_id = uid()` 기준이라 비로그인은 0행 |
| 정책 없는 표 | RLS 켜짐 + 정책 0개 = 전면 차단. "RPC로만 접근" 설계대로 동작 |
| 컨테이너 포트 | 전부 `127.0.0.1` 바인딩. `agit-db` 5432 는 publish 자체가 없음 |
| SSH | **공개키 전용으로 전환 완료** (직전 감사 P0 해소). `PasswordAuthentication no`, `KbdInteractiveAuthentication no` |
| Storage 버킷 | 2개 모두 비공개, 용량 상한(1MB·256KB)과 MIME 제한(webp·jpeg) |
| Edge 함수 | 8개 모두 자체 인증 검사 있음. `verify_jwt=false` 인 2개도 자체 검사 보유 |
| `verify-admin-mode` | 비밀번호 대조 **전에** JWT 검증과 `profiles.role='ADMIN'` 을 먼저 확인 |
| XSS | `dangerouslySetInnerHTML`·`innerHTML` 사용처 0건 |
| 의존성 | `npm audit --omit=dev` → 취약점 0건 |
| 비밀 관리 | `.env*` 는 `.gitignore` 에 있고 추적되지 않음. 현재 트리에 하드코딩 키 없음 |
| 회귀 검사 | `npm run test:security` 전체 통과 |
| 마이그레이션 | 315/315 적용, 대기 0 |

## 4. 우선순위

### 지금 (오늘 안에)
1. `notification_emit_v1` 의 PUBLIC·anon·authenticated EXECUTE 회수 — 마이그레이션 한 줄. 기능 영향 없음.
2. 공개 이력의 Google API 키를 Google Cloud 에서 폐기하거나 제한.

### 다음 작업 창
3. `learning_engine_retry_gate_v1`·`vocab_tower_v2_summit_status_v1` 에 학생 소유 검사 추가.
4. `agit-app` 컨테이너 비root·read-only·`cap_drop: ALL`·`no-new-privileges`·메모리 상한 적용.
5. anon 표 GRANT 17개 회수, `student_title_test_overrides` RLS 켜기.

### 이어서
6. `check-rpc-surface.mjs` 에 "SECURITY DEFINER 인데 anon 에 열린 함수" 검사 추가 — 오늘 것을 자동으로 잡게.
7. `profile_secrets` API 키 저장 방식 재검토(암호화 또는 참조 저장).
8. 이웃 아지트 작업 완료 후 `create_neighbor_activity_v1` 권한 정리.

## 5. 이번 점검의 한계

- **바깥에서 들어오는 경로는 확인하지 못했다.** 공유기 포트포워딩·WAN 도달 여부는 맥미니 안에서 알 수 없다.
  직전 감사와 같은 한계다.
- 호스트 리스너 `46594`·`52660` 의 주인은 `sudo` 없이 확인하지 못했다(Tailscale 로 추정).
- **이웃 아지트는 범위에서 제외했다.**
- 프런트엔드 입력 검증·CSRF·세션 만료 정책은 이번에 보지 않았다.
- 공개 도메인의 보안 헤더는 이번 세션에서 직접 재확인하지 못했다(직전 감사에서 CSP·HSTS 확인됨).
