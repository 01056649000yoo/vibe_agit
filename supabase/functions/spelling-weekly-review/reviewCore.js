/**
 * 주간 맞춤법 검수의 **순수 로직 원본**이다.
 *
 * 같은 계산을 두 곳이 쓴다 — 관리자 화면이 부르는 이 폴더의 엣지 함수(Deno)와,
 * 되돌림 경로로 남겨 둔 `scripts/run-weekly-spelling-review.mjs`(Node)다.
 * 그래서 어느 쪽에도 없는 것은 여기 두지 않는다: 파일 읽기·DB·네트워크·`node:` 내장 모듈.
 *
 * sha256 만 플랫폼마다 다르므로 **부르는 쪽이 넣어 준다**(`hashFn`). Deno 의 Web Crypto 는
 * 비동기라 여기서 직접 쓰면 계산 전체가 비동기가 된다 — 넣어 받으면 양쪽 다 동기로 남는다.
 */

export const MODEL = 'gpt-4o-mini';
export const REVIEW_VERSION = 'weekly-v1';
export const MAX_CANDIDATES = 200;
export const AI_BATCH_SIZE = 12;

export const normalizeSpellingValue = (value) => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s/·,?!."'’“”()_-]/g, '');

export const trimText = (value, limit) => String(value || '').normalize('NFC').trim().slice(0, limit);

const diceScore = (leftValue, rightValue) => {
    const left = normalizeSpellingValue(leftValue);
    const right = normalizeSpellingValue(rightValue);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.length === 1 || right.length === 1) return left.includes(right) || right.includes(left) ? 0.6 : 0;
    const pairs = new Map();
    for (let index = 0; index < left.length - 1; index += 1) {
        const pair = left.slice(index, index + 2);
        pairs.set(pair, (pairs.get(pair) || 0) + 1);
    }
    let overlap = 0;
    for (let index = 0; index < right.length - 1; index += 1) {
        const pair = right.slice(index, index + 2);
        const count = pairs.get(pair) || 0;
        if (count > 0) {
            overlap += 1;
            pairs.set(pair, count - 1);
        }
    }
    return (2 * overlap) / (left.length + right.length - 2);
};

const addKnownRecord = (records, aliases, record) => {
    const expression = trimText(record.expression, 80);
    const correction = trimText(record.correction, 80);
    if (!expression) return;
    const normalized = normalizeSpellingValue(expression);
    if (!normalized) return;
    aliases.add(normalized);
    const key = `${normalized}:${normalizeSpellingValue(correction)}`;
    if (!records.has(key)) records.set(key, { ...record, expression, correction });
};

export const buildKnownSpellingIndex = (lookupPayload, detectionPayload, commonEntries = []) => {
    const aliases = new Set();
    const records = new Map();

    for (const entry of lookupPayload?.lookupEntries || []) {
        const values = [entry.question, entry.answer, ...(entry.searchable || [])];
        for (const value of values) {
            for (const expression of String(value || '').split('/').map((item) => item.trim()).filter(Boolean)) {
                addKnownRecord(records, aliases, {
                    expression,
                    correction: entry.answer,
                    label: entry.learningLabel || entry.category || '기본 자료',
                    source: '기본 500개'
                });
            }
        }
    }
    for (const rule of detectionPayload?.quickRules || []) {
        addKnownRecord(records, aliases, {
            expression: rule.wrong,
            correction: rule.right,
            label: rule.label || '빠른 검사 규칙',
            source: '기본 500개'
        });
    }
    for (const rule of detectionPayload?.elementaryRules || []) {
        for (const pattern of rule.patterns || []) {
            addKnownRecord(records, aliases, {
                expression: pattern.target || pattern.text,
                correction: pattern.right,
                label: rule.label || '기본 자료',
                source: '기본 500개'
            });
        }
    }
    for (const entry of commonEntries || []) {
        addKnownRecord(records, aliases, {
            expression: entry.wrong_expression,
            correction: entry.correct_expression,
            label: entry.label || '공통 자료',
            source: '공통 자료'
        });
        addKnownRecord(records, aliases, {
            expression: entry.correct_expression,
            correction: entry.correct_expression,
            label: entry.label || '공통 자료',
            source: '공통 자료'
        });
    }
    return { aliases, records: [...records.values()] };
};

