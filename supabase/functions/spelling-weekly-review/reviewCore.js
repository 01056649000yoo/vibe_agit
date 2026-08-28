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

/**
 * 검수 기준이 바뀌면 이 값을 올린다.
 *
 * `review_key` 가 이 값을 넣어 만든 해시라, 올리면 옛 판정 캐시를 아무도 못 찾는다 —
 * 곧 **새 기준으로 다시 검수**하게 된다. 기준을 고쳐 놓고 이 값을 안 올리면 옛 판정이
 * 그대로 재사용돼 아무것도 안 바뀐다.
 *
 * v2(2026-08-28): "틀렸는가" 에서 **"여러 학급이 되풀이해 틀릴 규칙인가"** 로 기준을 바꿨다.
 */
// 기준을 바꾸면 반드시 올린다. 안 올리면 옛 판정 캐시를 그대로 꺼내 써서 새 기준이 소용없다.
export const REVIEW_VERSION = 'weekly-v3';

/**
 * AI 에게 주는 검수 기준. 엣지 함수와 되돌림 스크립트가 **같은 것**을 써야 같은 판정이 나온다.
 *
 * v1 의 기준은 `틀렸는가` 하나뿐이었다. 그랬더니 146건 중 83건이 `반영 권장` 으로 몰렸고,
 * 그 안에 `안/않` 같은 규칙과 `즐거워더` 같은 한 아이의 오타가 뒤섞였다(2026-08-28 확인).
 * 이 자료는 **모든 학급이 함께 쓰는** 것이므로, 되풀이될 규칙인지를 묻는 것이 맞다.
 */
export const REVIEW_INSTRUCTIONS = [
    '초등학생용 맞춤법 공통 자료 후보를 검수한다.',
    '이 자료는 모든 학급이 함께 쓰는 배움 자료가 된다.',
    '그러므로 "틀렸는가"가 아니라 "여러 학급 아이들이 되풀이해 틀릴 규칙인가"를 기준으로 고른다.',
    'recommend: 규칙이 있어 다른 아이도 똑같이 틀릴 것. 여러 학급에서 되풀이된 것만 해당한다.',
    '  보기 — 안/않, 되/돼, 의존명사 것·거·수, -로서/-로써, 흔한 띄어쓰기(잘 먹다, 할 수 있다).',
    'caution: 틀린 것은 맞지만 이 아이 한 명의 오타나 활용 실수라 다른 학급에서 되풀이될 것 같지 않은 것.',
    '  보기 — 즐거워더, 븍지런함, 잔고 싶어. 문맥에 따라 맞을 수 있거나 고유명사 가능성이 있는 것도 여기다.',
    'reject: 틀린 표현이 아니거나, 낱말·짧은 구가 아니라 문장 전체인 것.',
    'class_count가 1이면 아직 한 학급에서만 나온 것이라 recommend가 아니라 caution이다.',
    '입력은 기본 500개와 현재 공통 자료의 정확 일치를 코드로 제거한 뒤의 후보다.',
    'similar_matches는 전체 자료가 아니라 코드가 고른 유사 항목 최대 3개이므로 참고만 한다.',
    'recommend/caution에는 짧은 바른 표현, 40자 이하 라벨, 학생용 설명, 바른 예문 최대 4개를 작성한다.',
    '학생 글·학생·학급 정보는 추측하지 않는다.'
].join('\n');
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

/**
 * AI 가 돌려준 판정 하나를 저장할 모양으로 다듬는다.
 *
 * **한 항목 때문에 회차 전체가 멈추면 안 된다.** 예전에는 AI 가 `반영 권장` 이라면서 바른 표현을
 * 비워 보내면 오류를 던졌고, 그 후보가 든 배치가 매번 같은 자리에서 터져 회차가 84/146 에서
 * 영원히 멈췄다(2026-08-28). 이제 어긋난 답은 **버리지 않고 낮춰서** 관리자에게 보낸다 —
 * 어차피 게시 여부는 사람이 정하므로, 보여 주고 판단하게 하는 편이 낫다.
 */
export const cleanReview = (candidate, review, cacheHit) => {
    const rawVerdict = String(review?.verdict || '');
    let verdict = ['recommend', 'caution', 'reject'].includes(rawVerdict) ? rawVerdict : 'reject';
    let correctExpression = trimText(review?.correct_expression, 40);
    let reason = trimText(review?.reason, 300);

    if (verdict !== 'reject' && !correctExpression) {
        // 원자료에 교정이 함께 온 후보(AI 검사·교사 자료)면 그것을 쓴다.
        correctExpression = trimText(candidate?.source_correction, 40);
        if (!correctExpression) {
            verdict = 'reject';
            reason = 'AI가 바른 표현을 주지 않아 제외 권장으로 낮췄습니다. 필요하면 직접 등록해 주세요.';
        }
    }

    return {
        ...candidate,
        verdict,
        correct_expression: correctExpression,
        label: trimText(review?.label, 40) || '미분류',
        explanation: trimText(review?.explanation, 600) || '관리자가 직접 확인해 주세요.',
        examples: (Array.isArray(review?.examples) ? review.examples : [])
            .map((item) => trimText(item, 150)).filter(Boolean).slice(0, 4),
        reason: reason || '관리자 확인이 필요합니다.',
        cache_hit: cacheHit === true
    };
};

/** AI 가 아예 판정을 안 준 후보. 빼 두면 영원히 안 끝나므로 제외 권장으로 남긴다. */
export const missingReview = (candidate) => cleanReview(candidate, {
    verdict: 'reject',
    reason: 'AI가 이 후보의 판정을 주지 않았습니다. 필요하면 직접 등록해 주세요.'
}, false);

export const getMonday = (date = new Date()) => {
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = local.getDay() || 7;
    local.setDate(local.getDate() - day + 1);
    return [local.getFullYear(), String(local.getMonth() + 1).padStart(2, '0'), String(local.getDate()).padStart(2, '0')].join('-');
};
