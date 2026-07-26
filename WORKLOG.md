# 작업 로그 (WORKLOG)

> **목적**: Claude·GPT 등 어떤 AI 모델이 작업하든, 서로의 작업·변경·완료 내역을 이어받기 위한 공유 기록.
> 모델이 바뀌어도 이 파일만 보면 "무엇을 왜 했고, 무엇이 남았는지" 파악 가능해야 한다.
>
> **규칙 (모든 모델 공통)**
> 1. **작업 시작 전**: `ROADMAP.md`(계획·현재 위치)와 이 파일 상단 몇 개 항목을 읽는다.
> 2. **작업 후**: 이 파일 **맨 위**에 새 항목을 추가한다(최신이 위). 아래 형식을 따른다.
> 3. **ROADMAP.md도 함께 갱신**: 완료 항목 `[x]`, 방향 변경은 ROADMAP "결정 기록"에.
> 4. **비밀은 값이 아니라 위치만 기록**(DB 비번·API 키·OAuth 시크릿 등은 절대 본문에 쓰지 않음).
> 5. git 밖 변경(맥미니 인프라: 도커 스택·Caddy·DNS·`~/agit-supabase/` 등)도 반드시 여기 남긴다 — 커밋만으로는 안 보이므로.
>
> **항목 형식**
> ```
> ## YYYY-MM-DD — 제목 (작업 모델)
> - **한 일**: …
> - **변경**: 커밋 해시/범위, 또는 git 밖 인프라 변경
> - **결과/검증**: …
> - **남은 것 / 다음**: …
> ```

---

## 2026-07-26 — 친구 아지트 본인 노출·친구 누락 원인 진단 (GPT/Codex)
- **증상**: 같은 기기에서 테스트 학급 유지담으로 접속했는데 유지담 본인의 아지트가 친구 목록에 보이고,
  실제 친구 한 명은 보이지 않음.
- **원인**: `useFriendsHideout.fetchClassmates()`의 5분 메모리 캐시 키가 `classmates_${classId}`라 같은 학급 학생들이
  목록을 공유함. 직전 학생 기준 RPC 결과(직전 학생 제외·새 학생 포함)가 다음 로그인에 재사용되고,
  캐시 반환 후 현재 `studentSession.id`를 다시 거르는 방어 필터도 없음.
- **결과/검증**: 운영 DB 테스트 학급은 활성 학생 7명·삭제 학생 0명이라 유지담 기준 정상 친구 수는 6명.
  유지담·유지현의 `auth_id` 바인딩은 각각 고유하고, 운영 `get_student_classmates_for_hideout()`도
  DB 바인딩으로 현재 학생과 학급을 판별해 `s.id <> v_student_id`로 본인을 제외함. DB/RPC가 아니라 클라이언트 캐시 오염으로 확정.
  브라우저 제어 세션은 사용할 수 없어 UI 자동 재현은 미실시.
- **남은 것 / 다음**: 캐시 키에 학생 ID를 포함하고(`classmates_${classId}_${studentId}`), RPC·폴백 결과에도
  현재 학생 제거 필터를 적용. Realtime 캐시 무효화 키도 함께 변경한 뒤 유지현→로그아웃→유지담 순서로 재현 검증.

## 2026-07-26 — 친구 아지트를 토글 없는 고정 기능으로 전환 (GPT/Codex)
- **한 일**: 사용자 결정에 따라 친구 아지트의 학급별 ON/OFF를 폐기. 모듈 구조와 독립 lazy chunk는 유지하면서
  매니페스트를 `core: true`로 지정하고, 교사 모듈 토글 목록에서 고정 모듈을 제외했다.
  학생 대시보드·모바일 탭·가이드·교실 아지트·소셜 알림·직접 경로의 조건 분기도 모두 제거해 항상 사용할 수 있게 함.
- **변경**: 커밋 `b1acef5`. 앞선 호환 마이그레이션 파일을 삭제하고, git 밖 운영 DB의
  `enabled_modules`에서 임시 `friends-hideout` 값 2건 제거.
- **결과/검증**: 운영 DB 정리 `UPDATE 2`, 잔여 0건. 프로덕션 빌드 통과, 친구 아지트 독립 lazy chunk 31.82KB 유지,
  변경 파일 ESLint 0에러(기존 보안 경고 1건) 및 `git diff --check` 통과.
- **남은 것 / 다음**: 로컬 변경은 아직 원격 push·운영 앱 배포 전. 다음 Stage 3b 후보는 아지트온클래스 또는 아이디어마켓.

## 2026-07-26 — 친구 아지트 모듈화 + ON/OFF 전 진입점 통일 (GPT/Codex)
- **한 일**:
  - `FriendsHideout`·전용 훅을 `src/modules/community/friends-hideout/`로 옮기고 매니페스트·레지스트리에 등록.
  - 앱 셸에서 학생 모듈 상태를 한 번 읽어 대시보드 카드, 모바일 하단 탭, 학생 가이드, 교실 아지트의 친구 응원,
    소셜 알림 이동, `friends_hideout` 직접 진입을 같은 ON/OFF 값으로 게이팅.
  - `한줄모아`는 내부 모듈이 아니라 연구소 연결 항목임을 확인해 Stage 3 후보에서 제외하고 Stage 2d/4b로 정리.
- **변경**: 코드 커밋 `a04f55e`(모듈 본체 이전), `7140cfa`(모든 진입점 게이트).
  git 밖 운영 DB에서 기존 설정 학급 2곳의 `enabled_modules`에 `friends-hideout`을 추가했으며,
  동일 내용을 `20260726_enable_friends_hideout_module.sql`로 저장해 기존 노출 동작과 롤백 가능성을 보존.
- **결과/검증**: 운영 DB 마이그레이션 `UPDATE 2`, 적용 후 대상 누락 0. 프로덕션 빌드 통과,
  친구 아지트 독립 lazy chunk 31.82KB 확인, 변경 파일 ESLint 0에러 및 `git diff --check` 통과.
  `AgitOnClassPage.jsx` 전체 린트에는 이번 범위 밖의 기존 렌더 중 `Math.random` 순수성 오류 4건이 남아 있음.
- **남은 것 / 다음**: 교사 토글에서 친구 아지트를 OFF한 뒤 학생 실기기에서 각 진입점이 사라지고 ON 복구되는지 확인.
  다음 Stage 3b 후보는 아지트온클래스 또는 아이디어마켓이며, 친구 아지트의 기본 OFF/삭제 여부는 Stage 3c에서 결정.

