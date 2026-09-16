// 다했니 API 키 저장·검증·삭제 (교사별)
//
// 왜 엣지 함수인가:
//   키를 브라우저에 두거나 평문으로 DB에 두지 않기 위해서다. 교사가 보낸 키를 여기서
//   AES-256-GCM 으로 암호화해 저장하고, 다시는 원본을 클라이언트로 돌려주지 않는다.
//   화면에는 마지막 몇 자리(key_last4)만 보여 준다.
//
// 보안:
//   · 암호화 마스터 키는 엣지 시크릿 DAHANDIN_ENC_KEY 하나. DB가 통째로 유출돼도 이 키
//     없이는 복호화할 수 없다. (self-hosted 스택이라 Vault 대신 앱단 AES-GCM 을 쓴다.)
//   · 저장 전에 다했니 /get/class/list 로 키가 진짜 유효한지 확인한다. 무효면 저장하지 않는다.
//
// 응답 필드 원본 키는 절대 싣지 않는다.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENC_SECRET = (Deno.env.get('DAHANDIN_ENC_KEY') ?? '').trim()
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)

const DAHANDIN_BASE = 'https://api.dahandin.com/openapi/v1'
const REQUEST_TIMEOUT_MS = 8_000

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

// ── AES-256-GCM (마스터 키를 SHA-256 으로 32바이트화해서 쓴다) ──
async function importKey(): Promise<CryptoKey> {
    const material = new TextEncoder().encode(ENC_SECRET)
    const digest = await crypto.subtle.digest('SHA-256', material) // 32바이트
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function toBase64(bytes: Uint8Array): string {
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    return btoa(binary)
}

async function encryptKey(plain: string): Promise<{ ciphertext: string; iv: string }> {
    const key = await importKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const enc = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(plain)
    )
    return { ciphertext: toBase64(new Uint8Array(enc)), iv: toBase64(iv) }
}

// ── 다했니 키 검증 (/get/class/list 는 코드 없이 키만으로 확인 가능) ──
async function verifyDahandinKey(apiKey: string): Promise<{ valid: boolean; classes?: unknown }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        const res = await fetch(`${DAHANDIN_BASE}/get/class/list`, {
            method: 'GET',
            headers: { 'X-API-Key': apiKey },
            signal: controller.signal
        })
        const json = await res.json().catch(() => null) as { result?: boolean; data?: unknown } | null
        if (json && json.result === true) return { valid: true, classes: json.data }
        return { valid: false }
    } catch {
        return { valid: false }
    } finally {
        clearTimeout(timer)
    }
}

async function readStatus(admin: ReturnType<typeof createClient>, teacherId: string) {
    const { data } = await admin
        .from('dahandin_teacher_credentials')
        .select('key_last4, key_valid, verified_at, updated_at')
        .eq('teacher_id', teacherId)
        .maybeSingle()
    return {
        connected: !!data,
        keyLast4: data?.key_last4 ?? null,
        keyValid: data?.key_valid ?? false,
        verifiedAt: data?.verified_at ?? null,
        updatedAt: data?.updated_at ?? null
    }
}

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin')
    const headers = corsHeaders(origin)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, headers)
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: 'Forbidden origin' }, 403, headers)
    if (!ENC_SECRET) return jsonResponse({ error: '다했니 연동 암호화 설정이 필요합니다.', code: 'ENC_NOT_CONFIGURED' }, 503, headers)

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

    // 승인된 교사/관리자만
    const { data: profile } = await client
        .from('profiles')
        .select('role, is_approved, approval_revoked_at')
        .eq('id', user.id)
        .maybeSingle()
    const allowed = profile?.role === 'ADMIN'
        || (profile?.role === 'TEACHER' && profile?.is_approved === true && profile?.approval_revoked_at == null)
    if (!allowed) return jsonResponse({ error: '승인된 교사만 이용할 수 있습니다.' }, 403, headers)

    let body: Record<string, unknown>
    try {
        body = await req.json() as Record<string, unknown>
    } catch {
        return jsonResponse({ error: '요청 형식이 올바르지 않습니다.' }, 400, headers)
    }
    const action = String(body.action ?? '').trim()

    if (action === 'status') {
        return jsonResponse({ ok: true, status: await readStatus(admin, user.id) }, 200, headers)
    }

    if (action === 'save') {
        const apiKey = String(body.apiKey ?? '').trim()
        if (apiKey.length < 8 || apiKey.length > 200 || /\s/.test(apiKey)) {
            return jsonResponse({ error: 'API 키 형식이 올바르지 않습니다.' }, 400, headers)
        }
        const check = await verifyDahandinKey(apiKey)
        if (!check.valid) {
            return jsonResponse({ error: '다했니에서 인정하지 않는 키예요. 다했니 → API 센터에서 키를 다시 확인해 주세요.', code: 'KEY_INVALID' }, 400, headers)
        }
        const { ciphertext, iv } = await encryptKey(apiKey)
        const { error: upsertError } = await admin
            .from('dahandin_teacher_credentials')
            .upsert({
                teacher_id: user.id,
                key_ciphertext: ciphertext,
                key_iv: iv,
                key_last4: apiKey.slice(-5),
                key_valid: true,
                verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'teacher_id' })
        if (upsertError) return jsonResponse({ error: '키 저장에 실패했습니다.' }, 500, headers)
        return jsonResponse({ ok: true, status: await readStatus(admin, user.id) }, 200, headers)
    }

    if (action === 'delete') {
        const { error: delError } = await admin
            .from('dahandin_teacher_credentials')
            .delete()
            .eq('teacher_id', user.id)
        if (delError) return jsonResponse({ error: '연결 해제에 실패했습니다.' }, 500, headers)
        return jsonResponse({ ok: true, status: await readStatus(admin, user.id) }, 200, headers)
    }

    return jsonResponse({ error: '지원하지 않는 요청입니다.' }, 400, headers)
})
