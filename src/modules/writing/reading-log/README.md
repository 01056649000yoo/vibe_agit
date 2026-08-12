# 독서록

학생 자율 글쓰기의 첫 번째 유형이다. 책 선택·초안·하루 완료 제한·보상·책장을 이 폴더가 소유한다.

- 유형 등록: `manifest.js`와 `src/modules/writing/selfWritingTypes.js`
- 학생 화면: `ReadingLogPage.jsx`
- 교사 확인: `teacher/TeacherReadingLogManager.jsx`
- 초안 판정: `draftRules.js`
- 독서마라톤: `marathon/` — 개인 거리 순위와 학급 공동 목표를 같은 캠페인으로 집계

완료 판정은 DB의 `writing_counts_as_completed()`를 사용하고, 의견·댓글·확인 상태는 공용
`MyPostEngagementPanel`을 연결한다.

## 책 표지

- Kakao 검색 표지는 원본을 직접 받지 않고 `search1.kakaocdn.net`의 `R120x174.q85` 썸네일로 고정한다.
  학생 화면 최대 표지 112×162px에 맞는 크기이며 지연 로딩·비동기 디코딩으로 표시한다.
- 외부 이미지 허용은 운영 Caddy CSP의 `img-src`에 정확한 Kakao CDN origin만 둔다. 광범위한 `https:`나
  `*.kakaocdn.net` 와일드카드를 허용하지 않는다.
- URL 정규화는 `bookCoverUrl.js` 한 곳을 사용한다. 검색 결과·선택 화면·내 서재·친구 글 상세에서 원본 URL을
  직접 `<img>`에 넣지 않는다.

## 독서마라톤

- 교사가 `학생 독서록 → 동기부여 설정`에서 켜고 목표 거리와 종료일을 정한다.
- 한 캠페인 안에서 **개인 거리 경쟁**과 **학급 공동 목표 달성**을 함께 보여 준다.
- 학생 화면은 상위 3명과 본인 순위만 보여 주고, 교사는 전체 순위를 확인한다.
- 1쪽은 10m로 환산하며 같은 학생이 같은 판본의 책을 다시 등록해도 캠페인당 한 번만 센다.
- 페이지 수는 학생에게 입력받지 않는다. 책 선택 시 Google Books를 ISBN으로 조회하고, 독서록 저장 뒤 서버가
  저장된 ISBN을 다시 검증해 `book_catalog.page_count`에 기록한다. Google에 정보가 없는 책만 교사가 보정한다.
- Google 결과도 요청한 ISBN과 `industryIdentifiers`가 정확히 같은 판본의 `pageCount`만 사용한다.
- 공동 목표를 완주해도 새 캠페인을 시작하기 전까지 개인 순위 기록은 계속 쌓인다.
- 독서마라톤 자체 포인트는 지급하지 않는다. 기존 독서록 완료 보상과 포인트 경제를 그대로 유지한다.
