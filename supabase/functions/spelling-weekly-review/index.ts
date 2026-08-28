/**
 * 주간 맞춤법 AI 검수를 **관리자가 화면에서 눌러** 돌린다.
 *
 * 예전에는 맥미니에서 스크립트를 손으로 돌리거나 LaunchAgent 로 자동으로 돌렸다. 자동으로 돌리면
 * 학생 유래 표현을 외부로 보내는 일을 사람이 안 보고 넘기게 되고, 손으로 돌리면 맥미니에 붙어야 했다.
 * 이 함수가 있으면 관리자가 쌓인 양을 보고 그 자리에서 판단해 누른다.
 *
 * 거르는 계산은 `reviewCore.js` 가 원본이다. 되돌림 경로인 `scripts/run-weekly-spelling-review.mjs` 와
 * 같은 후보를 뽑아야 하므로 여기에 계산을 다시 쓰지 않는다.
 *
 * 한 주에 한 번만 돈다 — `start_spelling_weekly_review_v1` 이 이미 끝난 주는 되돌려보낸다.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createHash } from 'node:crypto'
import {
    AI_BATCH_SIZE,
    MODEL,
    REVIEW_VERSION,
    buildKnownSpellingIndex,
    getMonday,
    prepareWeeklyReviewCandidates,
    trimText
} from './reviewCore.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const OPENAI_API_KEY = (Deno.env.get('OPENAI_API_KEY') ?? '').replace(/[^\x20-\x7E]/g, '').trim()

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

/**
 * 학생 태블릿이 받는 것과 **같은 맞춤법 카탈로그**를 읽어야 한다. 그래서 번들에 사본을 넣지 않고
 * 서비스가 실제로 내려 주는 주소에서 받는다. 사본을 두면 배포 시점이 어긋나 학생 화면과 검수 기준이
 * 달라진다. 주소는 따로 주지 않으면 허용 출처의 첫 번째를 쓴다.
 */
const CATALOG_ORIGIN = (Deno.env.get('SPELLING_CATALOG_ORIGIN') ?? ALLOWED_ORIGINS[0] ?? '').replace(/\/$/, '')

/**
 * 이 시간이 지나면 다음 배치를 **시작하지 않는다**.
 *
 * 작업자 제한이 60초인데, 넘기면 supervisor 가 끊어 버려 오류 처리조차 못 돈다(2026-08-28 첫 실행이
 * 그렇게 통째로 날아갔다). AI 호출 하나가 최대 20초이므로 30초에 멈추면 최악이라도 50초 안에 끝난다.
 */
const BATCH_BUDGET_MS = 30_000

const corsHeaders = (origin: string | null) => ({
    'Access-Control-Allow-Origin': origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin.replace(/\/$/, '')))
        ? origin
        : (ALLOWED_ORIGINS.length === 0 ? '*' : 'null'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
})

const json = (body: unknown, status: number, origin: string | null) => new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
)

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

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
}

// 되돌림 스크립트와 **같은 지시문·같은 스키마**를 쓴다. 다르면 같은 후보에 다른 판정이 나온다.
const reviewWithOpenAI = async (candidates: unknown[]) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
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
    })
    if (!response.ok) throw new Error(`openai_http_${response.status}`)
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('openai_empty_response')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed.reviews)) throw new Error('openai_invalid_response')
    return parsed.reviews
}

const cleanReview = (candidate: Record<string, unknown>, review: Record<string, unknown>, cacheHit: boolean) => {
    if (review.review_key !== candidate.review_key) throw new Error('openai_review_key_mismatch')
    const verdict = ['recommend', 'caution', 'reject'].includes(String(review.verdict)) ? review.verdict : 'reject'
    const correctExpression = trimText(review.correct_expression, 40)
    if (verdict !== 'reject' && !correctExpression) throw new Error('openai_missing_correction')
    return {
        ...candidate,
        verdict,
        correct_expression: correctExpression,
        label: trimText(review.label, 40) || '미분류',
        explanation: trimText(review.explanation, 600) || '관리자가 직접 확인해 주세요.',
        examples: (Array.isArray(review.examples) ? review.examples : []).map((item: unknown) => trimText(item, 150)).filter(Boolean).slice(0, 4),
        reason: trimText(review.reason, 300) || '관리자 확인이 필요합니다.',
        cache_hit: cacheHit
    }
}

