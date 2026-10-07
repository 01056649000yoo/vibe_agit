import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    AI_BATCH_SIZE,
    MODEL,
    REVIEW_INSTRUCTIONS,
    REVIEW_VERSION,
    buildKnownSpellingIndex,
    cleanReview,
    getReviewRunDate,
    isKnownSpelling,
    mergeWeeklySpellingSources,
    missingReview,
    normalizeSpellingValue,
    prepareWeeklyReviewCandidates as prepareCandidatesWithHash,
    trimText
} from '../supabase/functions/spelling-weekly-review/reviewCore.js';
// 모델과 매개변수는 _shared/model.js 한 곳에서만 정한다(엣지 함수와 같은 파일).
import { buildChatRequest } from '../supabase/functions/_shared/model.js';
import { sendTelegram } from './lib/telegram.mjs';

/*
 * 거르는 계산의 **원본은 엣지 함수 폴더가 갖는다**(`supabase/functions/spelling-weekly-review/reviewCore.js`).
 * 관리자 화면이 누르는 길과 이 스크립트가 같은 후보를 뽑아야 하므로 계산을 두 벌 두지 않는다.
 * 이 파일은 되돌림 경로다 — 엣지 함수가 막혔을 때 맥미니에서 손으로 돌린다.
 */
export { buildKnownSpellingIndex, mergeWeeklySpellingSources, normalizeSpellingValue };

