# 학생 입력기 모듈 (`student-input`)

학생이 글을 쓰는 칸 + 초등 맞춤법 검사기를 **한 부품**으로 묶었다(2026-10-08, 선생님 결정).
학생이 글을 입력하는 화면을 새로 만들 때는 직접 `<textarea>`·`<input>` 을 쓰지 않고 이 모듈을 그대로 넣는다.

## 바로 쓰기

```jsx
import { StudentTextArea, StudentTextField } from '../../modules/writing/student-input';

<StudentTextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
<StudentTextArea value={body} onChange={(e) => setBody(e.target.value)} rows={8} autoGrow />
```

이것만으로 따라오는 것:

- 빨간 물결 밑줄: 빠른 규칙 + 기본 자료 500개 + 공통·반별 자료(관리자가 게시하면 재배포 없이 반영)
- 본문 아래 `확인해 볼 표현` 칩 → 누르면 맞춤법 수첩이 열리며 고칠 말을 먼저 보여 준다
- 학급 글쓰기 설정의 `맞춤법 수첩` 켜기/끄기를 그대로 따른다
- 태블릿·모바일 정렬(밑줄층과 입력창 글자 배치 고정, iOS 배경·안드로이드 글자 확대 막기, 관성 스크롤 따라가기)
- 타이핑이 밀리지 않게 손을 멈춘 뒤(350ms) 훑기, 조합형(NFD) 글자 맞추기
- 학생 글을 바꾸지 않는다. 기기 안에서만 검사하고 글을 서버로 보내지 않는다

`textarea`·`input` 이 받는 속성(onChange·placeholder·rows·maxLength·disabled·ref…)은 그대로 넘어간다.

## 더 받는 속성

| 속성 | 값 | 기본 | 쓰는 때 |
|---|---|---|---|
| `spelling` | `'class'` · `'on'` · `'off'` | `'class'` | 학급 설정과 상관없이 늘 켜거나 끌 때 |
| `spellingEntries` | `'student'` · 배열 · `false` | `'student'` | 교사 미리보기처럼 학생 자료를 받을 수 없는 화면은 `false` |
| `onIssueClick` | `(issue) => void` | 수첩 열기 | 칩을 눌렀을 때 다른 일을 할 때(본문용만) |
| `showIssueNotice` | 참/거짓 | 참 | 칩 줄을 숨길 때(본문용만) |
| `autoGrow` | 참/거짓 | 거짓 | 글이 길어지는 만큼 세로로 늘릴 때(본문용만) |
| `containerStyle` | 스타일 | — | 바깥 상자 스타일(제목용만) |

학급 설정을 따르려면 화면이 `WritingEditorSettingsProvider`(`editor-settings/`) 안에 있어야 한다. 밖이면 기본값(켬)이다.
칩의 기본 동작(수첩 열기)은 화면에 맞춤법 수첩 도구(`tools/spelling-lookup`)가 있을 때만 무언가를 연다.

## 화면 없이 검사만

```js
import { checkSpelling } from './checker/spellingEngine.js';
import { findElementarySpellingIssues } from './checker/elementarySpellingEntries.js';

checkSpelling(text, { elementaryDetector: findElementarySpellingIssues, entries });
// → [{ start, end, text, wrong, right, label, entryId }]
```

React 화면에서 직접 그리고 싶으면 `useSpellingCheck(value, { enabled, entries, delayMs })` 훅을 쓴다.
채점표(`scripts/spelling-scorecard.mjs`)·회색 줄 기록(`scripts/spelling-shadow.mjs`)도 이 엔진 하나로
"학생에게 보이는 빨간 줄"을 구한다 — 빨간 줄을 따로 합치는 코드를 새로 만들지 않는다(`studentInputModule` 검사가 본다).

## 파일

| 자리 | 하는 일 |
|---|---|
| `index.js` | 공개 창구. 다른 화면은 여기서만 가져온다 |
| `StudentTextArea.jsx` · `StudentTextField.jsx` · `StudentTextInput.css` | 여러 줄 · 한 줄 입력기와 밑줄층 |
| `useSpellingSwitch.js` | 학급 설정 따르기·칩 누름 동작 |
| `checker/spellingEngine.js` | 세 겹 합치기(순수 함수, 노드 스크립트도 씀) |
| `checker/useSpellingCheck.js` | 자료 받기·손 멈춤 기다리기·NFC → 밑줄 자리 |
| `checker/spellingDetectionRules.js` | ① 빠른 규칙(띄어쓰기·자주 틀리는 말) |
| `checker/catalog/` · `elementarySpellingEntries.js` · `elementarySpellingDetectorLoader.js` | ② 기본 자료 500개(분류 파일 여섯 개, 뒤에서 받는 청크) |
| `checker/classSpellingDetection.js` · `entryCache.js` · `candidateIndex.js` | ③ 공통·반별 자료로 찾기, 기기 저장·바뀐 것만 받기, 공용 후보 색인 |

맞춤법 수첩(`tools/spelling-lookup/`)·교사 자료 화면(`spelling-learning/`)·인형뽑기 퀴즈는 이 모듈의 자료를 **가져다 쓴다**.
자료를 늘리는 규칙은 `spelling-learning/README.md`, 분류 규칙은 `checker/catalog/README.md`.

## 다음에 붙일 것

회색 점선 `한번 살펴볼까요?`(Kiwi·hunspell·MeCab 교차 확인, 맥미니 서버)는 지금 기록만 한다(`services/spelling-analyzer/`).
화면에 붙일 때는 이 모듈의 `useSpellingCheck` 에 서버 결과를 더하고 밑줄층에 두 번째 표시를 그린다 — 화면들은 고칠 필요가 없다.
