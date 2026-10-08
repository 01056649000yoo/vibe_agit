# 학생 입력기 모듈 (`student-input`)

학생이 글을 쓰는 칸 + 초등 맞춤법 검사기 **전부**를 한 모듈로 묶었다(2026-10-08, 선생님 결정).
학생이 글을 입력하는 화면을 새로 만들 때는 직접 `<textarea>`·`<input>` 을 쓰지 않고 이 모듈을 그대로 넣는다.

## 바로 쓰기

```jsx
import { StudentTextArea, StudentTextField } from '../../modules/writing/student-input';

<StudentTextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
<StudentTextArea value={body} onChange={(e) => setBody(e.target.value)} rows={8} autoGrow />
```

이것만으로 따라오는 것:

| 표시 | 뜻 | 어디서 찾나 | 켜기 |
|---|---|---|---|
| 빨간 물결 〰 | **틀렸어요** | ① 빠른 규칙 ② 기본 자료 500개 ③ 공통·반별 자료(관리자가 게시하면 재배포 없이 반영) — 기기 안 | 학급 설정 `맞춤법 수첩`(처음 값 켬) |
| (빨간 물결) | 검토 중 자료 862개 | ②′ `checker/pending/` | `pending/config.js` 스위치(**꺼짐**, 학생 기기는 받지도 않음) |
| 회색 점선 ┈ | **한번 살펴볼까요?** | 맥미니 분석 창구(Kiwi·hunspell·MeCab 교차 확인) — 글은 맥미니 밖으로 안 나감 | 학급 설정 `한번 살펴볼까요?`(처음 값 켬, 2026-10-08~) |

- 본문 아래 `확인해 볼 표현` 칩(빨간 물결) → 맞춤법 수첩이 열리며 고칠 말을 먼저 보여 준다.
- 그 아래 `한번 살펴볼까요?` 칩(회색 점선) → 까닭 한 줄과 `[이렇게 고치기]`·`[그대로 두기]`. 처음 한 번은 수호룡이 뜻을 알려 준다.
  `이렇게 고치기` 는 학생이 누를 때만 그 자리를 바꾸고(부모 화면의 onChange·자동 저장을 그대로 탄다), 고른 결과만 학급 단위로 기록한다.
- 빨간 물결이 있는 자리에는 회색 점선을 긋지 않는다. 회색 점선 창구가 꺼져 있어도 빨간 물결은 그대로다.
- 태블릿·모바일 정렬(밑줄층과 입력창 글자 배치 고정, iOS 배경·안드로이드 글자 확대 막기, 관성 스크롤 따라가기).
- 타이핑이 밀리지 않게 손을 멈춘 뒤 훑기(빨간 350ms, 회색 1.2초·바뀐 문단만), 조합형(NFD) 글자 맞추기.

`textarea`·`input` 이 받는 속성(onChange·placeholder·rows·maxLength·disabled·ref…)은 그대로 넘어간다.

## 더 받는 속성

| 속성 | 값 | 기본 | 쓰는 때 |
|---|---|---|---|
| `spelling` | `'class'` · `'on'` · `'off'` | `'class'` | 빨간 물결을 학급 설정과 상관없이 늘 켜거나 끌 때 |
| `spellingEntries` | `'student'` · 배열 · `false` | `'student'` | 교사 미리보기처럼 학생 자료를 받을 수 없는 화면은 `false` |
| `spellingPending` | 참/거짓 | 스위치 값 | 검토 중 자료를 이 칸에서만 켜 볼 때(실험실) |
| `grayLine` | `'class'` · `'on'` · `'off'` | `'class'` | 회색 점선(본문용만). 제목 칸에는 긋지 않는다 |
| `grayLineSource` | 함수 | — | 실험실 흉내 전용 — 서버 대신 부른다(학생 화면에서는 주지 않는다, 기록도 안 함) |
| `onIssueClick` | `(issue) => void` | 수첩 열기 | 빨간 물결 칩을 눌렀을 때 다른 일을 할 때(본문용만) |
| `showIssueNotice` | 참/거짓 | 참 | 칩 줄을 모두 숨길 때(본문용만) |
| `autoGrow` | 참/거짓 | 거짓 | 글이 길어지는 만큼 세로로 늘릴 때(본문용만) |
| `containerStyle` | 스타일 | — | 바깥 상자 스타일(제목용만) |

학급 설정을 따르려면 화면이 `WritingEditorSettingsProvider`(`editor-settings/`) 안에 있어야 한다. 밖이면 기본값(둘 다 켬)이다.
직접 써 보기: `?dev-lab=student-input`(검토 중 자료·회색 점선 흉내를 이 화면에서만 켤 수 있다).

