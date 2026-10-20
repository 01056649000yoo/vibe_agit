/* eslint-disable security/detect-object-injection -- 세는 칸은 이 파일이 만든 두 값(student·teacher)뿐이다. */
import { countNonBlank, diffWritingText, isBlankText } from './writingDiff.js';

/**
 * 누가 어디를 고쳤는지(2026-10-20, 교사 글 자세히 보기의 `처음 글과 나란히`).
 *
 * 글이 거쳐 온 판을 순서대로 늘어놓고 **앞 판 → 뒷 판**을 차례로 견준다. 어절이 누구 것인지 추측하지 않는다.
 *   처음 글 →(학생)→ 선생님이 고치기 전 글 →(선생님)→ 선생님 수정본 →(학생)→ 다시 낸 글 → … → 지금 글
 * 판은 처음 글(`original_content`)과 교정 회차 기록(`get_post_teacher_edits_v1`)의 `base_content`·`edited_content`,
 * 지금 글(`content`)에서 나온다. 교정 기록은 20261360 이후 고친 글부터 쌓이므로 그전 글은 회차가 0으로 보여
 * 처음 글 → 지금 글이 모두 학생이 고친 것처럼 나온다(옛 글은 그 사이 판이 남아 있지 않다).
 *
 * 결과 조각: `{ text, author: 'orig'|'student'|'teacher', removedBy: null|'student'|'teacher' }`
 *   - 지금 글 = `removedBy` 가 없는 조각을 이은 것
 *   - 처음 글 = `author === 'orig'` 인 조각을 이은 것
 * 화면과 떨어진 순수 함수라 `node --test` 가 바로 부른다.
 */

/** 이어진 같은 종류 조각을 하나로 묶는다(이어 붙인 글은 그대로다). */
const mergeItems = (items) => {
    const merged = [];
    for (const item of items) {
        if (item.text === '') continue;
        const previous = merged.at(-1);
        if (previous && previous.author === item.author && previous.removedBy === item.removedBy) previous.text += item.text;
        else merged.push({ ...item });
    }
    return merged;
};

/** 지금 살아 있는 글(지워진 조각을 뺀 것)에 `to` 로 가는 비교를 입혀 새 조각 목록을 만든다. 너무 긴 글이면 null. */
const applyStep = (items, to, actor) => {
    const live = items.filter((item) => !item.removedBy).map((item) => item.text).join('');
    if (live === to) return items;
    const diff = diffWritingText(live, to);
    if (diff.mode === 'none') return null;

    const out = [];
    let index = 0;
    let carry = null;
    // 살아 있는 다음 조각. 이미 지워진 조각은 그대로 내보내며 지나간다.
    const nextLive = () => {
        for (;;) {
            const item = carry ?? items[index++];
            carry = null;
            if (!item) return null;
            if (item.removedBy) { out.push(item); continue; }
            return item;
        }
    };
    const consume = (length, removedBy) => {
        let left = length;
        while (left > 0) {
            const item = nextLive();
            if (!item) break;
            const take = Math.min(left, item.text.length);
            const head = { ...item, text: item.text.slice(0, take) };
            out.push(removedBy ? { ...head, removedBy } : head);
            if (take < item.text.length) carry = { ...item, text: item.text.slice(take) };
            left -= take;
        }
    };

    for (const segment of diff.segments) {
        if (segment.type === 'added') out.push({ text: segment.text, author: actor, removedBy: null });
        else consume(segment.text.length, segment.type === 'removed' ? actor : null);
    }
    if (carry) out.push(carry);
    out.push(...items.slice(index));
    return out;
};

/**
 * @param {string} original 처음 글
 * @param {{ base_content?: string, edited_content?: string }[]} rounds 교정 회차(오래된 것부터)
 * @param {string} current 지금 글
 * @returns {{ text: string, author: string, removedBy: string|null }[] | null} 너무 긴 글이면 null(화면은 옛 비교로 물러선다)
 */
export const attributeWritingChanges = (original, rounds, current) => {
    const steps = [];
    for (const round of Array.isArray(rounds) ? rounds : []) {
        steps.push({ actor: 'student', to: String(round.base_content ?? '') });
        steps.push({ actor: 'teacher', to: String(round.edited_content ?? '') });
    }
    steps.push({ actor: 'student', to: String(current ?? '') });

    let items = [{ text: String(original ?? ''), author: 'orig', removedBy: null }];
    for (const step of steps) {
        items = applyStep(items, step.to, step.actor);
        if (!items) return null;
    }
    return mergeItems(items);
};

/**
 * 제목도 본문과 같은 방식으로 가른다(2026-10-21 제보: 최종 글 비교에 제목 교정이 안 나왔다).
 * 처음 제목 → (학생) → 선생님이 고치기 전 제목 → (선생님) → 선생님 수정 제목 → … → 지금 제목.
 * `rounds` 는 `get_post_teacher_edits_v1` 회차 그대로(`base_title`·`edited_title`).
 */
export const attributeTitleChanges = (original, rounds, current) => attributeWritingChanges(
    original,
    (Array.isArray(rounds) ? rounds : []).map((round) => ({ base_content: round.base_title, edited_content: round.edited_title })),
    current
);

/** 고친 자리 수(학생·선생님 따로). 이어진 추가·삭제 묶음을 한 자리로 센다. */
export const countAttributedChanges = (items) => {
    const counts = { student: 0, teacher: 0 };
    let last = null;
    for (const item of items) {
        const actor = item.removedBy ?? (item.author === 'orig' ? null : item.author);
        if (!actor || isBlankText(item.text)) {
            if (!actor && !isBlankText(item.text)) last = null;
            continue;
        }
        if (last !== actor) counts[actor] += 1;
        last = actor;
    }
    return counts;
};

/** 처음 글을 거의 새로 썼다고 안내하는 기준 — 처음 글(공백 뺀 글자)의 이만큼 이상이 지워지거나 바뀌었을 때. */
export const REWRITE_NOTICE_RATIO = 0.5;

/**
 * 처음 글이 얼마나 고쳐졌는지. 처음 글 글자(공백 뺀 것) 중 지워진 비율과, 그것을 지운 사람(학생·선생님)별 몫.
 * `rewritten` 이면 화면이 "거의 새로 썼어요" 를 알린다. `by` 는 더 많이 지운 쪽(같으면 student).
 */
export const getRewriteShare = (items) => {
    const size = (item) => countNonBlank(item.text);
    const original = items.filter((item) => item.author === 'orig');
    const total = original.reduce((sum, item) => sum + size(item), 0);
    const removed = { student: 0, teacher: 0 };
    for (const item of original) if (item.removedBy) removed[item.removedBy] += size(item);
    const ratio = total > 0 ? (removed.student + removed.teacher) / total : 0;
    return {
        ratio,
        percent: Math.round(ratio * 100),
        rewritten: ratio >= REWRITE_NOTICE_RATIO,
        by: removed.teacher > removed.student ? 'teacher' : 'student'
    };
};