## 2026-07-26 — 놀이터 OFF 수정 운영 배포 (GPT/Codex)
- **한 일**: 로컬 `main`의 놀이터 후속 작업 6커밋(`549e784`~`9fb5699`)을 원격 `main`에 push해 맥미니 자동 배포 실행.
- **변경**: GitHub Actions Deploy run `30200668684` 성공. 운영 `agit-app:prod` 컨테이너 재생성,
  새 학생 번들 `StudentDashboard-C2WjD97L.js` 반영.
- **결과/검증**: Actions의 Checkout·이미지 빌드·컨테이너 재시작·Verify 전 단계 성공(21초),
  `agit-app` 정상 실행 및 호스트 직접 응답 `127.0.0.1:8300` HTTP 200 확인.
  공개 도메인 curl은 맥미니 내부 NAT 루프백에서 타임아웃되어 외부 실기기 확인이 필요.
- **남은 것 / 다음**: 교사 화면에서 모듈 OFF 후 이미 열린 학생 화면의 놀이터가 새로고침 없이 사라지는지 실기기 확인.

## 2026-07-26 — 아지트 놀이터 OFF가 학생 화면에 남는 문제 수정 (GPT/Codex)
- **원인**: 교사 OFF 값은 DB에 정상 저장됐지만, 이미 열린 학생 화면의 `useEnabledModules`가 최초 1회만 조회해
  이전 ON 상태를 계속 유지했다. 또한 설정 조회 완료 전·조회 실패 시에도 모듈 기본값(드래곤 ON)을 먼저 표시했고 오류를 숨겼다.
- **한 일**:
  - `useEnabledModules`에 `classes` UPDATE Realtime 구독 + 브라우저 포커스 복귀 시 재조회 추가.
  - 설정 조회 전/실패 시 선택 모듈을 숨기는 fail-closed 처리. 조회 성공 후에만 기존 기본값/호환 플래그 적용.
  - OFF 수신 시 이미 열린 놀이터·드래곤·배경상점·어휘의 탑도 즉시 렌더 중단하도록 진입 화면까지 게이팅.
  - 교사 모듈 설정 조회 실패를 ON 기본값처럼 보이지 않게 오류 표시. UPDATE 후 실제 반환 행을 확인해 RLS 등으로
    0행 저장된 경우도 저장 실패로 처리.
- **변경**: 커밋 `b9e95cf`. 파일: `useEnabledModules.js`, `ModuleToggles.jsx`, `StudentDashboard.jsx`.
- **결과/검증**: 운영 DB에서 신고 학급 값이 `{__configured__}`(전부 OFF)로 정상 저장됨을 확인했고,
  동일 학급 학생 권한 RLS SELECT 성공 및 `classes`의 Realtime publication 포함 확인. 변경 파일 ESLint 0에러, 프로덕션 빌드 통과.
- **남은 것 / 다음**: 로컬 `main`이 원격보다 5커밋 앞서 있어 아직 운영 미배포. push→자동 배포 후
  교사 OFF 상태에서 이미 열린 학생 화면의 놀이터가 사라지는지 실기기 확인.

## 2026-07-26 — 놀이터 후속 정리 + 어휘의 탑 ON/OFF 일원화 (GPT/Codex)
- **한 일**:
  - `DashboardMenu.jsx`에서 놀이터 이전 후 남은 어휘의 탑 랭킹 프리뷰·일일 횟수·모듈 게이팅 죽은 코드 110줄 제거.
    함께 남아 있던 `get_student_classmates_for_hideout` 불필요 RPC도 제거.
  - 어휘의 탑 학생 노출 판단을 `useEnabledModules` 한 경로로 통일. 교사 `GameManager`의 중복 "게임 활성화" 토글은 제거하고
    상단 **학급 기능 켜기/끄기**만 사용하도록 안내 문구로 교체.
  - 기존 `vocab_tower_enabled`는 `enabled_modules` 미설정 학급의 초기 상태와 구버전 롤백 호환용으로만 사용.
    모듈 토글 저장 시 호환 컬럼도 자동 동기화하여 기존 학급 상태·롤백 경로를 보존.
  - 드래곤 배경 애니메이션의 렌더 중 `Math.random` 3건을 인덱스 기반 결정값으로 교체(시각적 시간차 유지).
- **변경**: 커밋 `549e784`(메뉴 죽은 코드), `8c481a5`(어휘의 탑 토글 일원화), `d83d26f`(드래곤 렌더 순수성).
- **결과/검증**: 변경 파일 ESLint 0에러, 프로덕션 빌드 통과, `git diff --check` 통과.
  모듈 초기화 시나리오(기존 ON/OFF, 명시적 전부 OFF, 명시적 목록, 사고성 빈 배열) 결과 확인.
  전체 ESLint 오류는 20개→10개로 감소(남은 것은 이번 범위 밖의 기존 오류).
- **남은 것 / 다음**: 교사 화면은 Google OAuth가 필요하므로 실제 UI에서 중복 토글 제거·상단 모듈 토글 저장을 1회 확인 권장.
  다음 Stage 3 작업은 커뮤니티/수업도구 모듈 이전 또는 메뉴의 나머지 하드코딩 제거.

## 2026-07-26 — 아지트 놀이터 도입 (포인트 콘텐츠 허브) (Claude)
- **기획 배경(사용자)**: 포인트로 즐기는 콘텐츠를 **"아지트 놀이터"** 라는 고정 항목 하나로 묶고, 교사가 취사선택한
  놀거리가 그 안에서 열리게. 콘텐츠가 늘어도 학생 메뉴가 길어지지 않도록.
- **한 일**:
  - `src/modules/PlaygroundPanel.jsx` 신설 — 켜진 게임 모듈을 카드 그리드로 보여주는 전체화면 패널(포인트 표시 포함).
  - `StudentDashboard`에 놀이터 상태·항목 구성(`playgroundItems`) 추가. 항목 클릭 → 놀이터 닫고 해당 기능(드래곤 모달/어휘의탑) 오픈.
  - `DashboardMenu`에서 **드래곤·어휘의탑 개별 카드 제거 → 놀이터 카드 1개**로 교체(280~438줄 구간). 놀거리 0개면 카드 자체 숨김.
- **변경**: 커밋 `cfceee9`. 파일: `PlaygroundPanel.jsx`(신규), `StudentDashboard.jsx`, `DashboardMenu.jsx`.
- **결과/검증**: 메뉴에 놀이터 카드 표시 ✅ / 놀이터 안 드래곤·어휘의탑 카드 ✅ / 드래곤 클릭→모달 열림 ✅ /
  전체화면 오버레이 정상(뷰포트 캡처 확인) / 빌드·브라우저 에러 0. 학급 미설정(NULL)+어휘의탑 게임설정 ON 상태로 검증.
