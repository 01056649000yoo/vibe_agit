# 포인트·놀이 모듈 추가 계약

새 게임은 `src/modules/game/<module-id>/` 폴더 하나로 만든다. 기존 `GameManager`나
`StudentDashboard`에 게임별 조건문을 추가하지 않는다.

## 필수 파일

```text
<module-id>/
├── manifest.js
├── TeacherManager.jsx   # 교사 설정이 있을 때
└── StudentEntry.jsx     # 학생 게임 화면
```

`manifest.js`를 `src/modules/registry.js`에 한 줄 등록하면 다음 위치에 자동으로 연결된다.

- 교사 `포인트·놀이`: 왼쪽 콘텐츠 메뉴, 전체 활성 현황, 학생 화면 미리보기, ON/OFF, 선택 콘텐츠 세부 관리
- 학생 `아지트 놀이터`: 아이콘·이름·설명 카드, 학생 진입 화면 지연 로딩

교사 화면은 처음에 전체 현황만 보여주고, 왼쪽 메뉴에서 콘텐츠를 선택했을 때 해당 `teacherEntry`만 지연 로딩한다.
따라서 콘텐츠가 늘어나도 모든 관리 화면을 동시에 조회하거나 렌더링하지 않는다.

## 매니페스트 예시

```js
export const sampleGameManifest = {
  id: 'sample-game',
  name: '샘플 게임',
  description: '포인트로 즐기는 샘플 게임',
  icon: '🎲',
  part: 'game',
  audience: 'both',
  defaultEnabled: false,
  studentEntry: () => import('./StudentEntry'),
  teacherEntry: () => import('./TeacherManager'),
  playground: {
    order: 30,
    background: 'linear-gradient(135deg, #F3E8FF, #FAF5FF)',
    borderColor: '#D8B4FE',
    entryMode: 'standard'
  },
  management: {
    order: 30,
    activeColor: '#7C3AED',
    headerBackground: 'linear-gradient(135deg, #F3E8FF, #EDE9FE)'
  }
};
```

## 컴포넌트 props

`TeacherManager`는 공통 카드의 본문이며 다음 props를 받는다.

```js
{ activeClass, isMobile, module, onCollapse }
```

`StudentEntry`는 전체 화면 공통 호스트 안에서 다음 props를 받는다.

```js
{ studentSession, isMobile, points, onPointsChange, onBack, module }
```

## 데이터 원칙

- ON/OFF는 `classes.enabled_modules`만 사용한다.
- OFF는 노출만 중단하며 기존 게임 데이터는 삭제하지 않는다.
- 단순 설정은 모듈 소유 설정 저장소, 랭킹·시즌·진행 기록은 모듈 전용 테이블/RPC가 담당한다.
- 포인트 지급·차감은 클라이언트 직접 갱신 대신 권한을 검증하는 RPC를 사용한다.
- 교사·학생 진입 컴포넌트는 열릴 때만 자기 데이터를 조회한다. 다른 모듈의 장애나 로딩을 막지 않는다.

드래곤과 어휘의 탑은 게임별 `teacherEntry`를 통해 레지스트리에서 지연 로딩한다. 기존 운영 DB 계약과
관리 로직은 회귀 위험을 줄이기 위해 당분간 `legacy/LegacyGameManager.jsx` 어댑터를 공유하며, 각 진입점이
자기 게임만 표시한다. 학생 진입은 별도 검증 후 표준 호스트 계약으로 옮긴다.