const loadCatalogs = async () => {
    if (!CATALOG_ORIGIN) throw new Error('catalog_origin_missing')
    const [lookupResponse, detectionResponse] = await Promise.all([
        fetch(`${CATALOG_ORIGIN}/spelling/elementary-lookup-v1.json`, { signal: AbortSignal.timeout(20_000) }),
        fetch(`${CATALOG_ORIGIN}/spelling/elementary-detection-v1.json`, { signal: AbortSignal.timeout(20_000) })
    ])
    if (!lookupResponse.ok || !detectionResponse.ok) throw new Error('catalog_fetch_failed')
    const [lookupBytes, detectionBytes] = await Promise.all([
        lookupResponse.arrayBuffer(),
        detectionResponse.arrayBuffer()
    ])
    const lookupArray = new Uint8Array(lookupBytes)
    const detectionArray = new Uint8Array(detectionBytes)
    const joined = new Uint8Array(lookupArray.length + detectionArray.length)
    joined.set(lookupArray, 0)
    joined.set(detectionArray, lookupArray.length)
    const decoder = new TextDecoder()
    return {
        lookupPayload: JSON.parse(decoder.decode(lookupArray)),
        detectionPayload: JSON.parse(decoder.decode(detectionArray)),
        // 되돌림 스크립트와 같은 방식으로 센다 — 두 파일을 이어 붙인 바이트의 sha256 앞 16자.
        catalogVersion: hash(joined).slice(0, 16)
    }
}

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin')
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
    if (req.method !== 'POST') return json({ success: false, message: '허용되지 않은 요청입니다.' }, 405, origin)

    const startedAt = Date.now()
    let weekStart = ''
    let adminClient: ReturnType<typeof createClient> | null = null

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return json({ success: false, message: '로그인이 필요합니다.' }, 401, origin)

        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        })
        const { data: { user }, error: userError } = await userClient.auth.getUser()
        if (userError || !user) return json({ success: false, message: '인증 정보를 확인할 수 없습니다.' }, 401, origin)

        adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const { data: profile } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
        if (profile?.role !== 'ADMIN') {
            return json({ success: false, message: '관리자만 실행할 수 있습니다.' }, 403, origin)
        }

        if (!OPENAI_API_KEY) return json({ success: false, message: 'AI 서비스 연결 설정을 확인해주세요.' }, 503, origin)

        const body = await req.json().catch(() => ({}))
        weekStart = typeof body?.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)
            ? body.weekStart
            : getMonday()

        const { lookupPayload, detectionPayload, catalogVersion } = await loadCatalogs()

        const { data: sourcePayload, error: startError } = await adminClient.rpc('start_spelling_weekly_review_v1', {
            p_week_start: weekStart,
            p_catalog_version: catalogVersion,
            // 60초에 못 끝낸 회차를 다음 호출이 이어받는다. 없으면 already_running 으로 막힌다.
            p_allow_resume: true
        })
        if (startError) throw new Error(`database_start_failed:${startError.message}`)
        if (!sourcePayload?.should_run) {
            return json({
                success: true,
                skipped: true,
                reason: sourcePayload?.reason || 'not_required',
                weekStart
            }, 200, origin)
        }
        if (sourcePayload.public_api_enabled !== true) throw new Error('public_api_disabled')

        const knownIndex = buildKnownSpellingIndex(lookupPayload, detectionPayload, sourcePayload.common_entries)
        const prepared = prepareWeeklyReviewCandidates(sourcePayload, knownIndex, hash)

        const cache = new Map((sourcePayload.cached_reviews || []).map((item: Record<string, unknown>) => [item.review_key, item]))
        const completed: Record<string, unknown>[] = []
        const fresh: Record<string, unknown>[] = []
        for (const candidate of prepared.candidates) {
            const cached = cache.get(candidate.review_key) as Record<string, unknown> | undefined
            if (cached?.review_version === REVIEW_VERSION) completed.push(cleanReview(candidate, cached, true))
            else fresh.push(candidate)
        }

        /*
         * 작업자 제한은 60초다(`volumes/functions/main/index.ts` 의 workerTimeoutMs).
         * 제한을 넘으면 supervisor 가 작업자를 **끊어** 버려서 아래 오류 처리도 못 돈다.
         * 그래서 시간이 남아 있을 때만 다음 배치를 시작하고, 남은 것이 있으면 회차를 열어 둔 채
         * 돌려보낸다. 부르는 쪽이 다시 부르면 이어서 한다.
         */
        let reviewedNow = 0
        let offset = 0
        while (offset < fresh.length && Date.now() - startedAt < BATCH_BUDGET_MS) {
            const batch = fresh.slice(offset, offset + AI_BATCH_SIZE)
            const reviews = await reviewWithOpenAI(batch.map((candidate) => ({
                review_key: candidate.review_key,
                expression: candidate.expression,
                source_correction: candidate.source_correction,
                source_kinds: candidate.source_kinds,
                hit_count: candidate.hit_count,
                class_count: candidate.class_count,
                similar_matches: candidate.similar_matches
            })))
            const reviewByKey = new Map(reviews.map((review: Record<string, unknown>) => [review.review_key, review]))
            const done: Record<string, unknown>[] = []
            for (const candidate of batch) {
                const review = reviewByKey.get(candidate.review_key)
                if (!review) throw new Error('openai_missing_review')
                done.push(cleanReview(candidate, review, false))
            }

            // 배치가 끝나는 즉시 캐시에 적립한다. 다음 호출이 이것을 재사용하므로,
            // 중간에 끊겨도 이미 낸 AI 비용은 남는다.
            const { error: cacheError } = await adminClient.rpc('save_spelling_weekly_ai_cache_v1', {
                p_items: done.map((item) => ({ ...item, model: MODEL, review_version: REVIEW_VERSION }))
            })
            if (cacheError) throw new Error(`database_cache_failed:${cacheError.message}`)

            completed.push(...done)
            reviewedNow += done.length
            offset += AI_BATCH_SIZE

            // 어디까지 왔는지 원장에 적어 둔다. 화면이 이것을 읽어 진행 상황을 계속 보여 준다.
            await adminClient.rpc('update_spelling_weekly_progress_v1', {
                p_week_start: weekStart,
                p_total_count: prepared.candidates.length,
                p_done_count: completed.length
            })
        }

        if (offset < fresh.length) {
            // 회차는 `running` 인 채로 둔다. 다음 호출이 이어받는다.
            return json({
                success: true,
                done: false,
                weekStart,
                remaining: fresh.length - offset,
                totalCount: prepared.candidates.length,
                doneCount: completed.length,
                reviewedNow,
                collectedCount: prepared.collectedCount,
                knownFilteredCount: prepared.knownFilteredCount
            }, 200, origin)
        }

        const { error: finishError } = await adminClient.rpc('finish_spelling_weekly_review_v1', {
            p_week_start: weekStart,
            p_items: completed,
            p_summary: {
                collected_count: prepared.collectedCount,
                known_filtered_count: prepared.knownFilteredCount,
                cache_hit_count: completed.filter((item) => item.cache_hit === true).length,
                ai_reviewed_count: fresh.length,
                model: MODEL,
                review_version: REVIEW_VERSION
            }
        })
        if (finishError) throw new Error(`database_finish_failed:${finishError.message}`)

        return json({
            success: true,
            weekStart,
            collectedCount: prepared.collectedCount,
            knownFilteredCount: prepared.knownFilteredCount,
            cacheHitCount: completed.filter((item) => item.cache_hit === true).length,
            aiReviewedCount: fresh.length,
            itemCount: completed.length
        }, 200, origin)
    } catch (error) {
        const code = String((error as Error)?.message || 'unknown').slice(0, 80)
        // 회차를 'running' 인 채로 두면 두 시간 동안 다시 못 누른다. 실패를 반드시 기록한다.
        if (adminClient && weekStart) {
            await adminClient.rpc('fail_spelling_weekly_review_v1', {
                p_week_start: weekStart,
                p_error_code: code
            }).catch(() => {})
        }
        console.error('[spelling-weekly-review] failure:', code)
        return json({ success: false, message: '주간 맞춤법 검수에 실패했습니다.', code }, 500, origin)
    }
})
