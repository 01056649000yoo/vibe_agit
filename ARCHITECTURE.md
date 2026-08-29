# 아키텍처 — 이 시스템은 이렇게 만들어졌다

> **이 문서의 역할**: "왜 이렇게 만들었고 지금 어떻게 생겼는지"만 담는다. 날짜별 작업 이력은
> [WORKLOG.md](WORKLOG.md), 앞으로 할 일은 [ROADMAP.md](ROADMAP.md), 성능·보안 기준과 실측은
> [PERFORMANCE_HARNESS.md](PERFORMANCE_HARNESS.md)·[SECURITY_HARNESS.md](SECURITY_HARNESS.md)를 본다.
> 여기 적힌 건 날짜가 지나도 계속 맞아야 하는 내용이다 — 특정 작업의 "그때 상황"은 여기 넣지 않는다.

## 목표 아키텍처

```
┌─ 코어 셸 (불변 영역 — 항상 로드, 함부로 수정 금지) ──────────────┐
│  인증·세션 / 학급·학생 관리 / 포인트 시스템                      │
│  글쓰기 파이프라인: 미션 → 작성(StudentWriting) → 제출           │
│                     → AI·교사 피드백 → 승인·포인트               │
│  모듈 레지스트리 + 네비게이션 (모듈 목록을 읽어 메뉴를 그림)      │
└──────────────────────────────────────────────────────────────┘
        ▲ 등록                ▲ 확장 포인트(글쓰기 슬롯)
┌─ 기능 모듈 (지연 로딩 — 선택 기능은 학급별 on/off) ────────────┐
│  [게임·동기부여 파트]   드래곤 기르기 / 어휘의 탑 / 서바이벌(흡수) │
│  [학급 커뮤니티 파트]   친구 아지트(고정)                          │
│  [글쓰기 확장 파트]     장르 입력 틀(시·회의 안건) / 생각 정리 / 자유쓰기│
│  [미래 모듈…]          폴더 하나 + 레지스트리 등록 한 줄로 추가    │
└──────────────────────────────────────────────────────────────┘
        ▼ 데이터 연동(코드 이식 금지)
┌─ 아지트 연구소 (/lab, 독립 Next.js 앱, 같은 DB·같은 로그인) ────┐
│  하위 활동: 글쓰기 도우미(개요) / 과학 탐구 / 도덕 / 한자 / 질문 …│
│  → 활동 결과물을 표준 형태로 노출하는 RPC 계층 제공               │
└──────────────────────────────────────────────────────────────┘
```

**코어 셸 판정 기준**: "이게 죽으면 글쓰기 수업이 안 되는가?" — 예이면 코어, 아니면 모듈.

새 모듈을 만드는 구체적 계약(필수 파일, `manifest.js` 형태, props)은
[src/modules/game/README.md](src/modules/game/README.md)를 본다.

## 핵심 설계 불변식 (2026-08-06 확정, 계속 지킬 것)

이 네 가지는 "그때 정한 규칙"이 아니라 **지금도 항상 참이어야 하는 구조적 약속**이다. 어기면 화면마다
다른 답이 나오는 사고가 실제로 있었다(아래 각 항목 참고).

- **완료 글 판정은 `public.writing_counts_as_completed()` 하나뿐이다.** 과제는 교사 승인, 자율 글은
  학생 작성 완료가 기준이다. 같은 규칙을 함수마다 따로 적지 않는다.
- **자율 글 유형 문자열은 `src/modules/writing/selfWritingTypes.js`와 `public.writing_types` 두 곳에만
  등록한다.** 새 유형 추가 시 이 두 곳만 고치면 된다.
- **내 글의 3축(제출 확인·선생님 의견·친구 댓글)은 `MyPostEngagementPanel` 한 줄로 붙인다**
  (`src/modules/writing/engagement/README.md`). 새 글쓰기 유형은 유형 등록 + 그 한 줄이면 자동으로
  같은 모습이 된다.
- **목록과 그 개수를 세는 곳을 나누지 않는다.** 나누면 어긋난다 — 실제로 댓글 배지 숫자가 실제 목록과
  어긋나 교사가 비울 수 없는 숫자가 남는 사고가 있었다. 같은 CTE/RPC를 두 곳이 함께 쓰게 한다.

## 1,000명 성능 하네스 (설계 원칙)

세부 기준·측정 기록은 [PERFORMANCE_HARNESS.md](PERFORMANCE_HARNESS.md)를 본다. 여기서는 "왜 이렇게
설계했는지"만 남긴다.