- **⚠️ 남은 것 (GPT 인수인계)**:
  1. **`DashboardMenu.jsx`에 미사용 변수 7개** — 카드를 놀이터로 옮기며 쓰이지 않게 된 것들
     (`hasModuleConfig`, `isModuleOn`, `isExhausted`, `isRankingHovered`/`setIsRankingHovered`, `fetchRankings`, `displayRankings`
     + 관련 `rankings`/`classmates` 상태·`getTodayKey`/`getAttempts`). **동작에는 문제 없음**(빌드 통과), 린트 에러만 남음.
     → 제거 시도했다가 JSX/문법 깨져 원복함. **한 번에 지우지 말고 하나씩 지우며 `npm run build` 확인 권장.**
     주의: 이 코드들(랭킹 프리뷰·시도 횟수)은 **어휘의 탑 게임 내부에 동일 기능이 이미 있음**(각 14곳·13곳 참조) → 삭제해도 기능 손실 없음.
  2. 어휘의 탑이 여전히 **두 곳**에서 제어됨: 모듈 토글(ModuleToggles) + 기존 게임설정(`vocab_tower_enabled`).
     현재 규칙 = 모듈 설정을 저장한 학급이면 모듈 우선, 미설정이면 기존 플래그 존중. **교사 혼란 소지 → 일원화 필요.**
  3. 드래곤 모달의 선행 린트 에러 3건(`Math.random` in render) 미수정 — 이전 작업과 무관한 기존 이슈.
- **테스트 정보**: 테스트 학급 `테스트`(id `c748b950-...`), 학생코드 `NPU6KAN5`(유지현). dev는 `npm run dev`(localhost:5173),
  교사 구글로그인 하려면 `/etc/hosts`에 `127.0.0.1 api.xn--vz0ba242ncqcba79xhwx.site` 필요.

## 2026-07-26 — 모듈 토글 버그 2건 수정 (사용자 신고) (Claude)
- **신고1**: "전부 OFF하면 도로 켜짐" — 원인: 마지막 모듈을 끄면 빈 배열이 되는데, 직전에 넣은 안전장치가
  빈 배열을 '미설정'으로 보고 defaultEnabled로 되돌림. → **`__configured__` 표식**을 저장에 포함해
  "의도적으로 다 끔"과 "설정 안 함/사고성 빈 쓰기"를 구분. 기존 저장 학급 1건도 표식 추가 마이그레이션.
- **신고2**: "어휘의 탑만 on/off 안 됨" — 원인: 내가 메뉴를 `모듈 ON && vocab_tower_enabled` **AND**로 묶음.
  실제 학급 대부분은 게임설정만 켜고 모듈은 미설정(NULL)이라 **어휘의 탑이 사라지고 토글도 무반응**으로 보였음.
  → **모듈 설정을 저장한 학급은 모듈 값 우선, 미설정 학급은 기존 `vocab_tower_enabled` 존중**으로 변경.
- **변경**: 커밋 `dabacf6`(표식), `(이 커밋)`(어휘의탑 우선순위). `registry.js`·`useEnabledModules.js`·`ModuleToggles.jsx`·`DashboardMenu.jsx`.
- **결과/검증**: 시나리오 6종 실검증 — ①전부OFF→숨김 유지 ②미설정→기본값 ③사고성 빈배열→기본값(안전)
  ④게임설정ON+모듈미설정→둘 다 보임 ⑤모듈로 어휘의탑만 ON→드래곤만 숨김 ⑥모듈로 어휘의탑 OFF→게임설정 ON이어도 숨김. 빌드 통과.
- **남은 것 / 다음**: 어휘의 탑이 여전히 **두 곳(모듈 토글 + 게임설정)** 에서 제어됨 → 교사 혼란 소지, 일원화 필요.
  드래곤 모달의 선행 린트 에러 3건(Math.random in render) 미수정.

## 2026-07-26 — 기능 OFF 표시 통일(숨기기) + 빈배열 안전장치 (Claude)
- **한 일**: 사용자 지적 — 드래곤은 OFF 시 카드가 사라지는데 어휘의 탑은 "게임 준비중" 회색카드로 남아 **동작 불일치**.
  선생님 결정("아예 숨기기로 통일")에 따라 어휘의 탑 카드에도 게이팅 적용.
  또한 **이중 관리**(신규 `enabled_modules` + 기존 `vocab_tower_enabled`)를 정리: 메뉴는 **둘 다 ON일 때만** 노출(한쪽만 꺼도 숨김),
  매니페스트에 `legacyFlag` 명시.
- **발견·수정한 위험**: 검증 중 드래곤 카드까지 사라지는 현상 → 원인은 **`enabled_modules`가 빈 배열(`{}`)** 이면
  "아무것도 안 켬"으로 해석된 것(내 이전 테스트 잔재). **레지스트리에서 빈 배열=미설정으로 처리**하도록 안전장치 추가 →
  실수로 빈 배열이 저장돼도 학생 메뉴가 통째로 비지 않음. 전 학급 점검 결과 322개 모두 NULL(실사용 영향 0), 테스트 학급도 NULL 원복.
- **변경**: 커밋 `a04914b` — `DashboardMenu.jsx`(어휘의탑 게이팅), `registry.js`(빈배열 안전처리), vocab-tower `manifest.js`(legacyFlag).
- **결과/검증**: 스크린샷 확인 — "게임 준비중" 카드 사라지고 드래곤·글쓰기·친구아지트·우리반아지트 정상. 빌드·브라우저 에러 0.
  빈배열 재현 테스트에서 드래곤 유지 확인(안전장치 작동). 린트 에러 1건은 변경 전후 동일한 선행 이슈(미수정).
- **남은 것 / 다음**: ①교사 UI에서 어휘의 탑은 여전히 두 곳(모듈 토글 + 게임설정)에서 제어 → 하나로 합치기
  ②나머지 기능(친구아지트·아지트온클래스·아이디어마켓) 이전 ③OFF 시 코드도 안 받게(카드 UI까지 모듈로 이동).

## 2026-07-26 — 메뉴 레지스트리 게이팅 (Stage 3b 점진 전환) (Claude)
- **한 일**: 학생 대시보드 메뉴가 모듈 레지스트리를 읽어 표시 여부를 판단하도록 전환 시작.
  카드 UI/레이아웃은 **손대지 않고** "보여줄지" 판단만 `useEnabledModules`로 이관 (드래곤 카드 우선 적용).
  어휘의 탑 카드는 랭킹조회·일일시도·잔여표시 등 상태가 얽혀 있어 이번엔 게이팅 제외(후속).
