// 맞춤법 회색 점선 '한번 살펴볼까요?' 서버 함수(2026-10-08).
//
// 학생 입력기 → 이 함수(학생 인증·학급 켜짐·횟수 제한·입력 상한) → 맥미니 분석 창구(127.0.0.1:8791, server.py)
// 글은 맥미니 밖으로 나가지 않는다(분석 창구는 같은 기계 안). 이 함수도 글을 저장하거나 기록하지 않는다.
// 분석 창구가 꺼져 있으면 200 {available:false} — 학생 화면은 회색 점선만 조용히 사라진다(빨간 줄은 그대로).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const ANALYZER_URL = Deno.env.get('SPELLING_ANALYZER_URL') ?? 'http://host.docker.internal:8791/analyze'
const ANALYZER_TOKEN = Deno.env.get('SPELLING_ANALYZER_TOKEN') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

export const GRAY_TOOL_ID = 'spelling-gray'
export const LOOKUP_TOOL_ID = 'spelling-lookup'
export const MAX_PARAGRAPHS = 12
export const MAX_PARAGRAPH_CHARS = 1500
export const MAX_TOTAL_CHARS = 6000
// 입력기는 손을 멈추고 1.2초 뒤에 바뀐 문단만 보낸다. 넉넉히 1분 40번·0.5초 간격까지.
const MIN_INTERVAL_MS = 500
const WINDOW_MS = 60_000
const WINDOW_LIMIT = 40
const ANALYZER_TIMEOUT_MS = 3000
const requestsByUser = new Map<string, number[]>()

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

/** 문단 목록을 상한 안으로 맞춘다. 상한을 넘는 요청은 잘라 내지 않고 거절한다(입력기가 지키는 값). */
export function cleanParagraphs(value: unknown) {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PARAGRAPHS) return null
    let total = 0
    const paragraphs: { key: string; text: string }[] = []
    for (const item of value) {
        if (!item || typeof item !== 'object') return null
        const key = String((item as Record<string, unknown>).key ?? '').slice(0, 80)
        const text = String((item as Record<string, unknown>).text ?? '').normalize('NFC')
        if (!key || text.length > MAX_PARAGRAPH_CHARS) return null
        total += text.length
        paragraphs.push({ key, text })
    }
    return total > MAX_TOTAL_CHARS ? null : paragraphs
}

/** 학생 한 명의 요청 빈도 — 0.5초 간격, 1분 40번. */
export function allowRequest(userId: string, now = Date.now(), store = requestsByUser) {
    const recent = (store.get(userId) ?? []).filter((at) => now - at < WINDOW_MS)
    if (recent.length && now - recent[recent.length - 1] < MIN_INTERVAL_MS) return false
    if (recent.length >= WINDOW_LIMIT) return false
    recent.push(now)
    store.set(userId, recent)
    if (store.size > 5000) store.clear()
    return true
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

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) return jsonResponse({ error: '학생 인증이 만료되었습니다.' }, 401, headers)

    const { data: student } = await client
        .from('students')
        .select('id, class_id')
        .eq('auth_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()
    if (!student?.class_id) return jsonResponse({ error: '학생 계정에서만 쓸 수 있습니다.' }, 403, headers)

    // 학급이 켰는지 서버가 다시 본다(화면 설정만 믿지 않는다).
    const { data: klass } = await client
        .from('classes')
        .select('writing_editor_settings')
        .eq('id', student.class_id)
        .maybeSingle()
    const enabledTools = (klass?.writing_editor_settings as { enabled_tools?: unknown } | null)?.enabled_tools
    // 맞춤법 수첩(빨간 물결)을 끈 반은 회색 점선도 끈다(2026-10-09 선생님 결정).
    if (!Array.isArray(enabledTools) || !enabledTools.includes(GRAY_TOOL_ID) || !enabledTools.includes(LOOKUP_TOOL_ID)) {
        return jsonResponse({ available: false, reason: 'class_off' }, 200, headers)
    }

    let body: { paragraphs?: unknown }
    try {
        body = await req.json()
    } catch {
        return jsonResponse({ error: '요청이 올바르지 않습니다.' }, 400, headers)
    }
    const paragraphs = cleanParagraphs(body.paragraphs)
    if (!paragraphs) return jsonResponse({ error: '한 번에 보낼 수 있는 글을 넘었습니다.' }, 413, headers)
    if (!allowRequest(user.id)) return jsonResponse({ error: '조금 천천히 살펴볼게요.' }, 429, headers)
    if (!ANALYZER_TOKEN) return jsonResponse({ available: false, reason: 'not_configured' }, 200, headers)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS)
    try {
        const response = await fetch(ANALYZER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Analyzer-Token': ANALYZER_TOKEN },
            body: JSON.stringify({ paragraphs }),
            signal: controller.signal
        })
        if (!response.ok) {
            console.error(`spelling analyzer status ${response.status}`)
            return jsonResponse({ available: false, reason: 'analyzer_error' }, 200, headers)
        }
        const payload = await response.json() as { results?: unknown }
        return jsonResponse({ available: true, results: Array.isArray(payload.results) ? payload.results : [] }, 200, headers)
    } catch (error) {
        console.error(`spelling analyzer unreachable: ${error instanceof Error ? error.name : 'unknown'}`)
        return jsonResponse({ available: false, reason: 'analyzer_down' }, 200, headers)
    } finally {
        clearTimeout(timeoutId)
    }
})
