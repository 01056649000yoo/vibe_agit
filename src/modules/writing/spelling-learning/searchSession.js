import { spellingLearningApi } from './api';

const pending = new Map();

export const rememberSpellingSearch = ({ entryKey, label = '미분류', query = '', matched = false }) => {
    const safeKey = String(entryKey || '').slice(0, 80);
    if (!safeKey) return;
    const current = pending.get(safeKey) || { entry_key: safeKey, label, query: matched ? '' : query, count: 0 };
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
