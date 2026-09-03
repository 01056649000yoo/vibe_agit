# 맞춤법 배움 데이터 — `시험해 보기` 탭 계획 (2026-09-02 수립, 미착수)

## 무엇을 만드나

`설정 → 맞춤법 배움 데이터`의 기존 세 탭(`살펴보기`·`항목 만들기`·`데이터`) 옆에 네 번째 탭
**`시험해 보기`** 를 둔다. 교사가 문장을 쳐 보면 학생 글쓰기 창과 똑같은 밑줄이 그어지고,
밑줄을 누르면 학생과 똑같이 맞춤법 수첩이 열린다. **맞춤법 검사가 잘 도는지 점검하는 확인 창**이다.

## 정해진 것

| | 결정 |
|---|---|
| AI 맞춤법 검사 | **넣지 않는다.** 비용이 나가고 이 탭의 목적(밑줄 점검)과 다르다. |
| 보여 줄 흐름 | 밑줄 → 누르면 수첩으로 넘어가는 과정까지. |
| 승인 전 항목 | **함께 확인할 수 있게 한다.** 승인 전 항목이 제대로 잡히는지 보려는 것이 목적이므로. |
| 저장 | 하지 않는다. 저장·제출·글자 수 정책 없는 빈 종이. |

## 조사로 확인된 사실 (2026-09-02, 재조사 불필요)

### 그대로 쓸 수 있는 것

- 학생 글 입력창은 `src/components/writing/WritingEditorFields.jsx`, 그 안이
  `src/modules/writing/tools/spelling-lookup/SpellingUnderlineTextarea.jsx`. **둘 다 독립 부품**이다.
- 밑줄을 눌러 수첩을 여는 것은 커스텀 이벤트(`agit:spelling-lookup-open`)이고
  `src/modules/writing/tools/WritingToolHost.jsx`가 받는다. 학생 화면에 매여 있지 않다.
- 선례: `src/dev/UiPreview.jsx`가 이미 학생 셸 밖에서 `WritingEditorFields`와 `WritingToolHost`를 쓴다.
- `WritingEditorSettingsContext`는 Provider 없이도 기본값을 주지만, 학급 설정을 반영하려면
  `WritingEditorSettingsProvider classId={...}`로 감싸는 편이 낫다.

### ⚠️ 함정 1 — 그냥 붙이면 정작 확인하려는 것이 안 보인다

`SpellingUnderlineTextarea`는 학급 항목을 `spellingLearningApi.getStudentEntries()` →
`get_student_spelling_entries_v2()` 로 가져온다. 이 함수는

```sql
FROM public.students student
WHERE student.auth_id = auth.uid()
```

로 **로그인한 사람의 학생 기록**에서 학급을 찾는다. 교사 계정은 `students`에 없으므로 결과가 빈 배열이다.
→ 그대로 붙이면 기본 자료 500개만 잡히고 **학급 항목은 하나도 안 잡힌다.**
`SpellingLookupTool.jsx:123`도 같은 함수를 부르므로 수첩 쪽도 같은 문제를 겪는다.

### ⚠️ 함정 2 — 교사의 시험이 학생 통계를 오염시킨다

`SpellingLookupTool`은 닫힐 때 `flushSpellingSearches()`(`searchSession.js:33`)를 부르고,
그것이 `spellingLearningApi.recordSearchBatch()` → `record_spelling_search_batch_v2` 로 **DB에 쓴다.**

교사가 시험 삼아 검색한 표현이 학생 검색 집계에 섞이면, 바로 그 집계를 쓰는 `살펴보기` 탭의
추천 항목이 망가진다. **미리보기에서는 검색 기록 저장을 반드시 꺼야 한다.**

## 해결 방향 — 새 DB 함수 없이 된다

교사 화면이 이미 부르는 `get_spelling_learning_workspace_v3`가 학급 항목(`entries`, 상태 포함)과
공통 항목(`common_entries`)을 **둘 다** 들고 있다. 탭이 이미 메모리에 가진 자료로 목록을 만든다.

- 새 RPC·새 표 없음, **요청 한 건도 늘지 않음**
- 대가: 학생 함수의 병합 규칙(승인된 것만 · 공통 우선 · 틀린 표현 소문자·공백 정리 기준 중복 제거 ·
  최대 100개)이 SQL과 JS 두 곳에 생긴다. 규칙을 함수 하나로 모으고 검사로 못 박아 상쇄한다.

