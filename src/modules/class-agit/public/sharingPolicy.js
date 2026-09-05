import { CLASS_AGIT_LIMITS } from '../policy.js';

// 외부 작성자 표시는 작품 순번에서만 만든다. 저장된 별명·실명은 사용하지 않는다.
export const externalAuthor = (index) => `새싹 작가 ${String(index + 1).padStart(2, '0')}`;
export const hasBlockedShareWorks = (items) => items.some((item) => item.unavailable || item.sourceChanged || item.revoked);
export function prepareShareWorks(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > CLASS_AGIT_LIMITS.maxWorks) throw new Error(`공개할 작품은 1~${CLASS_AGIT_LIMITS.maxWorks}편이어야 합니다.`);
    if (hasBlockedShareWorks(items)) throw new Error('공개할 수 없는 작품이 있습니다. 전시 편집에서 원글을 다시 확인하거나 작품을 빼고 저장해 주세요.');
    return items.map((item, index) => ({ itemId: item.itemId, sourceRevision: item.sourceRevision, publicAlias: externalAuthor(index) }));
}
