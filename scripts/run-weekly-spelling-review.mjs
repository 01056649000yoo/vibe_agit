import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    AI_BATCH_SIZE,
    MODEL,
    REVIEW_VERSION,
    buildKnownSpellingIndex,
    getMonday,
    mergeWeeklySpellingSources,
    normalizeSpellingValue,
    prepareWeeklyReviewCandidates as prepareCandidatesWithHash,
    trimText
} from '../supabase/functions/spelling-weekly-review/reviewCore.js';

/*
 * 거르는 계산의 **원본은 엣지 함수 폴더가 갖는다**(`supabase/functions/spelling-weekly-review/reviewCore.js`).
 * 관리자 화면이 누르는 길과 이 스크립트가 같은 후보를 뽑아야 하므로 계산을 두 벌 두지 않는다.
 * 이 파일은 되돌림 경로다 — 엣지 함수가 막혔을 때 맥미니에서 손으로 돌린다.
 */
export { buildKnownSpellingIndex, mergeWeeklySpellingSources, normalizeSpellingValue };

const DEFAULT_DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const DEFAULT_SECRETS_FILE = '/Users/seunghyeonmaegmini/agit-supabase/secrets.agit.env';
const lookupUrl = new URL('../public/spelling/elementary-lookup-v1.json', import.meta.url);
const detectionUrl = new URL('../public/spelling/elementary-detection-v1.json', import.meta.url);

const hash = (value) => createHash('sha256').update(value).digest('hex');

// sha256 은 플랫폼마다 다르므로 원본이 받아 쓴다. Node 쪽 짝을 여기서 묶어 준다.
export const prepareWeeklyReviewCandidates = (payload, knownIndex) => (
    prepareCandidatesWithHash(payload, knownIndex, hash)
);

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
