import useFittedWidgetBox from '../useFittedWidgetBox';

/*
 * 자리표·역할표를 위젯 상자에 가득 차게 맞춘다.
 *
 * 왜(2026-09-03): 처음에는 글씨를 상자 크기에만 비례시켰다(`cqmin`). 그런데 그 방식은
 * **내용이 얼마나 많은지를 모른다** — 24명이든 6명이든 같은 크기로 그리니
 * 사람이 많으면 아래가 잘려 다 안 보이고, 적으면 쓸데없이 작았다.
 * 여기서는 실제로 그려 본 뒤 **넘치지 않는 가장 큰 크기**를 찾는다.
 *
 * 자리 칸 높이·이름 크기·틈은 모두 이 한 값(`--arrange-fit-unit`)에서 나온다.
 * 맞추는 일 자체는 `../useFittedWidgetBox` 하나에 모았다(2026-09-21) — 급식 위젯이
 * 같은 로직을 베끼며 고리 차단기를 빠뜨려 떨었다. 이 위젯은 `overflow:hidden` 이라
 * 우연히 안 걸렸을 뿐, 같은 지뢰를 품고 있었다.
 */

// 디자인 가이드의 글자 바닥(0.8rem). 더 줄이면 뒷자리 아이가 못 읽는다.
// ⚠️ 그래도 안 들어가면 줄이지 않고 그대로 둔다 — 위젯을 키우라는 뜻이다(작게 뭉개는 것보다 낫다).
const MIN_UNIT_PX = 12.8;
const MAX_UNIT_PX = 96;

export default function useFittedArrangement(signature) {
  return useFittedWidgetBox(signature, {
    property: '--arrange-fit-unit',
    minSize: MIN_UNIT_PX,
    maxSize: MAX_UNIT_PX,
  });
}
