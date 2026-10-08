# 맞춤법 카탈로그 추가 안내

항목은 뜻에 맞는 큰 분류 파일 하나에만 넣는다. 여섯 파일은 관리·검색용이며, 실행할 때에는 `index.js`가 한 목록으로 합쳐 공용 후보 색인 한 번으로 검사한다.

```js
reference(
    501,
    '겹치지-않는-고정-id',
    'schema.js에 정의된 세부 분류',
    'exact', // exact | phrase | context
    'catalog',
    '바른말 / 틀린말',
    '바른말',
    '학생이 이해할 수 있는 설명',
    ['바른 예문 하나.', '바른 예문 둘.']
)
```

위 인수 순서는 `sortOrder, id, subcategoryId, detectionMode, origin, question, answer, explanation, examples`다. 기본 검색어·출처·단순 검출 패턴은 여기서 자동으로 만든다. 별도 문맥이나 출처가 필요할 때만 마지막 `options`에 `searchable`, `sourceQuery`, `sourceType`, `detectionPatterns`를 넣는다. 기존 100문제와 같은 문장형 문항은 같은 파일의 `practice(...)` 형식을 따른다.

- `exact`: 틀린 표기 자체가 어느 문장에서도 틀릴 때만 쓴다. `text === target`이어야 한다.
- `phrase`: 띄어쓰기 오류처럼 틀린 어구 전체를 찾을 때 쓴다. `text`에 공백이 있어야 한다.
- `context`: 두 형태가 모두 올 수 있으면 반드시 앞뒤 말을 `text`에 넣고 밑줄 부분만 `target`에 둔다.
- 기존 ID와 정렬 번호는 바꾸지 않는다. 새 ID와 `sortOrder`는 전체 500개와 겹치지 않게 추가한다.
- 바른 예문과 정상 반례에서 오탐이 없는지 확인하고 `npm run spelling:check`, `npm run spelling:benchmark`를 통과시킨다.

분류, 세부 분류, 검출 방식이 빠졌거나 패턴과 맞지 않으면 `schema.js`가 즉시 실패시킨다. 총 개수가 달라지면 개수를 고정해 둔 검사와 문서도 함께 갱신한다.