- 학생 홈은 **공용 bootstrap 하나**(`get_student_home_bootstrap_v1`)로 수렴한다 — 화면마다 따로
  조회하면 1,000명 규모에서 첫 번째로 터지는 지점이 되기 때문이다.
- Realtime(WebSocket 상시 연결)은 기본적으로 안 쓴다 — 대신 화면 복귀·사용자 동작 응답·4~6분 분산
  동기화로 수렴시킨다. 이유: 1,000명이 각자 소켓을 열면 연결 한도가 먼저 바닥난다(실측: 리얼타임
  `max_concurrent_users=600`, 자세한 수치는 PERFORMANCE_HARNESS.md). 수업 중 교사의 과제 글 반려·승인만
  예외적으로 보이는 학생 탭에서 12초 경량 RPC를 사용한다. 첫 요청 분산·요청 겹침 금지·숨은 탭 중단·오류 후퇴를
  강제하고, 학생 본인의 커서 뒤 최대 10개 최소 신호만 읽는다.
- 사용자 동작 1회는 전용 RPC 1회로 끝낸다(쓰기 후 재조회 금지) — 서버 응답에 이미 필요한 정보가
  있는데 화면 전체를 다시 물어보면 그만큼 서버 부하가 헛되이 는다.

## 포인트 시스템 (설계 원칙)

- 포인트는 선택형 게임 모듈이 아니라 **항상 켜지는 공용 코어 엔진**이다. 새 콘텐츠는 전용 RPC 하나가
  자기 권한·완료 조건을 검증하고 내부 `point_engine_apply()`를 호출한다.
- 화면은 `src/modules/points/pointApi.js`만 사용한다. `students.total_points`·`point_logs`·
  `increment_student_points`를 화면에서 직접 쓰거나 호출하지 않는다.
- 전용 RPC는 재클릭·재시도로 중복 지급되지 않도록 안정적인 `event_key`를 반드시 둔다.

## 맥미니 인프라

### DB 컨테이너
- 운영 DB는 **`agit-db`** 하나다. 자비스는 `app`, 샘링크는 `samlink`, 연구소는
  `writing_helper` 스키마로 격리한다. 예전 PG15 `supabase-db`는 2026-08-28에 컨테이너를 제거했고,
  2026-08-29 통합 복구 3/3 뒤 이미지·소형 볼륨·bind 데이터까지 제거했다. 이관 직전 통합 덤프와
  Caddy·롤·제거 목록은 `~/agit-backups/pre-docker-cleanup-20260828/`에 롤백용으로 보존한다.
- 아지트 실데이터 확인: `docker exec agit-db psql -U postgres -d postgres -c "SELECT count(*) FROM students;"`

### docker-compose 파일 3개는 항상 같이 써야 한다
- 이 스택은 `docker-compose.yml`(기본) + `docker-compose.pg17.yml`(PG17) +
  `docker-compose.agit.yml`(아지트 전용 포트·`secrets.agit.env` 연결) **세 개를 합쳐야 완전한 설정**이다.
- `~/agit-supabase/.env`에 `COMPOSE_FILE=docker-compose.yml:docker-compose.pg17.yml:docker-compose.agit.yml`을
  걸어둬서 `-f` 없이 그냥 `docker compose up -d`만 써도 세 파일이 항상 같이 적용된다(2026-08-09 설정).
  이 설정을 지우거나 우회하면 컨테이너를 재기동할 때 `secrets.agit.env` 연결이 빠져 함수 시크릿이
  통째로 누락될 수 있다 — 실제로 `ADMIN_MODE_PASSWORD`가 이렇게 빠진 적이 있다.
- 기본 기동은 필수 9개만 올린다. 관리 UI는 `--profile admin`, 로그 수집은
  `--profile observability`, DB 호스트 풀러는 `--profile pooler`로 필요할 때만 올린다.

### 교사 연구소 SSO는 같은 도메인의 루트 쿠키로 연결한다
- 아지트 브라우저와 통합 연구소 `/lab`은 `sb-agit-auth-token`, `Path=/`, `SameSite=Lax`인 host-only 쿠키를
  함께 사용한다. 토큰을 URL·쿼리·localStorage 사이에서 전달하지 않는다.
- 아지트의 과거 localStorage 세션은 첫 부팅 때 새 쿠키 저장 성공을 확인한 뒤에만 지운다. 통합 연구소 SSR은
  내부 Kong URL을 쓰더라도 명시적인 같은 쿠키 이름으로 세션을 읽는다.
- SSO는 새 통합 DB를 보는 `/lab` 빌드에서만 켠다. 롤백용 `helper.` 빌드는 구 Auth와 기존 기본 쿠키를 계속
  사용하므로 병행 기간의 기존 로그인과 자료가 끊기지 않는다.
