import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_EMAIL = 'admin@kku-azit.com'
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',')
    .map((value) => value.trim().replace(/\/$/, '')).filter(Boolean)

const isAllowedOrigin = (origin: string | null) => !origin
    || ALLOWED_ORIGINS.length === 0
    || ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''))
    || origin.startsWith('http://localhost:')
    || origin.startsWith('http://127.0.0.1:')

const headersFor = (origin: string | null) => ({
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin)
        ? origin : (ALLOWED_ORIGINS.length === 0 ? '*' : 'null'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
})

const escapeHtml = (value: unknown) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

// 같은 피드백을 되풀이해 보내거나 한 교사가 메일을 쏟아내지 못하게 한다(2026-10-11 보안 점검).
// 함수 인스턴스 메모리 기준의 가벼운 제한이다 — 피드백마다 1회, 교사별 1시간 5통.
const sentFeedbackIds = new Set<string>()
const sendLog = new Map<string, number[]>()
const MAX_PER_HOUR = 5
const HOUR_MS = 3_600_000
function allowSend(userId: string, feedbackId: string) {
    if (sentFeedbackIds.has(feedbackId)) return false
    const now = Date.now()
    const recent = (sendLog.get(userId) ?? []).filter((at) => now - at < HOUR_MS)
    if (recent.length >= MAX_PER_HOUR) return false
    recent.push(now)
    sendLog.set(userId, recent)
    if (sendLog.size > 500) sendLog.delete(sendLog.keys().next().value as string)
    return true
}

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin')
    const headers = headersFor(origin)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
    if (!isAllowedOrigin(origin)) return new Response(JSON.stringify({ error: 'Forbidden origin' }), { status: 403, headers })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        })
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || user.is_anonymous) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
        }

        if (Number(req.headers.get('content-length') || 0) > 2000) {
            return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers })
        }
        const { feedbackId } = await req.json()
        if (typeof feedbackId !== 'string' || !feedbackId) {
            return new Response(JSON.stringify({ error: 'Feedback id is required' }), { status: 400, headers })
        }
        const [{ data: profile }, { data: feedback, error: feedbackError }] = await Promise.all([
            admin.from('profiles').select('role, is_approved, approval_revoked_at').eq('id', user.id).maybeSingle(),
            admin.from('feedback_reports').select('id, teacher_id, title, content').eq('id', feedbackId)
                .eq('teacher_id', user.id).maybeSingle()
        ])
        const isAllowedTeacher = profile?.role === 'ADMIN'
            || (profile?.role === 'TEACHER' && profile.is_approved === true && profile.approval_revoked_at == null)
        if (!isAllowedTeacher) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers })
        if (feedbackError || !feedback) return new Response(JSON.stringify({ error: 'Feedback not found' }), { status: 404, headers })

        if (RESEND_API_KEY) {
            if (!allowSend(user.id, feedback.id)) {
                return new Response(JSON.stringify({ message: 'Feedback already sent' }), { status: 200, headers })
            }
            const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
                body: JSON.stringify({
                    from: 'Feedback <onboarding@resend.dev>',
                    to: [ADMIN_EMAIL],
                    subject: `[앱 피드백] ${String(feedback.title).slice(0, 120)}`,
                    html: `<h1>새로운 피드백이 도착했습니다.</h1>
                        <p><strong>작성자 ID:</strong> ${escapeHtml(user.id)}</p>
                        <p><strong>제목:</strong> ${escapeHtml(feedback.title)}</p>
                        <p><strong>내용:</strong></p><div>${escapeHtml(feedback.content).replaceAll('\n', '<br>')}</div>`
                })
            })
            if (!emailResponse.ok) throw new Error('이메일 알림 전송에 실패했습니다.')
            sentFeedbackIds.add(feedback.id)
            if (sentFeedbackIds.size > 2000) sentFeedbackIds.delete(sentFeedbackIds.values().next().value as string)
        }

        return new Response(JSON.stringify({ message: 'Feedback processed' }), { status: 200, headers })
    } catch (error) {
        console.error('[send-feedback]', error instanceof Error ? error.message : 'unknown error')
        return new Response(JSON.stringify({ error: 'Feedback processing failed' }), { status: 500, headers })
    }
})