const DEFAULT_DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const STATUS_FILE = '/Users/seunghyeonmaegmini/backups/auto/spelling-review-auto-status.txt';
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
    /*
     * 값은 base64 로 SQL 안에 넣고 SQL 은 **표준 입력**으로 보낸다(2026-10-07 첫 자동 실행에서 발견).
     * - psql 은 `-c` 명령 안의 :'변수' 를 풀지 않아 문법 오류가 났다.
     * - 검수 결과 200개를 명령줄 인자로 넘기면 macOS 인자 길이 제한을 넘는다.
     * base64 글자(A–Z a–z 0–9 + / =)는 작은따옴표를 깨지 못한다.
     */
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const arg = `convert_from(decode('${encoded}','base64'),'UTF8')::jsonb`;
    const calls = {
        spelling_review_auto_status_v1: 'SELECT public.spelling_review_auto_status_v1();',
        spelling_weekly_pending_expressions_v1: 'SELECT public.spelling_weekly_pending_expressions_v1();',
        close_rule_covered_spelling_items_v1: `SELECT public.close_rule_covered_spelling_items_v1(ARRAY(SELECT jsonb_array_elements_text(${arg}->'ids'))::uuid[]);`,
        start_spelling_weekly_review_v1: `SELECT public.start_spelling_weekly_review_v1((${arg}->>'week_start')::date, ${arg}->>'catalog_version', TRUE);`,
        save_spelling_weekly_ai_cache_v1: `SELECT public.save_spelling_weekly_ai_cache_v1(${arg}->'items');`,
        finish_spelling_weekly_review_v1: `SELECT public.finish_spelling_weekly_review_v1((${arg}->>'week_start')::date, ${arg}->'items', ${arg}->'summary');`,
        fail_spelling_weekly_review_v1: `SELECT public.fail_spelling_weekly_review_v1((${arg}->>'week_start')::date, ${arg}->>'error_code');`
    };
    const sql = Reflect.get(calls, functionName);
    if (!sql) throw new Error(`unknown_function_${functionName}`);
    const result = spawnSync(docker, [
        'exec', '-i', 'agit-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'
    ], { encoding: 'utf8', input: sql, maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) {
        // DB 오류 문장은 비밀을 담지 않는다 — 원인을 알 수 있게 한 줄 남긴다.
        const reason = String(result.stderr || result.error?.message || '').split('\n').find((line) => /ERROR|error|E2BIG/.test(line)) || '';
        if (reason) console.error(`[${functionName}] ${reason.slice(0, 300)}`);
        throw new Error(`database_${functionName}_failed`);
    }
    const output = result.stdout.trim();
    if (!output || functionName === 'fail_spelling_weekly_review_v1' || functionName === 'save_spelling_weekly_ai_cache_v1') return null;
    if (functionName === 'close_rule_covered_spelling_items_v1') return Number(output);
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
        body: JSON.stringify(buildChatRequest({
            messages: [
                {
                    role: 'system',
                    content: REVIEW_INSTRUCTIONS
                },
                { role: 'user', content: JSON.stringify({ candidates }) }
            ],
            maxOutputTokens: 5000,
            deterministic: true,
            responseFormat: {
                type: 'json_schema',
                json_schema: { name: 'weekly_spelling_reviews', strict: true, schema: reviewSchema }
            },
        }))
    });
    if (!response.ok) throw new Error(`openai_http_${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('openai_empty_response');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.reviews)) throw new Error('openai_invalid_response');
    return parsed.reviews;
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

    if (process.argv.includes('--close-covered')) {
        const closed = closeRuleCovered({ lookupPayload, detectionPayload });
        console.log(`기본 규칙이 이미 잡는 대기 후보 ${closed}개를 닫았습니다.`);
        return;
    }

    if (process.argv.includes('--auto')) {
        await runAuto({ lookupPayload, detectionPayload, catalogVersion });
        return;
    }

    const weekStartArgumentIndex = process.argv.indexOf('--week-start');
    const weekStart = weekStartArgumentIndex >= 0 ? process.argv[weekStartArgumentIndex + 1] : getReviewRunDate();
    try {
        const summary = await runReview({ weekStart, lookupPayload, detectionPayload, catalogVersion });
        if (summary.skipped) console.log(`주간 맞춤법 검수 건너뜀 — ${summary.reason}`);
    } catch (error) {
        console.error(`주간 맞춤법 검수 실패 — ${error.code || 'unknown'}`);
        process.exitCode = 1;
    }
};

/**
 * 한 회차 검수. 끝나면 요약을, 돌 필요가 없으면 `{ skipped, reason }` 을 돌려준다.
 * 실패하면 회차를 failed 로 적고 `error.code`(영문·숫자만, 비밀 없음)를 단 오류를 던진다.
 */
export const runReview = async ({ weekStart, lookupPayload, detectionPayload, catalogVersion }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart || '')) throw Object.assign(new Error('invalid_week_start'), { code: 'invalid_week_start' });

    let started = false;
    try {
        const sourcePayload = runDatabaseFunction('start_spelling_weekly_review_v1', { week_start: weekStart, catalog_version: catalogVersion });
        if (!sourcePayload?.should_run) return { skipped: true, reason: sourcePayload?.reason || 'not_required' };
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
                const done = [];
                for (const candidate of batch) {
                    const review = reviewByKey.get(candidate.review_key);
                    // 판정이 빠진 후보 하나 때문에 배치 전체를 버리지 않는다.
                    done.push(review ? cleanReview(candidate, review, false) : missingReview(candidate));
                }
                // 배치가 끝나는 즉시 AI 판정을 저장한다(엣지 함수와 같다). 마무리가 실패해도 낸 AI 비용은 남는다.
                runDatabaseFunction('save_spelling_weekly_ai_cache_v1', {
                    items: done.map((item) => ({ ...item, model: MODEL, review_version: REVIEW_VERSION }))
                });
                completed.push(...done);
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
        return { ...summary, item_count: completed.length };
    } catch (error) {
        const errorCode = trimText(error instanceof Error ? error.message : 'unknown', 80).replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
        if (started) {
            try {
                runDatabaseFunction('fail_spelling_weekly_review_v1', { week_start: weekStart, error_code: errorCode });
            } catch {
                // 원래 오류를 유지한다. DB 실패 상세나 시크릿은 로그에 쓰지 않는다.
            }
        }
        throw Object.assign(new Error(errorCode), { code: errorCode });
    }
};

/*
 * 자동 검수(2026-10-07, 선생님 결정). launchd 가 매일 05:10 부른다.
 * - 새로 볼 표현이 AUTO_MIN_NEW(50)개 이상 모였으면 그날 검수한다. AI 판정은 저장해 두고 다시 쓰므로 자주 돌아도 비용은 같다.
 * - 화요일은 50개가 안 돼도 1개 이상이면 검수하고, 관리자에게 텔레그램으로 `먼저 볼 것`(반영할 것) 수를 알린다.
 *   알림은 반영할 것이 있을 때만 보낸다. 반영(게시)은 늘 관리자가 화면에서 한다 — 자동으로 게시하지 않는다.
 */
export const AUTO_MIN_NEW = 50;
export const DIGEST_WEEKDAY = 2; // 화요일(서울)

export const decideAutoRun = (status, weekday) => {
    const newCount = Number(status?.new_count || 0);
    if (['ready', 'empty'].includes(status?.current_status)) return { run: false, reason: 'today_done' };
    if (newCount >= AUTO_MIN_NEW) return { run: true, reason: 'threshold' };
    if (weekday === DIGEST_WEEKDAY && newCount >= 1) return { run: true, reason: 'weekly' };
    return { run: false, reason: newCount ? 'below_threshold' : 'nothing_new' };
};

export const buildDigestText = (status) => {
    const priority = Number(status?.priority_pending || 0);
    if (priority < 1) return '';
    return [
        '📚 맞춤법 주간 정리',
        `반영할 것(먼저 볼 것) ${priority}개가 기다려요.`,
        `지난 7일 자동 검수 ${Number(status?.runs_last_7_days || 0)}회 · AI가 새로 본 표현 ${Number(status?.ai_reviewed_last_7_days || 0)}개`,
        `한 학급에서 한두 번 나온 ${Number(status?.later_pending || 0)}개는 접어 두었어요(또 나오면 앞으로 올라와요).`,
        '→ 관리자 › 맞춤법 승격 › 먼저 볼 것'
    ].join('\n');
};

const writeStatus = async (line) => {
    try {
        const { appendFile, mkdir } = await import('node:fs/promises');
        await mkdir(STATUS_FILE.slice(0, STATUS_FILE.lastIndexOf('/')), { recursive: true });
        await appendFile(STATUS_FILE, `${line}\n`);
    } catch {
        // 기록 실패는 검수 결과를 바꾸지 않는다.
    }
};

/*
 * 기본 규칙(띄어쓰기 규칙처럼 꼴로 잡는 정규식)이 이미 밑줄을 긋는 대기 후보를 닫는다(2026-10-07).
 * 규칙이 늘면 예전에 쌓인 후보도 저절로 정리된다. 판정은 검수와 같은 isKnownSpelling 하나로 한다.
 */
export const closeRuleCovered = ({ lookupPayload, detectionPayload }) => {
    const knownIndex = buildKnownSpellingIndex(lookupPayload, detectionPayload);
    const pending = runDatabaseFunction('spelling_weekly_pending_expressions_v1', {}) || [];
    const ids = pending.filter((item) => isKnownSpelling(knownIndex, item.expression)).map((item) => item.id).slice(0, 2000);
    return ids.length ? runDatabaseFunction('close_rule_covered_spelling_items_v1', { ids }) : 0;
};

const runAuto = async ({ lookupPayload, detectionPayload, catalogVersion }) => {
    const at = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
    const runDate = getReviewRunDate();
    const weekday = new Date(`${runDate}T00:00:00Z`).getUTCDay();
    let status = runDatabaseFunction('spelling_review_auto_status_v1', {});
    const decision = decideAutoRun(status, weekday);
    if (decision.run) {
        try {
            const summary = await runReview({ weekStart: runDate, lookupPayload, detectionPayload, catalogVersion });
            await writeStatus(summary.skipped
                ? `SKIPPED ${at} reason=${summary.reason}`
                : `OK ${at} why=${decision.reason} new=${status.new_count} ai=${summary.ai_reviewed_count} items=${summary.item_count}`);
        } catch (error) {
            await writeStatus(`FAILED ${at} code=${error.code || 'unknown'}`);
            sendTelegram(`⚠️ 맞춤법 자동 검수 실패 (${at})\n오류: ${error.code || 'unknown'}\n관리자 › 맞춤법 승격에서 검수를 다시 누르면 이어서 합니다.`);
            process.exitCode = 1;
        }
        status = runDatabaseFunction('spelling_review_auto_status_v1', {});
    } else {
        await writeStatus(`OK ${at} skipped=${decision.reason} new=${status.new_count}`);
    }
    try {
        const closed = closeRuleCovered({ lookupPayload, detectionPayload });
        if (closed) {
            await writeStatus(`OK ${at} rule_closed=${closed}`);
            status = runDatabaseFunction('spelling_review_auto_status_v1', {});
        }
    } catch {
        // 정리 실패는 검수 결과를 바꾸지 않는다. 다음 날 다시 한다.
    }
    if (weekday === DIGEST_WEEKDAY) {
        const text = buildDigestText(status);
        if (text) sendTelegram(text);
    }
};

if (fileURLToPath(import.meta.url) === process.argv[1]) await main();
