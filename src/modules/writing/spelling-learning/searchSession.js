import { spellingLearningApi } from './api';
import { normalizeSpellingCandidate } from './searchCandidate';

const pending = new Map();
const MAX_BATCH_ITEMS = 20;

/**
 * 수첩에서 찾아본 표현을 메모리에 모은다(닫을 때 한 번에 보낸다).
 *
 * 기존 자료·사전 검색·문장은 고정 요약 키로 횟수만 모은다. 교사 화면에 보낼 원문은
 * `candidate`로 분류된 15자 이하의 짧은 미등록 한글 표현뿐이다.
 */
export const rememberSpellingSearch = ({ kind = 'covered', entryKey = '', label = '미분류', display = '' }) => {
    const normalizedDisplay = normalizeSpellingCandidate(display);
    const safeKey = kind === 'candidate'
        ? `candidate:${normalizedDisplay}`
        : kind === 'dictionary' || kind === 'sentence'
            ? `summary:${kind}`
            : String(entryKey || '').slice(0, 80);
    if (!safeKey) return;
    if (!pending.has(safeKey) && pending.size >= MAX_BATCH_ITEMS) return;
    const current = pending.get(safeKey) || {
        entry_key: safeKey,
        kind,
        label: String(label || '미분류').slice(0, 40),
        display: kind === 'candidate' ? normalizedDisplay.slice(0, 15) : String(display || '').slice(0, 80),
        count: 0
    };
    current.count = Math.min(100, current.count + 1);
    pending.set(safeKey, current);
};

export const flushSpellingSearches = async () => {
    const items = [...pending.values()];
    if (!items.length) return;
    pending.clear();
    try {
        await spellingLearningApi.recordSearchBatch(items);
    } catch (error) {
        items.forEach((item) => pending.set(item.entry_key, item));
        throw error;
    }
};
