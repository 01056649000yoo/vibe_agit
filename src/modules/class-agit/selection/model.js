import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { editExhibition } from '../exhibitionDraft.js';

export const workKey = (item) => item.sourceId || item.itemId;
export function toggleSelection(selected, row, capacity) {
    if (selected.some((item) => item.id === row.id)) return selected.filter((item) => item.id !== row.id);
    if (selected.length >= Math.min(limits.selectionBatch, capacity)) throw new Error(`한 번에 최대 ${Math.min(limits.selectionBatch, capacity)}편을 선택할 수 있습니다. 먼저 담거나 선택을 줄여 주세요.`);
    return [...selected, row];
}
export function addExhibitionSources(draft, sources) {
    if (!sources.length || sources.length > limits.selectionBatch) throw new Error('담을 작품을 1~50편 선택해 주세요.');
    // Reduce only into a new value: a failed source never leaves a partially edited draft.
    return sources.reduce((next, source) => editExhibition(next, { type: 'add', source, classAcknowledged: true }), draft);
}
export function moveSelected(items, selectedIds, position) {
    const ids = new Set(selectedIds);
    const moving = items.filter((item) => ids.has(workKey(item)));
    if (!moving.length) return items;
    if (!Number.isInteger(position) || position < 1 || position > items.length) throw new Error('목록 안의 이동 순번을 입력해 주세요.');
    const remaining = items.filter((item) => !ids.has(workKey(item)));
    const insertion = Math.min(position - 1, remaining.length);
    return [...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)];
}
export function sortSelectedWorks(items, mode, addedOrder) {
    const order = new Map(addedOrder.map((id, index) => [id, index]));
    if (mode === 'added') return [...items].sort((a, b) => (order.get(workKey(a)) ?? Infinity) - (order.get(workKey(b)) ?? Infinity));
    const field = mode === 'mission' ? 'groupTitle' : 'authorName';
    return [...items].sort((a, b) => String(Reflect.get(a, field) || '').localeCompare(String(Reflect.get(b, field) || ''), 'ko'));
}
export function replaceDraftItems(draft, items) {
    const existing = new Set(draft.items.map(workKey));
    if (items.length > draft.items.length || new Set(items.map(workKey)).size !== items.length || items.some((item) => !existing.has(workKey(item)))) throw new Error('작품 목록을 다시 확인해 주세요.');
    return { ...draft, items, revision: draft.revision + 1 };
}