- 연구소 서버 액션은 `auth.uid()`만으로 허용하지 않고 `auth_user_role()`의 실제 DB 연결·승인 결과를 매번
  확인한다. 승인 교사의 `writing_helper.teacher_profiles`는 첫 진입에만 멱등 준비하며 기존 이름·학급·방·결과는
  덮어쓰지 않는다.
- 통합 `/lab`의 학급·학생 원장은 `public.classes`·`public.students`뿐이다. 연구소가 명단을 복제하거나 별도
  학급을 만들지 않으며, 아지트에서 바꾼 현재 활성 명단을 화면 진입 때 직접 읽는다. 신규 활동은
  `writing_helper.rooms.agit_class_id`, 학생 결과는 `student_sessions.agit_student_id`로 연결한다. 번호·이름은
  활동 당시 표시를 보존하는 스냅샷이고, 구 `writing_helper.classes`·`class_students`는 과거 자료와 롤백용
  `helper.` 호환을 위해서만 남긴다.

### 아지트 Storage는 macOS bind mount가 아니라 named volume을 쓴다
- `agit-storage`와 `agit-imgproxy`는 외부 Docker named volume **`agit-storage-data`**를 함께 사용한다.
  Storage는 읽기/쓰기, imgproxy는 읽기 전용으로 마운트한다.
- macOS Docker Desktop의 호스트 bind mount는 Storage API가 객체 메타데이터에 사용하는 확장 속성(xattr)을
  지원하지 않아 `ENOTSUP: The file system does not support extended attributes`로 업로드가 실패한다.
  [Supabase 공식 문서](https://supabase.com/docs/guides/self-hosting/docker#using-file-backend-in-storage-on-macos)도
  macOS에서는 named volume 사용을 안내한다.
- 이 볼륨은 `docker compose down -v`의 관리 대상 밖에 두어 실수로 지워지지 않게 한다. 새 장비 복구 시에는
  `docker volume create agit-storage-data`를 먼저 실행해야 하며, 객체 파일 백업·복구 절차는 `backup.md`를 따른다.

### Realtime 버전을 올릴 때 주의
- `SEED_SELF_HOST=false`라 테넌트 마이그레이션이 자동 실행되지 않는다. 이미지를 올리면 동시 접속
  한도(`max_concurrent_users=600`·`max_events_per_second=1000`·`max_joins_per_second=500`·
  `max_bytes_per_second=1000000`)를 다시 넣거나 시드를 잠시 켜야 한다.

### 학급 글 조회 기준 — 새 글쓰기 콘텐츠에도 항상 적용
1. 학급은 그 테이블의 `class_id`로 **직접** 좁힌다(조인한 테이블의 `class_id` 경유 금지)
2. 학급이 있는 테이블끼리 조인하면 조인 조건에도 `class_id`를 넣는다
3. `(class_id, 정렬열 DESC)` 인덱스를 두고 항상 상한(`limit`/페이지)을 건다
4. 캐시는 `src/lib/cache.js`의 `dataCache` + `classKey()`로만 만든다

전체 규칙·측정치·이유는 WORKLOG.md의 `학급 글 조회 기준 (2026-07-28 확정)` 항목을 읽는다.

## 맞춤법 검사 설계 원칙

- 판정 기준은 **오탐 0 최우선**(사용자 결정). 맞는 글에 빨간 줄이 그어지면 초등학생은 맞는 글을
  틀리게 고치거나 밑줄을 안 믿게 된다. 문맥에 따라 맞을 수 있는 표현(`안돼`·`낳다/낫다`·`바램`·
  `-데/-대`·`한번/한 번`·`로서/로써`)은 자동 밑줄에 넣지 않고 수첩 검색으로만 남긴다.
- 브라우저 내장 맞춤법 검사는 대안이 못 된다 — 크롬·엣지는 한국어 사전이 없고(Hunspell 방식이
  조사가 붙는 언어에 안 맞아 CJK가 지원 목록에서 빠짐), 사파리는 기기 설정에 좌우돼 학생마다
  다르게 보인다. 무엇을 틀렸다고 할지 통제할 수 없어 오탐 0 원칙과 충돌한다.
- 규칙을 늘릴 때는 반드시 `npm run spelling:check`를 먼저 돌린다 — 실제로 `이예요`(고양이예요는
  맞음)·`꽃입`(꽃입니다)·`요세`(요세미티)·`희안`(사람 이름)이 이 검사에 걸려 규칙에서 빠졌다.
