import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODEL = 'gpt-4o-mini';
const REVIEW_VERSION = 'weekly-v1';
const MAX_CANDIDATES = 200;
const AI_BATCH_SIZE = 12;
const DEFAULT_DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const DEFAULT_SECRETS_FILE = '/Users/seunghyeonmaegmini/agit-supabase/secrets.agit.env';
const lookupUrl = new URL('../public/spelling/elementary-lookup-v1.json', import.meta.url);
const detectionUrl = new URL('../public/spelling/elementary-detection-v1.json', import.meta.url);

export const normalizeSpellingValue = (value) => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s/·,?!."'’“”()_-]/g, '');

const hash = (value) => createHash('sha256').update(value).digest('hex');

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

const trimText = (value, limit) => String(value || '').normalize('NFC').trim().slice(0, limit);

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

export const prepareWeeklyReviewCandidates = (payload, knownIndex) => {
    const grouped = mergeWeeklySpellingSources(payload);
    const knownFiltered = grouped.filter((item) => knownIndex.aliases.has(normalizeSpellingValue(item.expression)));
    const candidates = grouped
        .filter((item) => !knownIndex.aliases.has(normalizeSpellingValue(item.expression)))
        .map((item) => ({
            ...item,
            review_key: hash(`${REVIEW_VERSION}|${normalizeSpellingValue(item.expression)}|${normalizeSpellingValue(item.source_correction)}`),
            similar_matches: findSimilarMatches(item.expression, knownIndex.records)
        }))
        .sort((left, right) => right.class_count - left.class_count || right.hit_count - left.hit_count)
        .slice(0, MAX_CANDIDATES);
    return { candidates, collectedCount: grouped.length, knownFilteredCount: knownFiltered.length };
};

const getMonday = (date = new Date()) => {
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = local.getDay() || 7;
    local.setDate(local.getDate() - day + 1);
    return [local.getFullYear(), String(local.getMonth() + 1).padStart(2, '0'), String(local.getDate()).padStart(2, '0')].join('-');
};

const parseSecretValue = (contents, name) => {
    const line = contents.split(/\r?\n/).find((item) => item.trim().startsWith(`${name}=`));
    if (!line) return '';
    const raw = line.slice(line.indexOf('=') + 1).trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1);
    }
    return raw;
};

const runDatabaseFunction = (functionName, payload) => {
    const docker = process.env.AGIT_DOCKER_PATH || DEFAULT_DOCKER;
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const sql = functionName === 'start_spelling_weekly_review_v1'
        ? `SELECT public.${functionName}((convert_from(decode(:'payload','base64'),'UTF8')::jsonb->>'week_start')::date, convert_from(decode(:'payload','base64'),'UTF8')::jsonb->>'catalog_version');`
        : functionName === 'finish_spelling_weekly_review_v1'
            ? `SELECT public.${functionName}((convert_from(decode(:'payload','base64'),'UTF8')::jsonb->>'week_start')::date, convert_from(decode(:'payload','base64'),'UTF8')::jsonb->'items', convert_from(decode(:'payload','base64'),'UTF8')::jsonb->'summary');`
            : `SELECT public.${functionName}((convert_from(decode(:'payload','base64'),'UTF8')::jsonb->>'week_start')::date, convert_from(decode(:'payload','base64'),'UTF8')::jsonb->>'error_code');`;
    const result = spawnSync(docker, [
        'exec', '-i', 'agit-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1', '-v', `payload=${encoded}`, '-t', '-A', '-c', sql
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`database_${functionName}_failed`);
    const output = result.stdout.trim();
    if (!output || functionName === 'fail_spelling_weekly_review_v1') return null;
    return JSON.parse(output);
};

const reviewSchema = {
    type: 'object',
    properties: {
        reviews: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    review_key: { type: 'string' },
                    verdict: { type: 'string', enum: ['recommend', 'caution', 'reject'] },
                    correct_expression: { type: 'string' },
                    label: { type: 'string' },
                    explanation: { type: 'string' },
                    examples: { type: 'array', items: { type: 'string' } },
                    reason: { type: 'string' }
                },
                required: ['review_key', 'verdict', 'correct_expression', 'label', 'explanation', 'examples', 'reason'],
                additionalProperties: false
            }
        }
    },
    required: ['reviews'],
    additionalProperties: false
};

