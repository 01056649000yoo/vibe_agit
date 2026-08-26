# 교사 활용 안내서 구조

교사 대시보드의 탭별 도움말과 전체 활용 안내서는 상세 내용을 복사하지 않고 같은 원본을 사용한다.

## 파일별 역할

- `src/constants/teacherGuides.js`: 화면별 상세 도움말의 유일한 원본
- `teacherGuideRegistry.js`: 도움말 ID와 실제 교사 화면 이동 대상 연결
- `teacherGuideJourneys.js`: 교사의 목적에 따른 큰 흐름과 도움말 참조만 정의
- `TeacherGuideContent.jsx`: 탭 도움말과 전체 안내서가 함께 사용하는 상세 렌더러
- `TeacherGuideCenter.jsx`: 여덟 개 큰 흐름을 보여 주는 전체 화면 안내서

## 도움말을 바꿀 때

기존 도움말의 단계·주의사항은 `teacherGuides.js`만 수정한다. 탭 도움말과 활용 안내서의 펼친 내용이 함께 바뀐다.

새 도움말을 추가하면 다음 순서로 연결한다.

1. `teacherGuides.js`에 상세 내용을 추가한다.
2. `teacherGuideRegistry.js`에 실제 화면 이동 대상을 추가한다.
3. 적절한 `teacherGuideJourneys.js` 단계에서 `guideRef`로 참조한다.
4. `node --test tests/teacherGuides.test.mjs tests/teacherGuideCenter.test.mjs`를 실행한다.

활용 안내서 단계에는 제목·목적 같은 큰 흐름만 쓴다. 버튼 순서나 주의사항을 다시 적으면 두 원본이 생기므로
상세 내용은 반드시 `guideRef`가 가리키는 탭 도움말에서 불러온다.
