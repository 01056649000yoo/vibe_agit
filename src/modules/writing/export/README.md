# 글 콘텐츠 내보내기 확장 계약

## 구조

학생별 글 내보내기는 다음 네 층으로 나눈다.

1. `get_teacher_writing_content_export`: 학급·학생·글 유형을 검증하고 공용 행 계약을 반환한다.
2. `writingExportProfiles.js`: 콘텐츠별 Excel 열과 Google Docs 제목·메타정보를 정한다.
3. `useDataExport.js`: Google 권한과 Docs API 요청을 담당하고, XLSX 생성은 공용 `excelExport`를 사용한다. 사진은
   장르 매니페스트의 `imageExport` 계약으로 내보내기 버튼을 누른 뒤에만 불러온다.
4. `writingPdfExport.js`: 일반 글 A4 셸을 유지하고, 장르형 글은 미션 매니페스트의 `pdfExport` 계약에 맡긴다.

미션 내보내기의 기존 `get_writing_export_data` 호출부는 운영 호환을 위해 유지한다. 신규 콘텐츠와 독서록은
공용 계약을 사용하고, 미션도 후속 회귀 검증 뒤 같은 계약으로 옮길 수 있다.

## 새 자율 글쓰기 콘텐츠 추가

새 콘텐츠가 `student_posts.writing_context='self'`와 `self_writing_type`을 사용한다면 다음만 추가한다.

1. `writing_types`와 글쓰기 모듈 매니페스트에 유형을 등록한다.
2. `WRITING_EXPORT_PROFILES`에 Excel 행과 Google Docs·PDF 표현 프로필을 등록한다.
3. 교사 화면에서 `fetchWritingContentExportData(contentType, studentId)`를 호출한다.
4. Excel은 `exportWritingContentToExcel`, Google Docs는 `exportWritingContentToGoogleDoc`으로 전달한다.
5. PDF는 `exportWritingContentToPdf`로 전달한다.

본문이 `student_posts`가 아닌 별도 테이블에 있다면 RPC의 공용 반환 열은 바꾸지 않고, 해당 유형을 공용 행으로
변환하는 서버 어댑터만 추가한다. 화면이나 Google/XLSX 전송 코드를 복사하지 않는다.

## 공용 반환 원칙

- `student_posts.class_id`로 학급을 직접 제한한다.
- 학급이 있는 테이블끼리 조인할 때는 `class_id`를 조인 조건에 함께 넣는다.
- 한 학생 단위로 조회하며 서버 상한을 둔다. 현재 기본 500편, 최대 2,000편이다.
- 본문은 내보내기 버튼을 누를 때만 조회하고 학생별 요약·목록에는 포함하지 않는다.
- 콘텐츠 전용 필드는 `source_title`, `source_authors`, 검토 정보 같은 선택 열에 담고 표현은 프로필에서 결정한다.

## PDF 출력 원칙

- 서버에서 PDF를 만들지 않는다. 교사가 내보내기를 눌렀을 때만 브라우저에서 A4 문서를 만들고 인쇄 창을 열며,
  `PDF로 저장`과 실제 프린터 출력을 같은 흐름으로 제공한다.
- 일반 글은 제목·글쓴이·과제/콘텐츠명·본문 양식을 그대로 쓴다. 별도 학생 입력 틀이 있는 장르형 글은 그 틀의
  의미 구조를 살린 전용 PDF를 쓴다. 현재 시는 제목·지은이·연 단위 시구, 보고서는 질문·사진·관찰 결과 구조다.
- 본문과 설명은 12pt 아래로 줄이지 않는다. 한 페이지를 넘는 긴 글은 브라우저 인쇄 엔진이 다음 페이지로 자연스럽게
  이어 붙이며, 사진과 사진 설명은 가능한 한 같은 페이지에 둔다.
- 한 번에 최대 100편만 만든다. 보고서 비공개 사진 주소는 PDF 출력을 누른 순간 최대 50개씩 서명하고, 입력 중이나
  목록을 보는 동안에는 사진을 미리 불러오지 않는다.

## 이미지 포함 Excel·Google Docs 원칙

- 사진을 가진 장르는 매니페스트에 지연 `imageExport { id, load }`를 선언한다. 로더가 반환하는 객체는
  `collectImages(entry)`로 글별 사진 순서·경로·크기를 제공하고 `loadImageUrls(entries)`로 담당 교사가 내보내기를
  누른 순간에만 비공개 사진의 서명 URL을 만든다. 공용 내보내기 훅에 장르 이름을 하드코딩하지 않는다.