## 화면 없이 검사만

```js
import { checkSpelling } from './checker/spellingEngine.js';
import { findElementarySpellingIssues } from './checker/elementarySpellingEntries.js';

checkSpelling(text, { elementaryDetector: findElementarySpellingIssues, entries });
// → [{ start, end, text, wrong, right, label, entryId }]
```

React 화면에서 직접 그리고 싶으면 `useSpellingCheck(value, { enabled, entries, delayMs, pending })`·`useLookCloser(text, { enabled })` 훅을 쓴다.
채점표(`scripts/spelling-scorecard.mjs [--pending]`)·회색 줄 기록(`scripts/spelling-shadow.mjs`)도 이 엔진 하나로
"학생에게 보이는 빨간 줄"을 구한다 — 빨간 줄을 따로 합치는 코드를 새로 만들지 않는다(`studentInputModule` 검사가 본다).

## 파일

| 자리 | 하는 일 |
|---|---|
| `index.js` | 공개 창구. 다른 화면은 여기서만 가져온다 |
| `StudentTextArea.jsx` · `StudentTextField.jsx` · `StudentTextInput.css` | 여러 줄 · 한 줄 입력기와 밑줄층 |
| `GrayLinePanel.jsx` | 회색 점선 칩·까닭·고치기/그대로 두기·수호룡 설명 |
| `useSpellingSwitch.js` | 학급 설정 따르기(빨간·회색)·칩 누름 동작 |
| `checker/spellingEngine.js` | 겹 합치기(순수 함수, 노드 스크립트도 씀) |
| `checker/useSpellingCheck.js` | 자료 받기·손 멈춤 기다리기·NFC → 빨간 물결 자리 |
| `checker/spellingDetectionRules.js` | ① 빠른 규칙(띄어쓰기·자주 틀리는 말) |
| `checker/catalog/` · `elementarySpellingEntries.js` · `elementarySpellingDetectorLoader.js` · `catalogDetector.js` | ② 기본 자료 500개(분류 파일 여섯 개, 뒤에서 받는 청크, 찾기 장치) |
| `checker/pending/` | ②′ 검토 중 자료 862개(`pendingSpellingEntries.js` 는 생성 파일 — `merge-spelling-expansion.mjs --pending`), 스위치 `config.js` |
| `checker/classSpellingDetection.js` · `entryCache.js` · `candidateIndex.js` | ③ 공통·반별 자료로 찾기, 기기 저장·바뀐 것만 받기, 공용 후보 색인 |
| `checker/gray/` | 회색 점선 — 문단 나누기·자리 맞추기(`paragraphs.js`), 서버 묻기·고른 결과 기록(`grayApi.js`), 훅(`useLookCloser.js`) |

모듈 밖에 있는 짝(학생 입력기가 부르는 서버 쪽):

| 자리 | 하는 일 |
|---|---|
| `supabase/functions/spelling-look-closer/` | 학생 인증·학급 켜짐·횟수 제한(0.5초·1분 40번)·상한(12문단·6,000자) → 맥미니 창구 |
| `services/spelling-analyzer/server.py` | 맥미니 창구(127.0.0.1:8791, 공유 열쇠), `analyze.py` 의 `visible()` 이 보일 것을 정한다 |
| `ops/launchd/com.agit.spelling-analyzer.plist` | 창구를 늘 켜 둔다. 설치는 `services/spelling-analyzer/setup.sh` |
| `20261383` `record_spelling_gray_feedback_v1` | 고른 결과(갈래·짧은 조각·고친/둔)를 학급 단위로, 학생 식별자 없이 60일 |

맞춤법 수첩(`tools/spelling-lookup/`)·교사 자료 화면(`spelling-learning/`)·인형뽑기 퀴즈는 이 모듈의 자료를 **가져다 쓴다**.
자료를 늘리는 규칙은 `spelling-learning/README.md`, 분류 규칙은 `checker/catalog/README.md`.

## 검토 중 자료를 켜는 법

1. 선생님이 빼기 번호를 정하면 `docs/spelling-expansion/batch-NN.decisions.json` 에 적는다.
2. `node scripts/merge-spelling-expansion.mjs --batch 01,...,06` 으로 기본 자료에 합치고(고정 개수·도움말 갱신),
   `--pending` 으로 남은 묶음만 다시 만들거나 비운다. 검토 없이 우선 다 보이게 할 때만 `pending/config.js` 를 `true` 로.
