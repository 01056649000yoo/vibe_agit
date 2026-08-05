# 글 콘텐츠 내보내기 확장 계약

## 구조

학생별 글 내보내기는 다음 세 층으로 나눈다.

1. `get_teacher_writing_content_export`: 학급·학생·글 유형을 검증하고 공용 행 계약을 반환한다.
2. `writingExportProfiles.js`: 콘텐츠별 Excel 열과 Google Docs 제목·메타정보를 정한다.
3. `useDataExport.js`: Google 권한, Docs API 요청, XLSX 파일 생성을 담당한다.

미션 내보내기의 기존 `get_writing_export_data` 호출부는 운영 호환을 위해 유지한다. 신규 콘텐츠와 독서록은
공용 계약을 사용하고, 미션도 후속 회귀 검증 뒤 같은 계약으로 옮길 수 있다.

## 새 자율 글쓰기 콘텐츠 추가

새 콘텐츠가 `student_posts.writing_context='self'`와 `self_writing_type`을 사용한다면 다음만 추가한다.

1. `writing_types`와 글쓰기 모듈 매니페스트에 유형을 등록한다.
2. `WRITING_EXPORT_PROFILES`에 Excel 행과 Google Docs 표현 프로필을 등록한다.
3. 교사 화면에서 `fetchWritingContentExportData(contentType, studentId)`를 호출한다.
4. Excel은 `exportWritingContentToExcel`, Google Docs는 `exportWritingContentToGoogleDoc`으로 전달한다.

본문이 `student_posts`가 아닌 별도 테이블에 있다면 RPC의 공용 반환 열은 바꾸지 않고, 해당 유형을 공용 행으로
변환하는 서버 어댑터만 추가한다. 화면이나 Google/XLSX 전송 코드를 복사하지 않는다.

## 공용 반환 원칙

- `student_posts.class_id`로 학급을 직접 제한한다.
- 학급이 있는 테이블끼리 조인할 때는 `class_id`를 조인 조건에 함께 넣는다.
- 한 학생 단위로 조회하며 서버 상한을 둔다. 현재 기본 500편, 최대 2,000편이다.
- 본문은 내보내기 버튼을 누를 때만 조회하고 학생별 요약·목록에는 포함하지 않는다.
- 콘텐츠 전용 필드는 `source_title`, `source_authors`, 검토 정보 같은 선택 열에 담고 표현은 프로필에서 결정한다.

