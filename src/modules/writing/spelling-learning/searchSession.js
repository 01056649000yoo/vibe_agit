import { spellingLearningApi } from './api';

const pending = new Map();

/**
 * 수첩에서 찾아본 표현을 메모리에 모은다(닫을 때 한 번에 보낸다).
 *
 * `display` 는 교사 화면에 보일 표현이다 — 찾은 항목이면 **사전 항목의 표기**(예: `며칠 / 몇일`),
 * 못 찾았으면 학생이 친 검색어다. 예전에는 찾은 항목의 표현을 아예 남기지 않아
 * 교사 화면에 `common:myeochil` 같은 내부 키와 `미분류` 만 보였다(2026-08-19 수정).
 */
export const rememberSpellingSearch = ({ entryKey, label = '미분류', display = '', query = '', matched = false }) => {
    const safeKey = String(entryKey || '').slice(0, 80);
    if (!safeKey) return;
    const current = pending.get(safeKey) || {
        entry_key: safeKey,
        label: String(label || '미분류').slice(0, 40),
        display: String(display || query || '').slice(0, 80),
        query: matched ? '' : query,
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
