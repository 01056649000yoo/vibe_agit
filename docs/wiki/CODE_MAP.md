# 코드 지도 (Graphify) — 쓰는 법과 한계

> 2026-10-25 시험 도입. `src/` 의 코드를 지도(함수·파일·컴포넌트와 그 연결)로 만들어 두고, 고치기 전에 "여기를 바꾸면 어디가 영향받나"를 몇 줄로 본다.
> 지도 결과는 **저장소 밖**(`~/graphify/vibe-agit`, 환경변수 `CODE_MAP_DIR`)에 둔다 — 저장소가 공개라서 구조 정보를 올리지 않는다.

## 쓰는 법

| 하고 싶은 것 | 명령 (영문 이름으로) |
|---|---|
| 이것을 고치면 영향받는 곳(부르는 곳·가져오는 곳) | `npm run map -- affected PlazaPostModal` |
| 이것이 무엇과 이어져 있나 | `npm run map -- explain DragonPlazaEntry` |
| 이름이 나오는 부분 지도 | `npm run map -- query "buildSeat useDragonPlaza"` |
| 두 이름 사이의 길 | `npm run map -- path "A" "B"` |
| **함수·컴포넌트 하나의 소스만**(파일 전체를 읽지 않기) | `npm run map -- show buildSeat` (겹치면 `show 이름 파일일부`) |
| **DB 함수의 최신 정의만**·부르는 곳·권한(낡은 정의 건너뜀) | `npm run map -- rpc get_my_title_status` |
| 지도가 신선한가 | `npm run map -- status` |

- `npm run recall -- src/…파일` 에 ⑥ "이 파일을 부르는 곳"이 자동으로 붙는다. 평소 하던 recall 만 해도 된다.
- 도구(graphify)가 없는 컴퓨터·모델에서는 한 줄 안내만 하고 끝난다 — 평소처럼 `grep` 으로 찾으면 된다.

## 토큰이 가장 크게 줄어드는 곳

찾는 것보다 **큰 파일을 통째로 읽는 것**이 더 비싸다(src 7.6MB·migrations 5MB·tests 3MB·docs 3.7MB). 그래서 `show`·`rpc` 가 핵심이다.
- `rpc get_my_title_status`: 열 번 다시 정의된 DB 함수의 **최신 정의 4.5KB** (grep 8.2KB·최신 정의가 든 마이그레이션 파일 전체 38KB).
- `show buildSeat`: 함수 하나 1.3KB (파일 전체 6.2KB). 큰 컴포넌트일수록 차이가 커진다.
- `affected`: 부르는 곳 몇 줄 0.4KB (grep 2.3KB).

## 갱신은 자동이다

- **세션을 열면** `.claude/hooks/code-map-refresh.sh` 가 백그라운드로 지도를 최신화한다(컨텍스트에 아무것도 싣지 않는다). 신선하면 몇십 ms, 낡았으면 4~6초 — 세션은 기다리지 않고, 그 사이 조회하면 잠금으로 끝날 때까지 기다렸다 신선한 지도를 쓴다.
- Claude Code 전용 훅이다(Codex 는 조회 때 알아서 갱신).

조회할 때도 "지도를 만든 뒤 소스가 바뀌었나(수정 시각)·소스 파일 수가 달라졌나(지운 파일 포함)"를 보고, **낡았을 때만** 다시 만든다(약 4~6초).
훅·백그라운드 프로세스가 없다. 직접 갱신하려면 `npm run map -- update`.

## 한계 — 이럴 땐 grep

- **문자열로 이어진 것은 못 본다**: RPC 이름(`supabase.rpc('…')`), CSS 클래스, 모듈 id, 문서 속 이름. → `grep -rn "이름" src supabase/migrations`.
- **SQL(마이그레이션)은 아직 안 읽는다**(`graphifyy[sql]` 추가 설치가 필요하고, JS 의 RPC 호출과도 이어지지 않아 이득이 작다).
- **한글 질문은 못 찾는다** — 함수·파일·컴포넌트의 영문 이름으로 묻는다.
- 이름이 겹치면(예: `registry.js`) 후보가 나온다 — `경로::이름` 형식으로 다시 묻는다.
- 지도에 없다고 "아무도 안 부른다"는 뜻이 아니다. 지운다·이름 바꾼다면 반드시 grep 으로도 한 번 더 센다.

## 일부러 넣지 않은 것

- 문서·PDF·이미지 분석: AI 서버로 전송된다(`--code-only` 로 막아 둠). 운영 정보가 든 우리 문서에는 쓰지 않는다.
- Claude Code 훅·`graphify claude install`: 저장소 `CLAUDE.md` 를 바꾸고 모든 파일 읽기에 끼어든다. 효과를 먼저 재 본 뒤에 판단한다.

## 쓴 경우 기록하기 (평가 근거)

지도를 쓸 때마다 저장소 밖 `~/graphify/vibe-agit/usage.jsonl` 에 자동 기록된다(질문 이름·답 크기만, 코드 내용 없음).
쓴 뒤 쓸모가 있었는지 한 줄 남기면 평가가 정확해진다: `npm run map -- note 도움됨|아님|놓침 "이유"` (놓침 = 지도가 못 보여서 grep 으로 찾음).
집계: `npm run map -- usage` (횟수·명령별·답 크기·평가 메모).

## 효과 재기 (시험 기간)

토큰 절감은 아직 실측 전이다. 영향 범위를 볼 때마다 `affected` 를 쓰고(예: `buildSeat` — grep 18줄 2.3KB, 지도 6줄 0.4KB),
2주 뒤(2026-11-08) 도움이 됐는지(찾기 빨라짐·놓친 곳 줄어듦)를 선생님께 말씀드리고 계속 쓸지 정한다.
쓰지 않기로 하면: `graphify uninstall --purge`, `uv tool uninstall graphifyy`, 이 문서와 `scripts/code-map*.mjs` 삭제.

## 설치(새 컴퓨터)

`brew install uv` → `uv tool install graphifyy` → `npm run map -- update`. (코드만 분석하므로 API 키가 필요 없다.)
