/* eslint-disable security/detect-object-injection -- 토막 배열과 LCS 표는 이 파일에서 만든 숫자 인덱스로만 읽고 쓴다. */
/**
 * 처음 글 → 고친 글에서 **바뀐 곳**을 찾는다(2026-09-26, 승인된 글의 비교 보기).
 *
 * 어절(띄어쓰기 단위)로 견준다. 한국어는 조사·어미가 붙어 글자 단위로 견주면 조각이 너무 잘게 나뉘어
 * 아이가 읽기 어렵고, 문장 단위로 견주면 한 글자만 고쳐도 문장 전체가 칠해진다.
 *
 * 계산량: 앞뒤의 같은 부분을 먼저 잘라 낸 뒤 가운데만 LCS(최장 공통 부분)로 견준다. 가운데가 너무 크면
 * 줄 단위로 물러서고, 그것도 크면 칠하지 않는다(`mode: 'none'`). 운영 글 99%는 2,000자 안이지만
 * 30만 자짜리 글도 있어서, 태블릿에서 화면이 멈추지 않게 상한을 둔다.
 * 화면(.jsx)과 떨어진 순수 함수라 `node --test` 가 바로 부른다.
 */

/** LCS 표 칸 수 상한. 어절 500 × 500 정도 — 표 하나가 1MB 남짓이다. */
export const WRITING_DIFF_MAX_CELLS = 250_000;

/** 어절과 그 사이 공백(줄바꿈 포함)을 따로 토막 낸다. 공백도 토막이라 원문 모양이 그대로 되살아난다. */
export const tokenizeWords = (text) => String(text ?? '').split(/(\s+)/).filter((token) => token !== '');

/** 줄 단위 토막(줄바꿈을 줄 끝에 붙여 둔다). */
export const tokenizeLines = (text) => String(text ?? '').split(/(?<=\n)/).filter((token) => token !== '');

const isBlank = (token) => /^\s+$/.test(token);

/** 앞뒤가 같은 토막 수를 센다. */
const commonEdges = (before, after) => {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
    let end = 0;
    while (
        end < before.length - start
        && end < after.length - start
        && before[before.length - 1 - end] === after[after.length - 1 - end]
    ) end += 1;
    return { start, end };
};

/** 가운데 토막들을 LCS 로 견줘 same/removed/added 조각을 차례로 돌려준다. 상한을 넘으면 null. */
const diffMiddle = (before, after, maxCells) => {
    const n = before.length;
    const m = after.length;
    if (n === 0 || m === 0) {
        return [
            ...before.map((text) => ({ type: 'removed', text })),
            ...after.map((text) => ({ type: 'added', text }))
        ];
    }
    if ((n + 1) * (m + 1) > maxCells) return null;
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            table[i * width + j] = before[i] === after[j]
                ? table[(i + 1) * width + j + 1] + 1
                : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
    }
    const pieces = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (before[i] === after[j]) {
            pieces.push({ type: 'same', text: before[i] });
            i += 1; j += 1;
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
            pieces.push({ type: 'removed', text: before[i] });
            i += 1;
        } else {
            pieces.push({ type: 'added', text: after[j] });
            j += 1;
        }
    }
    while (i < n) { pieces.push({ type: 'removed', text: before[i] }); i += 1; }
    while (j < m) { pieces.push({ type: 'added', text: after[j] }); j += 1; }
    return pieces;
};

/** 같은 종류가 이어진 조각을 하나로 묶는다. 조각의 종류는 바꾸지 않는다 — 이어 붙이면 두 원문이 그대로 되살아나야 한다. */
const mergePieces = (pieces) => {
    const merged = [];
    for (const piece of pieces) {
        const previous = merged.at(-1);
        if (previous && previous.type === piece.type) previous.text += piece.text;
        else merged.push({ type: piece.type, text: piece.text });
    }
    return merged;
};

/**
 * @returns {{ mode: 'word'|'line'|'same'|'none', segments: { type: 'same'|'added'|'removed', text: string }[],
 *             changeCount: number }}
 *   `changeCount` 는 바뀐 **자리** 수(이어진 추가·삭제는 한 자리로 센다). 공백만 바뀐 자리는 세지 않는다.
 */
export const diffWritingText = (beforeText, afterText, { maxCells = WRITING_DIFF_MAX_CELLS } = {}) => {
    const before = String(beforeText ?? '');
    const after = String(afterText ?? '');
    if (before === after) return { mode: 'same', segments: after ? [{ type: 'same', text: after }] : [], changeCount: 0 };

    for (const [mode, tokenize] of [['word', tokenizeWords], ['line', tokenizeLines]]) {
        const beforeTokens = tokenize(before);
        const afterTokens = tokenize(after);
        const { start, end } = commonEdges(beforeTokens, afterTokens);
        const middle = diffMiddle(
            beforeTokens.slice(start, beforeTokens.length - end),
            afterTokens.slice(start, afterTokens.length - end),
            maxCells
        );
        if (!middle) continue;
        const pieces = [
            ...beforeTokens.slice(0, start).map((text) => ({ type: 'same', text })),
            ...middle,
            ...beforeTokens.slice(beforeTokens.length - end).map((text) => ({ type: 'same', text }))
        ];
        const segments = mergePieces(pieces);
        // 바뀐 자리 = 같은 부분 사이에 낀 바뀐 조각 묶음. 지우고 새로 쓴 것이 붙어 있으면 한 자리다.
        let changeCount = 0;
        let inChange = false;
        for (const segment of segments) {
            // 공백만 있는 같은 부분은 경계가 아니다(`할수` → `할 수` 는 한 자리).
            if (segment.type === 'same') { if (!isBlank(segment.text)) inChange = false; continue; }
            if (!inChange && !isBlank(segment.text)) { changeCount += 1; inChange = true; }
        }
        return { mode, segments, changeCount };
    }
    return { mode: 'none', segments: [{ type: 'same', text: after }], changeCount: 0 };
};

/**
 * 한 화면에 보여 줄 조각만 고른다(`merged` 전부, `after` 는 지운 곳을 빼고, `before` 는 새로 쓴 곳을 뺀다).
 *
 * 고른 뒤 바뀐 두 조각 사이에 공백만 남으면 그 공백도 같은 표시로 칠한다(`bridged`). 그러지 않으면 형광펜이
 * 어절마다 끊겨 보인다. 이 일은 **보여 줄 때만** 한다 — 비교 결과에서 공백의 종류를 바꾸면 처음 글의
 * 띄어쓰기가 사라진다(2026-09-26 검사가 잡았다: `할수 있어서` → `할수있어서`).
 */
export const segmentsForView = (segments, variant = 'merged') => {
    const picked = segments.filter((segment) => (
        segment.type === 'same'
        || variant === 'merged'
        || (variant === 'after' && segment.type === 'added')
        || (variant === 'before' && segment.type === 'removed')
    ));
    return picked.map((segment, index) => {
        const previous = picked.at(index - 1);
        const next = picked.at(index + 1);
        const bridges = index > 0 && segment.type === 'same' && isBlank(segment.text)
            && previous && next && previous.type !== 'same' && previous.type === next.type;
        return bridges ? { type: previous.type, text: segment.text, bridged: true } : segment;
    });
};
