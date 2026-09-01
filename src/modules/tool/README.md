# 수업 도구 모듈 추가 계약

쌤링크처럼 교사가 수업 중 사용하는 앱은 `src/modules/tool/<module-id>/`에 둔다.
앱 코드를 교사 대시보드에 직접 추가하지 않고 manifest와 `teacherEntry`로 연결한다.

```js
export const sampleToolManifest = {
  id: 'sample-tool',
  name: '샘플 수업 도구',
  description: '수업에서 사용하는 도구',
  icon: '🧰',
  part: 'tool',
  audience: 'teacher',
  teacherEntry: () => import('./TeacherEntry'),
  tool: {
    order: 10,
    launchMode: 'embedded'
  }
};
```

`src/modules/registry.js`에 manifest를 등록하면 교사 `수업 도구` 런처에 자동으로 표시된다.
선택하기 전에는 앱 코드를 로드하지 않는다. 외부 앱은 인증·데이터 계약을 먼저 정한 뒤 연결하며,
비밀 값이나 외부 앱 코드를 아지트 코어 셸에 직접 섞지 않는다.

## 현재 도구

- `class-board`: `우리 반 스크린`. 보드 셸은 위젯 목록·배치·저장·발표만 맡고, 텍스트·이미지·글쓰기 현황은
  `widgets/registry.js`에 등록된 독립 위젯이 소유한다. 왼쪽 자료의 위치·크기·핀 상태는 보드에 저장하며, 오른쪽
  현황은 담당 교사에게 현재 미션 이름표와 오늘의 일기·독서록 숫자만 전달하고 글 내용·내부 ID는 제외한다.
  발표 화면의 `화면 편집`도 같은 위젯 레지스트리·설정·배치 엔진을 재사용한다. 변경은 임시 보드에서 처리한 뒤
  교사가 저장하거나 취소하며, 오른쪽 현황은 고정된 읽기 전용 영역으로 유지한다.
- `meal-board`: `얘들아, 밥 먹자!` 급식·학생별 비고 확인. 첫 화면으로 열리며, 나이스 키는 서버 함수만 읽고, 공개
  전체화면에는 학생 이름과 비고를 전달하지 않는다. 비고는 선택 사항이며 담당 학급 RPC로만 읽고 쓴다.
- `classroom-arrangement`: 자리·역할 배치
- `samlink`: URL 단축하기(쌤링크). 필요한 경우 선택할 때만 외부 페이지를 지연 로드한다.

## 우리 반 스크린 위젯 계약

새 표시 기능은 `src/modules/tool/class-board/widgets/<widget-id>/`에 두고 `widgets/registry.js`에 매니페스트를
등록한다. 보드 셸에 위젯 ID 조건문을 추가하지 않는다. 매니페스트는 `id`, `version`, `projectorSafe`,
`defaultPlacement`, `createDefaultConfig`, 지연 `load`를 갖고, 설정 화면이 있으면 `loadSettings`도 선언한다.
실시간 데이터가 필요한 위젯은 자신의 요청 예산을 `requestBudget`에 적는다. 교실 표시용 학생 이름이 필요하면
담당 교사 권한·100명 상한·내부 ID와 본문 제외를 서버에서 강제한다. 보드는 위젯의 배치와 설정만 저장하며 살아
있는 현황 데이터는 저장하지 않는다.
