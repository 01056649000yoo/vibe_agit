# 작가 수호룡 표현 계약

수호룡은 서로 다른 세 성장축을 한 화면에 합성한다.

- 작가 칭호: `presentation.js`의 4종 × 10단계 몸체 이미지
- 독자 칭호: `DragonAvatar`의 빛·별·궤도·문장·오로라 레이어
- 포인트 꾸미기: `decorCatalog.js`의 프레임·받침대·좌우 소품·문패 5개 고정 슬롯

꾸미기 상품이 늘어도 이 역할을 섞지 않는다. 포인트 상품은 물질적인 배경·가구·소품을 사용하고, 독자 효과 전용인
빛의 궤도·룬·수호 문장·단계 인장은 상품 장식으로 재사용하지 않는다.

## 프레임 등록 계약

`HIDEOUT_BACKGROUNDS` 이름과 저장 ID는 기존 데이터 호환 때문에 유지하지만, 새 화면에서는 전체 배경이 아니라
네 모서리 프레임 테마로 렌더링한다. 새 프레임도 기존 필드와 함께 `readerTone`을 반드시 선언한다.

```js
newBackground: {
    id: 'new-background',
    name: '새 프레임',
    color: 'linear-gradient(...)',
    border: '#...',
    textColor: '#...',
    subColor: '#...',
    glow: 'rgba(...)',
    price: 500,
    readerTone: 'light' // light | dark | vivid
}
```

- 중앙 장면은 밝은 중립 실내로 고정하고 프레임만 색·재질·모서리 형태를 바꾼다.
- `readerTone`은 예전 카드와 호환용 표시에서도 독자 효과 대비를 지키는 안전 계약이다.

`getReaderSceneTheme()`가 보호 무대·외곽선·입자 대비를 CSS 변수로 바꾸고 모든 `DragonAvatar`에 적용한다.
등록값이 없거나 잘못돼도 `light` 안전 기본값을 사용한다.

## 아지트 공방 5개 슬롯 계약

꾸미기는 자유 배치가 아니라 아래 슬롯에 하나씩만 장착한다.

- `wallpaper`: UI 명칭은 **프레임**. 기존 `pet_data.background/ownedItems`를 그대로 읽는 호환 키
- `pedestal`: 수호룡 아래 받침대
- `leftProp` / `rightProp`: 수호룡 바깥쪽의 소품
- `nameplate`: 학생 이름과 드래곤 이름을 보여 주는 문패

새 저장값은 `pet_data.equippedDecor`와 `ownedDecorItems`에 둔다. 기존 배경을 구입한 학생은 별도 변환 없이
`normalizeDragonDecor()`에서 새 프레임 소유권으로 인정한다. 프레임을 새로 장착할 때는 `background`도 함께 갱신해
교사 레거시 화면과 예전 카드가 계속 같은 테마를 표시한다.

구매·장착은 클라이언트가 가격이나 전체 `pet_data`를 보내서 덮어쓰지 않는다. `buy_my_dragon_decor`와
`equip_my_dragon_decor`가 서버 카탈로그의 가격·슬롯·소유·작가 단계·본인 여부를 검증한다. 나의 수호룡 방과 친구
아지트는 같은 `DragonHideoutScene`을 사용하므로 장식 렌더러를 두 군데에 복사하지 않는다.

## 고정 레이어 순서

1. 배경
2. 뒤쪽 가구·환경 소품
3. 독자 효과 보호 무대·후광
4. 독자 효과 오로라·궤도
5. 작가 수호룡 몸체
6. 독자 효과 별·룬·단계 인장
7. 앞쪽 가구·장착 소품

앞쪽 소품은 드래곤 몸 일부를 가릴 수 있지만 독자 효과의 단계 인장과 상단 문장은 가리지 않아야 한다. 수호룡 표시 영역은
가능하면 정사각형을 유지하고, 외부 카드가 `overflow: hidden`을 쓸 때도 효과가 보이도록 최소 6%의 내부 안전 여백을 둔다.

## 성능·접근성

- 독자 효과는 별도 래스터 이미지를 만들지 않고 CSS/SVG 레이어만 사용한다.
- 반복 애니메이션은 `transform`과 `opacity` 위주로 유지한다.
- `prefers-reduced-motion: reduce`에서는 정적인 최종 문양만 보여준다.
- 단계 차이는 색만이 아니라 별·궤도·왕관·오로라·이중 문장의 형태로도 구분한다.
