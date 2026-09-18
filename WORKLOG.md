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

## 2026-09-18 — 약관·처리방침에 서비스 종료 시 통지·백업 조항 신설 (Claude Opus 5)
- **요청**: "약관에 서비스 종료 내용이 있나" → 있으나 한 문단뿐이라 초안 요청 → 백업은 **교사 본인 구글
  문서**로 방향 결정 → 통지 30일 + 학년말 노력, **시행일은 2026-09-21 판에 바로 반영**(사용자 결정).
- **바뀌기 전 상태**: 약관 제7조가 "언제든 중단할 권리가 있고 사전 통지는 노력하되 보장 못 한다" 한 문단뿐.
  **아이들 글을 어떻게 되찾는지, 며칠 전에 알리는지, 종료 뒤 개인정보를 언제 파기하는지가 전부 없었다.**
  처리방침도 학급 종료·탈퇴만 다루고 **서비스 자체가 끝나는 경우**는 두 문서 어디에도 없었다.
- **약속 범위 실측**: 구글 문서 내보내기는 `drive.file` 권한으로 **교사 본인 구글 계정에 문서를 만든다**
  (`useDataExport.js`). 소유자가 교사라 서버에 사본이 없고 **종료 뒤에도 남는다** — 그래서 이걸 정본 백업으로
  약속했다. 과제는 보관함에서 여러 개 골라, 일기·독서록은 학생별로 내보낼 수 있고 엑셀·PDF 도 된다.
- **한 일**:
  - 약관 제7조를 다섯 항으로 교체: (1) 일시 중단 (2) 기능 변경 (3) **전체 종료 — 최소 30일 전 공지,
    그 기간에 교사 본인 구글 계정으로 저장, 학년말에 맞추도록 노력, 종료 뒤 서버 자료 파기**
    (4) **내보낸 자료의 보관·공유·파기 책임은 이용자(교사)** (5) 사전 통지가 어려운 경우.
  - 처리방침 제7조(파기 절차)에 두 문단 추가 — 종료일로부터 30일 내 서버 파기, 백업본 30일 자동 삭제라
    **최대 60일 안에 모든 사본 소멸**. 이용자가 내보낸 자료는 파기 대상이 아니며 이용자가 관리한다.
  - 약관 머리말 개정 이력에 "서비스 종료 시 통지·백업 조항 신설(제7조): 2026년 9월 18일" 추가.
