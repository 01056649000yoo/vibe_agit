/**
 * 학생 입력기의 맞춤법 검사 엔진(2026-10-08) — 화면과 상관없는 순수 함수만 둔다.
 *
 * 세 겹을 이 순서로 합친다. 앞 겹이 찾은 자리와 겹치는 뒤 겹의 밑줄은 버린다.
 *   ① 빠른 규칙(spellingDetectionRules) — 늘 바로 쓸 수 있다
 *   ② 기본 자료 500개(elementarySpellingEntries) — 첫 화면을 막지 않게 뒤에서 받는 청크
 *   ③ 공통·반별 자료(서버에서 받은 entries)
 * 입력기 부품·채점표·회색 줄 기록이 모두 이 함수 하나로 "학생에게 보이는 빨간 줄"을 구한다.
 * 노드 스크립트에서도 불러 쓰므로 React·브라우저·Supabase 를 가져오지 않는다.
 */
import { findSpellingIssues, MAX_SPELLING_ISSUES } from '../tools/spelling-lookup/spellingDetectionRules.js';
import { findClassSpellingIssues } from '../spelling-learning/detection.js';

export { MAX_SPELLING_ISSUES };

const appendNonOverlapping = (current, candidates, limit) => {
    const next = [...current];
    for (const candidate of candidates) {
        if (next.length >= limit) break;
        if (!next.some((item) => candidate.start < item.end && candidate.end > item.start)) next.push(candidate);
    }
    return next;
};

/**
 * 글에서 빨간 밑줄 자리를 찾는다. 글은 완성형(NFC)으로 맞춰 넘긴다.
 * @param {string} text
 * @param {{ elementaryDetector?: Function|null, entries?: Array, limit?: number }} options
 * @returns {Array<{ id, entryId, start, end, text, wrong, right, lookup, label }>} 시작 위치 순
 */
export const checkSpelling = (text, { elementaryDetector = null, entries = [], limit = MAX_SPELLING_ISSUES } = {}) => {
    const value = String(text || '');
    if (!value) return [];
    let found = findSpellingIssues(value, limit);
    if (elementaryDetector) found = appendNonOverlapping(found, elementaryDetector(value, limit), limit);
    const remaining = Math.max(0, limit - found.length);
    if (remaining > 0 && entries?.length) {
        found = appendNonOverlapping(found, findClassSpellingIssues(value, entries, remaining), limit);
    }
    return found.sort((a, b) => a.start - b.start).slice(0, limit);
};

/** 같은 항목은 한 번만(아래 `확인해 볼 표현` 칩용). */
export const uniqueSpellingIssues = (issues) => {
    const seen = new Set();
    return issues.filter((issue) => {
        if (seen.has(issue.entryId)) return false;
        seen.add(issue.entryId);
        return true;
    });
};

/** 두 글이 앞에서부터 몇 글자까지 똑같은지. */
export const commonPrefixLength = (left, right) => {
    const limit = Math.min(left.length, right.length);
    let index = 0;
    while (index < limit && left.charAt(index) === right.charAt(index)) index += 1;
    return index;
};

/**
 * 손을 멈추기 전(아직 훑지 않은 글자)에는 예전 위치의 밑줄이 엉뚱한 곳에 그어진다.
 * 훑은 글과 화면의 글이 같은 앞부분까지만 밑줄을 남긴다.
 */
export const issuesSafeWhileTyping = (issues, scannedText, currentText) => {
    if (scannedText === currentText) return issues;
    const safeLength = commonPrefixLength(scannedText, currentText);
    return issues.filter((issue) => issue.end <= safeLength);
};
