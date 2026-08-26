import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const NEIS_API_KEY = (Deno.env.get('NEIS_API_KEY') ?? '').trim()
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

const REQUEST_TIMEOUT_MS = 8_000
const MEAL_CACHE_TTL_MS = 6 * 60 * 60 * 1_000
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1_000
const SEARCH_CACHE_MAX = 200
const RATE_LIMIT_CACHE_MAX = 1_000
const SEARCH_MIN_INTERVAL_MS = 500
const MEAL_MIN_INTERVAL_MS = 1_000

type SchoolResult = {
    officeCode: string
    schoolCode: string
    schoolName: string
    address: string
    region: string
    schoolKind: string
}

type MealDish = { name: string; allergenCodes: number[] }
type MealItem = {
    mealType: string
    date: string
    dishes: MealDish[]
    calories: string
    nutrition: string[]
    origin: string[]
    sourceUpdatedAt: string
}

type MealPayload = {
    school: { officeCode: string; schoolCode: string }
    date: string
    meals: MealItem[]
    fetchedAt: string
    cacheStatus: 'fresh' | 'stale' | 'refreshed'
    warning?: string
}

const searchCache = new Map<string, { expiresAt: number; items: SchoolResult[] }>()
const lastRequestByUser = new Map<string, { search?: number; meal?: number }>()

function isAllowedOrigin(origin: string | null) {
    if (!origin) return true
    const clean = origin.replace(/\/$/, '')
    return ALLOWED_ORIGINS.length === 0
        || ALLOWED_ORIGINS.includes(clean)
        || clean.startsWith('http://localhost:')
        || clean.startsWith('http://127.0.0.1:')
}

function corsHeaders(origin: string | null) {
    return {
        'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : (ALLOWED_ORIGINS.length ? 'null' : '*'),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
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
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
}

function splitHtmlLines(value: unknown, maxItems = 40, maxLength = 160) {
    return String(value ?? '')
        .split(/<br\s*\/?\s*>|\r?\n/gi)
        .map((item) => cleanText(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
}

function parseDish(value: string): MealDish {
    const suffix = value.match(/\(([0-9.]+)\)\s*\*?\s*$/)
    const allergenCodes = suffix
        ? [...new Set(suffix[1].split('.')
            .map((code) => Number(code))
            .filter((code) => Number.isInteger(code) && code >= 1 && code <= 19))]
        : []
    const name = cleanText(suffix ? value.slice(0, suffix.index) : value, 120).replace(/\s*\*\s*$/, '')
    return { name, allergenCodes }
}

function validSchoolCodes(officeCode: unknown, schoolCode: unknown) {
    return /^[A-Z0-9]{3}$/.test(String(officeCode ?? ''))
        && /^[0-9]{7}$/.test(String(schoolCode ?? ''))
}

function validMealDate(value: unknown) {
    const text = String(value ?? '')
    if (!/^20[0-9]{6}$/.test(text)) return false
    const year = Number(text.slice(0, 4))
    const month = Number(text.slice(4, 6))
    const day = Number(text.slice(6, 8))
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
}

function enforceRateLimit(userId: string, action: 'search' | 'meal') {
    const now = Date.now()
    const previous = lastRequestByUser.get(userId) ?? {}
    const lastAt = previous[action] ?? 0
    const interval = action === 'search' ? SEARCH_MIN_INTERVAL_MS : MEAL_MIN_INTERVAL_MS
    if (now - lastAt < interval) return false
    if (!lastRequestByUser.has(userId) && lastRequestByUser.size >= RATE_LIMIT_CACHE_MAX) {
        const oldestUserId = lastRequestByUser.keys().next().value
        if (oldestUserId) lastRequestByUser.delete(oldestUserId)
    }
    lastRequestByUser.set(userId, { ...previous, [action]: now })
    return true
}

function neisResultCode(payload: Record<string, unknown>) {
    const direct = payload.RESULT
    if (direct && !Array.isArray(direct) && typeof direct === 'object') {
        return cleanText((direct as Record<string, unknown>).CODE, 20)
    }
    for (const value of Object.values(payload)) {
        if (!Array.isArray(value)) continue
        for (const section of value) {
            if (!section || typeof section !== 'object') continue
            const head = (section as Record<string, unknown>).head
            if (!Array.isArray(head)) continue
            for (const item of head) {
                if (!item || typeof item !== 'object') continue
                const result = (item as Record<string, unknown>).RESULT
                if (result && typeof result === 'object') {
                    return cleanText((result as Record<string, unknown>).CODE, 20)
                }
            }
        }
    }
    return ''
}

async function fetchNeis(url: URL) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`NEIS HTTP ${response.status}`)
        const body = await response.text()
        if (!body.trim() || body.length > 1_000_000) throw new Error('NEIS response size invalid')
        const payload = JSON.parse(body) as Record<string, unknown>
        const resultCode = neisResultCode(payload)
        if (resultCode && resultCode !== 'INFO-000' && resultCode !== 'INFO-200') {
            throw new Error(`NEIS result ${resultCode}`)
        }
        return payload
    } finally {
        clearTimeout(timeout)
    }
}

