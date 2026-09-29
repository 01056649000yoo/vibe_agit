# 학급 시간표 관리 (`class-timetable`)

`npm run new:module` 로 만든 뼈대(2026-09-29). 이미 된 것과 **사람이 판단해서 채울 것**을 나눠 적는다.

## 이미 된 것
- [x] 폴더·설정 파일(`manifest.js`)·교사 화면 뼈대
- [x] 레지스트리(`src/modules/registry.js`) 등록 — `tests/extensionRegistries.test.mjs` 가 빠짐을 막는다
- [x] 기본 검사 `tests/classTimetableModule.test.mjs`(설정 규칙·등록·배포에서 숨김)
- [x] 배포해도 숨김: `available` 은 개발 서버에서만 참, `defaultEnabled: false`
- [x] 마이그레이션 초안 `supabase/migration-drafts/class_timetable.sql` + 스모크 초안(적용 도구가 읽지 않는 자리)

## 채울 것 (공개 전에 모두) — 2026-09-29 모두 끝남(v1.18)
- [x] `manifest.js` 의 `description`·`icon`·`tool.order`
- [x] 화면: 공용 부품(`components/common`)·토큰만, 글자 0.8rem 이상(`docs/wiki/DESIGN_GUIDE.md`)
- [x] 성능표: `PERFORMANCE_HARNESS.md` "콘텐츠를 추가할 때 반드시 적는 성능표"에 한 줄(홈 조회·열 때 요청 수·쓰기 RPC)
- [x] DB: 초안을 고친 뒤 `supabase/migrations/<다음 번호>_class_timetable.sql` 로, 스모크는 `tests/sql/<같은 이름>.smoke.sql` 로 옮기고 `npm run migrate:check`
- [x] 보안: `SECURITY_HARNESS.md` 에 경계 한 단락(누가 읽고 누가 쓰는지), `npm run check:rpc-surface`
- [x] 교사 도움말: `src/constants/teacherGuides.js` 에 `'class-timetable'` 안내, `src/guides/teacherGuideRegistry.js` 에 화면 연결(`{ tab: 'tools', tool: 'class-timetable' }`)
- [x] 시험 화면: `src/dev/devLabRegistry.js` 에 DB 없는 장면(빈 자료·보통·많은 자료·오류)
- [x] 공개: `available: true`, `FEATURE_MAP.md` 줄 + 변경 기록, `WORKLOG.md`·`ROADMAP.md`

## 구조
- `curriculumSubjects.js` — 2022 개정 과목 이름(학년별). 교육과정이 바뀌면 이 파일만 고친다.
- `timetableModel.js` — 칸(6일×8교시)·주·다음 수업일·과목 색·줄임말. 스크린 위젯도 이 파일을 쓴다.
- `timetableApi.js` — RPC 네 개(`20261357_class_timetable.sql`).
- `TimetableEditor.jsx` — 입력 표(끌어다 놓기·눌러 채우기·칸끼리 바꾸기·직접 입력).
- `useTimetableAutosave.js` — 멈춘 뒤 1.2초 자동 저장, 한 번에 하나.
- 스크린 위젯은 `class-board/widgets/timetable/`. 실험실은 `?dev-lab=class-timetable`(메모리 가짜 서버 `src/dev/fakeTimetableApi.js`).