- Excel은 기존 데이터 열을 유지하고 `내용` 뒤에 `사진 1`, `사진 2`, `사진 3` 열을 추가한다. 사진은 링크 문자열이
  아니라 XLSX 이미지 레이어에 실제 파일로 포함하고 같은 글 행에 고정한다. WebP는 호환성을 위해 JPEG로 변환한다.
- Google Docs는 제목·작성자·본문을 먼저 넣고 사진을 해당 글의 가장 마지막에 원래 순서대로 한 장씩 가운데 정렬한다.
  Docs API가 PNG·JPEG·GIF만 받으므로 WebP는 브라우저에서 JPEG로 바꾼다.
- 변환된 사진은 교사가 선택한 Google 계정의 Drive에 검색 불가 임시 파일로 올린 뒤 Docs가 사본을 저장하면 즉시
  삭제한다. 파일 삭제가 실패하면 공개 권한 삭제를 다시 시도하고, 둘 다 실패하면 교사에게 직접 정리할 파일명을
  알린다. Google Cloud 프로젝트에는 Google Docs API와 Google Drive API가 모두 활성화되어 있어야 한다.
- 브라우저 CSP의 Google Drive API 허용 범위는 `https://www.googleapis.com` 하나로 제한한다. 사진 원본·서명 URL·
  Google 액세스 토큰을 로그나 DB에 기록하지 않는다.

## 장르형 글쓰기 PDF 추가 규칙 (필수)

`studentEditorEntry`로 일반 본문 입력과 다른 학생용 글쓰기 틀을 등록했다면 같은 작업에서 PDF 양식도 반드시
추가한다. 화면만 만들고 내보내기를 일반 글 양식에 맡긴 상태로 완료 처리하지 않는다.

1. 장르 폴더에 `<장르>PdfExport.js`를 두고, 매니페스트에 `usesStructuredContent: true`와 `pdfExport`를 선언한다.
2. 매니페스트의 `pdfExport`는 미션 타입과 같은 `id`, 교사가 내보내기를 누를 때만 실행되는 `load()`를 둔다.
   `load()`가 반환하는 장르 PDF 객체는 아래 계약을 지킨다.
   - `id`: 미션 타입 ID와 동일한 값
   - `renderEntry(entry, context)`: 제목·지은이와 장르 구조를 A4 HTML로 반환
   - `styles`: 해당 장르에서만 필요한 인쇄 CSS 문자열
   - 사진 같은 지연 자산이 있으면 `collectImagePaths(entry)`와 `loadImageUrls(entries)`도 함께 제공
3. 공용 `writingPdfExport.js`에 장르별 `if/switch`를 추가하지 않는다. 공용부는 `input_template` 또는
   `structured_content.template`로 매니페스트를 찾아 렌더러를 호출한다.
4. 구조화 데이터가 없는 과거 글도 평문에서 장르 구조를 복원하는 호환 경로를 둔다. 시는 빈 줄을 연 경계로 본다.
5. 글자는 12pt 아래로 줄이지 않고, 제목·지은이·본문의 시각 계층과 장르 단위를 유지한다. 긴 글은 억지로 축소하지
   않고 다음 페이지로 넘기며 한 연·한 사진 칸처럼 의미가 이어지는 단위는 가능한 한 페이지 사이에서 나누지 않는다.
6. `tests/genreWritingPdf.test.mjs`에 장르 매니페스트 계약, 구조화 데이터, 과거 글 호환, HTML 순서·글자 크기
   회귀 검사를 추가한다. 이 파일은 `npm run test:architecture`에 포함되어 있어 전용 PDF 누락 시 빌드가 실패한다.
7. 완료 전 Chrome 인쇄 엔진 또는 Poppler로 실제 A4 PDF를 만들고 다시 렌더링해 페이지 수, 줄바꿈, 잘림·겹침,
   한글 표시와 12pt 이상 글자를 눈으로 확인한다.

예시:

```js
export const exampleMissionType = {
    id: 'example',
    studentEditorEntry: () => import('./ExampleEditor'),
    usesStructuredContent: true,
    pdfExport: {
        id: 'example',
        load: () => import('./examplePdfExport.js').then((module) => module.examplePdfExport),
    },
};

export const examplePdfExport = {
    id: 'example',
    renderEntry,
    styles,
};
```