const mergeSource = (groups, sourceKind, row) => {
    const expression = trimText(row.expression, 40);
    const correction = sourceKind === 'search' ? '' : trimText(row.correction, 40);
    const expressionKey = normalizeSpellingValue(expression);
    if (!expressionKey) return;
    const correctionKey = normalizeSpellingValue(correction);
    const groupKey = `${expressionKey}:${correctionKey}`;
    const current = groups.get(groupKey) || {
        expression,
        source_correction: correction,
        source_kinds: new Set(),
        hit_count: 0,
        class_count: 0
    };
    current.source_kinds.add(sourceKind);
    current.hit_count = Math.max(current.hit_count, Number(row.hit_count ?? row.search_count ?? 0) || 0);
    current.class_count = Math.max(current.class_count, Number(row.class_count || 0) || 0);
    groups.set(groupKey, current);
};

export const mergeWeeklySpellingSources = (payload) => {
    const groups = new Map();
    for (const row of payload.ai_findings || []) mergeSource(groups, 'ai', row);
    for (const row of payload.teacher_entries || []) mergeSource(groups, 'teacher', row);

    for (const row of payload.searched || []) {
        const expressionKey = normalizeSpellingValue(row.expression);
        const matching = [...groups.entries()].filter(([, group]) => (
            normalizeSpellingValue(group.expression) === expressionKey
        ));
        if (matching.length === 0) {
            mergeSource(groups, 'search', row);
            continue;
        }
        matching.sort((left, right) => right[1].hit_count - left[1].hit_count);
        const group = matching[0][1];
        group.source_kinds.add('search');
        group.hit_count = Math.max(group.hit_count, Number(row.search_count || 0) || 0);
        group.class_count = Math.max(group.class_count, Number(row.class_count || 0) || 0);
    }

    return [...groups.values()].map((group) => ({
        ...group,
        source_kinds: [...group.source_kinds].sort(),
        primary_source: group.source_kinds.has('ai') ? 'ai' : group.source_kinds.has('search') ? 'search' : 'manual'
    }));
};

const findSimilarMatches = (expression, records) => records
    .map((record) => ({ ...record, similarity: diceScore(expression, record.expression) }))
    .filter((record) => record.similarity >= 0.3)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 3)
    .map((record) => ({
        expression: trimText(record.expression, 40),
        correction: trimText(record.correction, 40),
        label: trimText(record.label, 40),
        source: record.source,
        similarity: Math.round(record.similarity * 100)
    }));

export const prepareWeeklyReviewCandidates = (payload, knownIndex, hashFn) => {
    if (typeof hashFn !== 'function') throw new Error('hash_function_required');
    const grouped = mergeWeeklySpellingSources(payload);
    const knownFiltered = grouped.filter((item) => knownIndex.aliases.has(normalizeSpellingValue(item.expression)));
    const candidates = grouped
        .filter((item) => !knownIndex.aliases.has(normalizeSpellingValue(item.expression)))
        .map((item) => ({
            ...item,
            review_key: hashFn(`${REVIEW_VERSION}|${normalizeSpellingValue(item.expression)}|${normalizeSpellingValue(item.source_correction)}`),
            similar_matches: findSimilarMatches(item.expression, knownIndex.records)
        }))
        .sort((left, right) => right.class_count - left.class_count || right.hit_count - left.hit_count)
        .slice(0, MAX_CANDIDATES);
    return { candidates, collectedCount: grouped.length, knownFilteredCount: knownFiltered.length };
};

export const getMonday = (date = new Date()) => {
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = local.getDay() || 7;
    local.setDate(local.getDate() - day + 1);
    return [local.getFullYear(), String(local.getMonth() + 1).padStart(2, '0'), String(local.getDate()).padStart(2, '0')].join('-');
};