function rowsFrom(payload: Record<string, unknown>, key: 'schoolInfo' | 'mealServiceDietInfo') {
    const sections = Array.isArray(payload[key]) ? payload[key] as Record<string, unknown>[] : []
    const rowSection = sections.find((section) => Array.isArray(section?.row))
    return Array.isArray(rowSection?.row) ? rowSection.row as Record<string, unknown>[] : []
}

async function searchSchools(query: string) {
    const cacheKey = query.toLocaleLowerCase('ko-KR')
    const cached = searchCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.items

    const url = new URL('https://open.neis.go.kr/hub/schoolInfo')
    url.searchParams.set('KEY', NEIS_API_KEY)
    url.searchParams.set('Type', 'json')
    url.searchParams.set('pIndex', '1')
    url.searchParams.set('pSize', '20')
    url.searchParams.set('SCHUL_NM', query)
    url.searchParams.set('SCHUL_KND_SC_NM', '초등학교')
    const payload = await fetchNeis(url)
    const items = rowsFrom(payload, 'schoolInfo')
        .filter((row) => cleanText(row.SCHUL_KND_SC_NM, 30) === '초등학교')
        .map((row) => ({
            officeCode: cleanText(row.ATPT_OFCDC_SC_CODE, 3),
            schoolCode: cleanText(row.SD_SCHUL_CODE, 7),
            schoolName: cleanText(row.SCHUL_NM, 100),
            address: cleanText(row.ORG_RDNMA, 300),
            region: cleanText(row.ATPT_OFCDC_SC_NM, 60),
            schoolKind: cleanText(row.SCHUL_KND_SC_NM, 30)
        }))
        .filter((school) => validSchoolCodes(school.officeCode, school.schoolCode) && school.schoolName)
        .slice(0, 20)

    if (searchCache.size >= SEARCH_CACHE_MAX) {
        const oldestKey = searchCache.keys().next().value
        if (oldestKey) searchCache.delete(oldestKey)
    }
    searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, items })
    return items
}

function normalizeMealPayload(
    payload: Record<string, unknown>,
    officeCode: string,
    schoolCode: string,
    mealDate: string
): MealPayload {
    const meals = rowsFrom(payload, 'mealServiceDietInfo').slice(0, 3).map((row) => ({
        mealType: cleanText(row.MMEAL_SC_NM, 30),
        date: cleanText(row.MLSV_YMD, 8),
        dishes: splitHtmlLines(row.DDISH_NM).map(parseDish).filter((dish) => dish.name),
        calories: cleanText(row.CAL_INFO, 40),
        nutrition: splitHtmlLines(row.NTR_INFO, 30, 120),
        origin: splitHtmlLines(row.ORPLC_INFO, 30, 160),
        sourceUpdatedAt: cleanText(row.LOAD_DTM, 30)
    }))
    return {
        school: { officeCode, schoolCode },
        date: mealDate,
        meals,
        fetchedAt: new Date().toISOString(),
        cacheStatus: 'refreshed'
    }
}

async function readMealCache(admin: ReturnType<typeof createClient>, officeCode: string, schoolCode: string, mealDate: string) {
    if (!SUPABASE_SERVICE_ROLE_KEY) return null
    const isoDate = `${mealDate.slice(0, 4)}-${mealDate.slice(4, 6)}-${mealDate.slice(6, 8)}`
    const { data, error } = await admin
        .from('neis_meal_cache')
        .select('payload, fetched_at, expires_at')
        .eq('school_office_code', officeCode)
        .eq('school_code', schoolCode)
        .eq('meal_date', isoDate)
        .maybeSingle()
    if (error) console.error(`NEIS meal cache read failed: ${error.code || 'unknown'}`)
    return data ?? null
}

async function writeMealCache(admin: ReturnType<typeof createClient>, payload: MealPayload) {
    if (!SUPABASE_SERVICE_ROLE_KEY) return
    const mealDate = `${payload.date.slice(0, 4)}-${payload.date.slice(4, 6)}-${payload.date.slice(6, 8)}`
    const expiresAt = new Date(Date.now() + MEAL_CACHE_TTL_MS).toISOString()
    const { error } = await admin.from('neis_meal_cache').upsert({
        school_office_code: payload.school.officeCode,
        school_code: payload.school.schoolCode,
        meal_date: mealDate,
        payload,
        fetched_at: payload.fetchedAt,
        expires_at: expiresAt
    }, { onConflict: 'school_office_code,school_code,meal_date' })
    if (error) console.error(`NEIS meal cache write failed: ${error.code || 'unknown'}`)
}