- **변경**: 커밋 `6098a69` — `DashboardMenu.jsx`에 `useEnabledModules` + `isModuleOn('dragon')` 게이팅.
- **결과/검증**: ①전환 전/후 **풀페이지 스크린샷 동일**(레이아웃·문구·색상 변화 없음) ②메뉴 5개 항목 전부 표시 확인
  ③빌드·브라우저 에러 0 ④**게이팅 실동작 검증**: 테스트 학급 `enabled_modules=['vocab-tower']`로 두니 드래곤 카드 숨김 → NULL 원복 완료.
  린트 에러 2건은 변경 전후 동일(선행 이슈, 미수정).
- **후속(2026-07-26)**: **교사용 모듈 on/off UI 완료** — `src/modules/ModuleToggles.jsx` 신설, GameManager(놀이터 관리) 상단에 배치.
  등록 모듈을 파트별로 묶어 ON/OFF 토글 → `classes.enabled_modules` 저장. 미설정 학급은 defaultEnabled로 초기 표시(현재 화면과 동일).
  검증: 빌드·린트 0에러, DB 저장/원복 경로 확인. **교사 화면 실물 확인은 사용자 몫**(구글 OAuth라 자동화 불가).
- **남은 것 / 다음**: ①어휘의 탑 카드 게이팅 + `vocab_tower_enabled` → `enabled_modules` 흡수
  ②나머지 기능(친구아지트·아지트온클래스·아이디어마켓) 이전 ③모듈 OFF 시 코드도 안 받게(카드 UI까지 모듈로 이동).
  ⚠️ 현재는 "숨김"만 구현 — 모듈 OFF 시 코드 자체를 안 받게 하려면 카드도 모듈 폴더로 옮겨야 함(후속).

## 2026-07-26 — Stage 3a/3b 착수: 모듈 시스템 + 드래곤 첫 이전 (Claude)
- **한 일**: 기능별 모듈화 기반 공사 후 첫 모듈(드래곤) 이전.
  - **3a 기반**: `src/modules/`에 매니페스트 규격(`types.js`)·레지스트리(`registry.js`)·학급별 on/off 훅(`useEnabledModules.js`) 신설.
    DB `classes.enabled_modules text[]` 추가(NULL=모듈별 defaultEnabled → 기존 동작 보존).
  - **3b 첫 이전**: DragonHideoutModal·BackgroundShopModal·useDragonPet → `src/modules/game/dragon/` + manifest 등록.
    StudentDashboard가 두 모달을 `lazy()`+조건부 렌더로 전환 → **별도 청크 분리(17KB·4KB), 열 때만 다운로드**.
  - 판단: `pet_data`는 친구목록·글 작성자 아바타 등 여러 곳이 쓰므로 **코어 데이터로 잔류**, "드래곤 기르기 기능"만 모듈화.
- **변경**: 커밋 `32f1f53`(기반), `48dd818`(드래곤 이전). 마이그레이션 `supabase/migrations/20260726_add_enabled_modules.sql`(운영 DB 적용 완료).
- **결과/검증**: 빌드·린트 통과, 브라우저 에러 0, 앱 정상. 드래곤 청크 분리 확인. 모달에 exit 애니메이션 없어 조건부 렌더로 인한 연출 변화 없음(동작 동일).
- **후속(2026-07-26, `73aeda9`)**: **어휘의 탑 이전 완료** — VocabularyTowerGame·useVocabularyTower → `src/modules/game/vocab-tower/` + manifest 등록.
  이미 lazy 로드 중이라 청크(30KB) 유지. 교사 설정(GameManager의 vocab_tower_* 컬럼)·학급설정 로딩(useClassAgitClass)은 기존 위치 잔류 → 후속 이전 대상.
- **남은 것 / 다음**: ①메뉴(DashboardMenu 501줄, 기능 하드코딩 12곳)를 레지스트리 기반 렌더로 전환 ②나머지 모듈(커뮤니티·수업도구) 순차 이전
  ③교사 GameManager의 드래곤/어휘 설정도 모듈로 이전 ④기존 개별 플래그(vocab_tower_enabled)를 enabled_modules로 흡수.
  ⚠️ DragonHideoutModal에 기존 린트 에러 3건(Math.random in render) 존재 — 이전과 무관한 선행 이슈라 별도 커밋으로 처리 예정.

## 2026-07-26 — 자동 백업 실패 수정 (launchd 외장SSD 권한 문제) (Claude)
- **한 일**: 07-26 04:00 예약 백업이 전부 실패한 것 발견. 원인=**macOS가 launchd 실행에서 외장 SSD(/Volumes/SHmaegmini) 쓰기 차단**
  (`mkdir Operation not permitted`, TCC). 수동 실행(Terminal/Claude)은 권한 있어 되지만 예약은 안 됨.
- **변경**: `~/scripts/sh_mirror_backup.sh` 재작성 — **내장(`~/backups/auto/<날짜>`)에 스테이징 → 드라이브 업로드**(둘 다 launchd에서 확실)
  → **외장SSD 복사는 best-effort**(권한 있으면 성공, 없으면 스킵+로그). 옛 `agit_backup.sh` 삭제. 각 단계 ✓/✗ 로깅.
- **결과/검증**: 수동 재실행으로 오늘분 3곳(내장·외장SSD·드라이브) 각 5파일 복구. 어제(0725)분도 정상 확인.
- **남은 것 / 다음**: 예약 4시 실행은 이제 **내장+드라이브는 확실**, 외장SSD는 Full Disk Access 부여 시 자동.
  → `/bin/bash`를 시스템 설정>개인정보 보호>전체 디스크 접근 권한에 추가하면 외장SSD도 자동 복사됨(선택).

## 2026-07-25 — CI/CD 자동 배포 구축 (push→러너→Docker) (Claude)
- **한 일**: "어디서든 git push → 맥미니 러너 → Docker 자동 배포" 구축. gh 인증 후 vibe_agit 밀린 35커밋 push(최신화).
  기존에 writing-helper·URL·classroom-tools는 이미 self-hosted 러너+deploy.yml 있었음(online). **vibe_agit만 신규 설치**.
  처음 러너를 외장SSD에 설치했으나 launchd가 외장 실행파일을 못 돌려 exit126 → **내장 `~/actions-runner-agit`로 재설치**(기존 정상 러너들과 동일).
- **변경**: `.github/workflows/deploy.yml`(신규, vibe_agit). git 밖 — 내장에 러너 서비스 `actions.runner.…macmini-agit`.
  워크플로우: push(main)→checkout→`docker build`(anon키는 러너가 `~/agit-supabase/.env`에서 읽음)→agit-app 재시작→200 검증. 문서(.md)·정수SQL 변경은 배포 스킵.
