/* eslint-disable security/detect-object-injection -- 글자 배열과 LCS 표는 이 파일에서 만든 숫자 인덱스로만 읽고 쓴다. */
import { diffWritingText } from './writingDiff.js';

/**
 * 선생님 교정지 — 고치기 전 학생 글에 **빨간 펜 교정 부호**를 얹는다(2026-09-30).
 *
 * 1) 어절 비교(`diffWritingText`)로 "바뀐 덩어리"(같은 글 사이의 지운 것·넣은 것, 사이의 공백 포함)를 찾고
 * 2) 그 덩어리 안에서만 **한 글자씩** 다시 견준다. 어절 비교는 공백까지 한 조각으로 묶어(`갓다. 그래서` 가 통째로 지운 것)
 *    부호를 정확히 붙일 수 없었다. 실제 교정도 한 글자 단위라 이쪽이 맞다.
 *
 * 글자 비교 결과를 부호로 옮긴다.
 *   - 공백만 새로 생김 → `split`(∨ 띄어 쓰기)      - 공백만 사라짐 → `join`(⌒ 붙여 쓰기)
 *   - 글자만 새로 생김 → `insert`(∧ 넣기)           - 글자만 사라짐 → `delete`(지우기)
 *   - 사라지고 생김   → `replace`(지운 말 위에 고친 말)
 * 누가 고쳤는지 추측하지 않는다 — 실제 두 판(고치기 전 글·선생님 수정본)만 견준다. `node --test` 가 바로 부른다.
 */

/** 덩어리 하나의 글자 비교 상한(글자 수 곱). 넘으면 덩어리를 통째로 `replace` 로 보인다. */
export const PROOF_CHAR_MAX_CELLS = 40_000;

const isBlank = (text) => /^\s+$/.test(text);

/** 두 글자열의 글자 단위 비교 — same/del/ins 를 차례로. */
const diffChars = (before, after) => {
    const a = [...before];
    const b = [...after];
    const n = a.length;
    const m = b.length;
    if ((n + 1) * (m + 1) > PROOF_CHAR_MAX_CELLS) return null;
    const width = m + 1;
    const table = new Uint16Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            table[i * width + j] = a[i] === b[j]
                ? table[(i + 1) * width + j + 1] + 1
                : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) { ops.push(['same', a[i]]); i += 1; j += 1; }
        else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { ops.push(['del', a[i]]); i += 1; }
        else { ops.push(['ins', b[j]]); j += 1; }
    }
    while (i < n) { ops.push(['del', a[i]]); i += 1; }
    while (j < m) { ops.push(['ins', b[j]]); j += 1; }
    return ops;
};

/** 글자 비교 결과를 교정 부호 조각으로. */
const marksFromChars = (ops) => {
    const out = [];
    let same = '';
    let del = '';
    let ins = '';
    const flushSame = () => { if (same) { out.push({ kind: 'same', text: same }); same = ''; } };
    const flushChange = () => {
        if (!del && !ins) return;
        if (!del && isBlank(ins)) out.push({ kind: 'split', text: ins });
        else if (!ins && isBlank(del)) out.push({ kind: 'join', text: del });
        else if (!del) out.push({ kind: 'insert', text: ins });
        else if (!ins) out.push({ kind: 'delete', text: del });
        else out.push({ kind: 'replace', from: del, to: ins });
        del = '';
        ins = '';
    };
    for (const [op, char] of ops) {
        if (op === 'same') { flushChange(); same += char; continue; }
        flushSame();
        if (op === 'del') del += char;
        else ins += char;
    }
    flushChange();
    flushSame();
    return out;
};

/**
 * @returns {{ mode: string, changeCount: number,
 *   segments: ({ kind: 'same'|'insert'|'delete'|'split'|'join', text: string }
 *     | { kind: 'replace', from: string, to: string })[] }}
 *   `split`·`join` 의 `text` 는 생기거나 사라진 공백이다 — 조각을 이으면 두 원문이 그대로 되살아난다.
 *   `changeCount` 는 부호 수(띄어·붙여 쓰기 포함).
 */
export const buildProofMarks = (beforeText, afterText) => {
    const diff = diffWritingText(beforeText, afterText);
    if (diff.mode === 'none' || diff.mode === 'same') {
        return { mode: diff.mode, changeCount: 0, segments: [{ kind: 'same', text: String(afterText ?? '') }] };
    }
    const segments = [];
    let groupBefore = '';
    let groupAfter = '';
    let inGroup = false;
    let trailingBlank = '';
    const flushGroup = () => {
        if (!inGroup) return;
        const ops = diffChars(groupBefore, groupAfter);
        if (ops) segments.push(...marksFromChars(ops));
        else segments.push({ kind: 'replace', from: groupBefore, to: groupAfter });
        groupBefore = '';
        groupAfter = '';
        inGroup = false;
    };
    for (const segment of diff.segments) {
        if (segment.type === 'same') {
            // 바뀐 조각 사이의 공백만 있는 같은 부분은 덩어리에 넣어 둔다(두 글 모두 가진 공백).
            if (inGroup && isBlank(segment.text)) { trailingBlank += segment.text; continue; }
            if (trailingBlank) { groupBefore += trailingBlank; groupAfter += trailingBlank; trailingBlank = ''; }
            flushGroup();
            segments.push({ kind: 'same', text: segment.text });
            continue;
        }
        if (trailingBlank) { groupBefore += trailingBlank; groupAfter += trailingBlank; trailingBlank = ''; }
        inGroup = true;
        if (segment.type === 'removed') groupBefore += segment.text;
        else groupAfter += segment.text;
    }
    if (trailingBlank) { groupBefore += trailingBlank; groupAfter += trailingBlank; }
    flushGroup();
    // 이웃한 같은 조각을 합친다(보여 줄 때 끊기지 않게).
    const merged = [];
    for (const segment of segments) {
        const last = merged.at(-1);
        if (segment.kind === 'same' && last?.kind === 'same') last.text += segment.text;
        else merged.push({ ...segment });
    }
    return { mode: diff.mode, changeCount: merged.filter((segment) => segment.kind !== 'same').length, segments: merged };
};

/** 교정 부호의 뜻 — 화면 아래 안내와 검사가 같은 목록을 쓴다. */
export const PROOF_MARK_LEGEND = Object.freeze([
    { kind: 'split', mark: '∨', label: '띄어 쓰기' },
    { kind: 'join', mark: '⌒', label: '붙여 쓰기' },
    { kind: 'insert', mark: '∧', label: '넣기' },
    { kind: 'delete', mark: '—', label: '지우기' },
    { kind: 'replace', mark: '↑', label: '고치기' }
]);
