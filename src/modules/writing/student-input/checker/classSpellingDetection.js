import {
    collectSpellingCandidates,
    createSpellingCandidateIndex
} from './candidateIndex.js';

let cachedEntries = null;
let cachedCandidateIndex = null;

const getClassCandidateIndex = (entries) => {
    if (entries === cachedEntries && cachedCandidateIndex) return cachedCandidateIndex;
    cachedEntries = entries;
    cachedCandidateIndex = createSpellingCandidateIndex(
        entries || [],
        (entry) => entry.wrong_expression
    );
    return cachedCandidateIndex;
};

export const findClassSpellingIssues = (value, entries, limit = 50) => {
    const text = String(value || '').normalize('NFC');
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 50;
    if (!text || safeLimit === 0) return [];

    const issues = [];
    const candidateIndex = getClassCandidateIndex(entries);
    const candidates = collectSpellingCandidates(text, candidateIndex);
    for (const { item: entry, starts } of candidates) {
        const wrong = String(entry.wrong_expression || '').normalize('NFC');
        const correct = String(entry.correct_expression || '').normalize('NFC');
        if (!wrong || wrong === correct) continue;
        let nextAllowedStart = 0;
        for (const start of starts) {
            if (start < nextAllowedStart) continue;
            issues.push({
                id: `class:${entry.id}:${start}`,
                entryId: `class:${entry.id}`,
                start,
                end: start + wrong.length,
                text: wrong,
                wrong,
                right: correct,
                lookup: correct,
                label: entry.label
            });
            nextAllowedStart = start + wrong.length;
            if (issues.length >= safeLimit) break;
        }
        if (issues.length >= safeLimit) break;
    }
    return issues;
};
