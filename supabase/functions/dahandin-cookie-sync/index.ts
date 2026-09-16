// 다했니 쿠키 → 아지트 "다했니 포인트" 정산
//
// 두 가지 모드:
//   1) 수동: 교사가 자기 학급에 대해 "지금 동기화" 를 누르면 이 함수를 JWT 로 부른다.
//   2) 자동: cron/스케줄러가 x-cron-secret 헤더로 부르면, 지금 정산할 학급(dahandin_due_classes_v1)을
//      모두 처리한다.
//
// 흐름(학급 하나):
//   · 그 학급 담임의 다했니 키를 복호화한다(AES-256-GCM, 마스터 키 DAHANDIN_ENC_KEY).
//   · 활성 매칭 학생마다 /get/student/total?code= 를 200ms 간격으로 순차 호출한다.
//     (다했니 제한: 평균 5 req/초. 'slow down.'/429 면 잠깐 쉬고 다시 시도.)
//   · delta = max(0, 현재 누적쿠키 - 지난번 반영쿠키). delta>0 이면 delta*환율 을
//     award_dahandin_cookie_points_v1 로 지급(event_key 로 중복지급 차단).
//   · 성공하면 last_cookie 를 갱신한다(실패 학생은 다음 정산에서 다시 시도).
//   · 실행/학생별 결과를 dahandin_sync_runs/items 에 남긴다(대시보드용).
//
// 복호화된 키는 실행 중 메모리에만 두고 응답·로그에 절대 싣지 않는다.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENC_SECRET = (Deno.env.get('DAHANDIN_ENC_KEY') ?? '').trim()
const CRON_SECRET = (Deno.env.get('DAHANDIN_CRON_SECRET') ?? '').trim()
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)

const DAHANDIN_BASE = 'https://api.dahandin.com/openapi/v1'
const REQUEST_TIMEOUT_MS = 8_000
const CALL_INTERVAL_MS = 220           // 학생 사이 간격(≈4.5 req/초, 제한 아래)
const MAX_RETRY = 3

type SupabaseAdmin = ReturnType<typeof createClient>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
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

// ── AES-256-GCM 복호화 ──
async function importKey(): Promise<CryptoKey> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ENC_SECRET))
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
function fromBase64(b64: string): Uint8Array {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}
async function decryptKey(ciphertext: string, iv: string): Promise<string> {
    const key = await importKey()
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(iv) },
        key,
        fromBase64(ciphertext)
    )
    return new TextDecoder().decode(plain)
}

// ── 다했니 학생 조회 (재시도 포함) ──
type StudentTotal = { ok: true; name: string; cookie: number } | { ok: false; message: string }

async function fetchStudentTotal(apiKey: string, code: string): Promise<StudentTotal> {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        try {
            const res = await fetch(`${DAHANDIN_BASE}/get/student/total?code=${encodeURIComponent(code)}`, {
                method: 'GET',
                headers: { 'X-API-Key': apiKey },
                signal: controller.signal
            })
            if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue }
            const json = await res.json().catch(() => null) as
                { result?: boolean; message?: string; data?: { name?: string; cookie?: number } } | null
            if (json && json.result === true && json.data) {
                return { ok: true, name: String(json.data.name ?? ''), cookie: Number(json.data.cookie ?? 0) }
            }
            const message = String(json?.message ?? '조회 실패')
            if (/slow down/i.test(message)) { await sleep(1500 * (attempt + 1)); continue }
            return { ok: false, message } // 코드 오류 등은 재시도해도 같으므로 즉시 실패
        } catch {
            await sleep(500 * (attempt + 1))
        } finally {
            clearTimeout(timer)
        }
    }
    return { ok: false, message: '다했니 연결에 실패했습니다.' }
}

type SyncSummary = {
    classId: string
    ok: number
    fail: number
    pointsGranted: number
    items: Array<Record<string, unknown>>
    error?: string
}

