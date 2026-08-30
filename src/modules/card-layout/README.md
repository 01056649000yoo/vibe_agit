# 카드 크기 조절 모듈

카드 목록 화면에서 `작게 / 보통 / 크게`를 같은 모양과 기준으로 사용한다.

```jsx
import CardSizeControl from './CardSizeControl';
import { getCardColumns } from './cardSize';

<CardSizeControl value={cardSize} onChange={setCardSize} label="과제 카드" />

<div style={{
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : `repeat(${getCardColumns(cardSize)}, minmax(0, 1fr))`
}} />
```

- 조절기는 값 저장이나 목록 데이터를 소유하지 않는다. 화면에서 컴포넌트를 빼도 나머지 기능은 유지된다.
- 저장이 필요하면 상위 화면의 기존 상태와 `localStorage`를 연결한다.
- 모바일은 한 열을 유지하고 조절기를 숨긴다.
- 카드별 정보 밀도는 `normalizeCardSize(cardSize)`의 `small / medium / large`로 조절한다.
