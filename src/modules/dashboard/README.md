# 교사 대시보드 카드 확장 계약

학급 운영과 학급 발자국에 새 지표를 붙일 때 화면 본체를 반복 수정하지 않기 위한 공통 계약이다.
`cardRegistry.js`가 코어 카드와 각 기능 모듈의 `manifest.dashboardCards`를 합치고,
`DashboardCardHost.jsx`가 섹션·기본화면·전체화면·표시 조건을 판정한다.

## 자동 반영의 경계

- 기존 카드가 배열을 그리는 경우(포인트 획득처·사용처 등): RPC 배열에 새 유형이 생기면 자동으로 행이 추가된다.
- 기존 렌더러로 표현 가능한 새 카드: 데이터 반환 경로와 카드 매니페스트 한 건만 추가한다.
- 완전히 새로운 시각화 방식: 카드 매니페스트와 해당 대시보드의 렌더러를 한 번 추가한다.
- DB의 새 필드를 이름·단위·공개 범위 없이 임의 카드로 만들지는 않는다. 화면에 노출할 데이터는 반드시 카드로 명시한다.

현재 대시보드 id는 다음 두 개다.

- `class-operations`: 학급 운영 현황
- `class-footprint`: 학급 글쓰기 발자국

## 모듈에서 카드 추가

```js
export const exampleManifest = {
  // 기존 모듈 정보...
  dashboardCards: {
    'class-footprint': [{
      id: 'reading-growth',
      section: 'visualization',
      renderer: 'monthly-bars',
      order: 70,
      title: '📚 독서 활동 성장',
      hint: '월별 독서록 수를 보여줍니다.',
      rowsPath: 'detail.reading_growth.monthly',
      valueKey: 'count',
      unit: '편',
      surfaces: ['default', 'fullscreen', 'modal']
    }]
  }
};
```

카드 id는 모든 모듈을 합친 대시보드 안에서 고유해야 한다. 개발 환경에서는 id 중복,
필수 항목 누락, 계약 버전 오류를 콘솔에 표시하고 잘못된 카드는 렌더링에서 제외한다.

## 데이터 계약

가볍고 항상 필요한 집계는 기존 RPC 응답의 이름 공간 아래 추가한다.

- 학급 운영: `get_class_operations_dashboard`의 `summary`, `actions` 또는 새 이름 공간
- 학급 발자국: `get_class_writing_footprint_dashboard`의 `totals` 또는 새 이름 공간

화면 정규화는 알지 못하는 새 키를 버리지 않고 보존하므로, 카드의 `dataPath`·`rowsPath`가 그 값을 읽는다.
선택 모듈의 계산이 무겁다면 코어 RPC를 계속 키우지 말고 실제 기능을 만들 때 모듈 전용 지연 조회를 붙인다.

학급 데이터 조회는 저장소 공통 규칙을 그대로 지킨다.

1. 각 원본 테이블의 `class_id`로 직접 좁힌다.
2. 학급 테이블끼리 조인하면 조인 조건에도 `class_id`를 넣는다.
3. `(class_id, 정렬열 DESC)` 인덱스와 조회 상한을 둔다.
4. 화면 캐시는 `dataCache`와 `classKey()`만 사용한다.

## 현재 렌더러

- 학급 운영 `summary`: `metric`
- 학급 운영 `actions`: `action`
- 학급 발자국 `summary`: `stat`
- 학급 발자국 `visualization`: `calendar`, `monthly-bars`, `trend-line`, `point-flow`, `point-types`

학급 발자국은 같은 카드 정의와 `FootprintCardContent`를 기본화면·전체화면·확대 모달에서 공유한다.
따라서 제목, 설명, 데이터 경로와 표현이 세 화면에서 따로 어긋나지 않는다.
