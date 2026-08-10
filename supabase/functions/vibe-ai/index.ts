import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

const isAllowedOrigin = (origin: string | null) => {
    if (!origin) return true
    const normalized = origin.replace(/\/$/, '')
    return ALLOWED_ORIGINS.length === 0
        || ALLOWED_ORIGINS.includes(normalized)
        || normalized.startsWith('http://localhost:')
        || normalized.startsWith('http://127.0.0.1:')
}

const corsHeaders = (origin: string | null) => ({
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin)
        ? origin
        : (ALLOWED_ORIGINS.length === 0 ? '*' : 'null'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-customer-auth, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
})

class HttpError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

const jsonResponse = (body: unknown, status: number, headers: Record<string, string>) => new Response(
    JSON.stringify(body),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
)

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    )
    const supabaseAdmin = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let claimedCommentId: string | null = null
    let claimedStudentId: string | null = null
    let reviewToken: string | null = null

    try {
        if (!authHeader) throw new HttpError(401, '로그인이 필요합니다.')
        const payload = await req.json().catch(() => { throw new HttpError(400, '요청 형식이 올바르지 않습니다.') })
        const { prompt, content, studentId, type, commentId } = payload ?? {}
        const allowedTypes = new Set(['SAFETY_CHECK', 'AI_FEEDBACK', 'GENERAL', 'CONNECTION_TEST', 'DIAG', 'SPELLING_DRAFT'])
        if (!allowedTypes.has(type)) throw new HttpError(400, '허용되지 않은 AI 요청입니다.')

        const { data: userData, error: userError } = await supabaseClient.auth.getUser()
        const user = userData?.user
        if (userError || !user) throw new HttpError(401, '로그인 정보를 확인할 수 없습니다.')

        let isStudentRequest = false
        let targetTeacherId: string | null = null

        if (user.is_anonymous) {
            if (type !== 'SAFETY_CHECK' || typeof studentId !== 'string') {
                throw new HttpError(403, '학생 계정은 댓글 안전 확인만 사용할 수 있습니다.')
            }
            const { data: student, error: studentError } = await supabaseAdmin
                .from('students')
                .select('id, classes:class_id(teacher_id)')
                .eq('id', studentId)
                .eq('auth_id', user.id)
                .is('deleted_at', null)
                .maybeSingle()
            if (studentError || !student) throw new HttpError(403, '학생 계정 연결을 확인할 수 없습니다.')
            isStudentRequest = true
            targetTeacherId = Array.isArray(student.classes)
                ? student.classes[0]?.teacher_id ?? null
                : student.classes?.teacher_id ?? null
        } else {
            if (type === 'SAFETY_CHECK') throw new HttpError(403, '댓글 안전 확인은 학생 댓글에만 사용합니다.')
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('role, is_approved, approval_revoked_at')
                .eq('id', user.id)
                .maybeSingle()
            const isAdmin = profile?.role === 'ADMIN'
            const isApprovedTeacher = profile?.role === 'TEACHER'
                && profile.is_approved === true
                && profile.approval_revoked_at == null
            if (profileError || (!isAdmin && !isApprovedTeacher)) {
                throw new HttpError(403, '승인된 교사만 AI 기능을 사용할 수 있습니다.')
            }
            targetTeacherId = user.id
        }

        let finalPrompt = typeof prompt === 'string' ? prompt : (typeof content === 'string' ? content : '')

        if (isStudentRequest) {
            if (typeof commentId !== 'string' || !commentId) {
                throw new HttpError(400, '댓글 ID가 필요합니다.')
            }
            const { data: claim, error: claimError } = await supabaseAdmin.rpc('claim_comment_ai_review_v1', {
                p_comment_id: commentId,
                p_student_id: studentId
            })
            if (claimError) throw claimError
            if (!claim?.claimed) {
                if (claim?.status === 'rate_limited') throw new HttpError(429, '잠시 후 다시 확인해주세요.')
                if (claim?.status === 'pending') throw new HttpError(409, '이미 이 댓글을 확인하고 있습니다.')
                const existingResult = {
                    is_appropriate: claim?.status === 'approved',
                    reason: claim?.moderation_reason || ''
                }
                return jsonResponse({
                    text: JSON.stringify(existingResult), reviewRecorded: false, currentStatus: claim?.status
                }, 200, headers)
            }
            claimedCommentId = commentId
            claimedStudentId = studentId
            reviewToken = claim.review_token
            finalPrompt = claim.content
        } else if (type !== 'DIAG') {
            const { data: rate, error: rateError } = await supabaseAdmin.rpc('consume_ai_request_v1', {
                p_actor_id: user.id,
                p_scope: 'teacher_ai'
            })
            if (rateError) throw rateError
            if (!rate?.allowed) throw new HttpError(429, 'AI 요청이 너무 많습니다. 1분 뒤 다시 시도해주세요.')
        }

        if (type === 'DIAG') {
            const { data: setting } = await supabaseAdmin
                .from('system_settings').select('value').eq('key', 'public_api_enabled').maybeSingle()
            return jsonResponse({
                targetTeacherId,
                currentMode: 'SYSTEM',
                isPublicEnabled: setting ? setting.value === true : true
            }, 200, headers)
        }

        const maxPromptLength = isStudentRequest ? 300 : (type === 'SPELLING_DRAFT' ? 80 : 10000)
        if (!finalPrompt.trim()) throw new HttpError(400, 'AI에게 전달할 내용이 없습니다.')
        if (finalPrompt.length > maxPromptLength) throw new HttpError(400, '내용이 너무 깁니다.')

        if (isStudentRequest) {
            const textToCheck = finalPrompt.replace(/"/g, "'")
            finalPrompt = `너는 초등학교 선생님이야. 다음 학생 댓글이 학급 커뮤니티에 적절한지 판단해줘.
욕설, 비꼼, 따돌림, 무시, 의미 없는 무작위 문자열이나 도배가 하나라도 있으면 부적절해.
반드시 {"is_appropriate":boolean,"reason":"부적절할 때 다정한 2~3문장 안내"} JSON만 답해줘.
분석할 내용: "${textToCheck}"`
        } else if (type === 'SPELLING_DRAFT') {
            const expression = finalPrompt.replace(/["\\]/g, '').trim()
            finalPrompt = `초등학생 맞춤법 수첩에 넣을 교사용 검토 초안을 만들어줘.
입력된 문제 표현만 분석하고 개인정보나 문장을 추측하지 마.
반드시 마크다운 없이 다음 JSON 객체 하나만 답해줘.
{"wrong_expression":"입력 표현","correct_expression":"바른 표현","label":"40자 이내 학습 유형","explanation":"초등학생이 이해할 2~3문장 설명","examples":["바른 예문 1","바른 예문 2"]}
문맥에 따라 입력 표현이 맞을 수도 있으면 explanation에 그 조건을 분명히 적어 교사가 오탐 가능성을 검토하게 해.
입력 표현: ${expression}`
        }

        const { data: setting } = await supabaseAdmin
            .from('system_settings').select('value').eq('key', 'public_api_enabled').maybeSingle()
        if (setting && setting.value !== true) throw new HttpError(503, '현재 공용 AI 서비스가 비활성화 상태입니다.')
        const apiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').replace(/[^\x20-\x7E]/g, '').trim()
        if (!apiKey) throw new HttpError(503, 'AI 서비스 연결 설정을 확인해주세요.')

        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: finalPrompt }],
                max_tokens: isStudentRequest ? 100 : 1000,
                ...(isStudentRequest ? { temperature: 0 } : {})
            })
        })
        if (!openaiResponse.ok) {
            const upstream = await openaiResponse.json().catch(() => ({}))
            throw new HttpError(openaiResponse.status === 429 ? 429 : 502,
                upstream?.error?.message || 'AI 서비스 응답을 받지 못했습니다.')
        }
        const openaiData = await openaiResponse.json()
        const resultText = openaiData.choices?.[0]?.message?.content ?? ''

        if (isStudentRequest && claimedCommentId && claimedStudentId && reviewToken) {
            const jsonMatch = resultText.match(/\{.*\}/s)
            if (!jsonMatch) throw new HttpError(502, 'AI 댓글 판정 형식이 올바르지 않습니다.')
            const safetyResult = JSON.parse(jsonMatch[0])
            if (typeof safetyResult.is_appropriate !== 'boolean') {
                throw new HttpError(502, 'AI 댓글 판정 값이 올바르지 않습니다.')
            }
            const nextStatus = safetyResult.is_appropriate ? 'approved' : 'blocked'
            const { data: recorded, error: recordError } = await supabaseAdmin
                .from('post_comments')
                .update({
                    status: nextStatus,
                    moderation_reason: safetyResult.is_appropriate ? null : String(safetyResult.reason || '').trim() || null,
                    moderated_at: new Date().toISOString(),
                    moderated_by: 'ai',
                    ai_review_token: null
                })
                .eq('id', claimedCommentId)
                .eq('student_id', claimedStudentId)
                .eq('status', 'pending')
                .eq('ai_review_token', reviewToken)
                .select('id')
                .maybeSingle()
            if (recordError) throw recordError
            return jsonResponse({
                text: resultText, reviewRecorded: !!recorded, currentStatus: nextStatus
            }, 200, headers)
        }

        return jsonResponse({ text: resultText }, 200, headers)
    } catch (error) {
        if (claimedCommentId && claimedStudentId && reviewToken) {
            await supabaseAdmin.from('post_comments').update({
                moderated_at: null, moderated_by: null, ai_review_token: null
            }).eq('id', claimedCommentId).eq('student_id', claimedStudentId)
                .eq('status', 'pending').eq('ai_review_token', reviewToken)
        }
        const status = error instanceof HttpError ? error.status : 400
        const message = error instanceof Error ? error.message : 'AI 요청을 처리하지 못했습니다.'
        console.error(`[vibe-ai] ${status}: ${message}`)
        return jsonResponse({ error: message }, status, headers)
    }
})