- **결과/검증**: 첫 자동배포 성공(run success, agit-app 재생성, 사이트 200). 4개 앱 러너 전부 online.
- **남은 것 / 다음**: writing-helper에 커밋 안 된 기능 개발 909줄(한자쓰기·워드게임 등) 존재 → 선생님 확인 후 커밋·push(그럼 연구소 자동배포 트리거).
  러너는 내장 설치(외장SSD launchd 불가). 배포 시 앱 컨테이너 ~10초 재시작 다운.

## 2026-07-25 — 개발 캐시 SSD 오프로드 (내장 안정화) (Claude)
- **한 일**: 개발 시 계속 쌓이는 캐시를 SSD로 이전해 내장 디스크가 현재 수준을 유지하도록.
  주범은 npm 캐시 6.1GB(+무한증가)와 `~/.cache` 1.5GB였음.
- **변경**: git 밖 — `~/.npm` → `/Volumes/SHmaegmini/dev/cache/npm`(mv) + `npm config set cache`(~/.npmrc 영속).
  `~/.cache` → SSD 이동 후 심링크. SSD에 `/Volumes/SHmaegmini/dev/{cache,repos}` 구조 생성(앞으로 새 개발은 repos에서).
- **결과/검증**: 내장 여유 78GB→**85GB**(목표 80GB 초과). 이후 npm install·도구 캐시는 SSD에 누적 → 내장 안정.
  node_modules(548MB)는 내장 잔류하나 크기 고정이라 무방.
- **남은 것 / 다음**: (선택) 기존 레포를 `/Volumes/SHmaegmini/dev/repos`로 옮기면 node_modules까지 SSD.
  ⚠️ npm캐시·~/.cache가 SSD 의존(가드+인클로저로 안정, 캐시는 재생성 가능).

## 2026-07-25 — 재부팅 안전장치: SSD 마운트 가드 (Claude)
- **한 일**: Docker 데이터가 외장 SSD(USB 인클로저)에 있어, 재부팅 시 Docker가 SSD 마운트보다 먼저 뜨면
  빈 데이터로 시작해 컨테이너가 사라질 위험(이번에 실제 겪음) → 방지 안전장치 구축.
- **변경**: git 밖 — Docker Desktop AutoStart=False로 변경. `~/scripts/docker_ssd_guard.sh`(신규) +
  LaunchAgent `com.agit.docker-guard`(RunAtLoad). 부팅 시 SSD의 `DockerDesktop/Docker.raw`가 보일 때까지 최대 5분 대기 →
  확인되면 `open -a Docker`, 미마운트면 Docker 시작 안 함 + 화면 알림.
- **결과/검증**: AutoStart False 확인, 가드 실행 테스트에서 SSD 감지→Docker 시작 정상. 현 서비스 무영향.
- **남은 것 / 다음**: 다음 재부팅 때 가드가 정상 동작하는지 로그(`~/backups/auto/docker_guard.log`) 확인 권장.
  외장 SSD는 인클로저로 맥미니에 고정(분리 위험 낮음).

## 2026-07-25 — 자동 백업 체계 구축 (구글 드라이브, 압축 방식) (Claude)
- **한 일**: 백업 범위를 "GitHub에 없는 것만"으로 압축. 끄적끄적아지트·연구소·샘링크·서바이벌은 GitHub 버전관리 확인 → 제외.
  백업 대상=①자비스(Jarvis_Brain_Local, 원격 없음) ②agit-supabase 설정·시크릿(git 아님) ③양 스택 DB 덤프.
  최초에 rclone이 `.git` 소파일 수천개를 개별 업로드해 매우 느렸던 문제 → **tar.gz 압축 방식으로 전환**(앱당 파일 1개).
- **변경**: git 밖 — `~/scripts/sh_mirror_backup.sh`(신규), LaunchAgent `com.agit.backup`(매일 04:00) 이 스크립트 실행.
  rclone remote `gdrive`(구글드라이브, scope=drive). 업로드 경로 `gdrive:SH맥미니/<날짜>/`, 30일 보존.
- **결과/검증**: 전체 백업 **~15초 완료**(자비스 34MB + 설정 60KB + DB덤프 7MB). 드라이브 `SH맥미니/20260725/` 확인.
- **후속(2026-07-25 완료)**: rclone 전용 client_id(project 989537889976) 발급·Production 게시·Drive API 활성화 → 공용키 경고 사라짐, 토큰 만료 없음.
- **후속2(2026-07-25 완료)**: **이중 백업**으로 보완 — 백업 스크립트가 ①외장SSD `/Volumes/SHmaegmini/backups/<날짜>/`
  로컬 사본 + ②드라이브 `SH맥미니/<날짜>/` 둘 다 저장(각 30일). 실DB=내장 / 사본=외장SSD+드라이브로 3곳 분산.
  외장SSD 미마운트 시 내장 폴백. 테스트: 두 곳 5파일 일치.
  대안: 자비스를 private GitHub에 올리면 드라이브 백업은 DB덤프+시크릿(~7MB)만 남아 더 가벼워짐.
  복원: DB=`pg_restore`, 자비스/설정=tar 해제. DB는 raw 파일이 아닌 논리 덤프라 일관성 보장.

## 2026-07-25 — Docker 데이터 SSD 이전 성공 (수동 복사 방식) (Claude)
- **한 일**: Docker 데이터(이미지·컨테이너, Docker.raw 20GB)를 내장→외장 SSD(APFS, `/Volumes/SHmaegmini`)로 이전.
  Docker Desktop GUI 디스크이동이 3회 실패(12GB·3.3GB·0에서 revert)한 원인은 앱이 `Docker 2.app`이라는 비정상 이름으로 설치돼 있던 것.
  → 앱을 `Docker.app`으로 개명 후, **수동 복사 방식**으로 이전: Docker 정상종료 → Docker.raw를 SSD로 rsync 복사(원본 보존)
  → settings-store.json의 DataFolder를 SSD로 변경 → Docker 시작(복사본 인식) → 전수 검증 통과 후 내장 원본 삭제.
- **변경**: git 밖 인프라 — Docker DataFolder `~/DockerDesktop` → `/Volumes/SHmaegmini/DockerDesktop`.
  설정 백업 `settings-store.json.bak-before-ssd` 보존. **DB는 여전히 내장 bind mount**(B안: 이미지만 SSD, 운영DB 내장 유지).
- **결과/검증**: 이미지 22·컨테이너 36개 전부 SSD raw에서 정상 기동. DB 데이터 온전(users 2919·students 1415),
  bind mount 경로 내장 확인, 프로덕션 200 OK. **내장 여유 58GB→78GB**(20GB 확보). SSD 사용 20GB/911GB 여유.
