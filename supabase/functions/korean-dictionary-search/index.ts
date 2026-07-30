import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const STDICT_API_KEY = Deno.env.get('STDICT_API_KEY') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

const MIN_REQUEST_INTERVAL_MS = 700
const REQUEST_TIMEOUT_MS = 6000
const CACHE_TTL_MS = 30 * 60 * 1000
const CACHE_MAX_ENTRIES = 200
const lastRequestByUser = new Map<string, number>()
const searchCache = new Map<string, { expiresAt: number; payload: DictionaryResponse }>()

type DictionaryItem = {
    targetCode: string
    word: string
    supNo: string
    pos: string
    definition: string
    origin: string
    type: string
    category: string
    sourceUrl: string
}

type DictionaryResponse = {
    query: string
    total: number
    items: DictionaryItem[]
}

function isAllowedOrigin(origin: string | null) {
    if (!origin) return true
    const cleanOrigin = origin.replace(/\/$/, '')
    return ALLOWED_ORIGINS.length === 0
        || ALLOWED_ORIGINS.includes(cleanOrigin)
        || cleanOrigin.startsWith('http://localhost:')
        || cleanOrigin.startsWith('http://127.0.0.1:')
}

function corsHeaders(origin: string | null) {
    return {
        'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : (ALLOWED_ORIGINS.length ? 'null' : '*'),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-auth',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    }
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
    })
}