// 학급 하나를 정산한다.
async function runClassSync(admin: SupabaseAdmin, classId: string, trigger: 'manual' | 'auto'): Promise<SyncSummary> {
    const summary: SyncSummary = { classId, ok: 0, fail: 0, pointsGranted: 0, items: [] }

    // 설정 확인
    const { data: settings } = await admin
        .from('dahandin_class_settings')
        .select('enabled, points_per_cookie')
        .eq('class_id', classId)
        .maybeSingle()
    if (!settings || !settings.enabled) {
        summary.error = '연동이 꺼져 있습니다.'
        return summary
    }
    const rate = Number(settings.points_per_cookie ?? 10)

    // 담임의 키 복호화
    const { data: klass } = await admin.from('classes').select('teacher_id').eq('id', classId).maybeSingle()
    if (!klass?.teacher_id) { summary.error = '학급 정보를 찾을 수 없습니다.'; return summary }
    const { data: cred } = await admin
        .from('dahandin_teacher_credentials')
        .select('key_ciphertext, key_iv, key_valid')
        .eq('teacher_id', klass.teacher_id)
        .maybeSingle()
    if (!cred || !cred.key_valid) { summary.error = '먼저 다했니 API 키를 연결해 주세요.'; return summary }

    let apiKey: string
    try {
        apiKey = await decryptKey(cred.key_ciphertext, cred.key_iv)
    } catch {
        summary.error = '키 복호화에 실패했습니다.'
        return summary
    }

    // 매칭 학생
    const { data: links } = await admin
        .from('dahandin_student_links')
        .select('id, student_id, dahandin_code, last_cookie')
        .eq('class_id', classId)
        .eq('active', true)
    const list = links ?? []

    // 실행 로그 시작
    const { data: run } = await admin
        .from('dahandin_sync_runs')
        .insert({ class_id: classId, trigger, started_at: new Date().toISOString() })
        .select('id')
        .single()
    const runId = run?.id ?? null

    for (let i = 0; i < list.length; i++) {
        const link = list[i]
        const result = await fetchStudentTotal(apiKey, link.dahandin_code)
        const item: Record<string, unknown> = {
            run_id: runId, class_id: classId, student_id: link.student_id,
            dahandin_code: link.dahandin_code, prev_cookie: link.last_cookie
        }
        if (!result.ok) {
            summary.fail++
            Object.assign(item, { status: 'fail', message: result.message, points_granted: 0 })
        } else {
            const delta = Math.max(0, result.cookie - Number(link.last_cookie ?? 0))
            item.new_cookie = result.cookie
            item.delta_cookie = delta
            if (delta <= 0) {
                summary.ok++
                Object.assign(item, { status: 'skip', points_granted: 0, message: '변화 없음' })
            } else {
                const points = delta * rate
                const eventKey = `dahandin:${link.id}:${result.cookie}`
                const { error: grantError } = await admin.rpc('award_dahandin_cookie_points_v1', {
                    p_student_id: link.student_id,
                    p_amount: points,
                    p_event_key: eventKey,
                    p_metadata: { source: 'dahandin_cookie', class_id: classId, delta_cookie: delta }
                })
                if (grantError) {
                    summary.fail++
                    Object.assign(item, { status: 'fail', points_granted: 0, message: '포인트 지급 실패' })
                } else {
                    // 지급 성공 → 기준선 갱신
                    await admin.from('dahandin_student_links')
                        .update({ last_cookie: result.cookie, updated_at: new Date().toISOString() })
                        .eq('id', link.id)
                    summary.ok++
                    summary.pointsGranted += points
                    Object.assign(item, { status: 'ok', points_granted: points })
                }
            }
        }
        summary.items.push(item)
        if (i < list.length - 1) await sleep(CALL_INTERVAL_MS)
    }

    // 상세·집계 기록
    if (summary.items.length > 0) {
        await admin.from('dahandin_sync_items').insert(summary.items)
    }
    if (runId) {
        await admin.from('dahandin_sync_runs').update({
            finished_at: new Date().toISOString(),
            ok_count: summary.ok,
            fail_count: summary.fail,
            total_points_granted: summary.pointsGranted
        }).eq('id', runId)
    }
    return summary
}

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin')
    const headers = corsHeaders(origin)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, headers)
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: 'Forbidden origin' }, 403, headers)
    if (!ENC_SECRET) return jsonResponse({ error: '다했니 연동 암호화 설정이 필요합니다.', code: 'ENC_NOT_CONFIGURED' }, 503, headers)
    if (!SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ error: '서버 설정 오류' }, 503, headers)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── 자동(cron) 모드: x-cron-secret 로 인증 ──
    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret) {
        if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
            return jsonResponse({ error: '권한이 없습니다.' }, 401, headers)
        }
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) // YYYY-MM-DD
        // 학급 하나만 지정해 부르면(짧은 요청) 그 학급만, 없으면 정산 대상 전체를 처리한다.
        let bodyClassId = ''
        try { bodyClassId = String(((await req.json()) as Record<string, unknown>)?.classId ?? '').trim() } catch { /* body 없음 */ }

        let targets: string[]
        if (bodyClassId) {
            targets = [bodyClassId]
        } else {
            const { data: due, error: dueError } = await admin.rpc('dahandin_due_classes_v1')
            if (dueError) return jsonResponse({ error: '정산 대상 조회 실패' }, 500, headers)
            targets = ((due ?? []) as Array<{ class_id: string }>).map((r) => r.class_id)
        }

        const results: Array<Record<string, unknown>> = []
        for (const cid of targets) {
            const s = await runClassSync(admin, cid, 'auto')
            await admin.from('dahandin_class_settings').update({ last_run_on: today }).eq('class_id', cid)
            results.push({ classId: s.classId, ok: s.ok, fail: s.fail, pointsGranted: s.pointsGranted, error: s.error })
        }
        return jsonResponse({ ok: true, ran: results.length, results }, 200, headers)
    }

    // ── 수동 모드: 교사 JWT ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401, headers)
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) return jsonResponse({ error: '교사 로그인이 만료되었습니다.' }, 401, headers)

    let body: Record<string, unknown>
    try {
        body = await req.json() as Record<string, unknown>
    } catch {
        return jsonResponse({ error: '요청 형식이 올바르지 않습니다.' }, 400, headers)
    }
    const classId = String(body.classId ?? '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(classId)) return jsonResponse({ error: '학급 정보가 올바르지 않습니다.' }, 400, headers)

    // 이 학급 담임 또는 관리자만
    const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const { data: klass } = await admin.from('classes').select('teacher_id').eq('id', classId).maybeSingle()
    const allowed = profile?.role === 'ADMIN' || klass?.teacher_id === user.id
    if (!allowed) return jsonResponse({ error: '이 학급을 정산할 권한이 없습니다.' }, 403, headers)

    const summary = await runClassSync(admin, classId, 'manual')
    if (summary.error && summary.ok === 0 && summary.fail === 0) {
        return jsonResponse({ ok: false, error: summary.error }, 400, headers)
    }
    return jsonResponse({
        ok: true,
        ok_count: summary.ok,
        fail_count: summary.fail,
        points_granted: summary.pointsGranted,
        items: summary.items
    }, 200, headers)
})
