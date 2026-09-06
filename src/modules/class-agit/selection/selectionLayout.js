/** 작품 고르기 화면이 1열로 접히는 폭. `selection.css` 의 `@container (max-width: 740px)` 와 같은 값이다.
 *  두 곳이 어긋나면 좁은 화면인데 레일이 안 닫히거나, 넓은 화면인데 미션 목록이 사라진다.
 *  `tests/classAgitSelection.test.mjs` 가 CSS 와 이 값을 함께 본다. */
export const NARROW_LAYOUT_PX = 740;
