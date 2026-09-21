import useFittedWidgetBox from '../useFittedWidgetBox';

/*
 * 급식 이름을 위젯에 남은 자리에 가득 차게 키운다.
 *
 * 예전에는 위젯 크기에만 비례하는 글씨였다. 그래서 반찬이 적은 날에도 글씨가 작게 남아
 * 뒷자리에서 안 보였다. 여기서는 실제로 그려 본 뒤 넘치지 않는 가장 큰 크기를 찾는다.
 *
 * 맞추는 일 자체는 `../useFittedWidgetBox` 하나에 모았다 — 예전에는 이 파일이 제 손으로
 * ResizeObserver 를 달았는데, 자기가 크기를 바꾸는 요소를 자기가 감시해서 화면이 떨렸다
 * (2026-09-21). 이 위젯은 `overflow:auto` 라 스크롤 막대가 들락거리며 고리가 닫혔다.
 */

// 디자인 가이드의 글자 바닥(0.8rem). 더 줄이면 뒷자리 아이가 못 읽는다.
const MIN_DISH_SIZE_PX = 12.8;

export default function useFittedMealDishes(signature) {
  return useFittedWidgetBox(signature, {
    property: '--class-board-meal-dish-size',
    minSize: MIN_DISH_SIZE_PX,
  });
}
