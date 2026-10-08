/**
 * 분류 자료(reference·practice 항목 목록)로 글에서 밑줄 자리를 찾는 장치를 만든다.
 * 기본 자료 500개와 검토 중 자료가 같은 장치를 쓴다 — 모든 검사 표현을 후보 색인 하나로 합친 뒤
 * 본문을 한 번만 훑고, 후보가 된 규칙만 문맥을 확인한다(분류별 반복 검사를 만들지 않는다).
 */
import { collectSpellingCandidates, createSpellingCandidateIndex } from './candidateIndex.js';

export const createCatalogDetector = (entries, { idPrefix = 'elementary', source = null } = {}) => {
    const rules = Object.freeze(entries.map((entry) => Object.freeze({
        id: `${idPrefix}-${entry.id}`,
        entryId: entry.id,
        label: entry.learningLabel,
        categoryId: entry.categoryId,
        category: entry.category,
        subcategoryId: entry.subcategoryId,
        subcategory: entry.subcategory,
        detectionMode: entry.detectionMode,
        patterns: entry.detectionPatterns
    })));
    const indexedPatterns = Object.freeze(rules.flatMap((rule) => rule.patterns.map((item) => {
        const target = item.target || item.text;
        return Object.freeze({
            rule,
            item,
            target,
            targetOffset: Number.isInteger(item.targetOffset) ? item.targetOffset : Math.max(0, item.text.indexOf(target))
        });
    })));
    const candidateIndex = createSpellingCandidateIndex(indexedPatterns, (indexedPattern) => indexedPattern.target);

    const find = (value, limit = 50) => {
        const text = String(value || '').normalize('NFC');
        const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 50;
        if (!text || safeLimit === 0) return [];
        const issues = [];
        for (const { item: indexedPattern, starts } of collectSpellingCandidates(text, candidateIndex)) {
            const { rule, item, target, targetOffset } = indexedPattern;
            let nextAllowedMatchStart = 0;
            for (const targetStart of starts) {
                const matchStart = targetStart - targetOffset;
                if (matchStart < nextAllowedMatchStart || !text.startsWith(item.text, matchStart)) continue;
                const start = matchStart + targetOffset;
                issues.push({
                    id: `${rule.id}-${start}`,
                    ruleId: rule.id,
                    entryId: rule.entryId,
                    label: rule.label,
                    categoryId: rule.categoryId,
                    category: rule.category,
                    subcategoryId: rule.subcategoryId,
                    subcategory: rule.subcategory,
                    detectionMode: rule.detectionMode,
                    ...(source ? { source } : {}),
                    start,
                    end: start + target.length,
                    text: text.slice(start, start + target.length),
                    wrong: target,
                    right: item.right,
                    lookup: item.lookup || item.right
                });
                nextAllowedMatchStart = matchStart + item.text.length;
                if (issues.length >= safeLimit) break;
            }
            if (issues.length >= safeLimit) break;
        }
        return issues.sort((left, right) => left.start - right.start);
    };

    return { rules, indexedPatterns, find };
};