## 작업 순서

### 1단계 — 목록 만들기 규칙 (DB 변경 없음)

`src/modules/writing/spelling-learning/previewEntries.js` 새 파일.

```js
buildPreviewEntries(workspace, { includePending = false })
```

- `includePending: false` → 학생과 똑같이: `status='approved'` 만, 공통 우선, 중복 제거, 100개 상한
- `includePending: true` → 학급의 승인 전 항목까지 포함(공통은 그대로 승인된 것만)
- 각 항목에 `origin`(`common` | `class` | `class-pending`)을 붙여 화면이 출처를 표시할 수 있게 한다

단위 검사로 네 규칙(승인 필터 · 공통 우선 · 중복 제거 키 · 100개 상한)을 각각 고정한다.
`get_student_spelling_entries_v2` 와 같은 규칙이라는 것을 주석에 명시한다.

### 2단계 — 부품에 목록을 주입할 수 있게 (학생 화면 동작 변화 0)

`SpellingUnderlineTextarea`와 `SpellingLookupTool`에 선택 prop을 추가한다.

- `classEntries` — 주면 그것을 쓰고 학생 RPC를 **부르지 않는다.** 안 주면 지금과 완전히 동일.
- `recordSearches={false}` — 수첩이 검색 기록을 저장하지 않게 한다(함정 2). 기본값은 지금처럼 저장.

두 prop 모두 기본값이 현재 동작이므로 학생 화면은 한 글자도 바뀌지 않는다.
회귀 검사로 "학생 화면은 prop 없이 그대로 쓴다"를 못 박는다.

### 3단계 — `시험해 보기` 탭

`spelling-learning/TeacherEntry.jsx`의 탭 목록에 추가(현재 `is-three` 클래스를 `is-four`로).
탭 본체는 별도 파일 `SpellingPreviewPanel.jsx`로 분리한다(TeacherEntry가 이미 334줄).

구성:

```
┌──────────────────────────────┬──────────────────────┐
│ [ ] 승인 전 항목도 포함        │ 잡힌 표현            │
│                              │                      │
│ (학생과 같은 입력창)           │ 며칠 → 몇일          │
│  밑줄을 누르면 수첩이 열립니다  │   기본 자료 500      │
│                              │ 웬지 → 왠지          │
│                              │   우리 학급 · 승인 전 │
│                              │                      │
│ [예문 넣어 보기] [비우기]      │ 지금 목록: 공통 12 · │
│                              │ 학급 3(승인 전 1)     │
└──────────────────────────────┴──────────────────────┘
```

- **잡힌 표현 목록**이 이 탭의 핵심이다. 어떤 항목이 왜 잡혔는지(기본 500 / 공통 / 이 학급 / 승인 전)를
  보여 줘야 "왜 안 잡히지?"를 바로 알 수 있다.
- `승인 전 항목도 포함`을 켰을 때는 **학생 화면과 다르다는 표시**를 눈에 띄게 단다.
- `예문 넣어 보기` — `항목 만들기` 탭에서 방금 만든 항목의 예문을 입력창에 넣는다.
- 저장·제출·자동 저장 없음. `WritingToolHost`를 함께 두어 수첩이 열리게 한다.

### 4단계 — 문서·검사

- 교사 도움말(`settings:module:spelling-learning`)에 탭 설명과 "여기서 검색한 것은 학생 통계에 남지 않는다"
- 모듈 README에 "교사 미리보기는 학생 RPC를 부르지 않고 작업공간 자료로 같은 목록을 만든다"
- 회귀 검사 + 변이 검증(일부러 되돌렸을 때 잡히는지)

## 검사에서 반드시 잡아야 할 것

1. 미리보기가 `getStudentEntries`를 부르지 않는다 (부르면 교사에게 빈 목록이 온다)
2. 미리보기에서 검색 기록을 저장하지 않는다 (`recordSearchBatch` 호출 없음)
3. 학생 화면은 새 prop 없이 지금 그대로 쓴다
4. `buildPreviewEntries`의 네 규칙 각각
5. AI 맞춤법 검사가 이 탭에 없다

## 예상 규모

DB 변경 없음. 새 파일 2개(`previewEntries.js`, `SpellingPreviewPanel.jsx`),
기존 파일 수정 4~5개(부품 2개 + TeacherEntry + CSS + 도움말), 검사 1묶음.