- **남은 것 / 다음**: ①docker CLI 심링크가 옛 이름(`Docker 2.app`) 가리켜 깨짐 → sudo로 재연결 필요(사용자).
  ②rclone 구글드라이브 인증(`rclone config`, 브라우저) → 자동백업 업로드 활성화(스크립트·매일4시 스케줄은 이미 등록됨).
  ③80GB+ 완전 달성 및 "프로그래밍 파일 SSD" 위해 개발 레포·node_modules SSD 이동은 추후(현재 78GB).
  ⚠️ 운영 Docker가 외장 SSD 의존 → SSD 절대 분리 금지. 분리 시 서비스 다운(단 내장 DB데이터는 안전).

## 2026-07-24 — 🚨 Docker SSD 이동 실패 → 전 서비스 복구 (Claude)
- **한 일**: 사용자가 Docker를 외장 SSD로 옮기려다 실패한 상황 점검·복구. Docker Desktop이 데이터 폴더를
  `~/DockerDesktop`(빈 새 Docker.raw, sparse 9.5M)로 바뀌어 재시작 → **모든 컨테이너·이미지·네임드볼륨 소실, 사이트 502**.
  원본 Docker.raw는 유실(내장/외장/휴지통 어디에도 없음). **원인=수동 이동 중 원본 소실, 외장 SSD엔 실제로 안 옮겨짐.**
  - **데이터 생존 확인**: 모든 DB 스택이 **bind mount** 사용 → DB 실데이터는 Docker.raw 밖(디스크)에 있어 무사.
    (`~/agit-supabase/volumes/db/data` 162M, `~/Jarvis_Brain_Local/self-hosted-supabase/volumes/db/data` 278M)
  - **복구**: 각 스택 `docker compose up -d`로 재구축(이미지 재다운로드, 살아있는 bind-mount DB 연결) + `agit-app:prod` 이미지 재빌드.
- **변경**: git 밖 인프라만 — agit 스택(15)·구 supabase 스택(14)·앱 5종(agit-app/writing-helper/classroom-tools/jarvis/samlink) 전부 재생성.
  코드/커밋 변경 없음. Docker 데이터는 현재 **내장 디스크**에 있음(SSD 이동은 안 됨).
- **결과/검증**: 전 도메인 외부 200/307 정상(아지트·helper·survival). DB 데이터 온전 — 오히려 이관 스냅샷보다 최신
  (auth.users 2896→2918, students 1398→1415, point_logs 17286→17510, 연구소 학생매핑 27/40 보존). 익명 로그인 200. 전 앱 restart=unless-stopped.
- **남은 것 / 다음**: ⚠️ **SSD 이동 재시도 시 수동 금지** — 반드시 ①Docker Desktop Settings→Resources 디스크 위치 변경(안전)
  또는 ②bind-mount 볼륨 디렉토리를 SSD로 옮기고 compose 경로 수정, 둘 다 **사전 백업·컨테이너 정지 후**. survival 웹훅(9000)은
  LaunchAgent(`com.jarvis.survival`)/별도 프로세스라 미기동 상태(사이트 서빙 무관). dev OAuth 작업(.env.local api도메인 전환)은 이 사고로 중단됨 — 재개 필요.

## 2026-07-24 — dev 서버 구글 로그인 복구 (redirect allow-list) (Claude)
- **한 일**: `npm run dev`(localhost:5173)에서 교사 구글 로그인이 인증 후 되돌아오지 못하던 문제 해결.
  원인=GoTrue `ADDITIONAL_REDIRECT_URLS`에 아지트 dev 포트 5173 누락(연구소 3000·3002만 있었음).
- **변경**: git 밖 인프라 — `~/agit-supabase/.env`의 `ADDITIONAL_REDIRECT_URLS`에 `http://localhost:5173/**`,
  `http://192.168.219.102:5173/**` 추가 후 `agit-auth`만 재생성.
- **결과/검증**: 허용 목록 반영 확인, dev에서 "선생님으로 시작" → accounts.google.com 정상 이동.
- **남은 것 / 다음**: dev 구글 로그인은 구글 콜백이 `api.끄적끄적아지트.site`(→ hosts로 127.0.0.1)로 오므로,
  개발 중엔 `/etc/hosts`의 api 매핑을 유지해야 함(제거 시 dev OAuth 깨짐, 학생 익명로그인은 무관).

## 2026-07-24 — Stage 2 착수: 연구소↔아지트 학생 매핑 (Claude)
- **한 일**: 연구소 통합(Stage 2) 시작. 두 앱이 아직 다른 DB(아지트=새 스택 8100, 연구소=구 스택 8000)지만 JWT 시크릿·anon 키
  동일 확인(SSO 기반). 새 스택의 이관된 연구소 스키마에 학생/학급 매핑 컬럼 추가·채움 (운영 연구소 무영향).
  학급쌍(선생님 확정): 여수진남초4→진남초 AI글쓰기 대회 4학년, 동백 5학년1반→26년 동백 5-1. 테스트 학급 제외.
- **변경**: `supabase/integration/2026-07-24_lab_student_mapping.sql` (신규). 새 스택 agit-db `writing_helper.classes.agit_class_id`,
  `writing_helper.class_students.agit_student_id` 컬럼 추가 + 매핑. 되돌리기: 두 컬럼 DROP.
