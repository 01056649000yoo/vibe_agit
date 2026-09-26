import { supabase } from '../../../lib/supabaseClient';
import { diffWritingText } from './writingDiff.js';

/** 한 번에 보내는 글 수 — 서버 함수(record_post_revision_counts_v1)의 상한과 같다. */
export const REVISION_COUNT_BATCH = 200;

/**
 * 승인된 글의 고친 자리 수를 센다(목록 카드 `🖍️ N군데 고침`). 형광펜과 **같은 규칙**(writingDiff.js)만 쓴다 —
 * 서버에 같은 규칙을 한 번 더 두면 두 곳이 어긋난다. 처음 글이 없는 옛 글은 세지 않는다.
 */
export const buildRevisionCountItems = (posts) => posts
    .filter((post) => post?.id && post.original_content)
    .map((post) => ({ post_id: post.id, count: Math.min(diffWritingText(post.original_content, post.content).changeCount, 999) }));

/**
 * 교사가 승인한 직후 부른다. 실패해도 승인은 이미 끝났으므로 알리지 않고 넘어간다(카드에 수가 안 뜰 뿐이다).
 * @returns {Promise<Map<string, number>>} 저장한 글 id → 수 (화면 목록을 바로 고치는 데 쓴다)
 */
export const recordRevisionCounts = async (posts) => {
    const items = buildRevisionCountItems(posts);
    const saved = new Map();
    for (let index = 0; index < items.length; index += REVISION_COUNT_BATCH) {
        const batch = items.slice(index, index + REVISION_COUNT_BATCH);
        const { error } = await supabase.rpc('record_post_revision_counts_v1', { p_items: batch });
        if (error) {
            console.warn('고친 자리 수를 저장하지 못했습니다:', error.message);
            return saved;
        }
        batch.forEach((item) => saved.set(item.post_id, item.count));
    }
    return saved;
};
