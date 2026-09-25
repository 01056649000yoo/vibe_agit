/*
 * 패널이 짚은 자리를 가리면 **패널이 비킨다**(2026-09-25 제보 — 모두의 아지트 흐름의
 * 문집 도서관 카드가 오른쪽 끝이라 오른쪽 아래 패널에 가려졌고, 접으면 테두리까지 사라졌다).
 * 오른쪽 아래 → 왼쪽 아래 → 오른쪽 위 → 왼쪽 위 순서로 안 겹치는 곳을 고른다.
 * 모두 겹치면 가장 덜 겹치는 곳.
 */
export const PANEL_PLACEMENTS = Object.freeze(['bottom-right', 'bottom-left', 'top-right', 'top-left']);
const PANEL_MARGIN = 20;
export const choosePanelPlacement = (target, panel, viewport) => {
    if (!target || !panel?.width || !panel?.height) return PANEL_PLACEMENTS[0];
    const overlapOf = (placement) => {
        const left = placement.endsWith('left') ? PANEL_MARGIN : viewport.width - PANEL_MARGIN - panel.width;
        const top = placement.startsWith('top') ? PANEL_MARGIN : viewport.height - PANEL_MARGIN - panel.height;
        const x = Math.max(0, Math.min(left + panel.width, target.left + target.width) - Math.max(left, target.left));
        const y = Math.max(0, Math.min(top + panel.height, target.top + target.height) - Math.max(top, target.top));
        return x * y;
    };
    const scored = PANEL_PLACEMENTS.map((placement) => ({ placement, overlap: overlapOf(placement) }));
    const clear = scored.find((item) => item.overlap === 0);
    if (clear) return clear.placement;
    return scored.reduce((best, item) => (item.overlap < best.overlap ? item : best)).placement;
};