- **결과/검증**: 학급 2쌍, 학생 27/29명 매핑. 미매핑 2명은 규칙("큰 명단 유지, 짝 없으면 없는걸로")대로 NULL —
  최원진(동백 #16, 아지트 없음)·신율희(여수진남초4 #6, 아지트 동명이인 2명 → 수동확인 대기).
- **남은 것 / 다음**: ①신율희 동명이인 수동 확정 ②연구소를 새 스택으로 이전(운영 전환: 데이터 재동기화→env 전환→SSO 확인, 롤백=구 스택 env)
  ③SSO 세션 정렬(2a) ④결과물 RPC(2c). ⚠️ 연구소 이전은 운영 변경이라 dev 검증/롤백 경로 확보 후.

## 2026-07-24 — 로컬 개발 워크플로우 확립 (dev 서버 + .env.local) (Claude)
- **한 일**: "맥미니에서 공개 도메인이 NAT 루프백으로 안 열려 개발 불편" 문제 해결. 개발은 공개 도메인이 아니라
  **`npm run dev`(Vite, http://localhost:5173, 핫리로드)**로 하는 것이 정석임을 확립. dev 서버가 로컬 통합 스택을 바라보도록 설정.
- **변경**: `.env.local` 생성(git 무시, `.env.*`) — `VITE_SUPABASE_URL=http://127.0.0.1:8100` + 로컬 스택 anon 키.
  (프로덕션 빌드는 Dockerfile build-arg를 쓰므로 `.env.local` 영향 없음.) 코드/커밋 변경 없음.
- **결과/검증**: `npm run dev` 200, 앱 로컬 스택 연결 확인. 같은 WiFi 기기 테스트는 `npm run dev -- --host` → `http://192.168.219.102:5173`.
- **남은 것 / 다음**: ⚠️ 로컬 스택(8100)은 **운영 DB**다 — dev에서 쓰기·스키마 실험은 실데이터 위험.
  Stage 4(DB 스키마 변경) 착수 전 **별도 개발용 DB 스택**을 다른 포트로 분리 권장(미착수). UI 작업은 테스트 계정만 사용.

## 2026-07-24 — Claude·Codex 교대용 README 인수인계 정리 (Codex)
- **한 일**: 사용자가 교사 Google 로그인 후 아지트 대시보드 진입 정상화를 최종 확인. 두 AI 모델이 번갈아 작업해도
  운영 상태와 다음 순서를 놓치지 않도록 README의 기본 Vite 안내를 실제 인수인계 문서로 교체. 오늘 해결한 DNS·TLS·OAuth·Realtime·캐시·Umami
  상태, 운영 구조, 보류 항목, 비밀 관리 규칙을 요약하고 2026-07-25 기능 스모크 테스트를 접속·핵심 글쓰기·기존 기능·기기/성능 순으로 체크리스트화.
- **변경**: `README.md`, `ROADMAP.md` 문서 갱신. git 밖 인프라 변경 없음.
- **결과/검증**: 로그인과 대시보드 진입에 대한 사용자 실기기 확인을 현재 상태에 반영. README에서 영구 저장되지 않은
  `www` Caddy 런타임 설정과 안정화 후 정리할 항목을 완료 사항과 분리해 다음 작업자가 오판하지 않도록 정리.
- **남은 것 / 다음**: README 체크리스트에 따라 테스트 계정으로 전수 스모크 테스트. 우선 `/private/tmp/Caddyfile.www-redirect` 존재를 확인해
  `/etc/caddy/Caddyfile`에 영구 반영하고, 테스트 실패는 기기·계정·시각·네트워크와 함께 이 파일 상단에 기록.

## 2026-07-24 — 로그인 후 무한 로딩 진단·Realtime 완전 복구 (Codex)
- **한 일**: Google 로그인 후 “아지트 문을 열고 있어요”가 지속되는 현상 진단. Auth callback·세션 `/user`·프로필/교사 조회는 모두
  200이고 관리자 프로필도 정상임을 확인. 같은 시각 Realtime WebSocket이 503을 반복한 원인을 Kong의 이전 upstream 이름과
  통합 스택 Realtime 컨테이너 이름 불일치로 확정. 구 연구소 스택이 공식 컨테이너 이름을 이미 사용하므로 통합 스택 내부에만
  `realtime-dev.supabase-realtime` 네트워크 별칭을 추가하고 Kong upstream을 정합화. 비어 있던 `supabase_realtime` publication에는
  코드가 실제 구독하며 RLS가 활성화된 8개 테이블만 등록.
- **변경**: git 밖 인프라 — `~/agit-supabase/docker-compose.yml` Realtime 네트워크 별칭,
  `~/agit-supabase/volumes/api/kong.yml` Realtime WS/REST upstream, DB publication 8개
  (`announcements`, `classes`, `point_logs`, `post_comments`, `post_reactions`, `student_posts`, `students`, `writing_missions`).
  변경 전 Compose/Kong 파일은 같은 경로의 `*.pre-realtime-*-20260724`로 보존.
- **결과/검증**: `agit-realtime`·`agit-kong` healthy, Auth health·REST OpenAPI 200, WebSocket 101 Switching Protocols,
  DNS/TenantNotFound 오류 0, 실제 supabase-js `announcements` 구독 `SUBSCRIBED` 확인.
- **남은 것 / 다음**: 사용자 모바일 브라우저 새로고침 후 교사 대시보드 진입과 실시간 채널 재연결 최종 확인.

## 2026-07-24 — Google OAuth 클라이언트 정합화·Auth 재배포 (Codex)
- **한 일**: Google 콘솔 클라이언트와 운영 `agit-auth`의 클라이언트 ID가 달라 발생한 `redirect_uri_mismatch` 진단.
  사용자가 git 밖 시크릿 파일에 올바른 Web OAuth ID·시크릿을 입력한 뒤 값 노출 없이 형식만 검증하고 `agit-auth`만 재생성.
- **변경**: git 밖 인프라 — `~/agit-supabase/secrets.agit.env`의 Google OAuth 자격 증명 정합화(사용자 입력),
  compose project `agit`의 `auth` 서비스만 `--no-deps --force-recreate` 적용. 시크릿 값은 기록하지 않음.
- **결과/검증**: `agit-auth` healthy, 실제 authorize 요청이 새 클라이언트와
  `https://api.xn--vz0ba242ncqcba79xhwx.site/auth/v1/callback`을 사용하는 것 확인. Google 응답 200, mismatch 문구 없음.
- **남은 것 / 다음**: 실제 모바일/브라우저에서 교사 Google 로그인 후 아지트 대시보드 진입·세션 유지 1회 확인.

## 2026-07-24 — www DNS 별칭 TLS 복구·리디렉션 적용 (Codex)
- **한 일**: 사용자가 가비아에 `www` CNAME을 apex로 추가한 뒤 발생한 `ERR_SSL_PROTOCOL_ERROR` 진단.
  공개 DNS 3곳에서 `www`가 apex와 새 IP로 전파된 것을 확인하고, 원인이 호스트 Caddy의 `www` 사이트 블록·인증서 부재임을 확인.
  `www` 요청을 apex로 영구 리디렉션하는 검증된 설정을 실행 중인 Caddy 관리 API에 적용.
- **변경**: git 밖 런타임 Caddy 설정 — `www.xn--vz0ba242ncqcba79xhwx.site` → apex `{uri}` HTTP 301.
  영구 설정 후보는 `/private/tmp/Caddyfile.www-redirect`; `/etc/caddy/Caddyfile` 저장은 sudo 비밀번호가 필요해 아직 미반영.
- **결과/검증**: `www` TLS 정상, HTTP/2 301 및 apex Location 확인. 기존 apex 서비스 영향 없음.
- **남은 것 / 다음**: 사용자 터미널에서 현재 `/etc/caddy/Caddyfile` 백업 후 후보 파일을 복사하고 Caddy reload하여 재부팅 후에도 유지.

## 2026-07-24 — Umami Docker 서비스 중단·제거 (Codex)
- **한 일**: 미사용 Umami 분석 서비스를 Docker에서 제거. 최초 `docker compose down` 후 macOS LaunchAgent가 즉시 재생성하는 것을 발견해
  `com.jarvis.umami`를 bootout하고 plist를 `com.jarvis.umami.plist.disabled`로 변경한 뒤 Umami 앱·PostgreSQL 컨테이너와 전용 네트워크를 제거.
- **변경**: git 밖 인프라 — `umami-umami-1`, `umami-db-1`, `umami_default` 제거. 자동실행 비활성화.
  복구 가능하도록 `~/umami/docker-compose.yml`, Docker 이미지, `umami_umami-db-data` 볼륨, 실행 스크립트는 보존.
- **결과/검증**: Umami 컨테이너 0개, LaunchAgent 미등록, 비활성화 plist 존재, DB 볼륨 보존 확인. 아지트 코드는 Umami를 사용하지 않아 앱 영향 없음.
- **남은 것 / 다음**: 완전 폐기 확정 시 Caddy의 `umami.` 블록·가비아 DNS A 레코드·보존 이미지/볼륨/설정·스크립트를 별도 정리.

## 2026-07-24 — 컷오버 모니터링 및 정적 자산 캐시 규칙 수정 (Codex)
- **한 일**: README·ROADMAP 기준으로 컷오버 후 상태를 점검. 가비아 NS와 apex/API A 레코드가 새 공인 IP로 전파된 것을 확인하고,
  로컬 Caddy 경유 앱 HTTP/2 200·SPA 폴백·zstd 압축·보안 헤더 및 `agit-*` 컨테이너 상태를 확인. 실응답에서 Vite 해시 자산에
  `Cache-Control: immutable`이 누락된 원인을 찾아 `Caddyfile.container`의 해시 정규식을 실제 Vite 파일명 형식에 맞게 수정.
- **변경**: `Caddyfile.container`, `ROADMAP.md`. git 밖 운영 앱을 후보 이미지 `agit-app:cache-fix-20260724`로 교체하고
  `agit-app:prod` 태그 적용. 이전 이미지 `agit-app:pre-cache-fix-20260724`와 중지 컨테이너 `agit-app-pre-cache-fix-20260724`를 롤백용으로 보존.
- **결과/검증**: `npm run build` 통과(기존 duplicate key·청크 경고 유지), Caddy 설정 검증 통과. 임시 컨테이너와 후보 이미지 모두
  해시 JS 응답에 `Cache-Control: public, max-age=31536000, immutable` 적용 확인. 배포 후 실제 도메인 경유 앱 HTTP/2 200,
  anon 키 포함 API health 200, 새 컨테이너 로그 오류 없음.
- **남은 것 / 다음**: 외부 공인 IP 접속은 맥미니의 NAT 루프백 제약으로 로컬에서 타임아웃되므로 외부망/업타임 모니터로 별도 확인.
  안정 확인 후 롤백용 이전 컨테이너·이미지 정리.

## 2026-07-24 — 방향 확정: 3대 기둥 + 방학 계획 로드맵 반영 (Claude)
- **한 일**: 제품 집중 "3대 기둥"(교사 글쓰기 지도 / 학생 자율 글쓰기·제출 / 포인트 동기부여) 확정.
  방학 우선순위 4가지와 기능 정리(3기둥 밖 4종: 아지트온클래스·친구 아지트·한줄 모으기·아이디어마켓)를 로드맵에 반영.
  포인트 엔터테인먼트 확장(드래곤 다이나믹화 + 신규 포인트 활동)을 Stage 4d로 구조화.
- **변경**: 커밋 `3fbe601`, `bc4a603` (ROADMAP.md). Stage 3c(기능 정리+코드 청소), Stage 4d(포인트 확장) 신설.
- **결과/검증**: 문서 작업. 실행 코드 변경 없음.
- **남은 것 / 다음**: 정리 후보 삭제 vs 기본OFF, 신규 포인트 활동 종류, 드래곤 이벤트 범위는 🔶 선생님 결정 대기.

## 2026-07-24 — 🎉 Stage 1 컷오버 완료 (Vercel+Cloud → 맥미니) (Claude)
- **한 일**: 본 도메인 `끄적끄적아지트.site`를 맥미니 자체호스팅으로 전환.
  - 새 PG17 통합 Supabase 스택 구축, 클라우드 덤프 복원(users 2896·students 1398·posts 2769·point_logs 17286).
  - 연구소(writing_helper) 스키마 이관 + UUID 매핑(유승현→yoo@gmail, 최원진→wonjinchoi0126, 나머지 삭제).
  - Edge Functions 4개 배포 + 시크릿(OpenAI 공용키·관리자 비번·구글 OAuth) 주입.
  - 아지트 앱 Docker 이미지화 + 호스트 Caddy 라우팅 + 가비아 네임서버 이전 + Let's Encrypt 인증서.
- **변경**:
  - 커밋 `b97283a`~`afc9ef9` (ROADMAP.md·INTEGRATION_PLAN.md 진행기록, `Dockerfile`·`Caddyfile.container`·`.dockerignore` 추가).
  - **git 밖 인프라**: 새 스택 `~/agit-supabase/`(compose project `agit`, PG17, Kong:8100/DB:5433, 시크릿 `secrets.agit.env`). 앱 컨테이너 `agit-app`(127.0.0.1:8300, restart=unless-stopped). 호스트 `/etc/caddy/Caddyfile`에 apex·api 블록 추가. 가비아 DNS: apex/api/helper/survival/umami A→180.228.70.202. 백업 `~/backups/agit-cloud-20260724/`.
- **결과/검증**: 전수 통과 — 학생 익명로그인(signup 200·bind_student_auth 200)·교사 구글OAuth 리다이렉트·HTTPS 5도메인·OpenAI 키 유효(200). auth.users 원복(2896).
- **남은 것 / 다음**: DNS 전 세계 전파 완료 확인(일부 통신사 캐시 최대 24h) → 실사용 1~2주 모니터링 → Vercel/Supabase Cloud 해지 → 노출된 키 회전. 교사 AI피드백 실사용 1건 확인 권장.

## 2026-07-23~24 — Stage 0 대청소 (Claude)
- **한 일**: 이관 전 코드 정리. 루트 잡동사니(디버그 스크립트 등) 삭제, 보안테스트 스크립트 `scripts/` 이동,
  미사용 의존성(`openai`·`react-router-dom`) 제거, 린트 `no-unused-vars` 132→0, 프로덕션 빌드 console 제거.
- **변경**: 커밋 `fb694e9`~`aec63f4`, `1e7df29`. (`.gitignore`, `vite.config.js`, `eslint.config.js`, 다수 컴포넌트).
- **결과/검증**: 각 단계 `vite build` 통과. `react/jsx-uses-vars` 규칙 추가로 motion import 오탐 해결.
- **남은 것 / 다음**: `exhaustive-deps`·대형 파일 분할은 Stage 3c로 이월(의도적).