function cleanText(value: unknown, maxLength = 300) {
    return String(value ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
    if (Array.isArray(value)) return value
    return value == null ? [] : [value]
}

function safeSourceUrl(value: unknown, targetCode: string) {
    const rawUrl = typeof value === 'string' ? value.trim() : ''
    if (rawUrl.startsWith('https://stdict.korean.go.kr/')) return rawUrl.slice(0, 1000)
    return targetCode
        ? `https://stdict.korean.go.kr/search/searchView.do?word_no=${encodeURIComponent(targetCode)}&searchKeywordTo=3`
        : 'https://stdict.korean.go.kr/'
}

function normalizeDictionaryPayload(payload: Record<string, unknown>, query: string): DictionaryResponse {
    const channel = (payload?.channel && typeof payload.channel === 'object')
        ? payload.channel as Record<string, unknown>
        : {}
    const items = toArray(channel.item as Record<string, unknown> | Record<string, unknown>[])
        .flatMap((rawItem) => {
            if (!rawItem || typeof rawItem !== 'object') return []
            const targetCode = cleanText(rawItem.target_code, 40)
            const word = cleanText(rawItem.word, 100).replace(/[-^]/g, '')
            const senses = toArray(rawItem.sense as Record<string, unknown> | Record<string, unknown>[])

            return senses.slice(0, 3).map((sense) => ({
                targetCode,
                word,
                supNo: cleanText(rawItem.sup_no, 12),
                pos: cleanText(rawItem.pos, 40),
                definition: cleanText(sense?.definition, 500),
                origin: cleanText(sense?.origin, 120),
                type: cleanText(sense?.type, 60),
                category: cleanText(sense?.cat, 100),
                sourceUrl: safeSourceUrl(sense?.link, targetCode)
            }))
        })
        .filter((item) => item.word && item.definition)
        .slice(0, 12)

    return {
        query,
        total: Number(channel.total ?? items.length) || items.length,
        items
    }
}

function getCached(cacheKey: string) {
    const cached = searchCache.get(cacheKey)
    if (!cached) return null
    if (cached.expiresAt <= Date.now()) {
        searchCache.delete(cacheKey)
        return null
    }
    return cached.payload
}

function setCached(cacheKey: string, payload: DictionaryResponse) {
    if (searchCache.size >= CACHE_MAX_ENTRIES) {
        const oldestKey = searchCache.keys().next().value
        if (oldestKey) searchCache.delete(oldestKey)
    }
    searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload })
}

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin')
    const headers = corsHeaders(origin)

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, headers)
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: 'Forbidden origin' }, 403, headers)

    const customerAuth = req.headers.get('X-Customer-Auth')
    const authHeader = customerAuth
        ? (customerAuth.startsWith('Bearer ') ? customerAuth : `Bearer ${customerAuth}`)
        : req.headers.get('Authorization')

    if (!authHeader) return jsonResponse({ error: '학생 인증이 필요합니다.' }, 401, headers)

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) return jsonResponse({ error: '학생 인증이 만료되었습니다.' }, 401, headers)

    const { data: student, error: studentError } = await client
        .from('students')
        .select('id')
        .eq('auth_id', user.id)
        .maybeSingle()
    if (studentError || !student) {
        return jsonResponse({ error: '학생 계정에서만 사전을 검색할 수 있습니다.' }, 403, headers)
    }

    if (!STDICT_API_KEY) {
        return jsonResponse({
            error: '국립국어원 사전 검색 연결을 준비하고 있어요.',
            code: 'STDICT_NOT_CONFIGURED'
        }, 503, headers)
    }

    let body: { query?: string }
    try {
        body = await req.json()
    } catch {
        return jsonResponse({ error: '검색 요청이 올바르지 않습니다.' }, 400, headers)
    }

    const query = cleanText(body.query, 40)
    if (!query) return jsonResponse({ error: '궁금한 낱말을 입력해 주세요.' }, 400, headers)
    if (query.length > 30 || /[.!?。！？\n\r]/.test(query)) {
        return jsonResponse({
            error: '공식 사전에서는 낱말이나 짧은 구를 검색해 주세요.',
            code: 'WORD_OR_PHRASE_ONLY'
        }, 400, headers)
    }

    const cacheKey = query.toLocaleLowerCase('ko-KR')
    const cached = getCached(cacheKey)
    if (cached) return jsonResponse(cached, 200, headers)

    const now = Date.now()
    const lastRequestAt = lastRequestByUser.get(user.id) ?? 0
    if (now - lastRequestAt < MIN_REQUEST_INTERVAL_MS) {
        return jsonResponse({ error: '검색 버튼은 천천히 눌러 주세요.' }, 429, headers)
    }
    lastRequestByUser.set(user.id, now)

    const searchUrl = new URL('https://stdict.korean.go.kr/api/search.do')
    searchUrl.searchParams.set('key', STDICT_API_KEY)
    searchUrl.searchParams.set('q', query)
    searchUrl.searchParams.set('req_type', 'json')
    searchUrl.searchParams.set('num', '10')
    searchUrl.searchParams.set('advanced', 'y')
    searchUrl.searchParams.set('target', '1')
    searchUrl.searchParams.set('method', 'include')
    searchUrl.searchParams.set('type1', 'word,phrase')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
        const response = await fetch(searchUrl, { signal: controller.signal })
        if (!response.ok) {
            console.error(`Standard Korean Dictionary search failed: ${response.status}`)
            return jsonResponse({ error: '국립국어원 사전에 잠시 연결할 수 없어요.' }, 502, headers)
        }

        const responseText = await response.text()
        if (!responseText.trim()) {
            console.error('Standard Korean Dictionary API returned an empty response')
            return jsonResponse({
                error: '국립국어원 사전 인증키를 다시 확인해야 해요.',
                code: 'STDICT_API_ERROR'
            }, 502, headers)
        }

        let payload: Record<string, unknown>
        try {
            payload = JSON.parse(responseText) as Record<string, unknown>
        } catch {
            console.error('Standard Korean Dictionary API returned an invalid response')
            return jsonResponse({
                error: '국립국어원 사전 응답을 읽을 수 없어요.',
                code: 'STDICT_API_ERROR'
            }, 502, headers)
        }
        const apiError = payload?.error && typeof payload.error === 'object'
            ? payload.error as Record<string, unknown>
            : null
        if (apiError) {
            const errorCode = cleanText(apiError.error_code, 20)
            console.error(`Standard Korean Dictionary API error: ${errorCode || 'unknown'}`)
            return jsonResponse({
                error: errorCode === '20' || errorCode === '020' || errorCode === '21' || errorCode === '021'
                    ? '국립국어원 사전 인증을 다시 확인해야 해요.'
                    : '국립국어원 사전 검색 요청을 처리하지 못했어요.',
                code: 'STDICT_API_ERROR'
            }, 502, headers)
        }

        const normalized = normalizeDictionaryPayload(payload, query)
        setCached(cacheKey, normalized)
        return jsonResponse(normalized, 200, headers)
    } catch (error) {
        const timedOut = error instanceof DOMException && error.name === 'AbortError'
        console.error(`Standard Korean Dictionary request ${timedOut ? 'timed out' : 'failed'}`)
        return jsonResponse({
            error: timedOut
                ? '국립국어원 사전 응답이 늦어지고 있어요. 잠시 뒤 다시 찾아보세요.'
                : '국립국어원 사전 검색 중 오류가 발생했어요.'
        }, 502, headers)
    } finally {
        clearTimeout(timeoutId)
    }
})
