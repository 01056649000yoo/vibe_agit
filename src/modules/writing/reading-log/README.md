# 독서록

학생 자율 글쓰기의 첫 번째 유형이다. 책 선택·초안·하루 완료 제한·보상·책장을 이 폴더가 소유한다.

- 유형 등록: `manifest.js`와 `src/modules/writing/selfWritingTypes.js`
- 학생 화면: `ReadingLogPage.jsx`
- 교사 확인: `teacher/TeacherReadingLogManager.jsx`
- 초안 판정: `draftRules.js`

완료 판정은 DB의 `writing_counts_as_completed()`를 사용하고, 의견·댓글·확인 상태는 공용
`MyPostEngagementPanel`을 연결한다.
