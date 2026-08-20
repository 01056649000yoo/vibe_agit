# 일기

학생 자율 글쓰기의 두 번째 유형이다. 하루 한 편, 기본 비공개, 분량·보상 정책과 교사 확인 화면을 이 폴더가 소유한다.

새 일기의 날짜는 한국 시간 기준 오늘이 기본값이지만 학생이 오늘을 포함한 지난 날짜로 바꿀 수 있다. 같은 날짜에는 한 편만
저장하며 미래 날짜는 화면과 `upsert_my_diary` RPC 양쪽에서 막는다. 교사 확인 완료 뒤에는 날짜도 내용과 함께 잠근다.

- 유형 등록: `manifest.js`와 `src/modules/writing/selfWritingTypes.js`. 친구 아지트 자율 글 필터는 매니페스트의
  `communityFeed` 선언으로 자동 등록한다.
- 학생 화면: `DiaryPage.jsx`
- 교사 확인: `teacher/TeacherDiaryManager.jsx`

새 자율 글 유형은 일기 코드를 복사해 코어에 분기를 늘리지 말고, 유형 등록과 공용 정책·참여 패널 계약을 재사용한다.