const reviewWithOpenAI = async (apiKey, candidates) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                {
                    role: 'system',
                    content: [
                        '초등학생용 맞춤법 공통 자료 후보를 검수한다.',
                        '입력은 기본 500개와 현재 공통 자료의 정확 일치를 코드로 제거한 뒤의 후보다.',
                        'similar_matches는 전체 자료가 아니라 코드가 고른 유사 항목 최대 3개이므로 참고만 한다.',
                        '문맥에 따라 맞을 수 있거나 고유명사 가능성이 있으면 caution, 틀린 표현이 아니면 reject다.',
                        'recommend/caution에는 짧은 바른 표현, 40자 이하 라벨, 학생용 설명, 바른 예문 최대 4개를 작성한다.',
                        '학생 글·학생·학급 정보는 추측하지 않는다.'
                    ].join('\n')
                },
                { role: 'user', content: JSON.stringify({ candidates }) }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'weekly_spelling_reviews', strict: true, schema: reviewSchema }
            },
            max_tokens: 5000,
            temperature: 0
        })
    });
    if (!response.ok) throw new Error(`openai_http_${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('openai_empty_response');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.reviews)) throw new Error('openai_invalid_response');
    return parsed.reviews;
};

const cleanReview = (candidate, review, cacheHit) => {
    if (review.review_key !== candidate.review_key) throw new Error('openai_review_key_mismatch');
    const verdict = ['recommend', 'caution', 'reject'].includes(review.verdict) ? review.verdict : 'reject';
    const correctExpression = trimText(review.correct_expression, 40);
    if (verdict !== 'reject' && !correctExpression) throw new Error('openai_missing_correction');
    return {
        ...candidate,
        verdict,
        correct_expression: correctExpression,
        label: trimText(review.label, 40) || '미분류',
        explanation: trimText(review.explanation, 600) || '관리자가 직접 확인해 주세요.',
        examples: (Array.isArray(review.examples) ? review.examples : []).map((item) => trimText(item, 150)).filter(Boolean).slice(0, 4),
        reason: trimText(review.reason, 300) || '관리자 확인이 필요합니다.',
        cache_hit: cacheHit
    };
};

const main = async () => {
    const [lookupBuffer, detectionBuffer] = await Promise.all([readFile(lookupUrl), readFile(detectionUrl)]);
    const lookupPayload = JSON.parse(lookupBuffer.toString('utf8'));
    const detectionPayload = JSON.parse(detectionBuffer.toString('utf8'));
    const catalogVersion = hash(Buffer.concat([lookupBuffer, detectionBuffer])).slice(0, 16);
    if (process.argv.includes('--self-check')) {
        const index = buildKnownSpellingIndex(lookupPayload, detectionPayload);
        console.log(`주간 맞춤법 검수기 확인 완료 — 기본 별칭 ${index.aliases.size}개`);
        return;
    }

    const weekStartArgumentIndex = process.argv.indexOf('--week-start');
    const weekStart = weekStartArgumentIndex >= 0 ? process.argv[weekStartArgumentIndex + 1] : getMonday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart || '')) throw new Error('invalid_week_start');

    let started = false;
    try {
        const sourcePayload = runDatabaseFunction('start_spelling_weekly_review_v1', { week_start: weekStart, catalog_version: catalogVersion });
        if (!sourcePayload?.should_run) {
            console.log(`주간 맞춤법 검수 건너뜀 — ${sourcePayload?.reason || 'not_required'}`);
            return;
        }
        started = true;
        if (sourcePayload.public_api_enabled !== true) throw new Error('public_api_disabled');

        const knownIndex = buildKnownSpellingIndex(lookupPayload, detectionPayload, sourcePayload.common_entries);
        const prepared = prepareWeeklyReviewCandidates(sourcePayload, knownIndex);
        const cache = new Map((sourcePayload.cached_reviews || []).map((item) => [item.review_key, item]));
        const completed = [];
        const fresh = [];
        for (const candidate of prepared.candidates) {
            const cached = cache.get(candidate.review_key);
            if (cached?.review_version === REVIEW_VERSION) completed.push(cleanReview(candidate, cached, true));
            else fresh.push(candidate);
        }

        if (fresh.length > 0) {
            const secretsFile = process.env.AGIT_SECRETS_FILE || DEFAULT_SECRETS_FILE;
            const secrets = await readFile(secretsFile, 'utf8');
            const apiKey = (process.env.OPENAI_API_KEY || parseSecretValue(secrets, 'OPENAI_API_KEY')).trim();
            if (!apiKey) throw new Error('openai_key_missing');
            for (let offset = 0; offset < fresh.length; offset += AI_BATCH_SIZE) {
                const batch = fresh.slice(offset, offset + AI_BATCH_SIZE);
                const reviews = await reviewWithOpenAI(apiKey, batch.map((candidate) => ({
                    review_key: candidate.review_key,
                    expression: candidate.expression,
                    source_correction: candidate.source_correction,
                    source_kinds: candidate.source_kinds,
                    hit_count: candidate.hit_count,
                    class_count: candidate.class_count,
                    similar_matches: candidate.similar_matches
                })));
                const reviewByKey = new Map(reviews.map((review) => [review.review_key, review]));
                for (const candidate of batch) {
                    const review = reviewByKey.get(candidate.review_key);
                    if (!review) throw new Error('openai_missing_review');
                    completed.push(cleanReview(candidate, review, false));
                }
            }
        }

        const summary = {
            collected_count: prepared.collectedCount,
            known_filtered_count: prepared.knownFilteredCount,
            cache_hit_count: completed.filter((item) => item.cache_hit).length,
            ai_reviewed_count: fresh.length,
            model: MODEL,
            review_version: REVIEW_VERSION
        };
        runDatabaseFunction('finish_spelling_weekly_review_v1', { week_start: weekStart, items: completed, summary });
        console.log(`주간 맞춤법 검수 완료 ${weekStart} — 수집 ${summary.collected_count} · 기존 제외 ${summary.known_filtered_count} · 캐시 ${summary.cache_hit_count} · AI ${summary.ai_reviewed_count} · 관리자 후보 ${completed.length}`);
    } catch (error) {
        const errorCode = trimText(error instanceof Error ? error.message : 'unknown', 80).replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
        if (started) {
            try {
                runDatabaseFunction('fail_spelling_weekly_review_v1', { week_start: weekStart, error_code: errorCode });
            } catch {
                // 원래 오류를 유지한다. DB 실패 상세나 시크릿은 로그에 쓰지 않는다.
            }
        }
        console.error(`주간 맞춤법 검수 실패 — ${errorCode}`);
        process.exitCode = 1;
    }
};

if (fileURLToPath(import.meta.url) === process.argv[1]) await main();