async function getMeal(
    admin: ReturnType<typeof createClient>,
    officeCode: string,
    schoolCode: string,
    mealDate: string,
    forceRefresh: boolean
) {
    const cached = await readMealCache(admin, officeCode, schoolCode, mealDate)
    const cachePayload = cached?.payload && typeof cached.payload === 'object'
        ? cached.payload as MealPayload
        : null
    if (!forceRefresh && cachePayload && new Date(cached.expires_at).getTime() > Date.now()) {
        return { ...cachePayload, cacheStatus: 'fresh' as const, fetchedAt: cached.fetched_at }
    }

    try {
        const url = new URL('https://open.neis.go.kr/hub/mealServiceDietInfo')
        url.searchParams.set('KEY', NEIS_API_KEY)
        url.searchParams.set('Type', 'json')
        url.searchParams.set('pIndex', '1')
        url.searchParams.set('pSize', '3')
        url.searchParams.set('ATPT_OFCDC_SC_CODE', officeCode)
        url.searchParams.set('SD_SCHUL_CODE', schoolCode)
        url.searchParams.set('MLSV_YMD', mealDate)
        const normalized = normalizeMealPayload(await fetchNeis(url), officeCode, schoolCode, mealDate)
        await writeMealCache(admin, normalized)
        return normalized
    } catch (error) {
        const timedOut = error instanceof DOMException && error.name === 'AbortError'
        console.error(`NEIS meal request ${timedOut ? 'timed out' : 'failed'}`)
        if (cachePayload) {
            return {
                ...cachePayload,
                cacheStatus: 'stale' as const,
                fetchedAt: cached.fetched_at,
                warning: '나이스 연결이 원활하지 않아 마지막 급식 정보를 보여드립니다.'
            }
        }
        throw error
    }
}

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin')
    const headers = corsHeaders(origin)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, headers)
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: 'Forbidden origin' }, 403, headers)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401, headers)
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    })
    const admin = SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        : client
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) return jsonResponse({ error: '교사 로그인이 만료되었습니다.' }, 401, headers)

    if (!NEIS_API_KEY) {
        return jsonResponse({ error: '나이스 급식 연결 설정을 확인해 주세요.', code: 'NEIS_NOT_CONFIGURED' }, 503, headers)
    }

    let body: Record<string, unknown>
    try {
        body = await req.json() as Record<string, unknown>
    } catch {
        return jsonResponse({ error: '요청 형식이 올바르지 않습니다.' }, 400, headers)
    }

    const action = cleanText(body.action, 30)
    if (action === 'search-schools') {
        const query = cleanText(body.query, 40)
        if (query.length < 2) return jsonResponse({ error: '학교명을 두 글자 이상 입력해 주세요.' }, 400, headers)
        if (!enforceRateLimit(user.id, 'search')) return jsonResponse({ error: '학교 검색은 천천히 이용해 주세요.' }, 429, headers)
        try {
            return jsonResponse({ schools: await searchSchools(query) }, 200, headers)
        } catch {
            return jsonResponse({ error: '학교 검색에 잠시 연결할 수 없습니다.' }, 502, headers)
        }
    }

    if (action === 'get-meal') {
        const { data: profile } = await client
            .from('profiles')
            .select('role, is_approved, approval_revoked_at')
            .eq('id', user.id)
            .maybeSingle()
        const allowedTeacher = profile?.role === 'ADMIN'
            || (profile?.role === 'TEACHER' && profile?.is_approved === true && profile?.approval_revoked_at == null)
        if (!allowedTeacher) return jsonResponse({ error: '승인된 교사만 급식을 확인할 수 있습니다.' }, 403, headers)

        const officeCode = cleanText(body.officeCode, 3)
        const schoolCode = cleanText(body.schoolCode, 7)
        const mealDate = cleanText(body.date, 8)
        if (!validSchoolCodes(officeCode, schoolCode) || !validMealDate(mealDate)) {
            return jsonResponse({ error: '학교 또는 날짜 정보가 올바르지 않습니다.' }, 400, headers)
        }
        if (!enforceRateLimit(user.id, 'meal')) return jsonResponse({ error: '급식 새로고침은 천천히 이용해 주세요.' }, 429, headers)
        try {
            return jsonResponse(await getMeal(admin, officeCode, schoolCode, mealDate, body.forceRefresh === true), 200, headers)
        } catch {
            return jsonResponse({ error: '나이스 급식 정보를 불러오지 못했습니다.' }, 502, headers)
        }
    }

    return jsonResponse({ error: '지원하지 않는 요청입니다.' }, 400, headers)
})