- **(4)항을 넣은 이유**: 백업을 구글 문서로 정하니 **학생 이름과 글이 교사 개인 드라이브로 넘어간다.**
  그 시점에 책임 주체가 옮겨지므로 경계를 적어 두지 않으면 나중에 모호해진다. 기존 제3조("학생 정보 입력의
  책임은 이용자")와 결이 같다. 부수 효과로 학교 워크스페이스 계정 사용을 권하는 안내가 된다.
- **⚠️ 사용자가 사실을 알고 내린 결정**: 처리방침 제12조가 **"시행 7일 전 공지"** 를 약속하고, 9월 21일 판
  공지는 이미 2026-09-11 에 나갔으며, **선생님 90분이 이미 그 판에 동의**한 상태(09-13~09-18, `policy_consents`)
  임을 알린 뒤 "그래도 21일 판에 반영" 으로 결정했다. 따라서 **그 90분은 지금 화면과 다른 글에 동의한 기록**이
  된다. 별도 판(9/28 시행)으로 빼는 선택지와 재동의 선택지를 함께 제시했고 사용자가 선택하지 않았다.
- **변경**: `src/components/layout/TermsOfService.jsx`, `src/components/layout/PrivacyPolicy.jsx`,
  `tests/policyConsent.test.mjs`. `POLICY_VERSION` 은 `2026-09-21` 그대로(시행일 안 바뀜) — DB 변경 없음.
- **결과/검증**: `npm run test:all` 1216/1216, ESLint 0. 새 검사는 두 문서가 **같은 통지 기간**을 말하는지와
  구글 계정 백업·책임 경계·상호 참조를 함께 본다. 약관 쪽 30일만 14일로 바꿔 실패하는 것까지 확인했다.
- **남은 것 / 다음**: 이미 동의한 90분께 조항이 늘었다는 **보완 공지**를 낼지 정하기(안 하면 기록 불일치가
  그대로 남는다). 9월 21일 시행 후 재동의 동작 확인.

## 2026-09-17 — 이웃 아지트 코드 점검과 뒤처진 자리 정리 (Claude Opus 5)
- **요청**: 진행 중이던 이웃 아지트 코드 점검. 저녁에 더 작업해 공개할 예정.
- **현재 상태(운영 DB 재조회)**: 단계 `limited_beta`, 관리자 소유 `테스트`·`테스트2` 두 학급만.
  공간 3 · 참여 학급 6 · 공개 글 2 · 댓글 1 · 공감 0 · 간직 0 — 거의 안 써 본 상태.
  인수 점검 여섯 항목 모두 `false`(ROADMAP 의 남은 `[ ]` 세 개와 일치). **코드로 남은 일은 없었다.**
- **안전 확인(이상 없음)**: 이웃 표 19개 전부 RLS 켜짐. RPC 권한도 경계가 맞다 — 내부 헬퍼
  (`guard_*`·`publish_*`·`review_neighbor_shared_post_v1` 등)는 `supabase_admin`·`postgres` 뿐이고
  화면이 부르는 것만 `authenticated`. `toggle_neighbor_save_v1` 도 잠긴 채다.
- **⚠️ anon 에 열린 RPC 하나 — 이미 적어 둔 것, 아직 안 걷음**: `create_neighbor_activity_v1` 이
  `SECURITY DEFINER` 인데 anon EXECUTE 가 있다. **뚫리지는 않는다** — 오늘 공개 키로 직접 찔러
  `401 42501 '이웃 아지트 교사 인증이 필요합니다'` 를 재확인했다(함수 첫 줄이
  `assert_neighbor_participating_teacher_v1`). `ops/rpc-surface-allowlist.json` 에 이유와 함께
  올라와 있고 회수 조건이 **"이웃 아지트 작업이 끝나면"** 이다 — 즉 지금 공개 준비가 그 조건이다.
  원인: `20261266` 이 함수를 `DROP` 하고 새 서식으로 다시 만들며 `REVOKE` 를 안 했다(새 함수는
  기본이 PUBLIC EXECUTE). `20261267` 도 같다. **공개 전에 회수 마이그레이션 한 줄이 필요하다.**
- **고친 것**:
  1. `ROADMAP` 의 `[ ] 내 아지트에 이웃 글 보관함을 연결…` — **지운 기능이 만들 일로 남아 있었다.**
     간직하기는 2026-09-07 에 뺐다(`20261265`). 다음 사람이 다시 만들 자리라 결정 내용으로 바꿨다.
  2. `policy.js` 의 `getNeighborAgitTeacherSurface`·`canEnterNeighborAgitAsStudent` 삭제 —
     **화면 어디서도 부르지 않고 검사만 붙들고 있었다**(통과는 하는데 아무것도 안 보는 검사).
     관문은 서버 하나다: 학생은 bootstrap 의 `neighbor_agit_available`, 교사는 RPC 거절을
     `TeacherEntry` 가 "아직 사용할 수 없습니다" 로 받는다. 그 사실을 파일에 주석으로 남겼다.
  3. `AdminNeighborAgitPanel` 의 `간직하기 0개` 타일 제거(표가 잠겨 영원히 0).
  4. `preparationRoadmaps.js` 의 "…공감·**간직하기**만 사용합니다" 문구에서 간직하기 삭제.
     이 상수를 그리는 화면이 아직 없다는 사실도 주석으로 적었다.
- **검사**: `neighborAgitRolloutPolicy.test.mjs` 를 다시 썼다. 죽은 함수 검사 둘을 걷고, 대신
  **모듈 명세의 `maxInitialRows` 가 정책 상수와 어긋나면 갈리는** 검사를 넣었다(숫자가 두 곳에 있다).
  일부러 20→25 로 바꿔 실패하는 것까지 확인했다. `manifest.js` 는 `./policy` 를 확장자 없이
  import 해 Node 가 못 읽으므로 소스를 글로 읽어 본다(PITFALLS 의 그 함정).
- **변경**: `ROADMAP.md`, `src/modules/community/neighbor-agit/policy.js`,
  `src/components/admin/AdminNeighborAgitPanel.jsx`, `src/constants/preparationRoadmaps.js`,
  `tests/neighborAgitRolloutPolicy.test.mjs`. DB·인프라 변경 없음.
- **결과/검증**: `npm run test:all` 1211/1211(검사 둘 제거·하나 추가로 1212→1211), lint 오류 0.
- **남은 것 / 다음 (저녁 공개 작업)**:
  1. 인수 세 가지 — 교사·학생 실계정으로 세 활동 흐름, 관리자 화면, PC·태블릿·모바일 배치.
     관리자 `운영 → 기능 공개` 의 여섯 항목 체크가 DB에 남으므로 화면에서 눌러 기록한다.
  2. **`create_neighbor_activity_v1` 의 anon EXECUTE 회수 마이그레이션**(+ 허용 목록에서 줄 삭제).
  3. `public_beta` 전환은 관리자 화면 스위치로 하고, 문제가 있으면 다시 제한 공개로 되돌린다.

## 2026-09-17 — 푸시 전 검사에 lint 추가 (Claude Opus 5)
- **배경**: `PITFALLS` 의 "빌드는 통과했다 — lint 를 안 돌렸으면 그대로 배포될 뻔했다"(2026-09-03)가
  지금도 유효한지 확인해 보니 **그대로였다**. 배포 이미지는 `npm run test:all` 과 `npm run build` 만 돌고
  lint 는 어디에도 없었다. `react-hooks/rules-of-hooks` 는 **빌드를 통과하는** 오류라 사람 습관에만
  걸려 있던 유일한 자리였다.
- **넣기 전 잰 것**: `npm run lint` → **오류 0, 경고 30(모두 `security/*`), 17초, 종료코드 0**.
  지금 넣어도 막히는 것이 없다는 뜻이다. 경고로는 eslint 가 실패하지 않으므로 **오류만** 막는다.
  `react-hooks/rules-of-hooks` 는 `error`, `exhaustive-deps` 는 `warn` 으로 확인했다.
- **한 일**:
  - `scripts/git-hooks/pre-push` 에 **3단계 lint** 추가(검사 뒤, 마이그레이션 앞). 뒤 단계 번호를 4·5로 밀었다.
  - 머리말이 "두 가지를 본다" 라고 적힌 채 검사가 넷이던 것을 **다섯 가지**로 맞췄다(4·5는 설명도 없었다).
  - 머리말에 ⚠️ **훅은 `.git/` 안이라 git 으로 따라오지 않는다 — 기기를 옮기면 `hooks:install`** 을 명시.
    이날 윈도우 것이 8월 25일판이라 검사 4·5 가 빠진 채 밀고 있었던 일을 근거로 적었다.
  - `PITFALLS` 의 해당 줄을 현실에 맞게 고쳤다 — "푸시 검사에도 배포 빌드에도 없다" →
    "배포 빌드는 lint 를 돌리지 않는다. 2026-09-17 부터 푸시 전 검사가 막지만, 훅을 안 깐 기기에서는 그대로 나간다."
- **변경**: `scripts/git-hooks/pre-push`, `docs/wiki/PITFALLS.md`, `WORKLOG.md`. 두 기기에 훅 재설치.
- **결과/검증**: `src/BrokenHook.jsx` 에 **이른 return 뒤 `useMemo`** 를 일부러 넣어 lint 가
  `error react-hooks/rules-of-hooks` 로 **종료코드 1** 을 내는 것을 확인했다(지운 뒤 0). `bash -n` 문법 확인,
  `npm run test:all` 1212/1212 통과.
- **비용**: 푸시 전 대기가 대략 6초 → 23초. 배포 한 번 깨져 되돌리는 시간보다 싸다고 판단(사용자 결정).
- **남은 것 / 다음**: 눈으로 볼 일 셋(다했니 화면·책 쪽수 보완·과제 NEW 배지). 2026-09-21 처리방침 재동의.
  경고 30건은 손대지 않았다 — 막지 않으므로 급하지 않고, 손대려면 `security/*` 규칙 조정이 먼저다.

## 2026-09-17 — 되풀이하지 말 것: 갈래를 늘리고, 검사가 진짜 규칙을 보게 (Claude Opus 5)
- **배경**: `PITFALLS.md` 가 80줄 한도에 닿아 이날 겪은 함정 두 줄을 넣지 못했다. 한도를 올릴지 물었더니
  "갈래를 늘리고 한도도 그에 맞게" 로 결정. 80이라는 숫자는 2026-09-02(`9cc0d748`)에 **파일이 36줄일 때**
  잡은 어림값이었고 근거가 없었다.
- **진짜 문제는 한도가 아니었다**: 이 파일 자기 규칙은 "갈래마다 다섯 줄" 인데 `화면` 갈래가 혼자 **18개**로
  자라 DB·보안·운영 항목(`40001`, `safeupdate`, `SECURITY DEFINER`, `docker stats`, 앱 주소, 로그인 쿠키)의
  쓰레기통이 돼 있었다. 검사가 전체 줄 수만 보니 규칙을 어겨도 통과했다. 한도를 올리면 이 자람이 계속된다.
- **한 일**:
  - 갈래를 3개 → **7개**로 나누고 항목을 제자리로 옮겼다(내용은 그대로, 지운 줄 없음):
    `배포·운영`(5) · `DB·권한`(5) · `화면 그리기`(4) · `브라우저가 말없이 다르게 굴 때`(3) ·
    `고칠 때 함께 볼 것`(3) · `판단·확인`(4) · `바깥 것을 읽을 때`(4).
  - 이날의 함정 두 줄 추가: 시크릿은 `env_file` 이라 **restart 로 안 읽힌다**(배포·운영),
    **외부 API 는 이름만 믿지 말고 찔러 본다**(바깥 것을 읽을 때).
  - `tests/workflowGuardrails.test.mjs`: 전체 줄 수(80) 대신 **갈래마다 5줄**을 센다. 넘치면 갈래 이름과
    개수를 짚어 "그 갈래에서 낡은 줄을 빼거나 갈래를 새로 만들라"고 알린다.
  - 머리말에 "넣을 갈래가 없으면 갈래를 새로 만든다 — 아무 데나 붙이면 한 갈래가 쓰레기통이 된다" 추가.
- **확인하다 발견한 것(고치지 않음, 줄로만 남김)**: **lint 는 푸시 검사에도 배포 빌드에도 없다.**
  배포 이미지는 `test:all` 과 `build` 만 돈다. "커밋 전 `npx eslint` 를 꼭 본다" 줄이 지금도 그대로 유효해
  해당 줄에 그 사실을 명시했다. 관문에 넣을지는 별도 판단.
- **물리지 않은 것**: `SECURITY DEFINER`·`safeupdate` 두 줄은 이미 기계가 막아(각각 `check:rpc-surface`,
  `tests/sqlSafeUpdate.test.mjs`) 뺄 후보였으나, 갈래를 늘려 자리가 생겼으므로 그대로 두었다.
- **변경**: `docs/wiki/PITFALLS.md`(79→96줄, 갈래 7), `tests/workflowGuardrails.test.mjs`, `WORKLOG.md`.
- **결과/검증**: `npm run test:all` 1212/1212 통과. 새 검사를 일부러 넘겨(한 갈래 6개) 실패하는 것과
  넘친 갈래 이름이 메시지에 찍히는 것까지 확인했다.
- **남은 것 / 다음**: 눈으로 볼 일 셋(다했니 화면·책 쪽수 보완·과제 NEW 배지). 2026-09-21 처리방침 재동의.

## 2026-09-17 — 하네스 점검: 옛 푸시 훅·통과 개수·WORKLOG 부피·허용 목록 (Claude Opus 5)
- **요청**: 작업 내역과 하네스 설정을 점검하고 순서대로 정리.
- **⚠️ 가장 큰 것 — 윈도우(`jinnam`)의 `.git/hooks/pre-push` 가 8월 25일판에서 멈춰 있었다**.
  뒤에 추가된 **검사 3·4(미적용 마이그레이션 / 정리 안 된 RPC)가 통째로 빠져** 있었고,
  이날 민 네 번 모두 그 두 검사 없이 나갔다(결과적 피해는 없음 — 마이그레이션은 따로 350/350 대조했고
  RPC 는 건드리지 않았다). `npm run hooks:install` 로 복구. 맥미니 것은 원래 최신이었다.
  **훅은 `.git/` 안이라 git 으로 따라오지 않는다** — 저장소의 원본이 바뀌어도 각 기기가 다시 깔아야 하고
  알려 주는 장치가 없다. 기기를 옮기면 `npm run hooks:install` 을 한 번 돌리는 것을 습관으로.
- **한 일(순서대로)**:
  1. `scripts/git-hooks/pre-push` 의 통과 개수 표시 수정 — `^# pass`(TAP)만 보다가 지금 node 의
     `ℹ pass 1212` 를 못 읽어 "✔ 검사 **개** 통과" 로 찍혔다. 두 형식을 다 받고, 못 읽으면 개수 없이 알린다.
  2. `WORKLOG.md` 2179줄(한도 2500의 87%) → **1074줄**. 2026-09-10 이전 61개 항목을
     `docs/worklog/2026-09.md` 로 옮겼다(항목 총수 232개 그대로, 하나도 잃지 않음).
     보관소 이름을 `2026년 9월 앞부분` → `2026년 9월 10일까지` 로 바꿔 경계를 분명히 했다.
  3. `.claude/settings.json` 에 **읽기 전용 명령 허용 목록 19개** 추가(`git status/log/diff/show/branch/fetch`,
     `npm run test:*`·`lint`·`checklist`·`check:*`·`migrate:status`, `node --test`, `npx eslint`, `ls`·`wc`·`diff`).
     `push`·`reset`·`npm run migrate`(실제 적용) 같은 되돌리기 어려운 것은 **일부러 넣지 않았다**.
     기존 `SessionStart` 훅은 그대로 둔다.
- **못 한 것**: `docs/wiki/PITFALLS.md` 는 80줄 한도에 이미 닿아 있어(검사가 막는다) 이번 함정 두 줄을
  넣지 못했다. 자리를 비우려면 어느 줄을 물릴지 사람이 정해야 한다.
- **변경**: `scripts/git-hooks/pre-push`, `WORKLOG.md`, `docs/worklog/2026-09.md`, `.claude/settings.json`.
  git 밖: 윈도우 `.git/hooks/pre-push` 재설치.
- **결과/검증**: `npm run test:all` 1212/1212 통과(`workflowGuardrails` 포함), `.claude/settings.json` JSON 파싱 정상,
  새 훅이 `1212` 를 제대로 읽는 것 확인. 윈도우에는 도커가 없어 검사 3·4 는 "건너뜁니다" 로 넘어가는 것도 확인.
- **곁다리로 확인한 것**: 다했니 연동이 실제로 쓰이고 있다 — 교사 키 1개, 학생 매칭 13명, 학급 1개 켜짐,
  정산 2회. 매일 17시(KST) 자동이고 마지막 실행이 2026-09-16 — 점검 시각이 오전이라 **정상**이다.
  `cron.job` 3개(`dahandin-auto-sync`, `dahandin-prune-logs`, `open-scheduled-missions`) 모두 활성.
- **남은 것 / 다음**: 눈으로 볼 일 세 가지(다했니 화면 최종 확인·책 쪽수 보완 확인·과제 NEW 배지 확인).
  2026-09-21 처리방침 새 판 시행 — 재동의 동작 확인.

## 2026-09-17 — 책 쪽수 조회에 국립중앙도서관 서지정보 보완 연결 (Claude Opus 5)
- **요청**: "국회도서관 API 키로 책 쪽수·서지 보강과 책 검색을 구글과 함께 보완."
- **먼저 밝혀진 것**: 받은 키는 **국회도서관이 아니라 국립중앙도서관(NL)** 키였다.
  국회도서관 OpenAPI(`apis.data.go.kr/9720000/...`)에는 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 로 거절당했고,
  국립중앙도서관 서지정보 `https://www.nl.go.kr/seoji/SearchApi.do` 에서는 `cert_key` 로 정상 응답했다.
- **실측(2026-09-17)**:
  - seoji ISBN 조회는 `TITLE`·`AUTHOR`·`PUBLISHER`·`EA_ISBN`·`FORM`·`PAGE` 를 준다. **쪽수(`PAGE`)가 목적한 값**이다.
  - `PAGE` 표기가 제각각이다: `"170 p."`, `"100"`, `"343 p. : 삽화 ; 23 cm"`, 전자책은 대체로 빈 값.
  - ⚠️ 같은 키로 소장자료 검색 API(`/NL/search/openApi/search.do`)도 열리지만 **한글 검색어가 전달되지 않는다**.
    ASCII(`python`)·ISBN 검색은 정상, 한글은 UTF-8·EUC-KR 인코딩 모두 결과 0 또는 엉뚱한 자료. 제목 검색에 쓰지 말 것.
- **한 일**:
  - `supabase/functions/book-search/isbn.js` 신설 — ISBN 정규화를 한 자리로 모으고 `googleBooks.js` 는 별칭만 남겼다.
  - `supabase/functions/book-search/nlSeoji.js` 신설 — `parseSeojiPageCount`(표기 정리)·`findSeojiRecord`(요청 ISBN 정확 일치,
    전자책·종이책이 갈리면 쪽수 있는 종이책 선택)·`fetchSeojiBookInfo`/`fetchSeojiPageCount`.
  - `index.ts`: `lookupGooglePageCount` → `lookupPageCount` 로 바꾸고 **구글 → 국립중앙도서관** 순으로 묻는다.
    찾은 곳을 `page_count_source`(`google`|`nl`)에 기록하고, 저장 조건의 `.or(...)` 에 `nl` 을 더했다.
    `page_count_source` CHECK 제약에 `'nl'` 이 이미 있어(`20260930_reading_marathon.sql`) **마이그레이션은 필요 없다**.
    교사 보정값(`teacher`)은 이전과 같이 자동 조회가 덮어쓰지 않는다.
  - 검색 자체는 카카오 그대로 둔다(위 한글 검색 제약 때문). 쪽수 조회 시점도 그대로 — 학생이 책을 고른 뒤 1건만 조회한다.
  - 테스트 `tests/nlSeojiPageCount.test.mjs` 8건. 일부러 파서를 되돌려 실패하는 것까지 확인했다.
- **변경**: 위 신규 2파일 + `supabase/functions/book-search/googleBooks.js`·`index.ts`·`tests/nlSeojiPageCount.test.mjs`·
  `ROADMAP.md`(결정 기록)·`WORKLOG.md`. DB 변경 없음.
- **결과/검증**: `node --test tests/nlSeojiPageCount.test.mjs tests/googleBooksPageCount.test.mjs` 12/12 통과, ESLint 0.
  실제 키로 seoji ISBN 조회 응답 확인(예: `9791192049380` → `PAGE="170 p."`).
- **git 밖 인프라 변경(맥미니, 2026-09-17 실행 완료)**:
  1. `~/agit-supabase/secrets.agit.env` 에 `NL_SEOJI_API_KEY` 추가(값 미기재, 권한 600).
     백업 `secrets.agit.env.bak-20260917-111830` 남김.
  2. `book-search` 함수 4개 파일(`index.ts`·`googleBooks.js`·`isbn.js`·`nlSeoji.js`)을
     `~/agit-supabase/volumes/functions/book-search/` 에 배포. 저장소와 `diff -r` 동일 확인.
  3. 시크릿은 `docker-compose.agit.yml` 의 `functions.env_file` 로 들어간다 — **restart 로는 안 읽힌다**.
     `docker compose -p agit -f docker-compose.yml -f docker-compose.pg17.yml -f docker-compose.agit.yml
     up -d --force-recreate --no-deps functions` 로 재생성했다(`--dry-run` 으로 대상이 함수 컨테이너
     하나뿐인 것 먼저 확인). 컨테이너 healthy, `NL_SEOJI_API_KEY` 전달 확인.
  4. 스모크: 무인증 POST `/functions/v1/book-search` → 401 `학생 인증이 필요합니다.`
     (모듈 적재 오류 없음 = `nlSeoji.js` import 정상).
- **남은 것 / 다음**:
  - 브라우저에서 학생 계정으로 구글에 쪽수가 없던 국내 도서를 골라 쪽수가 채워지는지, 출처가 `nl` 로 남는지 확인.
  - ⚠️ 이 키는 대화창에 평문으로 노출된 적이 있다(사용자가 그대로 쓰기로 결정). 문제가 보이면 재발급 후 위 2~3 단계를 다시 밟는다.
  - 국립중앙도서관 소장자료 검색의 한글 검색어 문제는 미해결 — 풀리면 제목 검색도 카카오와 함께 쓸 수 있다.

## 2026-09-17 — 다했니 연동 후속(공지·권한·로그 정리·처리방침) 커밋·푸시 및 적용 상태 대조 (Claude Opus 5)
- **한 일**: 세 기기(윈도우 `jinnam`·맥미니·GitHub)의 커밋을 한 줄로 맞추고, 운영 DB 의 마이그레이션 적용 상태를 저장소와 전수 대조했다.
  - 윈도우 로컬을 `origin/main` 으로 fast-forward(7개 수신: `da2cf7f9`~`a867240c`).
  - 맥미니에만 있던 `431ffec0`(처리방침 제3·4조 정확도 보정)을 SSH 로 직접 받아 GitHub 로 푸시. 맥미니에서는 자격 증명이 없어 푸시가 안 되므로 **`ssh://macmini/~/vibe_agit` 를 원격처럼 fetch 해서 푸시하는 경로**를 썼다.
- **후속으로 들어온 마이그레이션**(2026-09-16 항목 작성 이후 추가된 것):
  - `20261302_announcement_dahandin_integration.sql` — 다했니 연동 기능 공지사항 등록.
  - `20261303_dahandin_can_manage_class_revoke_anon.sql` — RLS 헬퍼 `dahandin_can_manage_class` 의 anon EXECUTE 회수(`check:rpc-surface` 대응).
  - `20261304_dahandin_prune_and_dashboard_window.sql` — 정산 로그(runs/items) 기본 180일 보관 후 매일 자동 삭제 + 대시보드 7/30/90일 기간 토글.
- **변경**: 커밋 `4b5b3420`..`431ffec0`(푸시 완료). 이 항목과 `ROADMAP.md` 현재 위치 갱신.
- **결과/검증**: 운영 DB `agit-db` 의 `public.applied_migrations` 와 `supabase/migrations/` 전수 대조 — **350 / 350 일치**, 미적용·유령 기록 없음. `20261300`~`20261304` 모두 적용 상태. 푸시 전 훅 검사 통과. 세 기기 모두 `main` 이 `origin/main` 과 동일.
- **남은 것 / 다음**: 브라우저에서 실제 교사 계정으로 ①키 연결 ②붙여넣기 매칭 ③수동·자동 정산을 눈으로 확인(2026-09-16 항목에서 이어짐). 2026-09-21 처리방침 시행 판 재동의 동작 확인.
- **메모**: 적용 여부는 추측하지 말고 `npm run migrate:status`(맥미니) 로 묻는다. 다른 기기에서는 도커가 없어 실패하므로 `ssh macmini` 로 조회한다.

## 2026-09-17 — 모두의 아지트(옛 이웃 아지트) 이름 변경·UI 대개편·알림 (Claude Opus)
- **요청 흐름**: ① "이웃 아지트" 이름이 "남의 반으로 감" 느낌 → **모두의 아지트**로 변경. ② 교사 화면이 복잡·비직관 →
  진입 역할선택·준비 마법사·운영 탭 2개로 재구성, 탭 이동 최소화 + 새 글/처리할 것 **배지**. ③ 검토는 두 활동 공통이라 **통합 검토함**.
  ④ AI에 막힌 이웃 댓글이 학급 "학생 댓글"에서 안 보임 → 검토함에서 처리하게.
- **한 일(커밋됨)**:
  - `bcc5f36c` 표시명 "이웃 아지트"→"모두의 아지트" 일괄(내부 id `neighbor-agit`·RPC·CSS·서버 RAISE 문구·문서는 유지).
  - `f15624f3` `create_neighbor_activity_v1` anon 실행 권한 회수(+허용목록 정리).
- **한 일(오늘 미커밋 → 이번 커밋 예정)**:
  - **서버**: `20261306` 교사 방문표 `neighbor_space_teacher_visits` + `mark_neighbor_teacher_seen_v1` + 워크스페이스에 `notifications`(pending_reviews·approvals·joins·new_posts·new_comments). `20261307` 메뉴 배지 RPC `get_neighbor_teacher_badge_v1`. `20261308` 차단 댓글: `review_neighbor_blocked_comment_v1`(담임이 blocked→visible/deleted) + 워크스페이스에 `blocked_comments` 목록/카운트. `20261309` 메뉴 배지에 blocked 포함. (네 개 모두 운영 DB 적용 완료.)
  - **교사 화면(`TeacherEntry.jsx`/`.css`)**: 진입 **역할 선택(호스트/게스트)→모달**, 참여 2학급 전 **준비 마법사**(①공간✓ ②초대 ③참여확인), 운영 = **얇은 요약 바**(학생공개 토글·🗂️검토·⚙️공간관리) + **최상위 탭 2개**(글 나눔/함께 쓰는 주제) + **통합 검토함 모달**(공개 요청 + AI 막은 우리 반 댓글 되살리기/삭제) + **공간 관리 모달**. 탭·상단·메뉴 **배지**. 옛 3단계 탭(activeTab)·steps 제거.
  - **클라 API(`teacherApi.js`)**: `markSeen`, `reviewBlockedComment`, `notifications`/`blocked_comments` 기본값.
  - **메뉴 배지(`TeacherDashboard.jsx`)**: 모두의 아지트 메뉴에 처리할 일 수 배지(`get_neighbor_teacher_badge_v1`).
  - **테스트 갱신**: `neighborAgitActivities`·`neighborSafety`를 새 구조(마법사/요약바/탭)로, teacherApi rpc 개수 7로.
- **검증**: 전체 `node --test tests/*.test.mjs` **1211개 통과**, ESLint 0, `migrate:check`·`check:rpc-surface` 통과. 로컬 배포 완료.
- **⚠️ 미해결(내일 최우선) — 이웃 댓글 AI 검사 큐 트리거 누락**:
  - 증상: 글 나눔 댓글이 "AI에 막혀 보인다"지만 실제론 **pending 에서 멈춤**(운영 DB: 이웃 댓글 pending 2·blocked 0). 그래서 blocked만 보이는 검토함에 안 뜸.
  - 원인: 댓글 검사 큐(`comment_ai_review_slots`, 두 표 공용)를 도는 `vibe-ai`의 `drainCommentSafetyQueue`는 **학급 댓글 검사 요청(post_comments 전용 액션) 뒤 곁다리로만** 실행(vibe-ai 349행). **이웃 댓글 저장은 이 트리거를 안 부르고, 댓글 검사 전용 cron도 없음** → pending 방치.
  - 제약: `neighborSafety` 규칙 — **AI 작업기(vibe-ai)는 `neighbor_comments` 표 이름을 알면 안 됨**(큐 RPC가 두 표를 봄). 그러니 작업기 말고 **트리거만** 추가.
  - 계획: ①이웃 댓글 저장 시 vibe-ai에 **표 이름 없는 일반 드레인 poke** 호출(학급과 대칭) ②보강용 **pg_cron 주기 드레인** ③(선택) 검토함에 "검사 대기 N"·학생 화면 pending/blocked 표시. 갇힌 2건은 트리거 넣으면 다음 드레인에 풀림.
- **남은 선택**: `함께 쓰는 주제`에 **전체 `MissionForm` 드롭인**(옵션 B, `mode` prop) — 현재는 기존 컴포넌트 재사용 컴포저 유지(계약 테스트 통과). 학생 화면 pending/blocked 표시.

## 2026-09-16 — 다했니 쿠키 → "다했니 포인트" 연동 (Claude Opus)
- **요청**: 다했니(dahandin) 학생별 쿠키를 아지트 학생 포인트와 연동. 교사마다 자기 API 키를 설정 메뉴에서 입력→학생 매칭→사용. 붙여넣기 자동 인식, 자동 정산 주기(매일/매주), "다했니 포인트" 라벨, 다했어요 대시보드(통계·그래프)까지.
- **API 실측(2026-09-16)**: 인증 헤더 `X-API-Key`. `GET /openapi/v1/get/class/list`(키만), `GET /openapi/v1/get/student/total?code=`(학생 1명, `cookie` 누적·`usedCookie`·`totalCookie`·`badges`; 실제 응답에 `chocoChips` 없음). 코드 오류 시에도 "API KEY 가 올바르지 않습니다" 를 주는 함정 확인. 제한 평균 5req/초·300req/분. **키는 발급 계정의 데이터만** 조회 → 교사별 키 필수.
- **한 일**:
  - 마이그레이션 `20261300_dahandin_cookie_sync.sql`: `dahandin_teacher_credentials`(AES-GCM 암호문·IV, 끝자리만 노출·컬럼 권한으로 암호문 SELECT 차단), `dahandin_class_settings`(환율·켜짐·자동주기), `dahandin_student_links`(매칭·`last_cookie` 기준선), `dahandin_sync_runs`/`dahandin_sync_items`(대시보드용 로그). RLS 는 담임/ADMIN. RPC `award_dahandin_cookie_points_v1`(service_role 전용, `point_engine_apply` 를 event_key 로 호출 → 중복지급 차단, reason "다했니 포인트", metadata.source), `dahandin_due_classes_v1`(KST 기준 자동 정산 대상), `get_dahandin_dashboard_v1`(요약·일자별·학생별·최근 실행). **코어 point_engine_apply 미변경**.
  - 엣지 함수 `dahandin-credential`(키 저장/검증/삭제, 저장 전 class/list 로 유효성 확인, AES-256-GCM), `dahandin-cookie-sync`(수동=교사 JWT / 자동=`x-cron-secret`; 학생 순차 호출 220ms·429·slow down 재시도, delta 지급 후에만 last_cookie 갱신, run/items 기록). `config.toml` 에 cookie-sync `verify_jwt=false`.
  - 프런트: `lib/dahandinRoster.js`(붙여넣기 파서·delta 순수 로직), `lib/dahandinApi.js`(호출 한 자리), `components/teacher/DahandinIntegrationManager.jsx`(① 키 연결 ② 붙여넣기 자동 매칭 ③ 정산 설정·실행 + 다했어요 대시보드=요약카드·일자별 SVG 막대·학생별 순위·최근 정산·CSV). `TeacherSettingsHub` 에 "🍪 다했니 연동" 항목, `teacherGuides.js` 안내 추가.
  - 테스트 `tests/dahandinCookieSync.test.mjs`(파서·delta 9건).
  - **자동 정산 시계**(추가): 마이그레이션 `20261301_dahandin_auto_sync_cron.sql` — pg_cron 이 10분마다 `dahandin_trigger_auto_sync()` 를 깨우고, 정산할 학급(매일/매주·시각 지남·오늘 미실행)마다 pg_net(`net.http_post`)으로 `http://kong:8000/functions/v1/dahandin-cookie-sync` 를 `x-cron-secret` 로 학급 단위 호출. 비밀·주소는 git 밖 `dahandin_runtime_config`(RLS 잠금, SECURITY DEFINER 만 읽음)에 배포 후 수동 입력. cookie-sync cron 모드가 `classId` 하나만 처리하도록 보완.
  - 안내 연결: `teacherGuides.js`·`teacherGuideRegistry.js`·`teacherGuideJourneys.js`(포인트·동기부여 흐름에 `settings:dahandin` 추가) + `tests/teacherGuideCenter.test.mjs` 개수 27→28.
- **변경**: 위 신규 파일 + `TeacherSettingsHub.jsx`·`constants/teacherGuides.js`·`guides/teacherGuideRegistry.js`·`guides/teacherGuideJourneys.js`·`supabase/config.toml`·`tests/teacherGuideCenter.test.mjs`·마이그레이션 2개(`20261300`,`20261301`)·`DAHANDIN_COOKIE_SYNC_PLAN.md`. (이후 `b764cdec` 로 커밋됨 — 아래 2026-09-17 항목 참조.)
- **결과/검증**: 전체 `node --test tests/*.test.mjs` **1204/1204 통과**, ESLint 0, `migrate:check`·`check:rpc-surface` 통과. 유효 키로 실제 학급("여수진남초 4학년", 794쿠키)·학생(김단우 28쿠키) 응답 확인.
- **git 밖 인프라 변경(맥미니, 2026-09-16 실행 완료)**:
  1. `~/agit-supabase/secrets.agit.env` 에 `DAHANDIN_ENC_KEY`(hex32)·`DAHANDIN_CRON_SECRET`(hex24) 추가(값 미기재, 권한 600). 백업 `.bak-*` 남김. ⚠️ `DAHANDIN_ENC_KEY` 는 절대 바꾸지 말 것(바꾸면 저장된 교사 키 복호화 불가).
  2. 운영 DB에 마이그레이션 `20261300`·`20261301` 적용.
  3. 엣지 함수 `dahandin-credential`·`dahandin-cookie-sync` 를 `~/agit-supabase/volumes/functions/` 에 배포·컨테이너 재기동. 스모크: 무인증 401 / 틀린 cron 시크릿 401 / 올바른 cron 시크릿 200(ran:0).
  4. `dahandin_runtime_config` 에 `function_base_url=http://kong:8000` + `cron_secret`(값 숨김) 입력. `cron.job` 에 `dahandin-auto-sync`(*/10) 등록 확인.
  5. `npm run deploy:local` 로 앱 컨테이너 재빌드·교체(앱 200). → 교사 설정에 `🍪 다했니 연동` 노출.
- **남은 것 / 다음**: 브라우저에서 실제 교사 계정으로 ①키 연결 ②붙여넣기 매칭 ③수동 동기화·자동(매일) 동작을 눈으로 확인. 필요 시 git 커밋/푸시(사용자 지시 시).

## 2026-09-16 — 교사 과제 미확인 제출건 NEW 알림 및 강조 UI 구현 (Gemini)
- **요청**: 교사가 과제를 확인하고 나서 학생이 나중에 제출하는 경우 NEW를 표시해서 확인해야 할 과제제출건이 있음을 보여주도록 개선.
- **한 일**:
  - `MissionList.jsx`의 과제 카드(`MissionItem`)에서 학생이 제출했으나 미승인된 글이 있을 때(`pendingCount > 0`), 카드 상단 장르 태그 옆에 선명한 빨간 알약 배지(`NEW ${pendingCount}`)를 표시하고, 카드 테두리에 부드러운 붉은 톤 하이라이트(`1.5px solid #FCA5A5`)와 그림자 적용.
  - 과제 카드의 하단 '학생 글 확인' 버튼을 붉은색 계열(`bg: #FEF2F2, border: #FECACA, text: #DC2626`)로 강조하고 텍스트에 `📝 학생 글 확인 · 미확인 ${pendingCount}` 표시.
  - 과제 목록 상단 필터바에 미확인 글이 있는 과제가 1개 이상 존재할 때 `🔔 확인 필요 (N)` 탭을 생성하여 클릭 한 번으로 미확인 과제만 모아볼 수 있도록 지원.
  - `MissionManager.jsx`, `TeacherMissionTab.jsx`, `TeacherWritingHub.jsx`, `TeacherDashboard.jsx` 간 `onPendingCountChange`를 연결하여 `submissionBoard.pending_total`을 상위 대시보드로 동기화.
  - `TeacherDashboard.jsx` 2차 사이드바 메뉴의 `선생님 과제` 탭에 총 미확인 편수를 나타내는 빨간 카운트 배지(`.teacher-subtab__badge-new`)를 표시하고, 다른 1차 탭에 있을 때는 `✍️ 글쓰기` 탭에 알림 도트(`.teacher-dashboard__nav-dot`) 표시.
  - `TeacherDashboard.css`에 디자인 시스템 글자 크기 토큰(`var(--ui-text-xs)`)을 준수한 뱃지 및 도트 스타일 추가.
  - `tests/missionPendingNotification.test.mjs` 신규 단위 테스트 추가.
- **변경**: `MissionList.jsx`, `MissionManager.jsx`, `TeacherMissionTab.jsx`, `TeacherWritingHub.jsx`, `TeacherDashboard.jsx`, `TeacherDashboard.css`, `tests/missionPendingNotification.test.mjs`, `ROADMAP.md`, `WORKLOG.md`. DB 변경 없음.
- **결과/검증**: `node --test tests/missionPendingNotification.test.mjs` 등 관련 26개 테스트 100% 통과, ESLint 오류 0건, 디자인 시스템 토큰 규격 준수.
- **남은 것 / 다음**: 운영 배포 후 과제 카드 및 상단 메뉴 탭의 알림 동작 확인.

## 2026-09-16 — 2026-09-16 업데이트 공지사항 등록 마이그레이션 (Gemini)
- **요청**: 오늘 작업한 내역(독서록·일기 NEW 뱃지, 운영현황 첫 화면, 학급 스크린 버그 수정 및 전환 단축키)을 앱 내 공지사항에 등록.
- **한 일**:
  - `supabase/migrations/20261299_announcement_20260916_update.sql`: `public.announcements` 테이블에 업데이트 공지사항을 등록하는 마이그레이션 생성.
  - 교사용 대상(`target_role: 'TEACHER'`), 팝업 알림 포함(`is_popup: true`)으로 등록되어 로그인 시 팝업 및 상단 공지 띠(`AnnouncementSpotlight`)에 노출.
  - `tests/migrationVersionCleanup.test.mjs`, `tests/announcementWindow.test.mjs` 검증 통과.
- **변경**: `supabase/migrations/20261299_announcement_20260916_update.sql`, `WORKLOG.md`, `ROADMAP.md`. DB 마이그레이션 1건 추가.
- **결과/검증**: 전체 테스트 1,191개 통과, 린트 오류 0개.
- **남은 것 / 다음**: 배포 완료 후 교사 로그인 시 공지 팝업과 상단 공지 띠 노출을 확인한다.

## 2026-09-16 — 교사 대시보드 미확인 글 NEW 표시·기본 탭 변경 및 학급 스크린 새 탭 오류 수정·전환 단축키 추가 (Gemini)
- **요청**:
  1. 교사 대시보드에서 학생 독서록과 학생 일기에 새로운 글이 올라오면 좌측 메뉴와 상단 글쓰기 탭에 NEW 표기.
  2. 교사 대시보드 최초 진입 기본 탭을 '학급 운영 > 운영 현황'(`operations`)으로 변경.
  3. 학급 스크린에서 새 스크린 생성 후 '스크린 열기' 시 빈 화면(`about:blank`)만 뜨는 오류 해결.
  4. 발표 화면 상단에서 저장된 스크린 목록을 확인하고 좌우 방향키(`ArrowLeft`, `ArrowRight`)로 전환할 수 있도록 기능 추가.
- **한 일**:
  - `useTeacherUnreviewedWriting.js`: 미확인 독서록·일기 편수를 조회하고, 검토 처리 커스텀 이벤트(`teacher-writing-reviewed`)를 수신해 실시간 카운트를 동기화하는 공용 훅 신설.
  - `TeacherDashboard.jsx` & `TeacherDashboard.css`:
    - 최초 기본 탭 fallback을 `dashboard`(선생님 과제)에서 `operations`(운영 현황)으로 변경.
    - 미확인 글이 있을 때 상단 글쓰기 탭에 `teacher-dashboard__nav-new`, 좌측 `reading-logs`와 `diaries` 서브탭에 `teacher-subtab__new-badge` 표기. 디자인 시스템 타이포 스케일 준수를 위해 상대 폰트 단위(`em`) 적용.
  - `TeacherReadingLogManager.jsx` & `TeacherDiaryManager.jsx`: 교사가 글 검토(피드백/추천/확인 등) 완료 시 `notifyTeacherWritingReviewed()`를 호출하여 대시보드 배지가 즉시 갱신되도록 연동.
  - `TeacherEntry.jsx`: 새 스크린 생성 후 `openScreen` 클릭 시 `window.open('', '_blank', 'noopener')`의 `noopener`로 인해 WindowProxy가 `null`이 되어 `target.location.replace`가 실패하고 빈 페이지로 멈추던 버그 수정. `about:blank`로 창 참조를 안전하게 획득하고, 저장 완료 후 `replace` 이동 및 `opener = null` 정리.
  - `ClassBoardPresentationPage.jsx` & `classBoard.css`:
    - 학급 활성 스크린 목록(`getWorkspace`)을 로드하여 상단 바에 스크린 스위처 네비게이터(`(1/3) 우리 반 기본`, 이전/다음 버튼, 좌우키 안내) 구현.
    - `ArrowLeft` / `ArrowRight` 키보드 단축키 이벤트 리스너를 등록해 텍스트 입력 중이 아닐 때 스크린을 좌우로 즉시 전환. `history.pushState`로 브라우저 주소창 동기화.
  - `tests/teacherUnreviewedWritingBadge.test.mjs` & `tests/classBoardPresentationSwitcher.test.mjs`: 새 기능 및 계약 검증 테스트 추가.
- **변경**: `TeacherDashboard.jsx`, `TeacherDashboard.css`, `TeacherReadingLogManager.jsx`, `TeacherDiaryManager.jsx`, `TeacherEntry.jsx`, `ClassBoardPresentationPage.jsx`, `classBoard.css`, `useTeacherUnreviewedWriting.js`, `tests/teacherUnreviewedWritingBadge.test.mjs`, `tests/classBoardPresentationSwitcher.test.mjs`, `ROADMAP.md`, `WORKLOG.md`. DB 변경 없음.
- **결과/검증**: 전체 테스트 1,191개 통과, 린트 오류 0개, Vite 프로덕션 빌드 성공.
- **남은 것 / 다음**: 운영 배포 후 교사 대시보드 최초 진입 탭 및 학생 글 작성 시 NEW 뱃지 노출, 학급 스크린 새 스크린 열기 및 좌우 방향키 전환을 확인한다.

## 2026-09-15 — 문집 4단계 학생별 목차 및 학생 간지 생성 (Gemini)
- **요청**: 작품 묶기/쪽 배치 라디오 버튼 좌측 정렬 및 묶기 기준별 목차 설명 보강, 학생별로 묶는 경우 가장 앞 목차는 학생 이름별로 시작 쪽수만 표시하고 해당 학생 글 시작 페이지에 간지(속표지)를 두어 해당 학생의 글 목록과 쪽수를 싣도록 개선.
- **한 일**:
  - `management.css`에서 `input:not([type='checkbox'])` 규칙이 라디오 버튼까지 잡아 늘리던 문제를 `:not([type='radio'])`로 제외하고, `classAgit.css`의 `.book-order__choices` 라디오 버튼이 왼쪽 상단에 반듯하게 정렬되도록 전용 정렬 규칙 반영.
  - `BookOrderEditor.jsx`에서 묶기 기준별(직접 정한 순서, 학생별로 묶기, 주제별로 묶기) 및 쪽 배치별 목차 구성 방식과 특징을 명확한 안내 팁(`book-order__toc-note`)으로 추가.
  - `print.js`에서 학급 문집의 학생별 묶음(`grouping === 'author'`) 시 가장 앞 차례(TOC)에는 학생 이름(`김민준`, `박서연` 등)과 해당 학생의 시작 쪽수만 굵은 글씨로 표시하도록 개선.
  - 각 학생의 첫 글 시작 위치에 학생별 간지(`anthology-divider`)를 삽입하고, 간지 내에 학생 이름 큰 제목과 해당 학생의 수록 작품 목록 및 쪽수(`data-divider-list`)가 실리도록 구성.
  - `pagination.js`에서 간지 렌더링이 '그대로 이어붙이기'뿐만 아니라 기본값인 '작품마다 새 쪽' 배치에서도 올바르게 동작하도록 간지 흐름을 통합.
  - `StudentBooks.jsx` 학생 웹 뷰어 차례에서도 학생별 묶음일 때 학생 이름 구분 헤더가 나타나고 하위에 글 목록이 묶이도록 개선.
  - `tests/anthologyPageLayout.test.mjs`에 학생별 묶음의 차례 및 간지·목록 생성 검증 테스트 추가.
- **변경**: `BookOrderEditor.jsx`, `StudentBooks.jsx`, `print.js`, `pagination.js`, `classAgit.css`, `management.css`, `tests/anthologyPageLayout.test.mjs`, `ROADMAP.md`, `WORKLOG.md`. DB 변경 없음.
- **결과/검증**: 전체 테스트 1,185개 통과, 린트 오류 0개, Vite 빌드 성공.
- **남은 것 / 다음**: 운영 배포 뒤 실제 문집 4단계에서 학생별 묶음 선택 시 목차 및 인쇄/PDF 미리보기의 학생별 차례와 간지 생성을 확인한다.

## 2026-09-15 — 문집 1단계 종류 선택과 학생 글 자동 수록 (Gemini)
- **요청**: 문집 만들기 순서 3단계에서 학급문집/개인문집을 선택하던 것을 1단계로 옮겨 문집 종류와 학생 선택에 따라 표지가 바로 바뀌고 글이 자동 선택되도록 개선.
- **한 일**:
  - `1 표지·여는 글` 첫머리로 문집 종류(`우리 반 문집` / `개인 문집`) 선택 카드를 이동하고, 개인 문집 선택 시 학생 드롭다운을 제공.
  - 개인 문집에서 학생을 선택하면 표지 지은이("OOO 지음"), 기본 제목("OOO의 글 모음"), 부제, 작가의 말 레이블이 표지 미리보기에 즉시 반영되며, 백그라운드에서 해당 학생의 승인된 과제 글(`collectStudentSources`)을 자동 조회하여 초안에 바로 담도록 개선. 학생 변경 시 새 학생의 글로 교체.
  - `3 작품 담기`는 중복 선택기를 제거하고 문집 종류 요약 배너 및 자동 담긴 작품 목록 확인/추가/제외로 역할을 정돈.
  - 1단계에서 개인 문집 선택 후 학생 미지정 상태로 다른 단계 이동이나 초안 저장을 시도할 때 1단계로 돌아가 안내하도록 단계 검증 동기화.
  - 교사 도움말과 개인 문집 회귀 검사를 1단계 종류 선택 및 자동 수집 흐름에 맞춰 갱신.
- **변경**: `AnthologyManager.jsx`, `classAgit.css`, `teacherGuides.js`, `tests/personalAnthology.test.mjs`, `ROADMAP.md`, `WORKLOG.md`. DB 변경 없음.
- **결과/검증**: 문집 및 개인 문집 관련 테스트 50개 통과, ESLint 통과, Vite 프로덕션 빌드 통과.
- **남은 것 / 다음**: 운영 배포 뒤 1단계에서 개인 문집 및 학생 선택 시 표지 지은이 표시와 3단계 자동 수록 작품을 확인한다.

## 2026-09-15 — 개인 문집 자동 담기와 제목만 있는 목차 (Codex)
- **요청**: 개인 문집 생성 때 고른 학생의 글을 자동 선택하고, 비어 나오던 개인 문집 목차를 작품 제목별로 만들되 표지에 이미 있는 지은이는 목차에서 생략.
- **한 일**:
  - 개인 문집 생성 후 기존 `학생째 담기`의 페이지 조회·전문 재검증 흐름을 재사용해 해당 학생의 수록 가능한 글을 최대 300편까지 자동으로 담고 바로 초안을 저장한다. 담을 글이 없거나 일부를 건너뛰면 결과를 화면에 알린다.
  - 이어붙이기에서 주제 목차만 만들던 조건 때문에 직접 순서 개인 문집의 목차가 비던 문제를 고쳤다. 개인 문집은 묶기·쪽 배치와 관계없이 모든 작품 제목을 차례에 싣는다.
  - 개인 문집의 지은이는 표지에만 한 번 표시하고 PDF·Google Docs·학생 온라인 차례와 작품 본문에서는 반복하지 않도록 한 규칙으로 맞췄다. 우리 반 문집의 작품별 지은이 표시는 유지한다.
  - 교사 도움말과 개인 문집 회귀 검사를 함께 갱신했다.
- **변경**: `AnthologyManager`, PDF·Google Docs·학생 차례 출력, 도움말과 검사. DB 변경 없음.
- **결과/검증**: 개인 문집·일괄 담기·Google Docs·학생 차례 관련 검사 20개, ESLint, Vite 빌드 통과.
- **남은 것 / 다음**: 운영 배포 뒤 글이 많은 학생 한 명으로 개인 문집을 생성해 자동 담긴 편수와 PDF 목차 제목을 확인한다.

## 2026-09-15 — 작품 담기에서 문집 종류와 학생을 실제로 선택 (Codex)
- **요청**: 작품 담기 화면에는 우리 반 문집/개인 문집 안내만 있고 실제로 선택할 수 없는 문제 수정.
- **한 일**:
  - `3 작품 담기` 첫머리를 실제 선택 카드로 바꿔 우리 반 문집과 개인 문집을 고르게 했다. 개인 문집은 학생 한 명을 반드시 선택해야 학생 글을 담거나 다른 단계로 이동할 수 있다.
  - 이미 개인 문집이 있는 학생은 중복 선택하지 못하게 하고, 선택한 학생이 아닌 글이 담겨 있으면 자동으로 지우지 않고 해당 편수를 알려 먼저 빼도록 했다.
  - 확정판이 없는 초안만 종류·학생을 바꿀 수 있게 `20261298` 서버 저장 경계를 추가했다. 담당 학급의 활성 학생, 개인 문집 중복, 담긴 글의 학생 일치를 서버가 다시 검증하며 확정판이 생기면 변경을 잠근다.
  - 개발 전용 문집 fixture와 교사 도움말, 회귀 검사를 같은 흐름으로 갱신했다.
- **변경**: 앱·도움말·검사와 마이그레이션 `20261298`.
- **결과/검증**: 문집 검사 133개, 보안 정적 검사 343개와 전체 운영 보안 검사, ESLint(오류 0, 기존 경고 28), Vite 빌드 통과. `20261298`은 실제 운영 스키마에서 전체 롤백 검증 후 운영 DB에 적용(344/344)했다.
- **남은 것 / 다음**: 운영 배포 뒤 실제 교사 계정에서 학급→개인 전환, 학생 선택, 다른 학생 글이 담긴 상태의 차단 문구를 확인한다.

## 2026-09-15 — 문집 표지 윗문구 편집과 개인 문집 지은이 표시 정리 (Codex)
- **요청**: 첫 장의 고정 `우리 반의 이야기`를 수정할 수 있게 하고, 작품 담기에서 우리 반 문집/개인 문집을 분명히 확인한 뒤 개인 문집은 지은이를 작품마다 반복하지 않게 정리.
- **한 일**:
  - `1 표지·여는 글`에 `표지 윗문구` 입력을 추가했다. 우리 반 문집은 `우리 반의 이야기`, 개인 문집은 `나의 글 모음`으로 시작하며 자유롭게 바꾸거나 비워서 숨길 수 있다.
  - `cover_kicker`를 서버 정본으로 저장하고 확정판·PDF·Google Docs까지 전달한다. 기존 문집과 옛 확정판은 이전 기본 문구를 유지하고, 배포 전에 열린 옛 화면의 저장도 기존 문구를 지우지 않는다.
  - `3 작품 담기` 상단에 이미 확정한 문집 종류와 지은이 표시 규칙을 크게 보여 준다. 종류는 생성 시 확정하며 이후 바꿀 수 없다.
  - 우리 반 문집은 목차와 본문에 글쓴이를 표시한다. 개인 문집은 목차에 `제목 · 지은이`를 표시하고 작품 본문에서는 같은 이름을 생략한다. 인쇄·Google Docs·학생 온라인 차례를 같은 규칙으로 맞췄다.
- **변경**: 앱·도움말·검사와 마이그레이션 `20261297`.
- **결과/검증**: 글꽃 책방 132개와 표지/출력 전용 검사, migration version·보안 구조 검사, eslint(오류 0), Vite 빌드 통과. `20261297`은 실제 운영 스키마에서 전체 롤백 검증 통과.
- **남은 것 / 다음**: 배포 뒤 기존 문집의 윗문구 유지, 빈 윗문구 표지, 개인 문집의 목차 지은이·본문 생략을 실제 계정에서 확인한다.

## 2026-09-15 — 문집 목차 설정 분리와 진짜 이어붙이기 (Codex)
- **요청**: 학생 글 17편을 이어붙였는데 주제별 간지가 끼고 작품마다 새 쪽으로 넘어가는 문제를 점검하고, 목차 정하기의 작품 묶기·쪽 배치가 검색 입력처럼 보이는 UI도 함께 개선.
- **한 일**:
  - `4 목차 정하기`의 `작품 묶기`와 `쪽 배치`를 번호가 붙은 독립 선택 카드로 나누고, 작품 찾기는 아래의 별도 도구로 분리했다. 모바일에서는 두 설정을 세로로 쌓는다.
  - `그대로 이어붙이기`는 주제와 무관하게 앞 글 다음에 이어지게 했다. 주제 간지는 `주제별로 묶기 + 그대로 이어붙이기` 조합에서만 넣는다.
  - 출력기가 간지 존재 여부로 이어붙이기를 추측하던 결함을 없애고, 저장된 `page_layout`을 출력 소스에 명시해 간지가 0개여도 연속 배치되게 했다.
  - 교사 도움말과 회귀 검사를 새 UI·출력 계약에 맞췄다.
- **변경**: 앱·검사 8개 파일. DB 변경 없음.
- **결과/검증**: 관련 회귀 검사 27개, 글꽃 책방 전체 검사, eslint(오류 0), Vite 빌드 통과. 브라우저 자동화 표면을 사용할 수 없어 실화면 캡처는 배포 후 실제 화면에서 확인한다.
- **남은 것 / 다음**: 실제 17편 문집에서 `직접 정한 순서 + 그대로 이어붙이기`의 간지 없음과 쪽 절약 결과를 확인한다.

## 2026-09-15 — 학생 개인 문집과 표지 디자인 4종 확장 (Codex)
- **요청**: 학생별 문집은 학급 문집과 다른 표지가 필요하고, 작품마다 같은 지은이를 반복하지 않게 해 달라는 요청. 이어서 문집 디자인을 더 다양하게 확장.
- **한 일**:
  - 새 문집을 `우리 반 문집 / 학생 개인 문집`으로 나누고 개인 문집은 학생을 먼저 고른다. `book_type`·`owner_student_id`를 서버 정본으로 두며 기존 문집은 모두 학급 문집으로 유지한다.
  - 개인 문집은 학생당 한 권, 지정 학생 글만 수록 가능하다. 표지는 `나의 글 모음`·`학생 이름 지음`, 여는 글은 `작가의 말`로 바뀌며 목차·본문·온라인 읽기·Google Docs에서 같은 지은이를 반복하지 않는다.
  - 개인 확정판은 공개해도 지정 학생에게만 보이게 학생 읽기 RPC에서 실제 로그인 학생 ID를 다시 검사한다. 학급 문집 20권과 별도로 학생별 개인 문집을 둘 수 있다.
  - 기존 4종에 `동화책 / 푸른 바다 / 모던 블록 / 한지 문집`을 추가해 화면·PDF 표지를 총 8종으로 확장하고 교사 도움말을 함께 갱신했다.
  - `20261296_personal_anthologies_and_book_designs.sql`에 스키마·저장/조회 RPC·디자인 허용값과 기존 `get_class_agit_students_v1`의 남은 anon 실행 권한 회수를 함께 기록했다.
  - 운영 보안 스모크가 마이그레이션 이후 정상 가입한 교사도 `backfill`이어야 한다고 잘못 가정하던 검사를 고쳐, 모든 교사의 첫 동의 이력 존재와 실제 소급 기록의 시각을 함께 확인하게 했다.
- **변경**: 앱·검사와 마이그레이션 `20261296`; 운영 DB 적용 후 이 커밋을 `origin/main`에 푸시해 자동 배포.
- **결과/검증**: 문집 전용 129개, 전체 검사·eslint·Vite 빌드·운영 DB 포함 전체 보안 검사 통과. 새 SQL은 실제 운영 스키마에서 롤백 검증 후 적용했다. 실제 CSS 값으로 새 표지 4종 비교 이미지를 렌더링해 확인했다.
- **남은 것 / 다음**: 배포 뒤 실제 교사 계정에서 개인 문집 생성·학생 본인 서가 노출·다른 학생 비노출을 한 번 확인한다.

## 2026-09-15 — 문집 `4 목차 정하기` 단계 신설 — 끌어 놓기·번호로 옮기기·한 줄 목록 (Claude)
- **요청**: "차례를 수정하는 화면이 불편하다. 우측 사이드바를 내리면 전체 화면이 내려가고… 목차를 더 직관적으로 보고 쉽게 편집할 수 있게."
  이어서 "작품 담기 다음 스텝으로 목차 정하기, 그다음 확정·보관함 — 다섯 단계."
- **원인(재서 봄)**: 차례가 3단계(작품 담기) 아래에 붙어 있었고 한 줄이 **136px·단추 여섯**, 100편이 **680px 안쪽 상자**에서
  따로 스크롤됐다(상자 끝에서 휠이 넘치면 화면 전체가 내려간다). ↑↓ 는 한 칸씩이라 90번을 5번으로 올리려면 85번.
- **한 일**:
  - 단계를 다섯으로: `1 표지 / 2 판형 / 3 작품 담기 / 4 목차 정하기 / 5 확정·보관함`. 3단계는 담기만 남기고
    "담은 글 N편 · 몇 명 · 주제 몇 가지" 요약과 `목차 정하기 →` 단추를 둔다. 묶기·쪽 배치는 4단계로 옮겼다.
  - `BookOrderEditor.jsx`(4단계): 한 편이 한 줄(번호·제목·지은이·주제, 62px), **안쪽 스크롤 상자 없음**(화면 스크롤 그대로).
    직접 정한 순서에서는 `≡` 손잡이를 끌어 놓는다(framer-motion Reorder, 손잡이만 잡힘·터치 됨).
    `⋯` 메뉴에 `번호로 옮기기`·`맨 위로`·`맨 아래로`·읽기·원글 재확인·초안에서 빼기·수록 철회. ↑↓ 는 그대로 한 칸.
    학생별·주제별로 묶으면 묶음 제목이 줄 사이에 서고(끌기는 끔), 찾기에 제목·이름·주제를 적으면 그 줄만 보인다.
  - 규칙은 `orderModel.js`(moveBookItem·parseOrderNumber·findBookItems·bookItemGroupLabel)로 떼어 `node --test` 가 직접 본다.
  - 도움말(글꽃 책방)을 다섯 단계로 고치고 4단계 설명을 더했다. 쪽 다듬기 창의 "STEP 04" 표기는 05 로.
- **결과/검증**: 새 검사 4개(옮기기 경계·번호 해석·묶음/찾기·안쪽 상자 없음/끌기 조건) + 다섯 단계 검사 갱신. 옮기기가 원본을
  건드리게 하기·목록에 max-height 넣기 둘 다 잡힘. 플레이라이트로 100편 문집에서 ↓ 한 칸, 손잡이 끌어 3→1, ⋯ 메뉴로 100번→2번,
  학생별 묶음 제목 12개, 찾기 10편, 태블릿 폭 가로 넘침 없음 확인. 전체 1175개·eslint·빌드 통과. DB 변경 없음.
- **남은 것 / 다음**: 배포 뒤 실제 문집에서 태블릿 손가락 끌기 감각 확인.

## 2026-09-15 — 글꽃 책방 `학생째 담기` — 한 아이의 글을 한 번에 (Claude)
- **요청**: "주제별·글별로는 되는데 학생별로 문집을 만드는 기능이 있으면 좋겠어. 기존 기능에 필터링만 추가하면 되는걸까?"
  → 그렇다(A안). 차례를 학생별로 묶는 것은 이미 있었고, 없던 것은 **학생을 기준으로 글을 고르는 길**이었다.
  이름 검색은 한 편씩 체크해야 했고 같은 성의 두 아이가 섞여 나왔다. "반 전원 개인 문집 일괄"(B안)은 학급당 20권 한도라 따로다.
- **한 일**:
  - `20261295_anthology_student_bulk_add.sql`: 작품 검색 `get_class_agit_candidates_v2` 에 `student_id` 조건 추가(자격·정렬·커서는 그대로),
    학생 명단과 각자 담을 수 있는 글 수를 한 번에 주는 `get_class_agit_students_v1` 신설(자격은 검색과 같음).
  - 담는 방법에 `학생째 담기` 추가(`StudentBulkPicker`): 학생 한 줄과 `N편 모두 담기` 단추뿐, 작품을 펼치지 않는다. 이미 담은 편수도 보여 준다.
  - 모으는 고리(`bulkAdd.js`)는 미션·학생이 같은 것을 쓴다 — 30편씩 목록, 50편씩 전문 확인, 자리 검사, 커서 고리 한도.
  - 미리보기 fixture 에도 학생 조건·명단을 넣어 `?dev-lab=class-agit-release` 에서 눌러 볼 수 있다. 도움말(글꽃 책방)에 세 방법을 적었다.
  - 곁다리: 공용 책장 틀의 border 단축/개별 속성 혼용 경고 제거.
- **결과/검증**: 운영 DB 에서 마이그레이션+스모크를 **롤백 트랜잭션**으로 돌려 실제 학생(23편)의 명단 글 수와 학생 조건 검색이
  일치하고 다른 학생 글이 섞이지 않음을 확인(`tests/sql/20261295_...smoke.sql`). 단위 검사: 학생 조건만 보내고 미션·제외 조건은 안 섞임,
  자리 0 이면 막힘, 세 방법 존재, 명단 함수의 자격이 검색과 같음. 미리보기에서 12명 명단 → 10편 담기 → "다 담았습니다"·차례 10편.
  전체 1171개·eslint·빌드 통과.
- **남은 것 / 다음**: 배포는 **마이그레이션 먼저**(`npm run migrate`) 그다음 푸시. 개인 문집을 몇 번 만들어 본 뒤 전원 일괄(B안)이 필요한지 판단.

## 2026-09-15 — 책장 한 칸은 그 폭에 들어가는 만큼, 오른쪽 빈자리 없이 (Claude)
- **요청**: "교사 대시보드의 학생 아지트는 책장이 넓어서 12권이면 우측이 남아. 학생 책장과 교사 책장은 그 메뉴의 가로 길이에 맞춰서, 빈칸 없도록."
- **한 일**: 12권 상한을 버렸다. 한 칸에는 **그 책장 폭에 들어가는 만큼** 꽂는다(폰 4~5권, PC 11권, 선생님 화면 14권 남짓).
  꽉 찬 칸(마지막이 아닌 칸, 또는 가장 얇은 책도 더 못 들어가는 마지막 칸)은 남는 몇 px 를 책 사이에 고르게 나눠
  오른쪽이 비지 않는다. 덜 찬 마지막 칸만 왼쪽부터 붙인다. 폭을 아직 못 쟀을 때만 12권씩 끊는다(`SHELF_PAGE_FALLBACK_BOOKS`).
  미리보기 폭을 1,200px 로 넓혀 선생님 화면 폭도 볼 수 있게 했다.
- **결과/검증**: 검사 갱신 — 1,100px 에서 첫 칸이 12권보다 많고, 390/760/1,100 어느 폭에서도 칸이 넘치지 않으며,
  `shelfPageIsFull` 이 꽉 찬 칸·덜 찬 칸을 가른다. 플레이라이트로 390/760/1,240px 에서 모든 꽉 찬 칸의 오른쪽 여백이
  안쪽 여백(12px)과 같음(빈자리 0), 잘린 책 0. 전체 1170개·eslint·빌드 통과. DB 변경 없음.

## 2026-09-15 — 책장을 12권씩 칸으로 나누고, 다음 칸으로 미끄러져 넘어가게 (Claude)
- **요청**: "책장에는 몇 권까지 보이고 다음 책장으로 넘기게 되어 있을까?" → 넘기기가 없었다(옆으로 길게 스크롤, 60권까지 한 줄).
  "12권 넘으면 밀어서 다음 책을 보는 애니메이션이 들어가면 어때? 슬라이딩으로."
- **한 일**: 공용 `Bookshelf` 가 책을 **칸**으로 나눈다. 한 칸 최대 12권, 화면이 좁아 12권이 안 들어가면 **들어가는 만큼만**
  (폰 4~6권) — 책을 줄이거나 자르지 않는다. 칸은 옆으로 미끄러져 넘어가고(framer-motion 스프링), `‹ 앞 책장`·`다음 책장 ›`
  단추와 `2 / 7 책장` 표시가 판자 아래에 있다. 손가락으로 48px 이상 밀어도 넘어가며, 민 손가락이 책 위에서 떨어져도 책이 열리지 않는다.
  보이지 않는 칸의 책은 `inert` 라 Tab 으로도 못 간다. 탭을 바꾸면 첫 칸으로.
  - 칸 나누기는 순수 함수 `shelfPages(items, innerWidth)` — 줄 폭은 `ResizeObserver` 로 잰다.
  - 세 화면은 책을 `items`/`renderItem` 으로 넘긴다(children 으로 직접 꽂으면 넘기기가 없다). 옛 "옆으로 넘기기 →"·"좌우로 밀어" 안내는 지웠다.
- **결과/검증**: 검사 추가 — 12권 상한, 폰 폭에서 어떤 칸도 줄을 넘치지 않음, 책 하나가 폭보다 커도 한 권은 꽂음, 순서 보존,
  세 화면이 `renderItem` 을 씀. 13권으로 바꾸기·폭 무시하기 둘 다 잡히는 것 확인. 플레이라이트로 PC(760)는 11·11·8권 3칸,
  폰(390)은 4~5권 7칸, 어느 칸에서도 잘린 책 0, 단추·밀기 모두 넘어감, 넘어갈 때 위치가 −185→−579→…→−692px 로 흐름(순간 이동 아님).
  전체 1170개·eslint·빌드 통과. DB 변경 없음.
- **남은 것 / 다음**: 배포 뒤 태블릿에서 손가락으로 밀어 보기.

## 2026-09-15 — 책장·책등을 공용 부품으로 — 세 화면이 한 곳을 같이 쓴다 (Claude)
- **요청**: "선생님이 학생 아지트를 보는 화면도 똑같이 적용 안 됐을까?" → 안 됐었다. "이 부분도 모듈화해서 하나 고치면 같이 고쳐지게 하자."
- **원인**: 책등을 그리는 곳이 **셋**이었다 — 학생의 내 서재(`MyAgitPanel`), 선생님의 학생 아지트 보기
  (`TeacherStudentAgitViewer` + 자기 CSS), 친구 아지트의 공개 서재(`FriendWritingShelf`, 자기 ShelfBook·색표).
  아침에 고친 것은 첫째뿐이라 선생님 화면은 옛 색 막대, 친구 서재는 옛 세로쓰기(vertical-rl)로 남아 있었다.
- **한 일**: `src/components/common/bookshelf/` 로 모았다.
  - `ShelfBook.jsx`(책 한 권)·`shelfBookLayout.js`(크기·제목 규칙)를 student/ 에서 옮기고, `Bookshelf.jsx`(나무 틀·책 줄·판자·안내)를 새로 뺐다.
  - 세 화면 모두 이 둘만 쓴다. 선생님 화면의 책 CSS 85줄과 갈래 복사본, 친구 서재의 ShelfBook·색표·아이콘표를 지웠다.
  - 화면마다 달랐던 것은 **부품의 선택지**로 남겼다: 라벨 아래 쪽지 한 줄(`note` — 선생님은 글자 수, 친구 서재는 `♡ 반응 수`),
    여는 중 덮개(`opening`), 안건 의견 글(보라, 🏛️)은 `shelfSectionFor` 가 먼저 알아본다.
  - 쪽지 자리를 모든 책에 비워 두느라 키가 180~198 로 12px 커졌다(라벨 규칙 8/16/17 은 그대로). 책 줄 높이는 `SHELF_ROW_MIN_HEIGHT` 하나.
  - 미리보기 `?dev-lab=my-shelf` 에 선생님 보기·친구 서재·빈 책장 칸을 더했다.
- **결과/검증**: `tests/shelfBookLayout.test.mjs` 에 "세 화면 모두 공용 책장·책등만 쓴다" 검사 추가 — 화면이 세로쓰기·색표·책 CSS 를
  다시 가지면 막힌다(선생님 화면에 `writingMode` 한 줄, 친구 화면에서 Bookshelf 빼기 둘 다 잡히는 것 확인). 전체 1169개·eslint·빌드 통과.
  플레이라이트로 67권 크기 잼: 폭 {46,54,62}·키 {180,186,192,198} 밖 없음. DB 변경 없음.
- **남은 것 / 다음**: 배포 뒤 선생님 계정 `학생 아지트 보기` 와 학생 계정 친구 아지트 `공개 서재` 에서 한 번씩 확인.

## 2026-09-15 — 학생 아지트 서재의 책등을 진짜 책처럼, 제목은 세 줄 규칙으로 (Claude)
- **요청**: "서재의 책 모양이 맘에 안 들고 제목도 부실하다." 이어서 "제목이 길어도 책이 길어지거나
  줄어들지 않게", "너무 길면 앞뒤를 남기고 줄여라(B안)", "몇 자부터 그렇게 되는지 규칙은?"
- **원인**: 책등이 색 막대 하나였고, 제목은 옛 세로쓰기(`vertical-rl`, 오른쪽부터)라 두 줄이 되면
  아이들이 뒷줄부터 읽어 "계절과 그 이유 / 내가 좋아하는" 처럼 뒤엉켰다. 글자도 바닥(0.8rem) 아래였다.
- **한 일**: 책등을 `ShelfBook.jsx` 로 떼고, 크기·제목 규칙은 `shelfBookLayout.js` 에 두어 `node --test` 가 직접 부른다.
  - 모양: 머리띠·꼬리띠, 둥근 등 그라데이션, 갈래 배지, 크림색 종이 라벨. 잠금은 배지 모서리에 얹어 라벨 자리를 안 뺏는다.
  - 크기는 **제목과 무관한 고정 집합** — 폭 3종(46/54/62) × 키 4종(168~186), 라벨 높이는 모든 책에서 같다(113).
  - 제목 규칙은 세 줄뿐: **8자까지 한 줄 / 9~16자 두 줄 / 17자부터 앞 9자 ⋯ 뒤 6자**(띄어쓰기는 빼고 센다).
    앞뒤를 남기는 까닭은 아이들 제목이 끝에 뜻을 싣기 때문 — `⋯의방』을읽고`, `⋯를받지말자!`, `⋯이생긴다면?`
  - 화면을 찍어 보고 둘 더 고침: 글꼴이 세로쓰기에서 `⋯` 를 세로 점으로 바꿔 그려 줄임표만 `"vert" 0` 으로 고정,
    둘째 줄이 짧을 때 가운데 떠 있던 것(`…의일 / 기`)을 위에서 시작하도록.
  - 미리보기 `?dev-lab=my-shelf`(개발 서버 전용): 보통 제목 8권 + 극단 5권(200자·영어·이모지·빈 제목·빈칸만).
- **결과/검증**: `tests/shelfBookLayout.test.mjs` 6개 — 세 줄 규칙, 운영 제목 4건의 앞뒤 줄임, 고정 집합, 라벨 높이 상수,
  세로쓰기 방향·줄임표 글꼴 설정을 원문에서 확인. 규칙을 일부러 5가지로 깨 보아 모두 잡히는 것 확인.
  플레이라이트로 52권 크기를 재어 폭 {46,54,62}·키 {168,174,180,186} 밖이 없음. 전체 1168개·eslint·빌드 통과. DB 변경 없음.
- **남은 것 / 다음**: 배포 뒤 실제 서재에서 확인. 규칙 숫자를 바꾸면 테스트가 막으니 도움말·안내도 함께 바꿀 것.

## 2026-09-14 — 학생이 만든 질문도 교사가 골라 과제 핵심 질문으로 (Claude)
- **요청**: "투표 활동도 할 수 있지만, 그냥 학생들이 준 질문을 교사가 가공해서 제공하는 것도 필요하다."
- **알고 보니 절반은 이미 있었다**: `연구소 질문 불러오기` 는 원래 있었고, 가져온 질문은 과제의
  `guide_questions` 로 들어가 **교사가 자유롭게 고칠 수 있었다.** 빠진 것은 하나 — 출처가
  `get_teacher_question_voting_rooms_v1`, 즉 **투표방만** 봤다. 그래서 `질문 만들기`(question_generator)만
  하고 투표를 안 한 방(131건)의 질문은 쓸 수 없었다. 새 기능이 아니라 **출처를 넓히는 일**이었다.
- **어려운 점**: 두 활동은 질문이 있는 자리가 다르다. 투표방은 후보가 `rooms.activity_config->'sourceQuestions'`
  에 한 벌 있고 표는 학생 제출에 있다. 질문 만들기는 **학생마다 자기 질문을 `portable_results.chunks`** 에 남긴다.
  그래서 조회를 활동별로 가르지 않고 **같은 모양의 질문 꾸러미**로 맞췄다
  (`get_teacher_question_rooms_v1`, `get_teacher_room_question_pool_v1`). 옛 함수 둘은 이 모달에서만 쓰여 지웠다.
- **화면**: 모달 위에 탭 두 개(`🗳️ 좋은 질문 고르기` / `✍️ 학생이 만든 질문`). 방이 쌓이면 섞어 두는 쪽이
  더 불편해서 나눴다. 질문 만들기 방은 표가 없으므로 **같은 문장을 쓴 학생 수**를 대신 세고(표와 같은 구실),
  **누가 썼는지**도 함께 보여 준다. 둘 이상이 쓴 질문은 미리 체크해 두어 교사가 덜어 내며 다듬게 했다.
- **같은 문장 판정은 글자 그대로다**(앞뒤 공백만 뗀다). 느슨하게 묶으면 어떤지 운영 데이터로 재 보니
  **353묶음 중 1건**만 더 합쳐졌다. 얻는 것이 없는데 뜻이 다른 문장이 잘못 합쳐질 위험과 "대표 문장을
  기계가 고르는" 문제가 생긴다. `N명` 은 정렬·미리 체크에만 쓰는 참고 숫자이고 질문이 사라지지 않으므로,
  덜 묶여도 교사가 목록을 훑으면 된다. AI 로 뜻을 묶는 방법은 **일부러 쓰지 않았다.**
- **안 한 것**: 질문 366건 중 번호가 붙은 것은 4건뿐이라(`1. 내가 절망에…`) 자동으로 떼지 않았다.
  교사가 어차피 다듬는 자리이고, 건드리면 멀쩡한 문장을 망칠 위험이 더 크다.
- **변경**: `20261294_teacher_question_pool_from_lab.sql`, `labReferenceApi.js`,
  `MissionLabQuestionsModal.jsx`·`.css`, `teacherGuides.js`, 새 검사 `tests/labQuestionPool.test.mjs`.
- **결과/검증**: 운영 스키마에서 되돌리는 시험, 실제 방 데이터로 꾸러미가 나오는 것(`3명` 이 맨 위)까지 확인했다.
  전체 검사 1131건, 린트, 빌드 통과.
- **되풀이한 함정 둘**:
  · 새 검사가 **한쪽만 봤다.** 같은 구절이 두 함수에 있어, 방 목록에서 질문 만들기를 빼도 통과했다.
    그러면 "목록엔 떠도 눌렀을 때 막히는" 상태를 못 잡는다. 두 곳을 **세도록** 고쳤다.
  · 도움말에 줄을 **더했더니** 교사 투어에서 `한줄모아` 설명이 밀려났다. 투어가 상위 몇 줄만 뽑아 쓰는
    구조라서다. 줄 수를 늘리지 말고 기존 줄에 합쳤다. **도움말은 더하기 전에 뽑아 쓰는 곳이 있는지 본다.**
- **남은 것 / 다음**: 적용 뒤 실제 교사 화면에서 두 탭과 `N명`·지은이 표시를 확인한다.

## 2026-09-14 — 선생님 과제 예약 공개 (Claude)
- **무엇**: 교사가 정한 시각이 되면 과제가 저절로 학생에게 열린다. 공개 예약만 다루고 마감 예약은 넣지 않았다.
- **설계**: 학생에게 과제가 보이는지는 `is_archived` 하나로 정해지는데, 그 검사가 **22개 함수 34곳**에
  흩어져 있다. `open_at <= NOW()` 같은 새 조건을 만들면 34곳을 모두 고쳐야 하고, 한 곳만 놓쳐도
  **아직 열지 않은 과제가 학생에게 새어 나간다.** 그래서 예약을 **이미 있는 숨김 스위치로 표현**했다.
  · 예약됨 = `is_archived=TRUE, archived_at=NULL, open_at=<시각>`
  · 보관됨 = `is_archived=TRUE, archived_at=<시각>, open_at=NULL`
  · 진행 중 = `is_archived=FALSE, open_at=NULL`
  **학생 쪽 조회·쓰기 차단은 한 줄도 고치지 않았다** — 이미 숨겨지고 이미 막힌다.
- **안전장치**: DB 제약 `open_at IS NULL OR (is_archived IS TRUE AND archived_at IS NULL)` 가
  "예약됐는데 학생에게 보이는" 상태를 **아예 만들 수 없게** 한다. 화면이 실수해도 DB 가 막는다.
  학생이 표를 직접 읽어도 예약 과제는 안 보이도록 RLS SELECT 정책도 좁혔다(보관 과제는 지금처럼 읽힌다).
- **시계**: pg_cron 1분마다. 확인해 보니 `pg_cron` 이 **이미 shared_preload_libraries 에 올라가 있어**
  컨테이너 재시작이 필요 없었다(처음엔 재시작이 필요하다고 넘겨짚었다가 실제 설정을 보고 바로잡았다).
  여는 함수가 `<= NOW()` 로 훑으므로 한두 번 걸러도 다음 차례에 저절로 따라잡는다.
  매분 도는 덕분에 `cron.timezone=GMT` 인 것도 상관없다. 시계가 안 돌면 `20261293` 만 launchd 로 바꾸면 된다.
- **화면**: 과제 만들기 폼에 `🕒 정한 시각에 저절로 열기`, 과제 카드에 `🕒 … 공개 예정` 띠와 `지금 열기`.
  시간대 계산·검증·상태 판정은 `missionSchedule.js` 한 곳에 모았다.
- **변경**: `20261292_scheduled_mission_open_at.sql`(칸·제약·인덱스·여는 함수·RLS·교사 목록),
  `20261293_scheduled_mission_cron.sql`(시계, 일부러 분리), `missionSchedule.js`, `useMissionManager.js`,
  `MissionForm.jsx`, `MissionList.jsx`, `MissionManager.jsx`, `teacherGuides.js`, 검사 2종.
- **결과/검증**: 운영 스키마에서 되돌리는 시험 + 스모크로 DB 계약 네 가지를 일부러 망가뜨려 모두 잡히는 것을
  확인했다(제약 무력화, RLS 필터 제거, `<=` → `=`, 교사 목록에서 예약분 제외).
  전체 검사 1128건, 린트, 빌드 통과.
- **되풀이한 함정 둘**:
  · 시간대 검사가 **한국 시간대 컴퓨터에서는 아무것도 잡지 못했다.** 기기 시간대로 해석해도 한국에서는
    답이 같기 때문이다. 뉴욕·런던·오클랜드에서 **실제로 다시 돌려** 보도록 고치고서야 버그를 잡았다.
  · 보관해 둔 과제를 **고치기만 해도 다시 열릴** 뻔했다. 저장할 때마다 공개 상태 세 칸이 딸려 가는
    구조라, `resolveMissionSchedulePatch` 로 실제로 달라진 경우에만 건드리게 했다.
- **적용하며 겪은 것**: 두 마이그레이션이 `git stash` 를 거치며 작업본이 CRLF 가 됐고, 그 CRLF 본을
  맥미니에 보내 적용해 **원장에 CRLF 체크섬이 기록**됐다. 저장본은 LF 라 다음 pull 때 어긋날 자리였다
  (20261229 와 같은 사고). 저장본 바이트로 다시 보내고 원장 두 줄을 보정해 337/337 로 맞췄다.
  되풀이를 막으려고 `.gitattributes` 에 `*.sql text eol=lf` 를 걸고 PITFALLS 에 한 줄 남겼다.
- **시계 확인**: 적용 직후 `cron.job_run_details` 에서 03:31:00 UTC(한국 12:31) 정각 실행 `succeeded` 를 확인했다.
  pg_cron 이 이 컨테이너에서 실제로 돈다.
- **남은 것 / 다음**: `20261292`·`20261293` 을 앱보다 먼저 적용하고, **pg_cron 이 실제로 도는지**를
  적용 직후 1분간 확인한다(설정은 맞지만 실물 확인은 해 봐야 안다). 마감 예약은 같은 장치로 나중에 넣을 수 있다.

## 2026-09-14 — 회수 뒤 승인한 글이 글꽃 책방·전시관에 안 나오던 문제 (Claude)
- **제보**: "한 주제에 승인된 글이 12편인데 11편만 불러와진다. 빠진 1편은 **강제로 회수해서 승인한 글**이다."
- **원인**: `회수` 는 교사가 미제출 글을 대신 걷어오는 기능이고, 그때 `student_posts.recalled_at` 에 자국이
  남는다. 승인(`approve_assignment_post`)은 `is_submitted·is_confirmed·is_returned` 만 바꾸고 이 자국은
  지우지 않는다 — 지울 이유도 없다, 어떻게 제출됐는지에 대한 **기록**이다.
  그런데 글꽃 쪽 자격 판정이 그 자국까지 함께 보고 있어서(`recalled_at IS NULL`), **승인해도 계속 빠졌다.**
- **한 일**: 자격을 **최종 승인**만으로 정한다(제출·승인·반려 아님·학급 공개 범위).
  어떻게 제출됐는지는 싣는 자격과 무관하다 — 승인이 곧 교사의 판단이기 때문이다.
  승인하지 않은 회수 글은 `is_confirmed IS TRUE` 때문에 여전히 빠진다.
- **여섯 곳을 한꺼번에 고쳤다**: 같은 자격 규칙이 여섯 함수 여덟 곳에 흩어져 있었다.
  `get_class_agit_candidates_v2`(후보 목록), `get_class_agit_missions_v1`(주제별 편수),
  `class_agit_source_data_v1`(발행용 원본), `class_agit_revoke_changed_posts_v1`(자동 철회),
  `revoke_class_agit_source_v1`·`revoke_class_agit_releases_v1`(변경 트리거).
  **한 곳만 고쳤다면** 목록에는 떠도 발행이 거부되거나(원본 함수가 NULL), 실은 뒤 자동 철회됐을 것이다.
- **건드리지 않은 것**: `class_agit_source_data_v1` 의 **변경 감지 지문**에는 `recalled_at` 이 그대로 남는다.
  자격 판정이 아니라 "실은 뒤에 원글이 바뀌었는지" 를 알아보는 값이라, 지우면 변경 감지가 무뎌진다.
  이웃 아지트(`neighbor_source_*`)와 학생 홈 쪽 `recalled_at` 사용은 이번 범위가 아니라 그대로 두었다.
- **변경**: `supabase/migrations/20261291_class_agit_includes_recalled_approved.sql`(운영 DB 현재 정의를
  그대로 가져와 자격 조건만 덜어냄), 같은 이름 스모크, `src/constants/teacherGuides.js`,
  새 검사 `tests/classAgitApprovedSources.test.mjs`.
- **도움말**: 글꽃 전시관·글꽃 책방 **두 곳 모두**에 "불러올 수 있는 글은 `최종 승인한 글`" 기준과
  "강제 회수 뒤 승인한 글도 함께 나온다", "승인하지 않은 글은 회수했더라도 나오지 않는다" 를 적었다.
  두 곳이 같은 말을 쓰는지 검사가 지킨다.
- **결과/검증**: 운영 스키마에서 `BEGIN … ROLLBACK` 으로 여섯 함수 재생성과 스모크 4단계를 확인했다.
  스모크 [4]가 **운영에 실제로 있는 회수 뒤 승인 글**을 찾아냈고, 고치기 전에는
  `class_agit_source_data_v1` 이 NULL 을 돌려주어 실을 수 없다는 것을, 고친 뒤에는 원본이 만들어진다는 것을
  같은 데이터로 확인했다. 앱 검사도 다섯 가지로 일부러 망가뜨려 모두 잡히는 것을 봤다
  (함수 하나 빠뜨리기, 회수 조건 되살리기, 변경 감지 지문 지우기, 승인 관문 풀기, 도움말 한 곳만 적기).
  전체 검사 1120건, 린트 통과.
- **되풀이한 함정**: 새 검사가 처음에 **정상 상태에서도 실패**했다. 마이그레이션 설명 주석에 고치기 전
  조건(`recalled_at IS NULL`)을 인용해 두었는데 검사가 그 글자까지 본 탓이다. 주석을 걷어내고 코드만
  보도록 고쳤다. SQL 을 글자로 검사할 때는 **주석을 먼저 걷어낸다.**
- **남은 것 / 다음**: `20261291` 을 앱보다 먼저 적용한 뒤 배포한다. 적용 후 실제 그 주제에서 12편이
  모두 나오는지 선생님 화면으로 확인한다.

## 2026-09-14 — 카카오톡으로 보낸 전시 공개 주소가 열리지 않던 문제 (Claude)
- **제보**: "어제 만든 전시실 공개 주소를 모바일로 보내 열면 종료 시간도 안 됐는데 종료된 주소로 나온다."
  이어서 확인한 두 가지가 원인을 갈랐다 — **PC 에서는 열리고**, **문자로 보내면 열린다**. 카카오톡만 안 됐다.
- **원인**: 전시가 끝난 게 아니라 **열쇠를 잃은 것**이었다. 공개 주소는 `/exhibition#<64자리 열쇠>` 처럼
  열쇠가 `#` 뒤에 있는데, `public/kakao-browser.js` 가 카카오톡 안드로이드에서 크롬으로 넘길 때 쓰는
  `intent://` 주소는 **`#` 뒷부분을 담지 못한다**(그 자리를 `#Intent;…` 문법이 이미 쓴다).
  그래서 크롬이 열쇠 없이 `/exhibition` 만 열었고, 화면은 `공유가 끝났거나 지금 볼 수 없는 전시입니다`
  를 띄웠다. 선생님에게는 "종료된 주소" 로 읽혔다.
  이 우회는 원래 **구글 로그인**(카카오 내장 브라우저에서 막힘) 때문에 넣은 것인데,
  전시관은 로그인을 아예 쓰지 않는다. 로그인용 우회가 로그인을 안 쓰는 페이지를 망가뜨리고 있었다.
- **한 일**: 넘기지 말아야 할 두 가지를 거른다.
  1. 공개 전시(`/exhibition`)는 로그인을 쓰지 않으므로 넘기지 않는다.
  2. **주소에 `#` 내용이 있으면 어떤 주소든 넘기지 않는다.** 넘기는 순간 그 내용이 사라지기 때문이다.
     "어디로 보내든 기간 안에는 열려야 한다" 는 요구를 2번이 일반 규칙으로 지킨다 — 앞으로 생길
     `#` 주소도 자동으로 보호된다. 카카오 내장 브라우저에 머물러도 공개 페이지는 잘 열린다.
  샘링크 단축주소로 보내도 결국 `/exhibition#토큰` 으로 넘어오므로 같이 고쳐진다.
  덤으로 아이폰에서 전시 주소를 열 때 뜨던 `구글 로그인을 위해…` 알림창도 사라진다(같은 원인의 오작동).
- **변경**: `public/kakao-browser.js`, 새 검사 `tests/kakaoBrowserShareLink.test.mjs`.
  DB·마이그레이션·맥미니 인프라 변경 없음.
- **결과/검증**: 스크립트를 **가짜 브라우저에서 실제로 돌려** 어디로 갔는지 보는 검사 5건을 넣었다
  (글자 맞추기로는 조건이 뒤집혀도 통과한다). 고치기 전 코드로 되돌리면 5건이 실패한다.
  처음엔 전시 예외를 빼도 안 잡혀 **검사되지 않은 조건**이 남아 있었고, 열쇠 없이 전시 주소만 열린
  경우를 더해 3건이 실패하도록 보강했다. 전체 검사 1125건, 린트, 빌드 통과.
- **배포가 한 번 막혀 함께 고친 것**: 이 수정과 무관한 `classAgitPersistence` 검사가 배포 관문에서만
  실패했다. 저장 payload 에 금지어가 있는지 글자로 찾는데 그 목록에 `999` 가 있었고, 방 ID 가 무작위
  UUID 라 우연히 `999` 를 품으면(측정 약 0.5%, 3000번 중 16번) **바뀐 것이 없어도 배포가 실패**했다.
  숫자를 글자로 찾는 대신 `revision`·`state` 가 실제로 빠졌는지 값으로 확인하도록 바꿨다.
  일부러 흘리게 만들어 검사가 잡는 것과, 3000번 돌려 더는 흔들리지 않는 것을 함께 확인했다.
- **실기기 확인 완료 (2026-09-14)**: 배포 뒤 사용자가 실제 카카오톡으로 전시 주소를 보내 **정상 열림**을
  확인했다. 원인 진단(카카오 안드로이드 `intent://` 가 `#` 뒤 열쇠를 버린다)이 맞았다.
- **남은 것 / 다음**: 안내 문구 `공유가 끝났거나 지금 볼 수 없는 전시입니다` 는 종료·시작 전·해지·주소 오류·접속 폭주를
  한 문장으로 뭉뚱그린다. 이번처럼 **원인을 알 수 없게 만드는** 자리라, 나눠 줄지 따로 판단한다.

## 2026-09-13 — 다시 보기가 전체 진행되지 않던 진짜 원인: "끝냈다" 를 `status` 로만 봤다 (Claude)

- **제보(재발)**: "그래도 여전히 다시보기가 전체 진행이 안 된다." 앞 수정(옮겨 준 기억 지우기)은 맞는 수정이었지만 이 제보의 원인은 아니었다.
- **미리보기가 두 번 거짓말을 했다**: 미리보기가 상태 기계를 **손으로 흉내** 내고 있었고 그 흉내가 본 코드와 어긋나 "된다" 고 보였다. 그래서 `useTeacherTour` 훅을 그대로 돌리는 미리보기(`?dev-lab=teacher-tour-live`)를 새로 만들었다 — `userId` 를 주지 않으면 저장을 건너뛰고 메모리에서만 돈다. 이것으로 곧바로 재현됐다.
- **재현된 순서**: 끝냄 → 다시 보기 → 도중에 그만두기 → 다시 보기. 세 번째에서 `status` 가 `skipped` 이므로 "다시 보기" 가 아니라 **이어 하기**로 열렸고, 자동 판정이 켜진 채 열려 과제가 없는 학급의 선생님은 `과제 만들기` 의 "다 하시면 저절로 넘어갑니다" 앞에서 확인 버튼도 없이 갇혔다. 상태 기계만 따로 돌리면 정상이었던 이유는 검사가 `done` 상태에서만 시작을 눌러 봤기 때문이다.
- **고침**: 항목에 `everFinished`(한 번이라도 끝까지 가 봤는가)를 따로 남기고, 시작할 때 `status === 'done'` 이 아니라 **이 값**으로 다시 보기를 고른다. 끝까지 가 본 사실은 그 뒤 무슨 일이 있어도 지워지지 않는다. 기존 저장값은 `status === 'done'` 이면 그대로 `everFinished` 로 읽으므로 마이그레이션 없이 선생님 계정(8개 흐름 모두 `done`)에 바로 적용된다. 안내서의 `다 해보셨습니다` 문구·목차 ✅ 도 같은 값을 본다.
- **검사**: `끝낸 뒤 그만두었어도 다시 보기로 열린다`, `끝까지 가 본 사실은 지워지지 않는다` 2건 신설(고치기 전으로 되돌리면 잡힌다). 진짜 훅 미리보기로 세 흐름(처음 시작하기 3·첫 글쓰기 수업 5·학급 운영 10)을 **끝냄 → 다시 보기 → 그만두기 → 다시 보기 → 완주**까지 브라우저로 확인했다. `npm run test:all` 1050/1050, lint 오류 0, build 성공.
- **교훈**: 미리보기가 본 코드를 흉내 내면 흉내가 틀린 만큼 거짓 통과가 난다. 진짜 훅을 돌리는 미리보기를 표준으로 두고, 손으로 흉내 내는 쪽은 첫 회차(자동 판정) 눌러 보기 용도로만 남긴다.

## 2026-09-14 — 연구소와 아지트의 이질감 줄이기 (Claude)

- **지적**: 연구소 UI 가 아지트와 이질감이 있다. 글자 크기와 메뉴 모양을 맞추자.
- **먼저 잘못 짚은 것**: 운영 중인 연구소에 오늘 기능이 있는데 `~/writing-helper` 로컬에는 없어서 "노트북에만 있다" 고 말씀드렸다. **원격을 받아 오지 않은 탓**이었다 — `origin/main` 에 이미 `5db7f6b` 로 올라가 있었다. 로컬만 보고 단정하지 않는다.
- **글자**(연구소 저장소, `6300d0e`): 계단 자체는 2026-08-24 에 맞춰 뒀는데 **비켜 간 자리**가 남아 있었다 — 화면 코드에 `text-[11px]` 54곳·`text-[10px]` 11곳, `globals.css` 에 `0.68~0.78rem` 10곳. 아지트 바닥은 0.8rem 이다. 모두 계단의 가장 작은 칸으로 옮기고, **비켜 가는 방식 자체를 막는 검사**를 넣었다.
- **메뉴**(연구소 `b0169f3` + 아지트): 아지트 업무 메뉴는 **회색 줄 위에 지금 자리만 흰 바탕**, 글자 0.95rem, `아이콘 + 이름` 이다. 연구소는 흰 줄에 연파랑, 1rem, 이름만이었다. 셋을 맞췄다.
- **아지트 쪽도 한 줄 고쳤다**: 활성 메뉴 색이 `#3498DB` 로 박혀 있어 제 토큰(`--ui-primary` = #2563eb)과도, 연구소와도 달랐다. 토큰을 쓰게 했다.
- **두 저장소가 서로를 못 읽으므로** 같은 값을 양쪽에 적고 각자 검사한다(기존 규칙). 연구소 검사에 메뉴 모양 항목을 더하며 아지트 쪽 원본 파일을 주석에 적어 뒀다.
- **검사**: 연구소 90개 통과(활성 색·글자 크기·작은 글자 되돌리기 세 가지를 깨서 확인), 아지트 1162개 통과.

## 2026-09-14 — 학생 명단 도구 줄 정리 · 이름 바꾸기 (Claude)

- **`📋 명단 붙여넣기` → `📋 명단 일괄 붙여넣기`**: 붙여넣기만으로는 여러 명을 한 번에 넣는다는 뜻이 드러나지 않는다(사용자 지적). 화면·동행 모드 안내·활용 안내서를 함께 고쳤다.
- **학생 명단 도구 줄**(지적: 눈에 잘 안 들어온다): 일곱 개가 한 줄에 뒤섞이고 **배경색이 셋**(파랑 번호 매기기·회색 복구함·노랑 코드)이었다. 색은 많은데 무엇이 중요한지는 알 수 없었다.
  - 머리말 때와 같은 방식으로 **자리로** 갈랐다: ① 찾기(검색·정렬) ② 넣기(이름 한 명·일괄 붙여넣기) ③ 손보기(번호 다시 매기기·복구함·전원 코드). 무리 사이는 옅은 선 하나.
  - 손보는 도구 셋은 **같은 옷**을 입힌다 — 하나만 색이 다르면 그것부터 누르게 된다.
  - 강조는 **넣기 무리에만**. 이 화면에서 제일 자주 하는 일이다.
  - 색을 화면에 손으로 박지 않고 `--ui-*` 토큰으로 옮겼다.
- **동행 모드**: `학생 등록` 단계가 짚는 상자(`STUDENT_ADD`)는 묶음을 바꾸면서도 그대로 뒀다. 검사가 자리와 이름 입력칸을 함께 본다.
- **검사**: 무리 나누기 없애기·강조 없애기·동행 모드 자리 없애기 세 가지를 깨서 실패를 확인했다. `npm run test:all` 1162/1162, lint 오류 0, build 성공.

## 2026-09-14 — 학교는 목록에서 고른 것만 (앞 결정 되돌림) (Claude)

- **되돌린 것**: 같은 날 넣었던 "학교를 못 찾으면 이름을 그대로 쓰기" 를 걷어냈다.
- **왜 되돌렸나**: 사용자 지적("학교 이름이 검색 목록에 없을 수 없는데?")을 받고 확인해 보니, 검색은 나이스에서 **100곳을 받아 초등학교만 거른 뒤 20곳까지** 보여 주고 정확히 같은 이름을 맨 앞에 올린다. 2026-08-27 에 이미 고친 자리다 — **정상적인 초등학교는 거의 다 나온다.**
  - 근거로 삼았던 "학교 코드 없이 저장된 교사 311명" 도 다시 봤더니 **283곳 중 277곳이 `○○초등학교` 정식 이름**이었다. 나이스에 없는 학교가 아니라 **학교 선택이 필수가 되기 전(8월)에 가입한 사람들**이다. 내 진단이 틀렸다.
- **정한 것**: 이름과 학교는 정확해야 한다 — 문제가 생겼을 때 누구인지 알 수 있어야 하기 때문이다. 학교는 **코드까지 있는 것만** 저장한다(`!selectedSchool?.schoolCode`).
- **이름도 모양만 본다**: 두 글자 미만이거나 숫자가 섞이면 막는다. 확인할 길은 없으니 최소한만 막는다.
- **분석 항목을 다시 잡았다**: `학교를 어떻게 적었나` → **`학교 확인`**. 앞으로 이 수는 **0이어야 정상**이고, 0이 아닌 주가 생기면 확인 없이 지나가는 구멍이 난 것이다.
- **가입에서 143명이 막힌 원인은 다시 찾아야 한다.** 학교가 아니었다. 다음 후보는 약관 동의 단계, 구글 로그인 직후 이탈, 그냥 둘러보고 나간 경우다.
- **검사**: 학교 코드 없이 통과시키기·이름 검사 되돌리기·직접 입력 되살리기 세 가지를 깨서 실패를 확인했다. `npm run test:all` 1160/1160, lint 오류 0, build 성공.

## 2026-09-14 — 교사 머리말·업무 메뉴 정리 (Claude)

- **지적**: 머리말과 그 아래 메뉴가 "너무 정신이 없다".
- **무엇이 문제였나**
  - 머리말 한 줄에 **여덟 개**가 같은 크기(전부 0.8rem, 토큰 바닥값)·같은 회색으로 늘어서 있었다. 매일 쓰는 것(활용 안내서·우리 반 스크린)과 어쩌다 쓰는 것(정보 수정·로그아웃)이 구별되지 않았다.
  - **강조가 넷**이었다 — 노랑(오류 알림)·주황(관리자)·빨강(로그아웃)·빨간 배지. 강조가 넷이면 강조가 없는 것과 같다. 특히 **하루 한 번 쓸까 말까 한 로그아웃이 제일 튀었다.**
  - 아래 업무 메뉴는 **열한 개가 평평하게** 늘어섰다. 코드에는 네 구역이 있는데 화면에서는 간격 14px + 회색 1px 선이라 거의 안 보였다. 게다가 두 줄 모두 흰 바탕이라 한 덩어리로 뭉쳤다.
- **고침**
  - 머리말을 **자리로** 셋으로 갈랐다: ① 자주 쓰는 것(활용 안내서·우리 반 스크린) ② 소식(공지·오류 알려주기, 옅은 선으로 구분) ③ 계정(이름·관리자·정보 수정·로그아웃)은 오른쪽 끝 메뉴로 접었다. **색으로 가르지 않는다.**
  - 로그아웃의 빨강을 뺐다. 메뉴 안 마지막 자리와 옅은 선으로 충분하다.
  - 업무 메뉴 구역 간격 14 → 26px, 구분선을 `--ui-border-strong` 으로. 메뉴 줄 바탕을 `--ui-surface-muted` 로 바꾸고 **지금 자리만 흰 바탕으로 떠오르게** 했다.
- **동행 모드를 건드리지 않았다**: 35단계 중 24단계가 이 두 줄을 짚는다(업무 메뉴 20 · 머리말 1 · 나머지는 화면 안쪽). 생김새만 바꾸면 안전하고, **접거나 지우면 그 단계에서 선생님이 갇힌다.** 그래서 `우리 반 스크린`은 접지 않고 머리말에 남겼다.
- **검사**: `tests/teacherTourAnchorsPresent.test.mjs` 를 새로 만들어 **동행 모드가 짚는 32개 자리가 화면에 다 있는지** 기계가 본다. 처음 만들었을 때 자리를 지워도 통과해서 보니 **개발용 시안(`src/dev`)에 같은 자리가 심어져 있어** 그것이 가려 주고 있었다 — 시안을 빼고 다시 세도록 고쳤다.
- `npm run test:all` 1160/1160, lint 오류 0, build 성공.

## 2026-09-14 — 첫 과제의 문턱: 예시로 시작하기 (Claude)

- **어디를 봤나**: 학생 등록 → 첫 글이 43%인데, 그 사이에 단계가 더 있었다. 나눠 보니 **학생 168 → 과제 90(54%) → 학생 로그인 89(99%) → 첫 글 73(82%)**. 막히는 곳은 **첫 과제**다. 과제만 만들면 그 뒤는 흐른다.
- **어떻게 갈리나**: 과제를 만든 사람은 학생 등록 뒤 **중앙값 6분**, 87%가 같은 날 만들었다. 안 만든 78명은 영영 안 만든다. 학생 등록 때와 같은 모양이다 — **첫 자리에서 갈린다.**
- **무엇이 막나**: 과제 만들기 화면은 태그·질문 마법사·점수·평가 기준까지 있어 처음 보면 크다. 정작 꼭 채워야 하는 것은 **주제와 안내 두 칸**뿐이다. 거기에 "무엇을 쓰게 할까" 를 그 자리에서 정하는 일까지 겹친다.
- **고침**: 과제가 하나도 없을 때 빈 화면에 **예시 세 가지**를 둔다(오늘 있었던 일 · 내 짝을 소개합니다 · 가을에 본 것). 누르면 **폼이 채워진 채 열린다** — 조용히 만들지 않는다. 무엇이 만들어지는지 보고 고쳐서 저장한다.
- **예시 안내는 짧게 썼다**: 실제 교사가 쓴 안내는 중앙값 53자, 82%가 100자 미만이다. 예시가 길면 "이만큼 써야 하나" 로 읽혀 오히려 문턱이 높아진다.
- **장르는 실제로 쓰이는 이름**을 쓴다(생활문·일기). 목록에 없는 이름을 넣으면 장르별 화면이 그 과제를 못 알아본다.
- **학급 기본 설정은 건드리지 않는다**: 점수·댓글 허용 같은 값은 선생님이 정해 둔 것에서 온다. 예시가 그것까지 바꾸면 한 번 쓴 뒤로 설정이 달라져 있다.
- **분석에 한 항목 추가**: `학생 등록 뒤에 무엇이 막나` 를 넣어 이 네 칸을 같은 자로 잰다. 통째로 43% 로 보면 어디가 막혔는지 모른다.
- **검사**: 폼을 열지 않기·안내를 길게 쓰기·기본 설정을 덮어쓰기를 각각 깨서 실패를 확인했다. `npm run test:all` 1154/1154, lint 오류 0, build 성공.

## 2026-09-14 — 학교를 못 찾으면 가입이 끝나지 않던 것 (Claude)

- **어디를 봤나**: 가입 깔때기에서 다음으로 큰 구멍은 **계정 655 → 가입 완료 512(78%)** 다. 최근 30일에만 143명이 이 단계를 넘지 못했고, 누적으로는 계정만 있고 프로필이 없는 사람이 210명이다.
- **무엇이 막았나**: 학교는 필수인데 **목록에서 고르는 길 하나뿐**이었다. 검색은 나이스의 **초등학교만** 돌려준다. 이름이 조금 다르거나 새로 생긴 학교, 초등이 아닌 자리의 선생님은 **가입 자체를 끝낼 수 없다.** 빠져나갈 문이 없었다.
  - 주차별로 보면 이 규칙이 **08-31 주부터** 걸렸다(그 전에는 100%가 확인 없이 가입). 그 뒤로 직접 적은 사람 0% — 할 수 없었기 때문이다.
- **고침**: 검색 결과 아래에 **“찾는 학교가 없나요? ‘○○초등학교’ 그대로 쓰기”** 를 둔다. 이름만 저장하고 `school_verified_at` 은 찍지 않는다 — 찍으면 "확인된 학교" 를 세는 모든 곳이 틀린다. 화면에도 직접 적었다고 적어 준다.
- **급식처럼 학교 코드가 있어야 되는 기능에는 열지 않는다**(`allowManualEntry` 는 가입·프로필에서만). 거기서 이름만 받으면 나중에 "왜 급식이 안 나오죠" 로 돌아온다.
- **얼마나 쓰이는지 센다**: 분석에 `학교를 어떻게 적었나` 를 주차별로 더했다. 많으면 검색이 문제고, 없으면 막힌 원인은 다른 데 있다 — 다음 판단의 근거가 된다.
- **검사**: 직접 쓰기 길을 없애기·직접 적은 학교에 확인 도장을 찍기 두 가지를 깨서 실패를 확인했다. 급식 쪽에 열리지 않았는지도 본다. `npm run test:all` 1150/1150, lint 오류 0, build 성공.

## 2026-09-14 — 분석이 가리킨 자리를 고침: 명단 붙여넣기 (Claude)

### 숫자가 가리킨 곳

- 최근 30일 가입 깔때기: 계정 655 → 가입 완료 512 → 학급 505 → **학생 등록 168** → 첫 글 73.
- **학급을 만들고 학생 0명으로 멈춘 교사 337명 중, 그 뒤에 다시 들어온 사람은 2명**이다. 첫 자리에서 끝난다.
- 그런데 **끝까지 한 학급은 23명을 2분 만에 넣었다.** 느려서가 아니다 — 명단을 앞에 두고 "서른 번 치기" 를 **시작하지 못하는** 것이다.
- 가입 주차별 학생 등록률: 8/17 16% → 8/24 33% → 8/31 40% → 9/07 41% → 9/14 67%. 뒤 주차가 시간이 **덜** 지났는데 더 높다 — 개학과 동행 모드가 함께 끌어올린 것으로 보인다.

### 고침

- **명단 붙여넣기**: 나이스·엑셀·한글에서 이름 칸을 그대로 붙여넣는다. `1\t김민준`, `1. 김민준`, `김민준, 이서연` 을 모두 받고 번호는 뗀다. 한 번에 60명.
- **보내기 전에 무엇이 들어갈지 그대로 보여 준다** — 들어갈 이름 수와 앞 여섯, 이미 있는 이름, 빼놓은 줄과 그 이유. 조용히 빼면 28명 넣고 26명 들어온 것을 모른다. 동명이인은 막지 않고 알려만 준다.
- **한 번에 보낸다**([20261293](supabase/migrations/20261293_add_students_bulk.sql)): 서른 번 왕복하면 중간에 실패했을 때 절반만 들어간 명단이 남는다. 다 들어가거나 하나도 안 들어간다.
- **학생 코드는 서버에서 만든다**: 화면에서 서른 개를 만들어 보내면 겹쳤을 때(UNIQUE) 되돌릴 자리가 없다. 겹치면 다시 뽑는다. 글자는 `src/lib/codeGenerator.js` 와 같아야 하며(사람이 손으로 옮겨 적으므로 O/0·I/1·L 제외) 검사가 대조한다.
- 한 명씩 넣는 길은 **그대로 뒀다** — 전학생 한 명은 그게 빠르다.
- 동행 모드의 `invite-students` 안내와 활용 안내서도 붙여넣기를 먼저 말하도록 고쳤다.

### 검사

번호 떼기·한도·버튼·한 번에 보내기를 각각 깨서 실패를 확인했다. `npm run test:all` 1146/1146, lint 오류 0, build 성공, checklist 통과.

### 다음에 볼 것

`npm run analyze:usage` 로 **학생 등록률**을 주차별로 다시 본다. 지금 41%(9/07 주차)가 기준선이다.

## 2026-09-14 — 동행 모드 발자국과 사용자 분석 모듈 (Claude)

### 왜

"사용이 늘고 있나", "동행 모드가 도움이 되나" 를 물을 때마다 그 자리에서 SQL 을 짰다. 기준이 매번 달라져 지난번 수와 견줄 수가 없었다. 그리고 동행 모드는 **어디서 멈췄는지**까지만 알 수 있어, 5초 만에 껐는지 10분 붙들다 포기했는지를 몰랐다.

### 발자국

- 단계마다 **떠나는 자리**에 `{tour, step, at, how}` 를 남긴다(`start/next/skip/back/stop/done/welcome`). 다음 단계가 아니라 **방금 무엇을 했는지**가 알고 싶은 것이다.
- 담는 것은 단계 이름·시각·한 낱말뿐이다. 글·이름은 담지 않으며, 모양이 어긋난 값은 읽을 때 버린다.
- 최근 **40걸음**만 두고 오래된 것부터 버린다(4KB 안쪽). [20261292](supabase/migrations/20261292_teacher_tour_trail.sql) 이 DB 에서도 16KB 로 한 번 더 막는다 — 프로필은 로그인마다 통째로 읽는 열이라, 화면이 잘못 자라면 모든 교사의 로그인이 무거워진다.
- **멈춘 자리는 마지막 발자국 다음 단계**다. 나간 것은 기록할 수 없으니 "여기까지 하고 더는 없다" 로 읽는다.

### 분석 모듈

- `npm run analyze:usage` ([scripts/analyze-usage.mjs](scripts/analyze-usage.mjs)) 하나로 **한눈에 · 가입 깔때기 · 주간 사용 · 꾸준히 쓰는 학급 · 동행 모드 · AI 사용**을 같은 자로 잰다.
- **읽기만 한다**(쓰는 문장이 섞이면 부르기 전에 막는다). **사람을 식별하는 값은 결과에 넣지 않는다** — 그대로 붙여도 개인정보가 새지 않아야 한다.
- 한 항목이 깨져도 나머지는 나온다. 표가 바뀌었다고 분석 전체가 멎으면 급할 때 아무것도 못 본다.
- `.claude/skills/usage-analysis` 로 묶어 "사용자 분석 해줘" 로 부른다. 숫자를 늘어놓고 끝내지 말고 **고칠 자리 하나**를 대라고 적어 뒀다.

### 첫 판독 (2026-09-14)

- 최근 30일 가입 깔때기: 계정 655명 → 가입 완료 512명(78%) → 학급 505명(99%) → **학생 등록 168명(33%)** → 첫 글 73명(43%).
- **가장 크게 떨어지는 칸은 학생 등록**이다. 학급까지는 거의 다 오는데 거기서 셋 중 둘이 멈춘다. 동행 모드에서 멈춘 자리도 같다(`invite-students` 8명, `prepare-editor` 9명).
- 동행 모드: 만난 63명 중 31명(49%)이 한 걸음이라도 뗐고, 그중 14명(45%)이 첫 흐름을 끝냈다.
- 계정 나이를 가르지 않으면 결론이 **뒤집힌다** — 전부터 쓰던 교사가 섞여 "동행 모드를 안 한 사람이 글을 더 많이 받은 것" 처럼 보였다. 가른 뒤에는 1단계를 끝낸 새 교사 12명 전원이 학생을 등록했고, 중간에 멈춘 17명은 절반뿐이다.

- `npm run test:all` 1139/1139, lint 오류 0, build 성공.

## 2026-09-14 — 로그인 화면 현황이 갱신되지 않던 것 (Claude)

- **지적**: `함께하는 선생님` 수가 실시간으로 맞춰지지 않는다.
- **원인**: 화면이 뜰 때 **한 번만** 읽고 끝이었다. 서버는 60초마다 다시 세도록 해 뒀는데(`get_service_stats_v1`) 화면 쪽에 다시 읽는 자리가 없었다. 로그인 화면은 켜 둔 채로 오래 머무는 자리라, 그동안 선생님이 더 들어와도 숫자가 그대로였다.
- **고침**: 서버가 다시 세는 주기와 같은 **60초**로 다시 읽는다(더 자주 물어도 서버는 같은 값을 돌려준다 — 두들기기만 한다). **보이는 동안만** 읽고, 덮어 둔 탭에서는 쉰다. 탭을 다시 펴면 1분을 기다리지 않고 바로 읽는다. 화면을 떠나면 타이머와 이벤트를 걷는다.
- **검사**: 다시 읽기·탭 복귀·뒷정리를 각각 없애 실패를 확인했다.
- `npm run test:all` 1132/1132, lint 오류 0, build 성공.

## 2026-09-14 — 주제째 담기를 전시관에도 · 메뉴에서 BETA 를 뗌 (Claude)

### 전시관도 주제째 담기

- 문집에 넣은 담는 방식을 **글꽃 전시관에도** 넣었다(사용자 요청). 부품을 [selection/MissionBulkPicker.jsx](src/modules/class-agit/selection/MissionBulkPicker.jsx) 로 옮겨 둘이 함께 쓴다.
- **자리 셈이 다르다**: 문집은 한 권의 남은 자리(300편)지만, 전시는 **그 전시실**의 남은 자리다. 전시실 하나는 20편이라 학급 전체 미션이 한 방에 들어가지 않는다.
- 그래서 전시에는 길이 둘이다 — `이 전시실에 N편 담기` 와 `새 전시실 만들어 N편 담기`(미션 이름으로 방을 만들고 그 방에 담는다). `글 보기` 로 넘어가면 그 미션이 골라진 채로 골라 담기가 열린다.
- **50편씩 끊어 담는다**: `addExhibitionSources` 는 한 번에 50편까지다. 미배정처럼 자리가 넓은 곳에 한꺼번에 넘기면 통째로 튕긴다. 자리를 50으로 줄이는 대신 끊어서 넣는다 — 줄이면 덜 담긴다.

### 메뉴에서 BETA 를 뗐다

- 우리반 아지트의 `BETA` 배지를 뗐다(사용자 요청). 아직 열리지 않은 학급에 뜨는 준비 화면도 `Beta · 준비 중` → `준비 중`.
- 이웃 아지트는 2026-08 에 **"별도 경고문 없이 메뉴명으로 알린다"** 고 정해 `이웃 아지트(제작 중)` 이다. 그래서 배지를 쓰는 메뉴가 하나도 남지 않아 **그리는 자리와 스타일도 함께 걷어냈다** — 두 방식이 같이 있으면 다음 사람이 어느 쪽으로 적을지 헷갈린다.
- **검사**: 배지를 되돌리면 실패한다. 상태는 이름에 적는다는 약속을 검사 이름과 주석에 남겼다.

- `npm run test:all` 1113/1113, lint 오류 0, build 성공.

## 2026-09-14 — 작품 담기: 주제째 담기 + 200편에서 막히던 제약 (Claude)

### 사고: 200편을 담자 저장이 막혔다

- `new row for relation "class_agit_book_items" violates check constraint "class_agit_book_items_position_check"`
- **놓친 자리**: 한도를 300으로 올릴 때 함수 안의 숫자와 `page_breaks` 제약만 훑고 **표 제약**을 못 봤다. 전시 쪽 표들은 `class_agit_max_works_v1()` 을 불러 쓰는데(그래서 한 곳만 고치면 된다) **문집 표만 숫자가 박혀** 있어 눈에 띄지 않았다.
- **고침**([20261290](supabase/migrations/20261290_anthology_item_position_limit.sql)): 문집도 함수(`class_agit_max_anthology_works_v1`)를 불러 쓰게 바꿨다 — 숫자를 박아 두면 다음에 또 잊는다. 실패한 저장은 통째로 되돌려져 초안은 그대로다.
- **검사**: 제약에 숫자를 도로 박으면 실패한다. 문집 표·함수에 남은 `100` 이 없는지 DB 에서 훑었다(작업공간 조회의 학생 명단 `LIMIT 100` 만 남으며 그것은 다른 한도다).

### 작품 담기를 두 갈래로

- **지적**: 주제별로 담을 때는 주제만 고르면 되는데 작품이 전부 펼쳐져 불편하다.
- **왜 그랬나**: 담기 화면([SourceBrowser](src/modules/class-agit/selection/SourceBrowser.jsx))이 원래 **전시실 큐레이션용**이라 글을 한 편씩 고르게 되어 있다. 30편짜리 미션이면 체크를 서른 번 했다.
- **주제째 담기**(기본): 미션 한 줄과 `N편 모두 담기` 단추뿐이다. 작품을 펼치지 않는다. `글 보기` 를 누르면 그 미션이 골라진 채로 골라 담기로 넘어간다.
- **한 번의 누름 뒤 오가는 것**: 목록은 30편씩(`candidatePage`), 전문 확인은 50편씩(`selectionBatch`) 끊겨 온다. [bulkAdd.js](src/modules/class-agit/anthology/bulkAdd.js) 가 이어 붙이고 진행("28/28편 확인 중…")을 보여 준다.
- **정직하게 알린다**: `25편을 담았습니다. 3편은 지금 담을 수 없어 건너뛰었습니다.` 자리가 모자라면 그것도 말한다. 못 담은 수를 세자고 남은 쪽을 마저 받지는 않는다 — 담지도 않을 목록이다.
- **고리**: 자리가 없으면 **부르기 전에** 막고, 커서가 제자리를 돌면 라운드 수에서 끊는다. 빼는 학생이 서버 한도(100명)를 넘으면 거르기를 포기한다 — 그대로 보내면 요청이 튕겨 한 편도 못 담는다.
- **쪽 다듬기**: 300편이면 목록이 길어져 **찾기**(제목·글쓴이·주제)를 넣었다. 화면에서만 좁힌다 — 걸러진 목록으로 쪽을 세면 `첫 작품` 판정과 쪽 번호가 어긋난다.
- **검사**: 새 `anthologyBulkAdd.test.mjs` 8개(쪽 이어 붙이기·자리 제한·건너뛰기·커서 고리·학생 거르기 포기·기본 방법·미션 이어받기·찾기). 기본값·미션 이어받기·찾기를 각각 깨서 실패를 확인했다.
- `npm run test:all` 1111/1111, lint 오류 0, build 성공.

## 2026-09-14 — 문집 수록 한도 100편 → 300편 (Claude)

- **왜**: 주제별로 엮으면 미션 하나가 25~30편이라 서너 주제에서 한도에 닿았다. 사용자가 "한계니까 300편" 으로 정했다.
- **먼저 재 봤다**(A4·이어붙이기, 진짜 브라우저): 100편 71~111쪽, **300편 207~327쪽**, 400편 276쪽. 쪽 짜기는 300편이 **0.1초**라 성능이 아니라 **종이**가 한계다. 300편이면 양면으로 찍어도 100~165장이다.
- **한 곳만 고치면 조용히 깨지는 자리가 넷**이라 한 마이그레이션에서 함께 올렸다([20261289](supabase/migrations/20261289_anthology_work_limit_300.sql)):
  1. 저장 검사(작품 수·쪽 나누기 수)와 **요청 크기**(`octet_length` 60KB → 150KB — 300편이면 원글 id·검사값만으로 53KB다)
  2. 확정 검사 `1~300편`
  3. **교사 작업공간 조회의 `LIMIT`** — 여기가 100이면 101편째부터 오류 없이 사라진다
  4. **학생 서가 조회의 `LIMIT`** — 같은 이유
  표 제약 `page_breaks <= 300` 도 함께. 작업공간의 다른 `LIMIT 100`(학생 명단, `maxCandidates`)은 그대로 뒀다.
- **앱**: `policy.js` 의 `anthologyWorks`. 차례 id 규칙(`chapter-N`)은 원래 999까지라 그대로 닿는다.
- **도움말**: 활용 안내서 `3 작품 담기` 에 **한 권 300편 · 글꽃 전시관 120편·10실**을 적었다. 숫자는 상수를 넣어, 다음에 한도를 올리면 도움말이 저절로 따라간다. 인쇄 전에 쪽수를 보라는 안내도 더했다(100편 70~110쪽 / 300편 200~330쪽).
- **검사**: 새 `anthologyWorkLimit.test.mjs` 가 앱·DB 네 자리·차례 id·요청 크기를 한꺼번에 대조한다. 조회 `LIMIT` 만 100으로 되돌리기, 요청 크기만 60KB 로 두기, 차례 id 규칙만 두 자리로 줄이기, 도움말에 숫자 손으로 적기 — 넷 다 깨서 실패를 확인했다. 옛 검사 세 곳(`classAgitCapacity`·`classAgitReleases`)은 숫자를 박아 두고 있어 **상수를 읽도록** 고쳤다.
- `npm run test:all` 1102/1102, lint 오류 0, build 성공. 마이그레이션은 배포 전에 적용했다.

## 2026-09-14 — 긴 글의 제목이 한 쪽을 차지하던 것 (Claude)

- **지적**: 글이 너무 길면 제목이 한 쪽을 차지하고 본문은 다음 쪽부터 나온다.
- **왜**: `flow` 는 "이 쪽에 이미 담긴 것(`fixed`)" 보다 더 들어 있으면 문단을 쪼개지 않고 다음 쪽으로 보낸다. 그런데 이어붙이기의 `first()` 가 `fixed: 0` 을 넘겨 상자에 든 **제목·글쓴이·줄을 본문으로 잘못 셌다.** 그래서 한 쪽을 넘는 문단이 통째로 밀리고 제목만 남았다. 쪽을 넘길 일이 많아진 앞 수정 뒤에 눈에 띄었을 뿐, 원인은 그 전부터 있었다.
- **고침**: `fixed` 를 상자에 이미 든 것의 수(`box.childElementCount`)로 넘긴다. 작품마다 새 쪽인 쪽 짜기는 원래 `header.length` 를 넘기고 있었다 — 이제 둘이 같은 기준이다.
- **확인**(진짜 브라우저·A4·이어붙이기, 책 10권): 본문 없이 제목만 실린 상자 **10개 → 0개**, **163쪽 → 155쪽**. 30% 기준을 어긴 쪽은 그대로 0개다.
- **검사**: `fixed` 를 0 으로 되돌려 실패를 확인. `npm run test:all` 1098/1098, lint 오류 0, build 성공.

## 2026-09-14 — 제목만 걸친 쪽: 자리가 아니라 **실릴 몫**을 잰다 (Claude)

- **지적**: 앞서 넣은 "세 줄" 기준으로는 못 막았다. 본문이 한 줄도 없는데 쪽이 안 넘어간다. 기준은 **그 글 본문의 30%** 로 하자.
- **왜 세 줄로는 못 막았나**: 이어붙이기에서는 앞 작품이 있는 쪽에서 **문단을 쪼개지 않는다**(쪼개면 갈래별 글자 규칙이 깨진다). 그래서 첫 문단이 긴 글은 세 줄 자리가 있어도 **문단째** 다음 쪽으로 밀리고 제목만 남는다. 자리를 재는 것 자체가 틀린 물음이었다.
- **고침**: **이 쪽에 실제로 실릴 몫**을 잰다 — 본문을 다 붙여 보고 넘치는 문단을 뒤에서부터 빼면 남은 것이 실릴 몫이다. 그 몫이 본문 전체의 `ANTHOLOGY_MIN_BODY_RATIO`(0.3)에 못 미치면 글을 통째로 다음 쪽으로 넘긴다.
- **한 쪽 몫에서 끊는다**: 쪽보다 긴 글에 전체의 30% 를 그대로 요구하면 남은 자리가 아무리 넓어도 늘 밀려, 이어붙이기인데 쪽 아래가 통째로 빈다.
- **확인**(진짜 브라우저·A4·이어붙이기, 책 10권): 쪽 끝에서 시작한 작품 47개 중 **17개가 30% 에 못 미쳤고(제목만 실린 것 포함) → 0개**. 값은 128쪽 → 135쪽, 한 권에 한 쪽꼴이다.
- **검사**: 기준값·한 쪽 몫 상한·재 보던 문단 지우기를 각각 깨서 실패를 확인. `npm run test:all` 1097/1097, lint 오류 0, build 성공.

## 2026-09-14 — 문집 세 가지: 되풀이되는 딱지·닫기 단추·제목만 걸친 쪽 (Claude)

### 1. 글마다 되풀이되던 "끄적끄적 글쓰기"

- **지적**: 책에서 학생 글마다 같은 말이 되풀이된다.
- **왜**: 문집은 글쓰기 쪽의 출력 판(`buildWritingPdfHtml`)을 그대로 가져다 쓴다. 글 한 편을 따로 내려받을 때 표지 구실을 하던 갈래 딱지가, 책에서는 글마다 되풀이되는 말이 된다.
- **고침**: **책에서만** 딱지를 감춘다. 낱장 내려받기는 그대로 둔다. 딱지 이름은 갈래마다 다르므로(`pdf-entry__kicker`, `poem-sheet__kicker`) [pdfRenderContract.js](src/modules/writing/export/pdfRenderContract.js) 에 `PDF_KICKER_CLASSES` 로 모으고, 새 갈래가 딱지를 만들면 목록에서 빠지지 않도록 **글쓰기 출력 코드를 훑어 대조하는 검사**를 뒀다.
- **확인**: 진짜 브라우저로 산문·시가 섞인 책을 그려 보니 책 쪽 안의 딱지 3개가 모두 안 보인다(자리도 차지하지 않는다).

### 2. 쪽 다듬기 닫기 단추가 창 끝과 어긋난 것

- 창을 1280px 로 넓히자 머리글이 가로 배치라 **안내 글이 짧으면 단추가 글 옆에 따라붙었다.** 안내 글이 남는 자리를 차지하고 단추는 끝으로 민다.

### 3. 다음 글 제목만 쪽 아래에 걸치던 것

- **지적**: 이어붙이기에서 다음 글의 **제목만** 쪽 아래에 붙으면 교사가 손으로 넘겨야 한다. 짜는 자리에서 미리 넘기면 편집이 쉬워진다.
- **고침**: 제목 아래로 본문이 **세 줄**(`ANTHOLOGY_MIN_ORPHAN_LINES`)도 못 들어가면 그 작품은 다음 쪽에서 시작한다. 줄 높이는 글자 크기·판형마다 다르므로 **실제로 재서** 쓴다 — 픽셀을 못박으면 A5 에서 틀린다. 빈 쪽에서는 넘기지 않는다(끝없이 새 쪽만 열린다).
- **확인**: 진짜 브라우저(A4·이어붙이기)로 길이 조합 12가지를 짜 보니 **고치기 전 4곳** 에서 제목만 걸쳤고 **고친 뒤 0곳** 이다.

- **검사**: 새 검사 5개, 모두 일부러 깨 실패를 확인. `npm run test:all` 1096/1096, lint 오류 0, build 성공.

## 2026-09-13 — 쪽 다듬기에서 A4 좌우가 잘려 보이던 것 (Claude)

- **지적**: 쪽 다듬기의 초안 미리보기에서 **A4 쪽의 좌우가 다 보이지 않는다.**
- **왜**: A4 는 96dpi 로 794px 인데 미리보기 칸이 그보다 좁았다(창 1100px − 목록 380px − 여백 ≈ 700px). 넘친 만큼 잘렸다.
- **고침**: 칸 너비에 맞춰 쪽을 줄인다. **`zoom` 을 쓴다** — `transform: scale` 은 자리(레이아웃 상자)가 그대로라 줄여도 옆으로 넘치고 아래에 빈 공간이 남는다. 미리보기 전용이라 인쇄본에는 영향이 없다. 원래보다 키우지는 않는다(확대하면 오히려 잘린다). 창 크기가 바뀌면 다시 그리지 않고 **배율만** 고친다.
- **창도 넓혔다**: 1100 → 1280px, 목록 칸 380 → 320px, 미리보기 높이 52vh → 62vh.
- **확인**: 칸 700px → 배율 0.85, 560px → 0.68. 두 경우 모두 **맞추기 전에는 잘리고 맞춘 뒤에는 안 잘린다**.
- **검사**: `zoom` 을 쓰는지, scale 로 되돌아가지 않았는지, 창 크기 변화에 다시 맞추는지, 원래보다 키우지 않는지. `npm run test:all` 1091/1091, lint 오류 0, build 성공.

## 2026-09-13 — 문집 `쪽 다듬기`: 교사가 작품의 시작 쪽을 정한다 (Claude)

- **요청**: 초안을 보고 **작품을 다음 쪽으로 넘길지 말지** 교사가 정하는 단계가 있으면 좋겠다. 그리고 정리되면 **목차는 저절로 맞춰지게**.
- **먼저 솔직히 말한 것**: `당기기` 는 언제나 되는 것이 아니다. 앞 쪽에 자리가 없으면 강제를 풀어도 올라오지 않는다. 그래서 화면에 "다음 쪽으로 넘기기는 언제나 되고, 당기기는 **앞 쪽에 자리가 남아 있을 때만** 올라옵니다" 를 그대로 적었다 — 안 적으면 "눌렀는데 안 올라온다" 가 된다.
- **인쇄 창이 아니라 앱 안에서**: 인쇄 창은 보안상 앱과 연결이 끊겨 있어(`opener=null`) 거기서 누른 선택을 돌려받을 수 없다. `STEP 04` 에 `쪽 다듬기` 를 넣어 앱 안에서 같은 초안 스냅샷을 그리고, 누르면 **바로 저장**한다 — 저장해야 확정판에도 간다.
- **순번이 아니라 원글로 기억한다**(`page_breaks`): 순번으로 담으면 작품 순서를 바꿨을 때 엉뚱한 작품이 쪽을 넘긴다. 그러려면 확정판 작품에 원글 id 가 있어야 해서 `sourceId` 를 함께 싣도록 고쳤다(전에는 `itemId` 뿐이라 화면과 맞출 수 없었다). 문집에서 뺀 작품의 표시는 저장할 때 함께 지운다 — 남겨 두면 다시 담았을 때 정한 적 없는 쪽 넘김이 되살아난다.
- **목차는 손대지 않았다**: 쪽을 다시 짤 때마다 쪽번호가 저절로 다시 매겨진다. 브라우저로 확인 — `진달래` 를 다음 쪽으로 넘기니 본문이 `4쪽: 봄비+개나리 / 5쪽: 진달래+목련` 로 바뀌고 **간지의 목록도 4쪽 → 5쪽** 으로 따라왔다.
- **이어붙이기에서만 보인다**: 작품마다 새 쪽인 문집은 이미 작품마다 쪽이 나뉘어 있어 더 정할 것이 없다.
- **검사**: `tests/anthologyPageBreaks.test.mjs` 6건 — 원글로 기억하는지, 뺀 작품의 표시가 사라지는지, 첫 작품 앞에서는 넘기지 않는지(빈 쪽이 생긴다), 앱 안에서 저장하는지, 당기기의 한계를 화면이 말하는지. 되돌려 잡히는 것까지 확인. `npm run test:all` 1090/1090, lint 오류 0, build 성공.

## 2026-09-13 — 이어붙이기 차례가 길어지던 것: 작품 목록을 간지로 (Claude)

- **지적**: 이어붙이기로 하면 차례에 학생 글이 전부 들어가, **주제가 다섯을 넘으면 차례가 너무 길어진다.**
- **답은 간지에 있었다**: 간지는 주제 이름 한 줄뿐이라 나머지가 **통째로 비는 쪽**이다. 그 자리에 그 주제의 작품 목록을 실으면 **종이를 한 장도 더 쓰지 않고** 차례는 주제만 남아 짧아진다. 책에서 부(部) 속표지가 하는 일과 같다.
- **결과**(주제 6 × 작품 4 = 24편으로 확인): 차례가 **24줄 2쪽 → 6줄 1쪽**, 전체는 **28쪽 → 21쪽**. 간지마다 그 주제의 작품 4줄이 쪽번호와 함께 실린다.
- **큰 학급도 막지 않는다**: 한 주제에 30편(학급 전체가 같은 과제)이면 목록이 한 쪽을 넘는다. 넘친다고 막으면 **정작 큰 학급이 문집을 못 만든다** — 이름만 둔 쪽에 이어 다음 쪽으로 목록을 넘긴다. 30편으로 확인했다(간지 2쪽, 쪽번호 30개 모두 채워짐).
- **검사**: 차례가 주제만 만드는지, 작품 목록이 간지에 들어가고 **쪽번호까지 채워지는지**(못 채우면 거기서 찾을 수가 없다), 목록이 넘칠 때 다음 쪽으로 이어지는지. 되돌려 잡히는 것까지 확인. `npm run test:all` 1084/1084, lint 오류 0, build 성공.

## 2026-09-13 — 문집 쪽 배치: 작품마다 새 쪽 / 이어붙이기 (Claude)

- **왜(사용자 요청)**: 지금은 작품마다 새 쪽에서 시작해 앞 작품이 반 쪽만 쓰면 **아래가 통째로 빈다.** 작품마다 제목과 지은이가 붙어 있으니 이어 붙여도 어디서 끊기는지 알 수 있다. 두 방식을 교사가 고르게 한다.
- **이미 있던 것**: 문집에 `작품 묶기`(직접 정한 순서 / 학생별 / **주제별**)가 이미 있고, 작품마다 `group`(과제 제목)이 들어 있었다. 그래서 **새로 만든 것은 둘뿐** — 쪽을 이어 붙이는 배치와, 주제가 바뀌는 자리의 간지.
- **정한 모양**(사용자 확정): 간지는 **주제 이름만**(종이를 적게 쓴다), 목차는 **주제 아래 작품까지 들여쓰기**(찾기 쉽다). 간지는 표지 역할, 찾는 일은 목차가 맡는다.
- **기본은 지금까지의 모양**: `work-per-page`. 확정판은 되돌릴 수 없으므로 설정을 건드리지 않은 문집은 **예전과 똑같이** 나온다(검사로 못 박음). 이 설정이 생기기 전 확정판에는 `layout` 이 없어 그것도 그대로 열린다.
- **어려웠던 곳**: 이어붙이기는 작품을 쪽 안의 **제 상자**에 담아야 한다 — 작품마다 갈래가 달라(산문·시) 글자 크기와 정렬이 다른데, 쪽 하나에 그 규칙을 직접 걸면 한 쪽에 두 작품을 못 담는다. 대신 넘쳤는지는 **쪽 전체를 재야** 안다(상자만 재면 앞 작품이 차지한 자리를 못 본다). 그래서 `담는 곳`과 `재는 곳`을 나눴다(`measureOf`).
- **확인**: 브라우저로 같은 작품 넷을 두 방식으로 찍어 대조했다. 작품마다 새 쪽 = 7쪽(작품 4쪽), 이어붙이기 = 7쪽이지만 **간지 2쪽 + 본문 2쪽**(한 쪽에 두 작품씩). 목차도 주제 아래로 들여써지고 쪽번호가 간지/작품을 각각 가리킨다.
- **검사**: `tests/anthologyPageLayout.test.mjs` 5건 — 기본값이 옛 모양인지, 옛 확정판이 열리는지, 고른 배치가 저장까지 가는지, 간지·묶음 목차가 이어붙이기에서만 생기는지, 재는 곳과 담는 곳이 나뉘어 있는지. 둘을 되돌려 잡히는 것까지 확인. `npm run test:all` 1082/1082, lint 오류 0, build 성공.

## 2026-09-13 — 확대 보기 오른쪽 끝 정렬 + 보관함에도 같은 확대 보기 (Claude)

- **제보**: 학생 글을 **전체 화면으로 확대**하면 오른쪽이 여전히 우둘투둘하다. 그리고 **보관함**에서도 같은 확대 보기가 됐으면 좋겠다(거기도 정렬이 안 된다).
- **왜 남아 있었나**: 전에 고친 것은 **전시관과 문집**이었고, `writing-presentation-modal`(확대 보기 창)은 손대지 않았다. 같은 증상이라 같이 고쳤다고 여긴 것이 잘못이었다 — 화면마다 본문을 그리는 곳이 따로였다.
- **고침 ①**: 확대 보기 창의 본문에 `data-format` 을 달고 **산문만** `text-align: justify`. `white-space: pre-wrap` 은 **그대로 뒀다** — 전에 정렬을 맞추겠다고 이것을 지웠다가 학생 글의 줄바꿈이 통째로 사라진 적이 있다. **시는 정렬을 건드리지 않는다**(줄의 시작과 끝이 작품 그 자체라, 전시관에서도 같은 결론이었다).
- **갈래 판단은 한 곳에서**: `writingFormat.js` 의 `getWritingFormat()` 이 `mission_type`(`poem`)과 `genre`(`시`·`동시`)를 **둘 다** 본다 — 어느 쪽이 비어 있어도 판단이 선다. 확대 보기를 쓰는 세 화면이 모두 갈래를 넘기는지 검사가 본다(안 넘기면 기본값이 산문이라 **시까지 정렬된다**).
- **고침 ②(보관함)**: 보관함이 자기 방식으로 본문을 그리고 있었다. **글쓰기 화면과 같은 모듈**(`WritingPresentationTrigger` + `WritingPresentationModal`)을 불러와 붙였다 — 따로 만들면 정렬·글자 크기 같은 것이 한쪽만 고쳐진다.
- **검사**: `tests/writingPresentationFormat.test.mjs` 4건. 정렬 규칙을 빼거나 갈래를 안 넘기면 잡히는 것까지 확인. `npm run test:all` 1077/1077, lint 오류 0, build 성공.

## 2026-09-13 — 미션 카드 `연구소 연결` 에 이름 + 활용 안내서 단추를 눈에 띄게 (Claude)

- **지적 둘**: ①미션 카드의 수정·보관·삭제에는 이름이 붙어 있는데 **연구소 연결만 아이콘뿐**이라 무엇인지 알 수 없다. ②머리말의 **활용 안내서 단추가 눈에 안 띈다** — 글씨와 색을 세우고 아이콘은 돋보기로.
- **연구소 연결**: 옆 단추들과 같은 공용 모양(`CARD_ACTION_BUTTON_STYLE`)에 보라 계열을 입히고 `🧪 연구소 연결` 로 이름을 붙였다. **네 단추가 모두 아이콘+글자인지**를 검사가 본다 — 하나만 아이콘뿐이면 그 하나가 다른 것처럼 보인다.
- **활용 안내서 단추**: 옅은 회색 도움말과 같은 모양이라 지나쳤다. 채운 남보라(#4F46E5)·흰 글씨·굵게·알약 모양으로 세우고 아이콘을 `💡` → `🔍` 로 바꿨다. `GuideInfoButton` 에 `icon` 을 받는 자리를 만들어 **이 자리만** 바꿨다 — 탭 도움말(`💡`)은 그대로다(다섯 곳 확인).
- **검사**: `tests/missionCardActions.test.mjs` 2건 신설. `npm run test:all` 1073/1073, lint 오류 0, build 성공.

## 2026-09-13 — AI 맞춤법 검사를 기본으로 켬 (Claude)

- **왜**: 594개 학급 중 **13개만** 켜 두고 있었다. 그런데 **끈 학급은 하나도 없었다** — 기본 목록에 없어 `있는 줄 몰라` 안 쓴 것이지 싫어서가 아니었다(사용자 판단).
- **기본값만 바꾸면 새 학급에만 미친다**: 그래서 `20261286` 이 ①새 학급의 DB 기본값에 넣고 ②**이미 있는 학급에도** 넣는다. 이미 켠 13개에 중복으로 넣지 않고, `연구소 결과` 를 껐던 1개 학급의 선택도 건드리지 않는다(적용 뒤 그 학급은 `spelling-lookup, ai-spell-check` 로 남았다). 켜지 못한 학급이 남으면 장이 실패한다 — "켰다" 고 적고 안 켜져 있으면 안 된다.
- **결과**: 594개 학급 전부 켜짐. 새 학급 기본값도 함께 바뀜.
- **알아 둘 것(정책)**: 이 기능은 교사가 `다시 쓰기` 를 요청한 글에서만 열리고, 켜면 그 글이 OpenAI 로 전송된다 — **개인정보 처리방침 제5조에 이미 고지돼 있다**(이름·학번은 가지 않는다). 원치 않는 학급은 `글쓰기 창 관리` 에서 끄면 되고, 끄면 꺼진 채로 남는 것도 검사로 확인했다.
- **검사**: `tests/writingEditorDefaults.test.mjs` 4건 — 화면 기본값과 DB 기본값이 같은지(어긋나면 새 학급과 화면이 다른 것을 보여 준다), 끌 수 있는지, 두 번 넣지 않는지. 화면 기본값만 되돌려 잡히는 것까지 확인. `npm run test:all` 1071/1071, lint 오류 0, build 성공.

## 2026-09-13 — AI 길잡이가 낱말 하나로 문을 닫던 것 (Claude)

- **지적**: 안내서에 없는 낱말로 물으면 "없다" 는 결론이 난다. **낱말이 부정확하다고 그렇게 나오면 AI 길잡이라고 하기 어렵다.**
- **실제로 그랬다**: 화면이 먼저 낱말로 도움말을 찾고, **하나도 안 걸리면 AI 를 부르지도 않고** "기능 이름이나 메뉴 이름을 넣어 다시 물어봐 주세요" 로 끝냈다. AI 는 구경도 못 했다.
- **고침**: 낱말이 안 걸리면 **안내서 전체를 짧게 훑은 목록**(8개 흐름 · 각 흐름의 단계 제목)을 후보로 보내 **AI 가 뜻으로 고르게** 한다. 서버가 후보를 3개로 막고 있어 8개까지 받도록 함께 넓혔다 — 화면만 고쳤으면 서버가 400 으로 막아 오히려 아무 답도 못 받았을 것이다(검사로 둘을 함께 본다).
- **비용은 늘지 않는다**: 늘어난 것은 **개수뿐**이고 문맥 총량 상한(1200자)은 그대로다. 후보가 많으면 하나하나가 짧아질 뿐이다. 실제 훑어보기 후보의 문맥 합은 743자였다.
- **지어내지 않게**: 서버 지시문에 "딱 맞는 것이 없으면 **가장 가까운 것**을 고르고 확인해 보시라고 안내한다. **없는 기능을 있다고 지어내지 않는다**" 를 더했다.
- **배포**: 엣지 함수는 앱과 따로 올린다 — `sync-edge-shared.sh` → `vibe-ai/index.ts` 교체(되돌릴 사본 남김) → 컨테이너 재생성 → 빈 요청 400 확인. 컨테이너 안 파일에 새 상한이 들어간 것까지 확인했다.
- **검사**: `tests/teacherGuideAssistantFallback.test.mjs` 4건 신설 + 기존 상한 검사 갱신(3 → 8, **왜 늘렸는지 주석에 남김**). 화면·서버 각각 되돌려 잡히는 것까지 확인. `npm run test:all` 1067/1067, lint 오류 0, build 성공.

## 2026-09-13 — 안내서 목차가 두 줄로 길어지던 것 (Claude)

- **지적**: 목차에 진도 표시가 들어가면서 **제목이 두 줄로 밀려** 보기 나쁘다.
- **왜**: 항목이 `번호 · 아이콘 · 제목` 세 칸짜리 격자인데 진도 표시가 **네 번째 칸이 없어 다음 줄로** 내려갔다.
- **고침**: 칸을 넷으로 늘리고(`24px 25px 1fr auto`) 진도에 자기 칸을 준다. 아무것도 없으면 그 칸 폭이 0 이라 제목이 그만큼 넓어진다. 제목은 한 줄만 쓰고 길면 말줄임한다. 좁은 화면 두 규칙에도 같은 칸을 더했다.
- **확인**: 여덟 항목 모두 **52px 한 줄**로 정리됐다(브라우저에서 높이를 재서 확인). `npm run test:all` 1063/1063, lint 오류 0, build 성공.

## 2026-09-13 — 놀이 단계는 **늘 보이는 좌측 메뉴**를 짚는다 + 접기 단추에 글자 (Claude)

- **제보**: 포인트·동기부여의 스포트라이트가 여전히 불안정하다 — `작가 수호룡` **메뉴**를 짚어야 하는데 안 된다. 그리고 접기 아이콘(`⌄`)만 봐서는 그게 접는 단추인지 모르겠다.
- **두 번 틀린 자리를 짚었다**: ①처음에는 `StudentDashboardPreview` 의 **미리보기 카드** — 보여 주기만 할 뿐 눌러도 열리지 않는다. ②그다음 `전체 현황` 목록의 `세부 설정 열기` — 이건 눌리지만 **모듈을 열면 그 목록이 통째로 사라진다.** 그래서 불안정했다.
- **늘 보이는 것은 좌측 메뉴(`aside`)뿐이다**: 전체 현황이든 모듈이 열렸든 항상 그 자리에 있다. 이름표를 거기 **하나만** 두고, 고른 항목이 `aria-current` 로 알린다. 같은 이름표가 두 곳에 있으면 어디를 짚을지 흔들리므로 **이름표가 한 곳뿐인지도 검사로 센다.**
- **접기 단추**: `⌄` → `⌄ 접어 두기`, 접힌 알약도 `… · 안내 다시 펴기` 로 글자를 붙였다.
- **되돌아보며**: 오늘 이 자리에서만 세 번 틀렸다. 매번 "무엇이 보이는가" 로 골랐기 때문이다. 기준은 **"눌러서 실제로 열리는가"** 와 **"그 자리가 늘 있는가"** 두 가지여야 했다.
- **검사**: 이름표가 좌측 메뉴에 하나만 있는지, 접기 단추에 글자가 있는지. 미리보기 카드로 되돌려 잡히는 것까지 확인. `npm run test:all` 1063/1063, lint 오류 0, build 성공.

## 2026-09-13 — 놀이 단계가 엉뚱한 카드를 짚던 것 + 패널 접기 (Claude)

- **제보**: 수호룡·어휘의 탑 단계가 **학생 대시보드 미리보기**를 짚어 다음으로 갈 수 없다. 좌측의 실제 메뉴를 누르게 해야 한다. 그리고 패널이 오른쪽 아래를 늘 차지해 **뒤에 볼 내용이 있으면 답답하다.**
- **엉뚱한 자리였다**: `module:*` 이름표가 `StudentDashboardPreview` 의 카드에 붙어 있었다. 그 카드는 **보여 주기만 할 뿐 눌러도 열리지 않는다.** 실제로 여는 자리는 `전체 콘텐츠 빠른 설정` 의 단추(`onSelect`)다. 이름표를 그리로 옮기고, 고른 것이 `aria-current` 로 알리게 했다(`Overview` 가 지금 고른 것을 몰라 함께 넘겨 준다).
- **앞 판단을 되돌렸다**: 한 시간 전 "놀이 카드는 막지 않는다" 로 바꿨는데, 그것은 **짚는 자리가 틀렸던 것의 증상**을 다룬 것이었다. 제대로 된 단추를 짚게 되었으므로 다른 메뉴와 같이 **눌러야 다음으로** 가게 되돌렸다.
- **패널 접기**: 머리말의 `⌄` 로 접으면 오른쪽 아래에 작은 알약(`🧭 흐름 1/3 펴기`)만 남고 **덮개와 테두리도 함께 걷힌다** — 접었는데 화면이 어두우면 접은 뜻이 없다. 접은 상태는 그 사람 브라우저에만 남긴다.
- **배포 실패 한 건**: 직전 배포가 도커 안 검사 1건으로 실패했다(`classAgitPersistence` — 내 변경과 무관). 도커에서 세 번 돌려 모두 통과해 **일시적 실패**로 보고 재시도했고 성공했다. 되풀이되면 그때 파고든다.
- **검사**: 이름표가 미리보기가 아니라 여는 단추에 붙었는지, 접기가 덮개보다 앞서 판단되는지. `npm run test:all` 1062/1062, lint 오류 0, build 성공.

## 2026-09-13 — 놀이 카드는 짚어만 주고 막지 않는다 (Claude)

- **지적**: 포인트·동기부여의 `나의 작가 수호룡` 하이라이트는 **굳이 의미가 없다.**
- **맞는 말이었다**: 1단계에서 이미 놀이터 화면을 열어 카드가 다 보인다. 그중 하나를 다시 짚고 **누르라고 막기까지** 하면 얻는 것이 없다. 게다가 카드는 "열렸다" 고 알리지 못해 갇히기까지 했다(앞 항목).
- **고침**: 놀이 카드 단계(수호룡·어휘의 탑)는 **덮지 않고 옅게 짚기만** 한다. 어느 카드인지는 보이되 누르라고 막지 않고, 바로 `확인했어요` 로 읽고 넘어간다. 짚는 방식 분포가 `직접 눌러야 함 6 · 메뉴 27 · 옅게 3` 이 됐다.
- **검사**: 카드 단계가 막는 방식으로 되돌아가면 실패한다. `npm run test:all` 1062/1062, lint 오류 0, build 성공.

## 2026-09-13 — 3·4·5번 흐름이 페이지를 못 찾던 것과, 갇히던 두 자리 (Claude)

- **제보 셋**: ①3·4·5번 흐름은 **다른 단계를 하다 들어가면 해당 페이지를 못 찾는다.** ②포인트·동기부여의 `작가 수호룡 운영` 은 스포트라이트가 메뉴가 아니라 **카드**를 짚어 다음으로 갈 수 없다. ③연구소는 누르면 **다른 화면으로 떠나는데** 꼭 눌러야 할 것처럼 보인다.
- **① 하위 탭은 그 묶음을 열어야 그려진다**: `tab:diaries` 같은 이름표는 다른 묶음에 있으면 화면 어디에도 없다. 그런데 대비책을 `tab:<같은 탭>` 으로 계산해 **자기 자신이라 무효**였다. 이제 그 묶음의 **대표 탭(= 늘 보이는 위쪽 단추)** 으로 물러선다. 늘 보이는 것은 위쪽 묶음 단추뿐이라는 사실을 검사로 못 박았다 — 대표 탭이 아닌 이름표는 반드시 먼저 누를 곳을 갖는다.
- **② 놀이 카드는 "열렸다" 고 알리지 못했다**: 눌러도 표시가 없어, `열어야 다음으로` 규칙과 겹쳐 **갇혔다.** 카드가 스스로 알리게 고치고(`aria-current`), 그와 별개로 **누른 사실 자체**도 함께 본다 — 표시를 달 수 없는 자리를 새로 짚게 되어도 갇히지 않는다.
- **③ 연구소는 떠나는 문이다**: 누르면 새 화면으로 옮겨 가 동행 모드가 끊긴다. 조건은 원래 `확인했어요` 였지만 **스포트라이트 때문에 눌러야 하는 줄 알았다.** 안내에 "지금 누르면 옮겨 가 끊기니 읽고 넘어간 뒤 나중에 열어 보세요" 를 적었다.
- **검사**: 셋 다 되돌려 잡히는 것까지 확인. `npm run test:all` 1060/1060, lint 오류 0, build 성공.
- **남은 것**: 걷기 검사가 아직 "열려 있지도 않은데 테두리 없음" 을 14건 짚는다. 미리보기의 가짜 화면 탓인지 제품 탓인지 **아직 가리지 못했다** — 단정하지 않는다.

## 2026-09-13 — 두 시나리오를 자동으로 걷게 해서 점검 (Claude)

- **사용자 제안**: "순서대로 진행할 때" 와 "다 끝나고 파트별로 들어갈 때" 를 **따로** 검사해 보라. 그리고 짚어 준 곳을 눌러야만 다음으로 가게 하면 진행이 확실해진다.
- **걷기 검사**: 36단계 계획을 파일로 뽑고, 진짜 훅 미리보기를 브라우저가 두 시나리오로 걷는다 — ①처음부터 순서대로(끝나면 `이어서 둘러보기`) ②다 끝낸 뒤 흐름별 다시 보기. 단계마다 **패널 제목이 기대와 같은지**, **테두리가 있어야 할 때 있는지**, **눌렀더니 다음으로 가는지** 를 본다.
- **잡은 것 ①**: 짚어 준 메뉴를 눌러도 **최대 300ms 동안 반응이 없었다**(자리 재는 주기만 기다렸다). 눌린 직후 바로 다시 재도록 고쳤다 — 걷기 검사에서 "눌렀는데도 다음으로 못 감" 이 **19건 → 1건**으로 줄었다.
- **잡은 것 ②(사용자 제안 반영)**: 이제 **짚어 준 메뉴를 실제로 열어야** 다음으로 간다. 열기 전에는 `메뉴를 열면 다음으로 갈 수 있어요` 만 보인다. 다만 갇히면 안 되므로 `이 단계 건너뛰기` 는 조건 없이 늘 열려 있다(검사로 고정).
- **잡은 것 ③**: 앞 단계와 **같은 화면을 이어 쓰는 단계**(대시보드 제출 확인 → 승인, 독서록 확인 → 활동 운영)는 이미 열려 있어 테두리가 아예 없다. 왜 없는지 몰라 헷갈린다는 제보가 있어 `이 화면은 이미 열려 있습니다` 라고 말로 알려 준다.
- **남은 것**: 걷기 검사가 아직 "열려 있지도 않은데 테두리 없음" 을 14건 짚는다. 미리보기의 가짜 화면은 진짜처럼 화면이 바뀌지 않아 **검사 장치 쪽 문제인지 제품 문제인지 아직 가리지 못했다.** 다음에 가린다 — 지금 단정하지 않는다.
- **검사**: `npm run test:all` 1058/1058, lint 오류 0, build 성공.

## 2026-09-13 — "화면과 스포트라이트가 안 맞는다" 전면 재점검 (Claude)

- **제보 모음**: `AI 피드백 기준 정하기` 에서 하이라이트가 빠진다 / 맞춤법·AI 흐름은 스포트라이트가 아예 안 뜨고 안내문만 바뀐다 / 포인트·동기부여도 같다 / 메뉴를 눌러도 다음으로 안 넘어간다.
- **한 뿌리였다**: 구역(`section:`)·도구(`tool:`)·놀이(`module:`) 메뉴는 **한 단계 더 들어가야** 화면에 나온다. 아직 그 화면이 아니면 짚을 것이 없어 테두리가 통째로 사라진다. 앞서 "본문 전체를 두르는 대비책" 을 없앤 것이 옳았지만(엉뚱한 화면이 밝아졌다) **아무 대비책도 없이** 두어 이번 증상이 됐다.
- **고침**: 안쪽 메뉴는 **먼저 눌러야 할 바깥 메뉴**(설정·학급운영도구·놀이터)로 물러선다. 그래서 두 걸음이 된다 — `설정` 에 테두리 → 누르면 `글쓰기 설정` 구역으로 테두리가 옮겨 붙음 → 들어가면 조용해지고 `다음 단계로 →`.
- **"눌러도 안 넘어간다"**: 들어온 뒤에도 단추가 `확인했어요` 라 다음이 있는지 몰랐다. 도착하면 **`다음 단계로 →`** 로 바뀌고 안내도 "열렸습니다. 설명을 읽고 다음 단계로를 눌러 주세요" 로 바뀐다. 저절로 넘기지는 않는다 — 들어가자마자 넘어가면 정작 설명을 읽을 새가 없다.
- **36단계 전면 대조**: 이름표가 실제로 그려지는 화면이 있는지, 안쪽 메뉴에 바깥 메뉴가 딸려 있는지, 대비책도 실재하는지 — **문제 0건**. 이 대조를 검사로 굳혔다(없는 구역을 가리키게 바꿔 보아 두 단계를 집어내는 것까지 확인).
- **눈 확인**: 진짜 훅 미리보기에 설정 구역 메뉴를 만들어 `설정 → 글쓰기 설정 → 다음 단계로 → 맞춤법 자료` 로 이어지는 것을 브라우저로 확인했다.
- **검사**: `npm run test:all` 1057/1057, lint 오류 0, build 성공.

## 2026-09-13 — 테두리와 설명이 어긋나던 세 가지 (Claude)

- **제보 셋**: ①4번까지 하고 3번에 들어가면 **4번 화면**이 밝아진다. ②여러 번 해보니 테두리와 오른쪽 아래 설명의 **싱크가 안 맞는다** — 중간에 그만두고 다른 흐름을 다시 볼 때 특히. ③맞춤법·AI 흐름을 다시 보기로 열면 **설정만** 계속 짚는다.
- **① 엉뚱한 화면이 밝아진 이유**: 짚을 메뉴가 아직 화면에 없을 때(학급운영도구 안의 도구처럼 한 단계 더 들어가야 보이는 것) **본문 전체를 두르는 대비책**이 돌았다. 그러면 지금 열려 있는 **앞 단계 화면**이 통째로 밝아진다. 대비책을 없앴다 — 없는 것을 억지로 짚느니 아무것도 안 짚고 `화면 열기` 를 권한다.
- **② 싱크가 어긋난 이유**: 재는 자리를 **이름표에만** 묶어 두었다. 여러 단계가 같은 이름표를 쓰면(설정 다섯 단계가 모두 `tab:settings`) 앞 단계의 자리가 그대로 남는다. 이제 **단계에도 묶어** 지금 단계의 것이 아니면 그리지 않는다. 어긋난 테두리보다 없는 편이 낫다.
- **③ 설정만 짚은 이유**: 이동 대상에 `section` 이 있는데 **탭만 보고 이름표를 만들었다.** 설정 화면의 구역 메뉴에 이름표를 붙이고(`section:*`), 구역이 있으면 구역을 짚는다. 맞춤법·AI 세 단계가 이제 각각 `글쓰기 설정`·`맞춤법 자료`·`AI 기준` 을 짚는다.
- **되풀이 방지**: 한 흐름 안에서 **세 단계 이상이 같은 곳을 짚으면 검사가 막는다.** 이번 일의 뿌리가 그것이었다(설정 5·대시보드 3). 둘까지는 봐준다 — 독서록 확인·독서 활동처럼 같은 화면을 나눠 설명하는 경우가 있다.
- **검사**: 셋 다 되돌려 잡히는 것까지 확인. `npm run test:all` 1055/1055, lint 오류 0, build 성공.

## 2026-09-13 — 짚는 자리를 메뉴로 되돌리되, 열리면 조용해지게 (Claude)

- **지적**: "하이라이트가 거의 의미 없는 부분이 너무 많다. 학생 자율 글쓰기 지도하기에서도 **좌측 메뉴**에 하이라이트가 들어가야 하는데 전체를 박스 쳐서 어딜 말하는지 모르겠다. 해당 메뉴를 짚어 주고, 눌러 들어가면 설명이 붙는 방식이 좋겠다. 3번부터 8번까지 그런 경우가 많다."
- **내가 과하게 고쳤던 것**: 아침에는 "메뉴만 밝히고 볼 내용을 덮는다" 는 문제를 **본문 전체 테두리**로 바꿨다. 그러니 이번에는 **어디를 말하는지 알 수 없게** 됐다. 두 요구는 사실 시점이 달랐다 — 도착 **전에는** 메뉴를, 도착 **후에는** 내용을 봐야 한다.
- **고침**: 둘러보는 30단계가 다시 **메뉴 항목**을 짚는다(덮개+맥동). 그리고 **그 메뉴가 열리면 덮개와 테두리가 사라지고 설명만 남는다.** 열렸는지는 메뉴가 스스로 다는 표시(`aria-selected`/`aria-current`/`aria-pressed`)로 안다 — 따로 상태를 들고 다니면 화면과 어긋난다.
- **대신 눌러 주지 않는다**: 저절로 화면을 옮겨 주면 **어느 메뉴였는지 기억에 남지 않는다.** 교사가 직접 눌러 봐야 다음에 혼자 찾아간다. 못 찾을 때를 위해 `화면 열기` 단추는 남겼고, 메뉴를 못 찾으면 본문이라도 두른다.
- **한 줄 안내는 서른 번 적지 않는다**: "테두리가 씌워진 메뉴를 눌러 이 화면을 열어 보세요" 한 문장이면 메뉴 이름이 바뀌어도 늘 맞다.
- **검사**: 둘러보기 단계가 모두 메뉴를 가리키는지, 열리면 조용해지는지, 대신 눌러 주지 않는지. 둘을 일부러 깨뜨려 잡히는 것까지 확인. 진짜 훅 미리보기에 가짜 하위 메뉴를 두어 **테두리가 메뉴 위에 정확히 얹히고, 누르면 덮개가 걷히며 설명 5줄이 남는 것**을 눈으로 확인했다. `npm run test:all` 1053/1053, lint 오류 0, build 성공.

## 2026-09-13 — 글쓰기 연구소 설명을 실제 코드에 맞춰 자세히 (Claude)

- **지적**: `글쓰기 전에 생각 모으기` 단계의 연구소 설명이 얕다. 들어가서 무엇을 할 수 있는지, **네 가지 활동**이 각각 무엇인지 있어야 한다.
- **먼저 사실을 바로잡았다**: 아침에 쓴 안내서는 연구소 README 를 근거로 **다섯 활동**이라 적었는데, 실제 코드를 보니 `한자 활용 문장 만들기` 는 **2026-08-19 에 새로 만드는 길을 닫았다**(정의와 결과 화면은 과거 기록을 열려고 남겨 둔 것). 사용자가 말한 4가지가 맞았다 — README 가 낡았다. **문서가 아니라 실행 코드를 봤어야 했다.**
- **활동 설명은 연구소의 공식 문구 그대로**: `ACTIVITY_META` 의 summary 를 옮겼다 — 질문 만들기(질문 카드 참고), 좋은 질문 고르기(기준을 보고 익명 선택), 글 개요 짜기(처음·가운데·끝), 한줄모아(핵심단어로 한 문장). 여기에 코드에서 확인한 **이어지는 순서**(질문 만들기 → 좋은 질문 고르기 → 글 개요 짜기, 앞 활동의 제출이 끝나야 후보로 불려온다)와 `☆ 담기` 표시가 먼저 올라온다는 점을 더했다.
- **패널이 다 보이도록**: 핵심 줄 상한을 3 → 5 로 올리고, 안내서 단계를 네 활동 + 아지트 연결 다섯 줄로 맞춰 **하나도 잘리지 않게** 했다.
- **검사**: 네 활동이 모두 설명에 나오는지, 아지트로 잇는 길과 "연결해야 학생에게 보인다" 가 있는지 본다. 한줄모아를 빼 보아 잡히는 것까지 확인. `npm run test:all` 1053/1053, lint 오류 0, build 성공.

## 2026-09-13 — 다 둘러본 뒤 길이 끊기던 것 (Claude)

- **제보**: 글쓰기 도움 기능 설정을 확인하니 "여기까지 끝냈습니다 · 모든 흐름을 봤습니다" 가 뜨고 **`나중에` 버튼 하나만** 남았다.
- **왜 그랬나**: 그 계정은 8개 흐름을 **이미 다 끝낸 상태**였다. 그래서 "이어서 볼 다음 흐름" 이 없다는 판단은 맞았다 — 문제는 **거기서 갈 곳이 없다는 것**이었다. 다시 보고 싶어도 창을 닫는 수밖에 없다.
- **고침 둘**: ①다 둘러본 경우 `📘 활용 안내서에서 고르기` 를 주어 원하는 흐름을 골라 처음부터 다시 볼 수 있게 했다. 문구도 "여덟 흐름을 모두 둘러보셨습니다 — 다시 보고 싶은 흐름은 안내서에서 고르세요" 로 바꿨다. ②`getNextTourId` 가 현재 상태(`done`)가 아니라 **`everFinished`** 를 보도록 했다. 전에는 끝낸 뒤 그만둬 `skipped` 가 된 흐름을 "아직 안 봤다" 며 다시 권해, 목차의 ✅ 와 말이 어긋났다.
- **검사**: 이미 끝까지 가 본 흐름을 건너뛰고 다음을 고르는지, 다 본 뒤 갈 곳이 있는지. `done` 만 보게 되돌려 잡히는 것까지 확인. `npm run test:all` 1052/1052, lint 오류 0, build 성공. 진짜 훅 미리보기에서 8개 흐름을 모두 끝낸 뒤 끝 카드의 버튼과 안내서 연결을 눈으로 확인했다.

## 2026-09-13 — 다시 보기가 전체 진행되지 않던 진짜 이유 (Claude)

- **제보(재발)**: 앞 고침 뒤에도 "다시 보기가 전체 진행이 안 된다".
- **왜 두 번이나 헛짚었나**: 미리보기가 상태 기계를 **손으로 흉내 내고 있었다.** 그 흉내는 다시 보기를 제대로 하는데 본 코드는 아니어서, 브라우저로 확인해도 통과했다. 그래서 **`useTeacherTour` 를 그대로 돌리는 미리보기**(`?dev-lab=teacher-tour-live`)를 새로 만들었다 — `userId` 를 주지 않으면 저장을 건너뛰고 메모리에서만 돈다. 그것으로 **처음 재현했다.**
- **진짜 이유**: "한 번 끝냈다" 를 `status === 'done'` 으로만 봤다. 끝낸 뒤 그만두거나 다른 흐름을 열어 상태가 `skipped` 로 바뀐 교사는 다시 보기가 아니라 **이어 하기**로 열렸다. 그러면 자동 판정이 켜진 채 열려, 이미 학급은 있는데 과제가 없는 선생님은 `과제 만들기` 에서 "다 하시면 저절로 넘어갑니다" 앞에 갇혔다 — 확인 버튼도 없다.
- **고침**: 끝까지 가 본 사실을 `everFinished` 로 따로 남긴다. 상태가 무엇으로 바뀌든, 저장했다 다시 읽어도, 다시 보기로 진도가 0 이 되어도 지워지지 않는다. 시작할 때 그것을 보고 다시 보기로 연다. 안내서 목차의 ✅ 도 같은 기준을 쓴다.
- **검사**: 끝낸 뒤 그만둔 상태에서 다시 보기로 열리는지, `everFinished` 가 저장·재시작을 견디는지. `done` 만 보게 되돌려 잡히는 것까지 확인. `npm run test:all` 1050/1050, lint 오류 0, build 성공. 진짜 훅 미리보기에서 1회차(막히면 건너뛰기) → 다시 보기 1~3단계 **완주**를 눈으로 확인했다.
- **배운 것**: 흉내 낸 미리보기는 본 코드와 어긋나는 순간 **거짓 통과**를 만든다. 상태 기계를 다루는 화면은 진짜 훅으로 미리 보게 한다.

## 2026-09-13 — 안내서에서 `다시 보기` 를 눌러도 화면이 안 움직이던 것 (Claude)

- **제보**: "활용 안내서에서 다시 해보려는데 한 번 하면 다시 하기가 안 된다."
- **먼저 사실 확인**: 실제 계정(`98c01930`)은 8개 흐름이 모두 `done` 이었고, **그 계정의 저장된 값을 그대로 상태 기계에 넣어 보니** `다시 하기` → `status=running, stepId=첫 단계, replay=true` 로 정상이었다. 상태는 멀쩡했다.
- **미리보기에 안내서를 올려 진짜 눌러 봤다**: `?dev-lab=teacher-tour` 에 `TeacherGuideCenter` 를 넣어 브라우저로 눌러 보니 버튼·문구·목차 ✅·패널 모두 정상이었다. (중간에 "버튼 0개" 가 나왔는데 그것은 **내 미리보기 코드의 오류**였다 — 고치니 사라졌다.)
- **그 과정에서 찾은 진짜 결함**: 패널이 "이 단계는 이미 화면을 옮겨 줬다" 를 `navigatedStepRef` 에 기억하는데, **흐름을 새로 열어도 지우지 않았다.** 그래서 다시 보기로 1단계를 열면 "이미 옮겨 줬다" 고 보고 **화면을 움직이지 않아**, 눌러도 아무 일이 없는 것처럼 보였다. 기억은 한 회차 안에서만 쓸모가 있다 — 흐름 id·다시 보기 여부·진행 여부가 바뀌면 지운다.
- **검사**: 그 기억을 지우는 효과를 못 박았다. 지워 보니 잡힌다. `npm run test:all` 1048/1048, lint 오류 0, build 성공.
- **남은 것**: 미리보기에 안내서를 넣어 두었으므로 앞으로 `다시 보기` 흐름은 DB 없이 눌러 확인할 수 있다.

## 2026-09-13 — 동행 모드가 설명까지 한다 + 빠져 있던 글쓰기 연구소 (Claude)

- **왜**: "창 위치만 알려 주고 자세한 건 안내서에서 보라는 식이라, 찾기 어려운 기능은 끝까지 모른 채 지나간다. 흐름과 핵심은 지나가면서 한 번씩 짚어 달라."
- **설명을 새로 쓰지 않았다**: 안내서(`TEACHER_GUIDES`)에 이미 순서(`steps`)와 주의(`notes`)가 있으므로 **읽어 온다**(`teacherTourDetail.js`). 같은 말을 두 곳에 적으면 안내서만 고쳐졌을 때 둘이 달라진다. 검사가 이 파일에 긴 한글 문장이 직접 적히지 않았는지 본다.
- **그 단계에 맞는 문장을 고른다**: 앞에서부터 자르면 수호룡 `시즌 마감` 단계인데 `성장 단계 보는 법` 이 나온다. 단계 제목·설명의 낱말이 몇 개 겹치는지로 점수를 매겨 고르고, **굵게 강조된 주의**(되돌릴 수 없는 대목)를 먼저 올린다. 시즌 마감에서 `마감 열기 → 시즌 종료 → 새 학기 시작` 과 `초기화 시점` 이 실제로 뽑히는 것을 검사로 못 박았다. 겹치는 말이 없으면 주의는 **비워 둔다** — 빈칸을 채우려 아무 문장이나 넣으면 틀린 경고가 된다.
- **글자 그리기는 안내서와 공유**: `guideEmphasis.jsx` 로 빼내 `**굵게**`·`` `버튼 이름` `` 을 두 곳이 같은 방법으로 그린다.
- **빠져 있던 글쓰기 연구소**: 상단 메뉴에 `🧪 글쓰기 연구소` 가 있는데 **안내서에도 동행 모드에도 없었다.** 연구소 저장소(`~/writing-helper`)와 아지트 코드에서 확인한 사실만으로 안내서 항목을 만들었다 — 다섯 활동(글 개요 짜기·질문 만들기·좋은 질문 고르기·한줄모아·한자 활용 문장 만들기), 아지트 학급·학생을 그대로 쓴다는 점, `연구소 좋은 질문 불러오기`·`연구소 자료 연결` 로 이어지는 길. `첫 글쓰기 수업` 흐름에 `글쓰기 전에 생각 모으기` 단계로 넣었다.
- **새 화면으로 여는 단계**: 연구소는 탭이 아니라 링크다. 대신 눌러 주면 지금 화면이 사라지므로 **옮겨 주지 않고 링크 자리를 또렷이 짚는다**(`launch:` 이름표).
- **직접 해보는 단계 추가**: `우리 반 스크린` 은 말로 들어서는 모른다. 머리말 단추를 짚어 한 번 열어 보게 했다. 직접 해보는 단계가 4개 → **6개**(학급·학생·글쓰기 설정·연구소·과제·스크린), 나머지 30개는 덮지 않고 본문을 옅게 두른다.
- **함께 고친 울타리**: 도움말 개수 26 → 27, 이동 대상 검사가 `launch` 형태(새 화면으로 여는 메뉴)를 알도록. 숫자를 고칠 때 **왜 늘었는지**를 주석에 남겼다.
- **검사**: `tests/teacherTourDetail.test.mjs` 6건 신설 + `teacherTour` 29건. `npm run test:all` 1047/1047, lint 오류 0, build 성공. 패널에 핵심 3줄·주의 1줄이 실제로 그려지는 것을 눈으로 확인했다.

## 2026-09-13 — 동행 모드 35단계 짚는 자리 전면 재점검 (Claude)

- **제보**: `미션 만들기` 단계에서 **스포트라이트가 `✖ 닫기` 를 짚었다.** 그 버튼은 열리면 같은 자리에서 닫기로 바뀐다. 이어서 "그냥 확인하는 단계도 확인해야 할 부분이 제대로 짚히는지 다 점검해 달라".
- **여닫이 버튼**: 열린 뒤에는 짚는 자리를 **실제로 일하는 영역**으로 옮긴다. 과제는 만드는 판 전체(`teacher-mission-management-panel`), 학급은 이름을 적는 창(`Card`). 여닫이 버튼에 이름표를 고정해 두면 안 된다.
- **35단계 기계 대조**: 이름표를 메뉴에서 계산하므로, 계산한 이름이 화면에 실제로 붙는지 전부 대조했다. **붙는 곳 없는 단계 0건**. 대신 더 큰 문제가 드러났다 — **28단계가 작은 메뉴 버튼만 밝히고 정작 볼 내용은 전부 어둡게 덮고 있었다.** 정반대다. 게다가 설정 5단계·대시보드 3단계가 **각각 같은 버튼 하나**를 짚어 단계 구분이 되지 않았다.
- **짚는 방식을 둘로 나눴다**: `target`(눌러야 할 자리가 분명함 — 덮고 맥동한다, **4단계뿐**: 학급·학생·글쓰기 설정·과제) / `screen`(둘러보는 단계 — **덮지 않고** 본문 영역을 옅게 두른다, 31단계). 본문 영역에 `data-tour="workspace"` 를 붙였고, 못 찾으면 예전처럼 메뉴 이름표로 물러선다.
- **검사**: 덮는 단계가 정확히 그 넷인지, 둘러보기 단계가 모두 본문을 가리키고 대비책을 갖는지, 패널이 `screen` 단계에 덮개를 그리지 않는지 본다. 여닫이 버튼에 이름표를 고정해 보고 모두 `target` 으로 만들어 보아 잡히는 것까지 확인. `npm run test:all` 1039/1039, lint 오류 0, build 성공. 두 방식을 미리보기에서 눈으로 대조했다.

## 2026-09-13 — 동행 모드가 짚는 자리를 스포트라이트로 (Claude)

- **왜(사용자 지적 두 번)**: ①앱 전체가 파랑이라 **파란 테두리는 묻힌다** → `--ui-accent`(#c2410c, 주황빛 빨강)로 바꿨다. `--ui-danger` 는 이 앱에서 **삭제·위험**의 색이라 피했다 — "여기를 누르세요" 가 지우는 단추처럼 보이면 안 된다. ②그래도 **테두리만으로는 눈에 안 띈다** → 주변을 어둡게 덮고 그 자리만 밝게 남기는 **스포트라이트**와 **맥동**을 더했다.
- **덮개를 깔지 않았다**: 요소는 짚는 자리 크기뿐이고 **바깥 전체가 그림자**(`0 0 0 9999px`)다. 그래서 화면을 가리는 것처럼 보여도 실제로 덮인 영역이 없고, `pointer-events: none` 과 함께 두면 **어두운 곳도 그대로 눌린다.** 진짜 덮개를 깔면 정작 눌러야 할 버튼이 막힌다 — 동행 모드의 존재 이유가 무너진다.
- **맥동**: 멈춘 테두리보다 움직이는 쪽이 훨씬 먼저 눈에 걸린다. `prefers-reduced-motion` 에서는 맥동 대신 테두리를 굵게 남긴다.
- **검사**: 덮개·테두리 **둘 다** 클릭을 통과시키는지, 바깥을 덮는 것이 진짜 덮개가 아니라 그림자인지, 움직임 줄이기에서 맥동이 꺼지는지 본다. `pointer-events: none` 을 빼 보아 잡히는 것까지 확인. 실제로 **어두운 영역의 버튼을 눌러 통과하는 것**과 짚어 준 버튼을 눌러 다음 단계로 넘어가는 것을 눈과 클릭으로 확인했다.

## 2026-09-13 — 동행 모드 다시 보기와 안내서 진도 (Claude)

- **제보**: 다 한 뒤 안내서에서 `다시 하기` 를 눌러도 **다시 해볼 수 없었다.**
- **원인**: 자동 판정이 그대로 돌았다. `학급이 하나 이상`·`학생 한 명 이상` 같은 조건이 **이미 충족돼 있어** 1·2단계가 순식간에 지나가고 마지막 단계만 남았다. 다시 보기는 실제 작업이 아니라 **둘러보기**인데, 학급을 또 만들라고 할 수도 없다.
- **고침**: 다 한 흐름을 다시 열면 `replay` 로 표시해 **처음 단계부터, 자동 판정 없이** 연다. 모든 단계를 `확인했어요` 로 넘기고 패널에 `다시 보기` 딱지를 붙인다. **하다 만 흐름은 그대로 이어서** 간다 — 둘을 섞으면 한 일을 또 시킨다.
- **안내서 진도**: 목차에 흐름별로 다 한 것은 ✅, 하다 만 것은 `2/4` 를 보여 준다. 고른 흐름 위에는 "이 흐름은 동행 모드로 다 해보셨습니다" 또는 "N단계 중 M단계까지 하셨습니다" 가 뜨고, 버튼이 상황에 따라 `따라 하기` / `이어서 하기` / `다시 보기` 로 바뀐다. **다 해봤다는 사실은 다시 보기로 진도가 0 이 되어도 남는다**(검사로 못 박음).
- **미리보기도 같이 고쳤다**: `?dev-lab=teacher-tour` 가 훅의 자동 판정을 흉내 내는데 **거기만 안 고쳐** 다시 보기가 단계를 건너뛰는 것처럼 보였다. 흉내 코드가 본 코드와 어긋나면 미리보기가 거짓말을 한다.
- **검사**: `teacherTour` 23건(새로 4건). 셋을 일부러 깨뜨려 확인(다시 보기 표시 제거 → 제보 재현, 다시 보기에서 자동 판정 켜기, 다시 보기가 "다 해봤음" 까지 지우기). `npm run test:all` 1035/1035, lint 오류 0, build 성공.

## 2026-09-13 — 첫 자리에는 공지를 미루고, 2주 지난 공지는 목록에서 뺀다 (Claude)

- **왜(사용자 제안)**: ①가입하고 처음 앉은 자리에는 환영 안내·첫 걸음 카드·동행 패널이 이미 겹쳐 뜨는데 공지 띠와 공지 팝업까지 얹히니 **무엇부터 해야 하는지 묻힌다.** 첫 자리는 학급 만들기와 동행 모드에만 쓰고 공지는 다음에. ②지난 공지가 끝없이 쌓이면 목록이 길어져 **정작 새 공지가 묻힌다.** 2주 지난 공지를 굳이 다시 읽을 일은 없다.
- **첫 자리 판정**: `teacher_tour_state.firstLoginAt` 을 대시보드 첫 진입 때 한 번 적고, 그로부터 **30분** 동안만 공지 띠·팝업을 띄우지 않는다. "이번 페이지에서 처음인가" 로 보면 **새로고침 한 번에 공지가 튀어나온다.** 미룬 공지는 **읽음으로 넘기지 않으므로** 다음 로그인에 그대로 뜬다(검사로 못 박음). 머리말의 공지 버튼은 그대로 둬서 보고 싶으면 언제든 연다.
- **2주 창**: 교사 공지 목록은 **두 곳**에서 만들어진다 — 로그인 때 한 번에 받는 `get_teacher_app_bootstrap_v1`(`20261285`)과 화면이 직접 부르는 `useAnnouncements`. 한쪽만 고치면 **로그인 직후와 새로고침 뒤의 목록이 달라진다.** 숫자의 원본은 `src/constants/announcements.js` 의 `ANNOUNCEMENT_VISIBLE_DAYS`(14) 하나이고 검사가 DB·화면을 함께 본다. 운영에서 19건 중 최근 13건만 나오는 것을 확인했다.
- **관리자는 그대로**: `AdminAnnouncementManager` 에는 창을 걸지 않았다 — 지난 공지도 고치고 지울 수 있어야 한다. 검사가 관리 화면에 교사용 창이 섞이지 않았는지 본다.
- **검사**: `tests/announcementWindow.test.mjs` 5건. 셋을 일부러 깨뜨려 확인(DB 만 30일로, 화면 조회에서 창 빼기, 첫 자리 미루기 빼기). `npm run test:all` 1031/1031, lint 오류 0, build 성공.

## 2026-09-13 — 탈퇴 뒤 출입증이 안 지워지던 진짜 이유: 세션은 쿠키에 있었다 (Claude)

- **제보(재발)**: 앞 항목을 배포한 뒤에도 "다시 가입해서 소속 학교명을 넣으면 교사 로그인이 만료되었다" 가 그대로 떴다.
- **서버는 결백함을 먼저 확인**: 인증 사용자는 있고 프로필은 없는 **가입 도중 상태**를 실제로 만들어(임시 계정 생성 → 비밀번호 로그인 → 호출 → 계정 삭제) 학교 검색이 **200** 으로 도는 것을 봤다. 엣지 함수·나이스 키·배포본 모두 정상.
- **진짜 이유**: 세션은 `localStorage` 가 아니라 **쿠키**(`sb-agit-auth-token`)에 있다. 탈퇴는 `localStorage.clear()` 만 했으므로 **쿠키가 그대로 남았다**. 게다가 계정이 이미 지워진 뒤라 서버 로그아웃이 실패해 라이브러리도 쿠키를 못 지웠다. `@supabase/ssr` 은 세션이 길면 `…-token.0`, `.1` 로 조각내 저장하므로 **한 조각만 남아도** 다음 접속에서 옛 토큰이 되살아난다.
- **고침**: ①`clearStoredAuthSession()` — 쿠키를 이름으로, **조각까지 훑어** 지운다. 탈퇴와 `signOutIfAccountGone()` 양쪽에서 부른다. ②학교 검색이 401 이면 빨간 글씨만 띄우지 않고 흔적을 정리해 **로그인 화면으로 돌려보낸다** — 전에는 죽은 가입 화면에 갇혔다.
- **앞 항목에서 고친 것도 유효**: 탈퇴 순서(로그아웃 먼저)와 401·403 구분은 그대로 두고, 거기에 쿠키 삭제를 더한 것이다.
- **검사**: `tests/withdrawnAccountRecovery.test.mjs` 6건(새로 2건) — 쿠키를 조각까지 지우는가, 401 이면 갇히지 않는가. 조각 훑기를 빼고 돌려 잡히는 것까지 확인. `npm run test:all` 1026/1026, lint 오류 0, build 성공.

## 2026-09-13 — 개인 API 키 흔적 삭제 · 탈퇴 뒤 옛 출입증 정리 · 현황 1분 갱신 (Claude)

### 1) 약관의 개인 API 키 문구와 남아 있던 키
- **확인부터**: 앱은 이미 개인 키를 받지 않는다 — 입력 화면도 키를 읽는 화면 코드도 없고 교사 572명 전원 `api_mode='SYSTEM'`. 엣지 함수에서 키를 읽는 곳 0건, 키 '값' 을 읽는 DB 함수는 `check_my_api_key_exists` 하나뿐이며 부르는 화면 0곳.
- **고침**: 약관의 "부수적 사안(API 비용 등)에 대한 모든 책임은 이용자에게" 를 **"AI 기능은 서비스가 직접 운영하며 이용자가 키를 등록하거나 요금을 부담하지 않는다"** 로 바꾸고, AI 문장은 교사가 확인해 쓰라는 안내를 남겼다. 처리방침 보안 조항에도 "개인 키를 받지 않으며 과거 저장분은 2026-09-13 삭제" 를 적었다.
- **삭제**(`20261283`): `profile_secrets` 의 키 든 10행 삭제(16 → 6행), `profiles.gemini_api_key` 1건·`personal_openai_api_key` 2건 비움. **남은 것 0건을 장 안에서 확인하고 아니면 실패**하도록 했다. 열·표는 `check_my_api_key_exists` 가 아직 참조해 남겨 두고 주석으로 표시했다.

### 2) 탈퇴하고 다시 들어오면 가입 화면이 뜨던 것
- **제보**: 강제 탈퇴 뒤 재접속하면 로그인 창이 아니라 **가입 과정**으로 들어가고, 학교를 검색하면 "교사 로그인이 만료되었습니다".
- **원인 둘**: ①탈퇴가 **저장소를 먼저 비우고** 로그아웃해서, 그 사이 클라이언트가 메모리의 세션을 다시 적어 넣었다 — 지워진 계정의 출입증이 브라우저에 남는다. ②PostgREST 는 토큰의 **서명만** 보므로 그 출입증으로도 통과한다. 프로필이 없으니 앱은 "이제 막 가입하는 사람" 으로 보고 가입 화면을 띄웠다. 반면 엣지 함수는 인증 서버에 물어보므로 401 이 났다 — 두 증상이 같은 뿌리였다.
- **고침**: 탈퇴는 **로그아웃 먼저, 저장소 비우기 나중**(`scope: 'local'` — 계정이 이미 없어 서버 로그아웃은 실패한다). 그리고 프로필을 못 읽으면 `signOutIfAccountGone()` 이 인증 서버에 물어, **401·403 으로 거절했을 때만** 이 브라우저를 정리한다. 통신이 끊긴 것과 헷갈리면 멀쩡한 선생님을 쫓아내므로 그 구분을 검사로 못 박았다. 이미 이 상태로 묶인 브라우저는 배포 뒤 첫 접속에서 스스로 풀린다.

### 3) 로그인 화면 현황을 1분 갱신으로
- **왜**(`20261284`): `20261282` 는 한 시간에 한 번만 세서 가입·학급 생성이 첫 화면에 한참 반영되지 않았다. 간격을 **60초**로 줄였다. 방문마다 세지는 않는다 — 봇까지 여는 화면이라 조회가 방문 수만큼 늘기 때문이다. 검사에 **30초~5분** 범위를 넣어 양쪽으로 벗어나지 못하게 했다.
- 확인: 임시 학급을 넣었다 되돌리며(롤백) 숫자가 592 → 593 으로 따라오는 것을 봤다.

- **검사**: 새 파일 `tests/withdrawnAccountRecovery.test.mjs` 4건 + `serviceStats` 갱신. 일부러 깨뜨려 확인(탈퇴 순서 되돌리기, 401·403 구분 없애기). `npm run test:all` 1024/1024, lint 오류 0, build 성공, `check:rpc-surface` 통과.

## 2026-09-13 — 가입 때 학교 검색이 실패하던 것: 두 숫자가 어긋나 있었다 (Claude)

- **제보**: 가입 화면에서 소속 학교명을 검색하면 `Edge Function returned a non-2xx status code`.
- **아니었던 것**: 나이스 키는 런타임에 있고(값 확인 안 함) 나이스 API 는 200 을 돌려준다. 배포된 함수는 저장소와 체크섬이 같다. 로그인한 교사 토큰으로 직접 부르면 결과가 정상으로 나온다 — 함수도 키도 멀쩡했다.
- **원인**: **화면 350ms · 서버 500ms**. `SchoolSearchField` 는 글자를 멈춘 지 350ms 뒤에 보내는데, 함수의 `SEARCH_MIN_INTERVAL_MS` 는 500ms 안에 두 번 오면 429 로 막는다. 학교 이름을 치다 잠깐씩 멈추면 그 사이 요청이 막혔다. **두 숫자가 다른 파일에 살아 한쪽만 고쳐도 아무 검사도 울지 않았다.**
- **가려져 있던 이유**: supabase-js 는 2xx 가 아니면 어떤 이유든 같은 한 문장만 준다. 서버는 "학교 검색은 천천히 이용해 주세요" 라고 적어 보냈는데 화면까지 오지 못했다.
- **고침**: ①대기 시간을 `SCHOOL_SEARCH_DEBOUNCE_MS`(700ms) 한 곳으로 모으고 화면이 그것을 쓴다. ②429 면 한 번은 **조용히 다시 묻는다** — 선생님 잘못이 아니라 오류로 보일 것이 아니다. ③그래도 실패하면 응답 본문의 이유를 꺼내 그대로 보여 준다.
- **검사**: `tests/schoolSearch.test.mjs` 4건 — 두 파일의 숫자를 **함께** 본다(화면 대기 > 서버 간격 + 100ms 여유). 네 가지로 일부러 깨뜨려 확인했다: 350ms 로 되돌리기(이 제보가 그대로 재현), 여유 50ms, 화면이 숫자를 직접 적기, 서버가 간격을 2초로 늘리기. `npm run test:all` 1020/1020, lint 오류 0, build 성공.

## 2026-09-13 — 동행 모드: 첫 학급 뒤 자동 이어감 · 패널 두 배 · 안내서 안내 보강 (Claude)

- **제보**: "새로 가입해도 따라하기가 바로 진행이 안 된다", "패널이 너무 작다", "안내서 안내를 보강해 달라".
- **찾은 원인**: 학급 목록을 **받는 동안** `classes` 가 빈 배열이라 이미 학급이 있는 선생님도 잠깐 "0개" 로 보였다. 그 틈에 환영 안내가 번쩍이거나 판단이 어긋난다. `classesLoaded`(= `!loadingClasses`)를 훅에 넘겨 **다 받은 뒤에만** 판단한다.
- **첫 학급 뒤 자동 이어감**: 학급이 생기는 순간 첫 걸음 카드가 사라져(카드는 학급 0개 화면에만 있다) 안내서로 들어가지 않는 한 다시 시작할 길이 없었다. **이번 접속에서 0 → 1 로 바뀌는 순간**만 잡아 동행 모드를 잇는다. "학급이 있으면 켠다" 로 두면 쓰고 계신 568명 전원에게 켜진다 — 검사로 못 박았다.
- **패널 두 배**: 340px → 640px, 제목 24px·설명 18.4px. 오른쪽 아래라 작으면 안 읽힌다는 제보.
- **안내서 안내 보강**: 환영 창이 8개 흐름을 **실제 목록으로** 보여 준다(흐름 이름 + 몇 단계인지). "안내서가 있습니다" 라고만 하면 무엇이 들었는지 몰라 열지 않는다. 어떻게 넘어가는지(자동/확인했어요)와 나중에 어디서 다시 여는지(오른쪽 위 버튼·흐름별 🧭·화면마다 ⓘ)도 적었다. 동행 패널에는 `📘 이 단계 자세히 보기` 를 더해, 따라 하다가 그 단계의 안내서를 바로 연다.
- **사용자가 스스로 푼 것**: "동행 모드가 3개뿐" → 흐름이 끝나면 `이어서 둘러보기` 로 다음 흐름이 이어진다는 것을 확인하셨다.
- **검사**: 19건(새로 4건) — 학급 목록을 다 받기 전 판단 금지 / 0→1 전환만 자동 시작 / 환영 창이 흐름 목록을 실제로 그리는가 / 패널에서 안내서를 여는가. 셋을 일부러 깨뜨려 잡히는 것까지 확인. `npm run test:all` 1016/1016, lint 오류 0, build 성공.
- **아직 못 밝힌 것**: 오늘 가입한 계정 셋 중 둘의 `teacher_tour_state` 가 `{}` 인 채로 남았고 `welcomeSeenAt` 도 비어 있다. 환영 창이 뜨지 않았는지, 뜬 뒤 아무것도 안 누른 것인지 기록만으로는 가릴 수 없었다. 첫 학급 자동 이어감이 들어가 **환영 창을 못 봐도 동행 모드는 이어진다**.

## 2026-09-13 — 로그인 화면에 서비스 현황 넉 줄 (Claude)

- **왜**: 사용자 제안 — 첫 화면에 "이 앱과 함께하고 있는 현황" 을 짧게 보여 준다. 처음 오는 선생님에게 "혼자 쓰는 도구가 아니다" 를 숫자로 전한다.
- **무엇**: 로그인 화면 아래에 넷 — 함께하는 선생님 567명 / 만들어진 학급 591개 / 글 쓰는 학생 4,229명 / 아이들이 낸 글 5,594편.
- **비로그인에게 길을 하나 여는 일이라 두 가지를 지켰다**: ①나가는 것은 **정수 넷**뿐이다 — 학교명·이름·학급명은 함수 밖으로 한 글자도 못 나간다. ②`service_stats` 표는 RLS 를 켜고 정책을 하나도 두지 않고 anon·authenticated 권한을 걷어 `get_service_stats_v1()` 로만 읽힌다(운영에서 anon 으로 직접 SELECT → `permission denied` 확인).
- **방문마다 세지 않는다**: 로그인 화면은 누구나·봇까지 여는 화면이라 그때그때 `count(*)` 를 돌리면 조회가 방문 수만큼 늘고 아무나 늘릴 수 있다. 한 줄짜리 표에 적어 두고 **한 시간에 한 번만** 실제로 센다. 동시에 몰려도 `pg_try_advisory_xact_lock` 으로 한 세션만 센다.
- **숫자의 뜻을 문구와 맞췄다**: 승인 취소된 교사는 "함께하는 선생님" 이 아니고, 지운 학급·학생은 세지 않고, "낸 글" 이라 적었으므로 쓰다 만 초안은 뺀다(`is_submitted`).
- **자리**: 로그인 버튼 **아래**다. 숫자가 늦게 도착하며 위에 끼어들면 버튼이 밀려 누르려던 손이 빗나간다. 못 읽으면 그 줄만 조용히 감춘다 — 현황 때문에 로그인이 막히면 안 된다.
- **검사**: `tests/serviceStats.test.mjs` 6건. 일부러 깨뜨려 확인하다가 **검사 구멍을 하나 찾았다** — 같은 계산이 마이그레이션에 두 번 나오는데(함수 안, 처음 채우는 UPDATE) 한 곳만 보고 있어서, 한 곳만 바꿨더니 통과했다. 모든 곳을 세도록 고쳤다. `npm run check:rpc-surface` 통과(anonExecute 에 부르는 파일 이름까지 적어 남김), `npm run test:all` 1012/1012, lint 오류 0, build 성공.
- **눈 확인**: 실제 로그인 화면에서 넷이 뜨고 로그인 버튼이 위에 있는 것, 400px 에서 2×2 로 접히고 가로 스크롤 없음 확인. 배포 뒤 운영(`끄적끄적아지트.site`)에서 RPC 200·현황 넷 표시·콘솔 오류 0 확인.
- **함께 고친 것**: 그동안 배포 확인을 `app.끄적끄적.kr` 로 했는데 그 주소는 **자비스**다. 같은 맥미니라 200 이 돌아와 몰랐다. 이 앱은 `끄적끄적아지트.site` 다 — PITFALLS 에 한 줄 남기고 앞 항목의 잘못된 문장을 정정했다.

## 2026-09-13 — 가입 환영 안내 + 35단계 모두에 테두리 + 이름을 `동행 모드` 로 (Claude)

- **왜**: 가입하자마자 동행 모드가 시작되면 "지금 뭘 시키는 건가" 부터 묻게 된다. 먼저 **활용 안내서가 있다는 것을 알리고** 따라 할지 고르게 해 달라는 요구. 또 테두리가 붙는 단계가 35개 중 4개뿐이라 나머지는 화면만 열릴 뿐 무엇을 보라는 것인지 짚어 주지 못했다.
- **환영 안내**(`TeacherWelcomeModal`): 8개 흐름 35단계가 있다는 것을 알리고 `동행 모드로 시작하기` / `활용 안내서 먼저 보기` / `나중에` 셋 중 고르게 한다. 본 시각은 `teacher_tour_state.welcomeSeenAt` 한 곳에 적어 다시 뜨지 않는다. **학급이 하나도 없는 계정에만** 뜬다 — 조건이 느슨하면 쓰고 계신 568명에게 어느 날 갑자기 환영 인사가 뜬다(검사로 못 박았다).
- **35단계 모두 테두리**: 이름표를 손으로 35개 적지 않는다. 단계는 이미 `target`(어느 화면으로 가는가)을 갖고 있으므로 거기서 이름을 **계산**하고(`tab:` / `tool:` / `module:`), 메뉴·학급운영도구 목록·놀이 카드에 같은 규칙으로 붙였다. 손으로 적는 이름표는 "메뉴가 아니라 그 안의 특정 버튼"을 가리켜야 하는 넷뿐이다(학급 만들기·학생 추가·글쓰기 설정·과제 만들기). 같은 이름표가 위 큰 메뉴와 아래 하위 메뉴에 함께 붙으므로, 눈에 보이는 것 중 **마지막**(더 구체적인 쪽)을 고른다.
- **이름을 화면에도**: 그동안 `동행 모드` 는 코드 주석에만 있고 화면에는 없었다. 사용자가 이 말로 부르므로 버튼을 `🧭 동행 모드로 시작하기`·`🧭 동행 모드로 따라 하기`·`🧭 동행 모드 다시 하기` 로 맞췄다.
- **검사**: 15건(새로 3건). ①모든 단계가 가리킬 자리를 갖고, 규칙으로 만든 이름표는 해당 목록 화면이 같은 규칙으로 붙이는가 ②이름표 규칙 문자열이 화면과 안내에서 같은가 ③환영 안내가 학급 있는 교사에게 뜨지 않는가. 셋 다 **일부러 깨뜨려 잡히는 것까지 확인**했다. `npm run test:all` 1006/1006, lint 오류 0, build 성공.
- **눈 확인**: `?dev-lab=teacher-tour` 에 환영 안내를 넣었다. 모달 → `동행 모드로 시작하기` → 곧바로 1단계, 모달 사라짐, 400px 가로 스크롤 없음, 콘솔 오류 0건.

## 2026-09-13 — 동행 모드를 8개 흐름 35단계 전체로 (Claude)

- **왜**: 1차 배포 뒤 사용자가 실계정으로 가입해 확인했다. 기록상 정상 작동했다 — 가입 10:51:40 → 학급 10:51:59(1단계 통과) → 학생 10:52:45(2단계 통과) → 10:53:20 `done`. 문제는 **3단계에서 끝나고 나머지 기능으로 이어지지 않는 것**이었다. "대부분의 기능을 한 번 체크하고 가게" 해 달라는 요구.
- **무엇**: 안내서의 **8개 흐름 35단계를 그대로 동행 모드로 자동 변환**한다(`TEACHER_GUIDE_JOURNEYS.map`). 단계를 손으로 옮겨 적지 않으므로 안내서에 단계를 더하면 동행 모드에도 저절로 생긴다.
- **기본을 `확인했어요` 로**: 35단계 대부분은 "이런 화면이 있다"를 한 번 보고 가는 단계다. 그런 단계까지 자동 판정으로 두면 아무것도 바꿀 생각이 없는 교사가 갇힌다. 결과가 DB 에 남는 **네 단계만**(학급·학생·과제) 실제 데이터로 넘어간다. 나머지는 화면만 열어 주고 안내서 설명을 보여 준 뒤 확인 버튼.
- **흐름 단위로 끊는다**: 35단계를 한 줄로 세우면 아무도 끝까지 못 간다. 흐름 하나가 끝나면 그 자리에서 `이어서 둘러보기` 로 **아직 안 본** 다음 흐름을 권하고, `나중에` 로 멈출 수 있다. 끝난 인사는 이번 접속에서만 뜬다(DB 의 `done` 으로 판단하면 다음 로그인마다 다시 뜬다).
- **안내서 목차에 ✅**: 따라 해본 흐름에 표가 남고 버튼이 `다시 따라 해보기` 로 바뀐다. 무엇을 아직 안 봤는지 한눈에 보인다.
- **이름표 하나 추가**: `mission-create`(MissionManager 의 `➕ 미션 만들기`). 검사가 "테두리 없이 자동 판정인 단계"를 잡아내 발견했다 — 과제 만들기는 자동 판정인데 가리킬 버튼이 없어 교사가 어디를 눌러야 할지 몰랐을 것이다.
- **검사**: 12건으로 늘었다. 새로 더한 셋 — ①안내서의 모든 흐름을 빠짐없이 따라 할 수 있는가(흐름·단계 수 일치, 모든 단계에 열어 줄 화면이 있는가) ②테두리 없는 단계는 반드시 ack 인가 ③끝낸 뒤 아직 안 본 다음 흐름을 권하는가. 셋 다 **일부러 깨뜨려 잡히는 것까지 확인**했다. `npm run test:all` 1003/1003, lint 오류 0, build 성공.
- **눈 확인**: `?dev-lab=teacher-tour` 에서 흐름을 고를 수 있게 했다. 처음 시작하기 3단계 → 끝 인사 → 이어서 → 첫 글쓰기 수업 4단계(과제 자동 판정 포함) → 끝, 10단계짜리 학급 운영까지 걸어 봤고 콘솔 오류 0건.

## 2026-09-13 — 교사 동행 모드(따라 하는 튜토리얼) 1차 (Claude, 배포 완료)

- **왜**: 안내서(8개 흐름·35단계)는 있는데 **읽고 끝난다**. 모달이라 열면 화면을 가리고 닫으면 안내가 사라져 "보면서 따라 하기"가 안 되고, 가입 직후에는 학급 0개 화면에 `ClassManager` 만 떠서 "이제 뭘 해야 하지"에 답하는 것이 없었다.
- **무엇**: 안내서를 **옆에 붙어 다니는 패널**로 재생한다. 덮개가 없고 테두리에 `pointer-events:none` 이라 본 화면을 그대로 쓴다. 1차는 `처음 시작하기` 3단계(학급 → 학생 → 글쓰기 설정)만. 가입한 날 35단계를 연달아 시키면 중간에 그만둔다.
- **다음 단계 판정**: 결과가 DB 에 남는 단계는 **실제 데이터**로 저절로 넘어가고(학급 1개·학생 1명), 아무것도 바꿀 필요 없는 단계(글쓰기 설정 둘러보기)만 `확인했어요` 로 넘긴다. 모두 자동 판정으로 두면 **설정을 건드릴 생각이 없는 교사가 갇힌다**.
- **새 콘텐츠를 쓰지 않았다**: `teacherTour.js` 는 journey 의 `stepId` 를 가리킬 뿐이고 제목·설명·이동 화면은 안내서 원본에서 읽는다. 더한 것은 `anchor`(테두리 자리)·`hint`(명령문 한 줄)·`done`(넘어갈 조건) 셋뿐.
- **파일**: `guides/teacherTour.js`(순수 상태 기계·이름표 원본), `hooks/useTeacherTour.js`, `lib/teacherTourStore.js`, `components/teacher/TeacherTourCompanion.*`, `TeacherFirstStepsCard.*`, 이름표 3곳(`ClassManager`·`StudentManagerHeader`·`TeacherWritingEditorManager`), 안내서 `따라 해보기` 버튼, `20261281_teacher_tour_state.sql`(profiles 에 jsonb 한 열 — 학교·집 컴퓨터를 오가므로 localStorage 가 아니다), 미리보기 `?dev-lab=teacher-tour`.
- **학생 수는 그 단계일 때만 센다**: 동행 모드를 쓰지 않는 교사에게는 조회가 한 번도 붙지 않는다. 학급을 바꾸면 앞 학급 수로 단계가 열리지 않도록 학급 이름표를 함께 들고 다닌다.
- **검사/검증**: `tests/teacherTour.test.mjs` 9건 — 그중 **이름표가 실제 화면에 붙어 있는지**가 핵심이다(화면을 옮기면 안내는 그대로 뜨는데 가리킬 곳이 없어지고 오류도 안 난다). 이름표 떼기·ack 단계를 자동 판정으로 바꾸기·삭제된 학생까지 세기 셋을 **일부러 깨뜨려 검사가 잡는 것까지 확인**했다. `npm run test:all` 1000/1000, lint 오류 0, build 성공, `npm run checklist` 통과. 미리보기에서 3단계 자동 진행·테두리 이동·400px 가로 스크롤 없음·콘솔 오류 0 확인.
- **배포**: 처음에는 9/21 관문 주를 피해 `feature/teacher-tour` 가지에 두었으나, **오늘(일요일) 올리면 관문보다 8일 앞서 나가 두 변경이 더 깔끔하게 갈린다**는 판단으로 사용자가 즉시 배포를 결정했다. main 이 그사이 움직이지 않아 빨리감기 병합 → `npm run migrate` 로 `20261281` 먼저 적용(열·제약 확인, 기존 569명 기본값 `{}`) → 푸시 → 자동 배포 성공. 서빙 번들에 `따라 하며 시작하기`·`따라 해보기`·`data-tour`·`teacher_tour_state` 가 모두 들어간 것으로 확인했다. (정정: 이날 함께 적은 "운영 주소 HTTP 200" 은 `app.끄적끄적.kr` 를 본 것인데 그 주소는 **자비스**다. 이 앱은 `끄적끄적아지트.site` 다 — 번들 확인만 유효했다.)
- **기존 교사에게 바뀌는 것**: 안내서 안의 `🧭 따라 해보기` 버튼 하나뿐이다. 첫 걸음 카드는 학급이 0개인 계정에만 뜨므로 568명에게는 보이지 않는다.
- **다음(2차)**: `첫 글쓰기 수업 운영하기` 4단계를 학급·학생이 준비된 교사에게 따로 권하기. 실제 교사 계정에서 가입 직후 흐름 눈 확인.

## 2026-09-11 — 약관 동의를 이력 표로: 첫 동의(소급) + 개정판 추가 동의 (Claude)
- **왜 바로 뒤에 또**: `20261279` 를 사용자가 적용한 뒤 요구가 더해졌다 — 기존 교사는 첫 동의(가입일 소급)를 그대로 두고, 9/14 개정판에 다음 로그인 때 **추가로** 동의하며 둘 다 남긴다. 열 세 개로는 한 번밖에 못 적으므로 **이력 표**가 맞다. 적용된 마이그레이션은 고치지 않는다는 규칙대로 `20261279` 는 되돌리고(잠시 고쳤다가 체크섬 경고가 떠서 `git checkout`) 새 장 `20261280` 을 썼다.
- **변경**: `policy_consents(user_id, policy_version, kind[signup|reconsent|backfill], terms_agreed_at, privacy_agreed_at)` + UNIQUE(user, version). `20261279` 가 열에 소급한 568명을 표로 옮기고(옮긴 수를 확인한 뒤에야) 열 세 개를 지웠다. `record_policy_consent_v1(p_version, p_kind)` 로 서명 변경(옛 서명 DROP), `get_my_policy_consent_v1()` 추가. 표는 브라우저 역할에 닫고 RPC 로만.
- **관문**: `StudentConsentGate` 를 한 화면 두 부분(①바뀐 약관·처리방침 동의 — `/terms`·`/privacy` 새 탭 링크, ②학급 동의서 확인)으로 합쳤다. 각각 필요할 때만 보이고 셋 다 체크해야 열린다. `usePendingStudentConsent` 가 두 조건을 함께 묻고, **개정 시행일(POLICY_VERSION)부터만** 관문을 띄운다 — 배포일과 시행일이 달라도 화면은 시행일에 맞춰 열린다.
- **결과/검증**: `20261280` 롤백 스모크 통과(소급 568명 표 이전·추가 동의가 첫 동의를 안 덮음·같은 판 중복 방지·클라이언트 backfill 차단·anon 차단·표 비공개). `npm run test:all` 991/991, lint 깨끗, build 성공. 미리보기로 체크박스 3개·잠금 순서(약관 둘만 → 잠김, 셋 → 열림)·링크 2개 확인.
- **결과/후속**: 사용자가 `20261280` 적용(소급 568행·옛 열 제거·표 비공개 운영 DB 에서 확인). 처리방침 제12조가 **시행 7일 전 공지**를 약속하므로 오늘(9/11) 공지 기준 9/14 는 사흘뿐이라 규칙 위반 → 사용자 결정으로 시행일을 **2026-09-21(월)** 로 옮겼다(`POLICY_VERSION`·약관·처리방침·검사 일괄, 9/14 잔존 0건 확인). 판 이름은 로그인 때 기록되므로 DB 는 손대지 않았다. 사전 공지사항 초안은 대화로 전달 — 관리자 공지 등록은 사용자 판단.

## 2026-09-11 — 약관 동의 기록·학생 개인정보 동의서 확인·처리방침 정정 (Claude, 배포 전 검토 대기)
- **왜**: ①가입 화면에 약관 동의 체크가 있지만 **기록이 어디에도 남지 않았다**. ②처리방침은 "학생 가명 사용이 원칙"이라 적혀 있는데 실제로는 학생 4,229명 중 3,658명(86%)이 실명이다. 실명을 쓰려면 학교가 학기초에 법정대리인 동의서를 받아야 하고, 서비스는 그 확인을 교사에게 받아야 한다. ③처리방침의 수집 항목이 실제(교사: 이름·학교 필수, 학생: 이름·글)와 달랐다.
- **사용자 결정**: 기존 교사 동의 기록은 가입일로 소급 / 기존 학급 591개는 다음 로그인 때 모두 확인 / 처리방침 문구는 사용자가 확인 뒤 배포 / 시행일은 다음 월요일(9/14) → 7일 공지 규칙 때문에 **9/21** 로 변경.
- **변경**:
  - `20261279_policy_consent_records.sql` — `profiles.terms_agreed_at·privacy_agreed_at·agreed_policy_version`(기존 568명은 `created_at`·`'backfill'` 로 소급), `classes.student_consent_confirmed_at·_by`, RPC `record_policy_consent_v1`·`confirm_class_student_consent_v1`(시각은 서버가 찍고 본인 학급만, 비로그인 차단). 스모크는 남의 학급 확인 시도까지 막히는지 본다.
  - `src/constants/policyVersion.js` — 판(시행일)의 단 하나의 자리. `tests/policyConsent.test.mjs` 가 처리방침 본문의 시행일과 대조한다.
  - `TeacherProfileSetup.jsx` 가입 때 `record_policy_consent_v1` 호출 / `StudentConsentGate.jsx` + `usePendingStudentConsent.js` 로그인 관문(미확인 학급만 가볍게 따로 조회, 관리자 제외) / `ClassManager.jsx` 학급 만들 때 체크 필수 + 기록. 확인 문구는 `STUDENT_CONSENT_STATEMENT` 한 곳.
  - `PrivacyPolicy.jsx`·`TermsOfService.jsx` — 가명 원칙·실명 금지 문구를 **학교 동의서 근거**로 교체, 수집 항목을 사실대로(교사 이름·학교 필수, 전화 선택; 학생 이름·출석번호·글·댓글·독서록·일기), 동의 기록 항목·보유기간 추가, 개정 이력·시행일 9/14. **문구는 사용자 검토 대기.**
  - `?dev-lab=student-consent-gate` 미리보기.
- **결과/검증**: 롤백 스모크 통과(소급 기록·판 형식 검증·남의 학급 차단·anon 차단). `npm run test:all` 990/990, `npm run lint` 깨끗, `npm run build` 성공. 관문을 PC·태블릿·모바일에서 띄워 체크 전 잠김→체크 후 열림, 가로 넘침 0px 확인. 기존 검사 2건(지난 개정 날짜 고정)을 새 개정에 맞췄다.
- **짚어 둔 것**: 처리방침 제12조가 "시행 7일 전 공지"인데 9/14 는 사흘 뒤다. 7일을 지키려면 9/21. 시행일은 `policyVersion.js` 한 줄이라 바꾸기 쉽다 — 사용자 판단 대기.
- **남은 것 / 다음**: 사용자가 처리방침·약관 문구 확인 → 시행일 확정 → 마이그레이션 적용(`npm run migrate`) → 배포 → 공지.

## 2026-09-11 — 자바스크립트 전 첫 화면을 진짜 첫 화면과 같은 모양으로 (Claude)
- **배경**: "주소를 넣으면 선정기준·개인정보·약관이 모인 페이지가 떴다가 로그인창으로 리디렉션된다"는 제보.
  확인해 보니 **리디렉션이 아니었다.** `index.html` 안에 검색 로봇·느린 연결용으로 박아 둔 정적
  덩어리(`.search-intro`)가 React 가 뜰 때까지 보이는 것이었고, 그게 첫 화면과 전혀 다르게 생겨서
  "다른 페이지로 튕겼다"로 읽혔다. 뒤로가기 동작은 정상이었다(첫 화면으로 돌아가며, 그 세 링크는 푸터).
- **왜 지금 드러났나**: 어제(09-10) 글꼴 CSS 를 `<head>` 에서 뺀 변경 때문이다. 같은 조건(글꼴 서버
  1.5초 지연)에서 재 보니 **첫 그림 1584ms → 72ms**, 로그인창까지 2591ms → 1671ms 로 빨라졌지만,
  전에는 흰 화면 뒤에 가려져 있던 깜빡임이 949ms → 1580ms 로 **드러났다.** 느려진 게 아니라 보이게 됐다.
- **한 일**: 정적 덩어리를 첫 화면과 같은 모양으로 다시 만들었다(선택지 B). 글은 그대로 두어 검색
  노출 계약을 지켰다.
  · 상자 구조를 같은 순서로 겹쳤다 — `Layout`(세로 가운데·2rem) → `.landing-shell` → `.landing-card`.
  · 카드 안도 진짜 화면의 다섯 칸을 같은 높이로 따라간다(그림 → 제목 → 들어가기 → 활동 → 공개 안내).
    로그인 오류 문구가 차지하던 빈 자리까지 남겼다 — 없으면 아래 칸이 통째로 위로 당겨진다.
  · 들어가기 카드 두 장은 **자리만** 흐리게 잡아 둔다. 진짜 버튼처럼 만들면 그 1초 사이에 눌러 보고
    아무 일도 안 일어나 고장으로 읽힌다. 화면 읽어 주는 기계에는 `aria-hidden` 으로 숨겼다.
  · 같은 히어로 그림을 미리 받아 두어, React 가 뜰 때 그림을 다시 기다리지 않는다.
- **결과/검증**: 갈아 끼우기 전후 **위치 차이 0px**(처음 111px). 그림 상자·제목·들어가기 카드 세 곳의
  x·y·너비가 모두 일치한다. 자바스크립트를 끈 화면과 평소 화면을 실제로 띄워 좌표로 쟀고 그림도 봤다.
- **찾아 고친 것 둘**:
  · `margin: 0` 초기화에 요소 이름을 섞었더니(`.search-intro p`) 클래스 하나짜리 개별 여백(7·3·8px)을
    우선순위로 덮어, 카드가 정확히 18px 짧아져 있었다. 각자 적는 방식으로 바꿨다.
  · 전역 CSS 의 `h1` 은 그라데이션 글자다. **번들 CSS 는 자바스크립트가 없어도 적용되므로** 정적
    제목이 파랗게 떴다. 진짜 첫 화면이 하는 것과 똑같이 꺼 주었다(눈으로 보지 않았으면 못 잡았다).
- **함께 정리**: 어제 받아온 커밋 둘의 문제를 고쳤다(둘 다 내가 만든 것이 아니다).
  · `classAgit.css` 에 닫는 중괄호가 하나 더 있어 빌드가 `Unexpected "}"` 경고를 냈다.
  · `aiModelSingleSource.test.mjs` 가 **윈도우에서만 실패**했다. `path.join` 이 역슬래시로 이어
    자기 자신·면제 목록 비교가 한 번도 맞지 않았다. 배포(리눅스)는 통과하므로 아무도 몰랐지만,
    로컬 푸시 전 관문이 막혀 다음 푸시가 안 됐을 자리다. 남은 린트 경고 3건도 같이 껐다.
- **변경**: `index.html`, `public/search-intro.css`(다시 씀), `tests/searchDiscovery.test.mjs`,
  `src/modules/class-agit/classAgit.css`, `tests/aiModelSingleSource.test.mjs`. DB·인프라 변경 없음.
- **값이 두 곳에 있는 문제**: 정적 파일은 번들 밖이라 `LandingPage.css` 를 가져다 쓸 수 없다. 그래서
  **두 곳을 한꺼번에 보는 검사**를 `searchDiscovery.test.mjs` 에 두었다 — 제목 글, 그림 비율, 상자
  너비·모서리·바탕, 카드 높이, 오류 문구 자리, 그라데이션 해제, 그리고 정적 CSS 가 `.search-intro`
  밖으로 새지 않는지까지 본다. 다섯 가지로 일부러 망가뜨려 실패하는 것을 확인했다.
- **남은 것 / 다음**: 운영 배포 뒤 실제 기기에서 주소를 처음 입력해 깜빡임이 사라졌는지 본다.
  정적 덩어리는 이제 첫 화면을 따라가므로, **첫 화면 모양을 바꾸면 이 덩어리도 같이 봐야 한다**
  (검사가 막아 주지만 왜 막혔는지 알아야 고칠 수 있다).

## 지난 기록

이 파일에는 **최근 것만** 둔다. 통째로 읽으면 한 세션 예산을 통째로 쓴다.

| 기간 | 보관소 |
|---|---|
| 2026년 9월 10일까지 | [docs/worklog/2026-09.md](docs/worklog/2026-09.md) |
| 2026년 8월 | [docs/worklog/2026-08.md](docs/worklog/2026-08.md) |
| 2026년 7월 | [docs/worklog/2026-07.md](docs/worklog/2026-07.md) |

옛일을 찾을 때는 열어 읽지 말고 낱말로 찾는다 — `grep -n "찾을 말" docs/worklog/*.md`
