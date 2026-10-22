# 수호룡 퀴즈 아레나 (`quiz-arena`)

`npm run new:module` 로 만든 뼈대(2026-10-22). 이미 된 것과 **사람이 판단해서 채울 것**을 나눠 적는다.

## 이미 된 것
- [x] 폴더·설정 파일(`manifest.js`)·교사 화면 뼈대
- [x] 레지스트리(`src/modules/registry.js`) 등록 — `tests/extensionRegistries.test.mjs` 가 빠짐을 막는다
- [x] 기본 검사 `tests/quizArenaModule.test.mjs`(설정 규칙·등록·배포에서 숨김)
- [x] 배포해도 숨김: `available` 은 개발 서버에서만 참, `defaultEnabled: false`

## 채울 것 (공개 전에 모두)
- [ ] `manifest.js` 의 `description`·`icon`·`playground` 문구
- [ ] 화면: 공용 부품(`components/common`)·토큰만, 글자 0.8rem 이상(`docs/wiki/DESIGN_GUIDE.md`)
- [ ] 성능표: `PERFORMANCE_HARNESS.md` "콘텐츠를 추가할 때 반드시 적는 성능표"에 한 줄(홈 조회·열 때 요청 수·쓰기 RPC)
- [ ] 교사 도움말: `src/constants/teacherGuides.js` 에 `'quiz-arena'` 안내, `src/guides/teacherGuideRegistry.js` 에 화면 연결
- [ ] 시험 화면: `src/dev/devLabRegistry.js` 에 DB 없는 장면(빈 자료·보통·많은 자료·오류)
- [ ] 공개: `available: true`, `FEATURE_MAP.md` 줄 + 변경 기록, `WORKLOG.md`·`ROADMAP.md`
