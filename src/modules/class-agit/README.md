# 우리반 아지트

2026-09-05 C0~C4와 C5 공개 단계 제어를 로컬 구현했다. 전시·문집·읽기 전용 외부 공유를 제공한다.
2026-09-05 사용자 요청으로 운영 SQL `20261241`을 적용하고 진남초 4학년 1반만 pilot·학급 ON으로 지정했다.
다른 학급과 외부 공유는 OFF다. 사용자 배포 요청으로 새 화면을 배포 대상으로 확정했으며 실계정 인수는 남아 있다. 현재 설정은 [제품 계획](../../../CLASS_AGIT_PLAN.md#현재-운영-설정-2026-09-05)을 참조한다.
제품 범위와 순서는 루트 `CLASS_AGIT_PLAN.md`가 정본이다.

## 확인할 화면

- `/?dev-lab=class-agit`: C0 시안. 0/1/12/60편·학생/외부 표시·가림 이름을 확인한다.
- `/?dev-lab=class-agit-persistence`: 실제 교사 컴포넌트에 메모리 API를 주입한 C1 샘플. 생성→전문/수록 확인→
  초안 저장→학생 공개 켜기→학급 공개→공개판 확인을 점검한다. 저장 충돌·원글 수정/회수·조회 실패 버튼 제공.

- `/?dev-lab=class-agit-student`: 공용 홈 카드·학생 감상 컴포넌트의 C2 샘플. 0/1/12/60편, 철회·판 갱신·중단·조회 실패·10초 지연과 조회 횟수를 확인한다.

샘플은 창작 글이며 새로고침하면 초기화한다. 브라우저 저장소·실제 DB에는 저장하지 않는다.
운영 모듈이 `src/dev/`를 가져오지 않으며 실제 권한은 SQL 역할 스모크로 따로 검증한다.

- `/?dev-lab=class-agit-release`: 전시 가져오기→문집 확정/출력→학생 서가, 외부 주소 발급/만료/해지, 공개 단계 통합 샘플. 100편 문집 버튼 제공.

## 코드와 RPC 계약

| 원본 | 책임 |
|---|---|
| `policy.js` | 방당 12편·최대 60편·입력 상한과 공개 범위 |
| `sourceContract.js` | 화면 사전 자격 검사·기존 장르 매니페스트의 전시 표현 연결 |
| `exhibitionDraft.js` | 불변 초안 편집·재확인·순서 이동·표시 필드 투영 |
| `api/contract.js` | 작업공간 응답 경계, 저장 요청 필드 허용 목록 |
| `api/classAgitApi.js` | 전용 RPC·응답 검증·쓰기 후 공용 학급 캐시 무효화 |
| `teacher/TeacherEntry.jsx` | 작업공간·전시 목록·학급 스위치·네트워크 상태, 전시별 편집 세션 |
| `teacher/ExhibitionWorkbench.jsx` | 작품 전문/수록 확인·초안 편집·충돌/철회 안내 |
| `teacher/PublishedExhibition.jsx` | 한 방 12편의 고정 공개판 확인·실패 시 과거 응답 제거 |
| `api/studentApi.js` / `studentContract.js` | 학생 목록·방 요약·전문 RPC와 필드/판/크기 검증 |
| `student/StudentEntry.jsx` / `navigation.js` / `useGalleryRead.js` | 공용 방문 기록·지연 읽기·늦은 응답 격리·원래 액자 복귀 |
| `gallery/roomLayout.js` / `GalleryRoom.jsx` | 공유 좌표와 방 분할·조회 없는 CSS/DOM 전시실 |
| `gallery/ArtworkReader.jsx` / `GalleryViewer.jsx` | 평면 전문·포커스·글자 크기, 시안 로비/방/목록 |

`20261241_class_agit_internal_publication.sql`의 `class_agit_source_data_v1`은 서버 자격·표시본·해시 정본이다.
확인된 현재 과제 `title/content/structured_content`를 쓰고 교사 수정 제안을 자동 선택하지 않는다.
일반 과제와 시의 연/행만 지원하며 비공개·미제출·회수·미확인·사진/미지원 장르는 제외한다.
후보/전문/저장/공개/읽기가 같은 자격 도우미를 사용한다. 새 장르는 화면 매니페스트와 이 정본·스모크를 함께 확장한다.

| 호출 | 응답/변경 |
|---|---|
| `get_class_agit_workspace_v1` | 전시 요약 20개·현재 학생 명단 100명·선택한 초안 60편 |
| `get_class_agit_candidates_v1` | 기본 20·최대 50편 요약, `updated_at,id` 내림차순 커서, 검색 상한 80자 |
| `get_class_agit_source_v1` | 선택한 글 1편 전문·원글 해시 |
| `run_class_agit_action_v1` | create/save/publish/unpublish/archive/restore/withdraw/set_enabled. 쓰기 한 번에 최신 작업공간 반환 |
| `get_class_agit_publication_v1` | 선택한 방 12편 표시 데이터·현재 공개 수·열람 중단 수. 원글/학생/확인 식별자 반환 금지 |
| `get_my_class_agit_exhibitions_v1` | 현재 학급의 공개 전시 요약 최대 20개. 본문/학생 명단 없음 |
| `get_my_class_agit_room_v1` | 로비(방 0) 또는 최대 12편 요약·방 구성/개수. 전문 없음 |
| `get_my_class_agit_work_v1` | 지정 발행판의 작품 1편 전문·앞뒤 작품 번호. 이전 판 요청 거부 |

교사는 현재 학급 담당자여야 하며 internal 단계는 승인된 ADMIN, pilot 단계는 지정한 최대 두 학급의 승인된 ADMIN/TEACHER만 허용한다.
학생은 실제 `students.auth_id` 연결·활성 상태·학급 ON·현재 공개판을 모두 통과해야 한다.
전용 표 모두 RLS ON, anon/authenticated/service_role 직접 권한 OFF, 내부 도우미 실행도 닫는다.
JWT 역할 주장·클라이언트 상태는 권한 근거가 아니다. 외부 익명 읽기는 별도 토큰 RPC 한 개만 허용한다.

## 저장·공개·철회

생성 ID는 응답을 받기 전 재시도에도 유지한다. 이후 변경은 서버 `expected_revision`으로 충돌을 검출하고
실패한 편집 내용을 화면에 유지한다. 최신 초안을 다시 가져오거나 목록으로 나갈 때 미저장 편집을 확인한다.
저장 요청은 원글 ID·해시·가림 이름·학급 수록 확인만 전달하며 본문·등록 이름·상태는 서버에서 구성한다.

초안의 순서/제목/선정을 고쳐도 현재 공개판은 고정되어 있다. 공개판 갱신 때 최신 원글 자격·해시를 검사한다.
원글 변경은 재확인을 요구하며 회수/삭제/학생 비활성·수록 철회는 다음 읽기에서 숨긴다. 철회 후 재수록은
확인 식별자를 바꾸므로 초안 저장만으로 이전 공개판이 되살아나지 않는다. 새 공개판 갱신이 필요하다.
학급 OFF에서도 초안 편집은 가능하고 열람은 차단한다. 보관/초안 복원 역시 자동 재공개하지 않는다.

학급 전시는 현재 공개판 한 개와 판 번호를 보관한다. 별도 문집 표가 확정 콘텐츠·설정·20개 판을 보관하고, 외부 공유 표가 외부 전용 공개본을 보관한다. C1 수록 원장은
`class`만 기록한다. 원본 삭제 뒤 남은 초안 항목은 nullable sourceId 대신 itemId로 정확히 하나씩 정리한다.

## 검증

`npm run test:class-agit`, `npm run test:architecture`, `npm run test:security`,
`npm run smoke:class-agit`(또는 미적용 상태의 `npm run migrate:check`)로 검사한다.
SQL 스모크는 합성 계정·학급·글만 만들고 전체 ROLLBACK한다. 시작할 때 같은 트랜잭션 안에서 internal/OFF로 초기화하므로 실제 운영 단계와 관계없이 반복할 수 있고 종료 후 실제 시범 설정이 복원된다. 운영 자료로 전시를 발행하지 않는다.

C1에서 확인한 항목: 다른 학급/일반 교사/위조 관리자 접근, 표·도우미 권한, 61편/중복 방지,
원글 해시·본문 위조·명시적 수록 확인, 생성 재시도·revision 충돌, 12편 방 분할, 초안과 공개판 분리,
철회/재확인/재공개·원글 회수/삭제·학생 비활성, 학급 OFF, 공개 중단/보관/복원, 전체 중지.
브라우저 샘플에서 생성·담기·저장·공개·충돌 입력 보존·재확인·철회·조회 실패와 390px 편집을 확인했다.
C2 샘플은 공용 홈 카드와 방문 기록 함수를 사용하며 실제 로그인 인수·실기기 부하를 대체하지 않는다.

학생 홈은 기존 bootstrap에 공개 전시 존재 여부만 합치고 상세 요청을 추가하지 않는다. 본문은 작품을 열 때만
받는다. 방/보기/작품 넘기기는 `onReplace`로 부모 기록을 보존하고, 하위 진입은 `onNavigate`, 닫기는 공용 `onBack`을
사용한다. 요청을 떠나거나 실패한 뒤 예전 전문을 다시 보여 주지 않으며 body 캐시·폴링·Realtime은 없다.
다른 학급/학생으로 바뀌면 앱의 읽기 호스트 키도 바뀐다. 원글·학생 ID와 큰 본문은 history에 넣지 않는다.

학생 공개를 처음 켜는 미설정 학급은 `resolveEnabledModuleIds`가 계산한 기존 메뉴와 현재 legacy flag를 전달한다.
서버는 학급 잠금 안에서 아직 미설정인지·legacy flag가 바뀌지 않았는지 검사한다. 이미 설정된 목록은 서버 값을
유지한다. 새 legacy 필드가 생기면 작업공간과 초기화 계약을 함께 확장하도록 C2 검사가 묶어서 확인한다.

C1이 미적용인 상태라 같은 `20261241`에 C2 함수를 작성했다. 배포 전에 `migrate:status`/롤백 검사를 다시 확인한다.
C2 SQL은 60편의 긴 한글/이모지 글, 전문 번호/판, 요약 상한, 철회·OFF·중단·다른 학급을 검사한다.
브라우저는 0/1/12/60편·모바일 390px·26px 글자·Tab/Escape·원래 액자 초점·지연 중 닫기를 확인했다.

## 문집·외부 공유·제한 운영 계약

- `anthology/`는 독립 문집 프로젝트와 학생 서가, 공용 장르 렌더러를 사용하는 A4 인쇄·실측 페이지 분할을 소유한다.
  확정판은 내용·순서·표지·출력 설정 버전(`A4/12pt/14pt/v1`)을 고정한다. 파일 자체의 서버 저장은 후속 범위다.
- `get_class_agit_book_workspace_v1`: 목록 20권·명단 100명·선택 초안 100편·판 메타데이터 20개.
  `run_class_agit_book_action_v1`: 생성/저장/확정/학생 공개·숨김/수록 철회/보관·복원, expected_revision 충돌 검사.
  `get_class_agit_book_preview_v1`: 저장한 초안을 서버에서 재검증해 출력하며 판을 만들지 않는다.
  `get_class_agit_book_edition_v1`: 교사 인쇄용 확정 콘텐츠, 철회 작품이 있으면 새 출력 전체 거절.
  `get_my_class_agit_books_v1`: 학생 서가 20권 또는 차례 100개 또는 작품 1편. 본문·내부 식별자는 차례에 넣지 않는다.
- `get_class_agit_share_workspace_v1`, `run_class_agit_share_action_v1`: 외부 확인/발행/재발급/만료 변경/해지/작품 철회.
  가림 이름·본문·소개를 확인한 외부 전용 표시본만 저장한다. 작품별 확인 이벤트와 발행/해지 이벤트를 기록한다.
- 토큰은 Web Crypto 32바이트, DB에는 SHA-256만 저장한다. `/exhibition#토큰`은 익명 진입점으로 App·인증 셸을 로드하지 않는다.
  토큰은 URL query·스토리지·로그 대신 메모리와 익명 RPC POST 본문으로만 전달한다. 재조회 시 토큰 원문을 복원하지 않는다.
- `read_public_class_agit_v1`: 로비/방당 12편 요약/작품 1편, 전체 60편. 승인·공개 단계·외부 스위치·만료·철회를 재검사한다.
  전역 3,000회/분·공유당 600회/분, statement timeout 3초·lock timeout 1초, 프런트 요청 8초 상한. 폴링 없음.
  오류는 JSON + response.status로 반환해 속도 제한 증가가 롤백되지 않게 한다.
  [PostgREST 응답 설정과 트랜잭션](https://postgrest.org/en/stable/references/transactions.html).
- `get_class_agit_access_v1`와 `manage_class_agit_rollout_v1`은 현재 담당·실제 승인 역할을 검증하고 최대 2개 시범 학급을 제어한다.
  학생 ON과 외부 ON은 별개이며 학생 스위치를 끄는 것만으로 외부 주소가 해지되지 않는다.

## C3~C5 검증 기록

SQL 역할 스모크는 100편/101편 거절, 수록 확인·교차 학급·동시 편집 충돌·확정판 고정·철회·학생 서가를 검사한다.
익명 공유는 학생 OFF 상태 열람, 잘못된 토큰/판, 원글 회수 후 복원 방지, 재발급·만료·시범 제외·요청 제한까지 검사한다.
`npm run smoke:class-agit:http`는 운영 스키마만 새 임시 DB에 복사하고 합성 자료와 별도 PostgREST 컨테이너로
HTTP 200/403/404/409/429, 표 권한, no-store/no-referrer/noindex, 시간 제한 적용·속도 제한 영속화를 확인한다.
DB 비밀번호는 0600 임시 env 파일로만 전달하며 출력하지 않고, 종료 시 컨테이너·임시 DB·파일을 삭제한다.

실제 Chrome A4 출력: 100편·117쪽, 차례 쪽수 100/100, 문단·시 연 누락 0, 12pt 미만 0. 표지·차례·시·긴 글
이어짐·발행 정보를 렌더링해 확인했다. 인쇄 창 열림을 PDF 저장 완료로 기록하지 않는다.
실제 계정/학교망/저사양 기기에서 하는 진남초 4학년 1반 시범 인수는 앱 배포 후 별도로 남아 있다.

출력 회귀 검사는 `npm run smoke:class-agit:pdf`로 재실행한다. Chrome/Chromium(`CLASS_AGIT_CHROME`)과
pdfplumber를 설치한 Python(`CLASS_AGIT_PYTHON`)이 필요하다. 생성 파일은 OS 임시 폴더에 두고 경로를 출력한다.
입력 상한의 표지·작품 제목·긴 한 문단·130행 시가 포함된 100편을 실제 131쪽 PDF로 출력해 차례 100/100,
본문·연 누락 0, 12pt 미만 0, 좌우/상하 잘림 0을 확인했다. 인쇄 창은 클릭 즉시 열어 팝업 차단 가능성을 줄인다.
공개 배포 번들도 로컬 Caddy에서 no-store/no-referrer/noindex와 인증 번들 미로딩·콘솔 오류 0을 확인했다.

원글/편집 버전 불일치는 `PT409`로 즉시 응답한다. PostgREST 14.12에서 `40001` 업무 오류는 계속 재시도됨을
격리 HTTP로 재현했으므로 사용하지 않는다. 전시·문집·공유와 이웃 공개 확인의 같은 오류도 함께 수정했다.
