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

/**
 * 글 같지 않은 글(아무 자판이나 두드린 것)을 먼저 걸러낸다.
 *
 * 왜 필요한가: `ㅁ어라너리머리마ㅓㄹ어` 같은 글을 AI에게 보내면 "고칠 곳이 없다"고 답한다.
 * 그러면 학생 화면에 **"잘 썼어요!"** 가 뜬다 — 가장 나쁜 결과다.
 *
 * 판정은 두 가지만 본다(설명할 수 있어야 해서 단순하게 둔다).
 *  ① 홀로 선 자모(ㅁ, ㅓ …) 비율이 한글 글자의 15% 이상 — `ㅋㅋ`, `ㅠㅠ` 정도는 통과한다.
 *  ② 띄어쓰기 없이 한글이 25자 넘게 이어짐 — 운영 글 40편을 재어 보니 가장 긴 것이 18자였다(중앙값 6).
 */
function looksLikeGibberish(text: string): boolean {
    const hangul = text.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) ?? []
    if (hangul.length < 20) return false

    const loneJamo = text.match(/[ㄱ-ㅎㅏ-ㅣ]/g) ?? []
    if (loneJamo.length / hangul.length >= 0.15) return true

    const longestRun = (text.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g) ?? [])
        .reduce((longest, chunk) => Math.max(longest, chunk.length), 0)
    return longestRun >= 25
}

const isUuid = (value: string) => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

    // 맞춤법 검사에서 선점한 글. 도중에 실패하면 **한 번뿐인 기회를 돌려줘야** 해서 바깥에 둔다.
    let spellCheckPostId: string | null = null
    let studentClassId: string | null = null
    let claimedCommentId: string | null = null
    let claimedStudentId: string | null = null
    let reviewToken: string | null = null

    try {
        const payload = await req.json().catch(() => { throw new HttpError(400, '요청 형식이 올바르지 않습니다.') })
        const { prompt, content, studentId, type, commentId, postId } = payload ?? {}
        const allowedTypes = new Set([
            'SAFETY_CHECK', 'AI_FEEDBACK', 'GENERAL', 'CONNECTION_TEST', 'DIAG', 'SPELLING_DRAFT', 'LAB_GENERAL',
            'SPELL_CHECK'
        ])
        if (!allowedTypes.has(type)) throw new HttpError(400, '허용되지 않은 AI 요청입니다.')

        let isStudentRequest = false
        let targetTeacherId: string | null = null
        const isLabRequest = type === 'LAB_GENERAL'

        if (isLabRequest) {
            const labAuth = req.headers.get('X-Lab-Auth') ?? ''
            const labAnonKey = req.headers.get('X-Lab-Anon-Key') ?? ''
            const legacyLabSupabaseUrl = (Deno.env.get('LAB_SUPABASE_URL')
                ?? 'https://supabase.xn--9y2br3k43n.kr').replace(/\/$/, '')
            if (!labAuth.startsWith('Bearer ') || !labAnonKey) {
                throw new HttpError(403, '연구소 로그인 정보를 확인할 수 없습니다.')
            }

            // 통합 /lab은 아지트 Auth, 롤백용 helper는 구 연구소 Auth가 발급한 토큰을 쓴다.
            // 전달된 anon key와 토큰을 각 Auth 서버가 직접 검증하며, 먼저 성공한 사용자만 사용한다.
            const labAuthUrls = [...new Set([
                supabaseUrl.replace(/\/$/, ''),
                legacyLabSupabaseUrl
            ].filter(Boolean))]
            let labUser: { id?: string } | null = null
            for (const labAuthUrl of labAuthUrls) {
                const labUserResponse = await fetch(`${labAuthUrl}/auth/v1/user`, {
                    method: 'GET',
                    headers: { Authorization: labAuth, apikey: labAnonKey },
                    signal: AbortSignal.timeout(10_000)
                })
                if (!labUserResponse.ok) continue
                labUser = await labUserResponse.json().catch(() => null)
                if (isUuid(labUser?.id ?? '')) break
            }
            if (!isUuid(labUser?.id ?? '')) throw new HttpError(403, '연구소 사용자 정보를 확인할 수 없습니다.')

            const { data: resolved, error: resolveError } = await supabaseAdmin.rpc('resolve_lab_ai_teacher_v1', {
                p_lab_user_id: labUser.id
            })
            if (resolveError || resolved?.allowed !== true || !isUuid(resolved?.agit_user_id ?? '')) {
                throw new HttpError(403, '승인된 연구소 교사만 AI 기능을 사용할 수 있습니다.')
            }
            targetTeacherId = resolved.agit_user_id
        } else {
            if (!authHeader) throw new HttpError(401, '로그인이 필요합니다.')
            const { data: userData, error: userError } = await supabaseClient.auth.getUser()
            const user = userData?.user
            if (userError || !user) throw new HttpError(401, '로그인 정보를 확인할 수 없습니다.')

            if (user.is_anonymous) {
                // 학생이 쓸 수 있는 AI 는 둘뿐이다 — 댓글 안전 확인, 내 글 맞춤법 검사.
                if ((type !== 'SAFETY_CHECK' && type !== 'SPELL_CHECK') || typeof studentId !== 'string') {
                    throw new HttpError(403, '학생 계정은 댓글 안전 확인과 맞춤법 검사만 사용할 수 있습니다.')
                }
                const { data: student, error: studentError } = await supabaseAdmin
                    .from('students')
                    .select('id, class_id, classes:class_id(teacher_id)')
                    .eq('id', studentId)
                    .eq('auth_id', user.id)
                    .is('deleted_at', null)
                    .maybeSingle()
                if (studentError || !student) throw new HttpError(403, '학생 계정 연결을 확인할 수 없습니다.')
                isStudentRequest = true
                studentClassId = typeof student.class_id === 'string' ? student.class_id : null
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
        }

        let finalPrompt = typeof prompt === 'string' ? prompt : (typeof content === 'string' ? content : '')

        if (isStudentRequest && type === 'SPELL_CHECK') {
            // 글 한 편에 한 번이라는 제한이 이미 있지만, 한 학급이 동시에 누르는 순간을 위해
            // 학급 교사 기준 분당 상한도 함께 건다(OpenAI 를 부르기 전에).
            if (!targetTeacherId) throw new HttpError(403, '학급 정보를 확인할 수 없습니다.')
            const { data: rate, error: rateError } = await supabaseAdmin.rpc('consume_ai_request_v1', {
                p_actor_id: targetTeacherId,
                p_scope: 'student_spell_check'
            })
            if (rateError) throw rateError
            if (!rate?.allowed) throw new HttpError(429, '지금은 검사 요청이 몰려 있어요. 잠시 뒤에 다시 눌러 주세요.')
        } else if (isStudentRequest) {
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
            if (!targetTeacherId) throw new HttpError(403, 'AI 사용 권한을 확인할 수 없습니다.')
            const { data: rate, error: rateError } = await supabaseAdmin.rpc('consume_ai_request_v1', {
                p_actor_id: targetTeacherId,
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

        // 맞춤법 검사는 글 한 편에 한 번뿐이다. 본문은 클라이언트가 아니라 **서버가 DB 에서 읽고**,
        // 사용 표시를 원자적으로 선점한 뒤에만 AI 를 부른다(새로고침으로 다시 쓰지 못하게).
        if (type === 'SPELL_CHECK') {
            if (!isStudentRequest) throw new HttpError(403, '맞춤법 검사는 학생 본인 글에만 사용합니다.')
            if (!isUuid(postId ?? '')) throw new HttpError(400, '검사할 글을 찾을 수 없습니다.')

            const { data: post, error: postError } = await supabaseAdmin
                .from('student_posts')
                .select('id, content, is_submitted, is_returned, is_confirmed, spell_check_used_at, spell_check_result')
                .eq('id', postId)
                .eq('student_id', studentId)
                .maybeSingle()
            if (postError || !post) throw new HttpError(403, '내 글에서만 맞춤법 검사를 할 수 있습니다.')

            // 이미 썼으면 그때 결과를 그대로 돌려준다. 다시 부르지 않는다.
            if (post.spell_check_used_at) {
                return jsonResponse({
                    alreadyUsed: true,
                    usedAt: post.spell_check_used_at,
                    result: post.spell_check_result ?? { items: [] }
                }, 200, headers)
            }

            const body = String(post.content ?? '').trim()
            if (body.length < 10) throw new HttpError(400, '글을 조금 더 쓴 뒤에 검사해 주세요.')
            if (post.is_confirmed) throw new HttpError(400, '이미 선생님이 확인한 글은 검사하지 않아요.')
            // 쓰는 도중에 눌러 한 번뿐인 기회를 날리지 않도록, **다시 쓰기 요청을 받은 글**만 검사한다.
            // ⚠️ 교사가 다시 쓰기를 보내면 `is_submitted` 가 **false 로 돌아간다**(useMissionManager 의 반려 처리).
            //    그래서 `is_submitted` 를 함께 요구하면 아무 글도 통과하지 못한다 — `is_returned` 하나로 본다.
            if (!post.is_returned) {
                throw new HttpError(400, '선생님께 다시 쓰기 요청을 받은 글만 검사할 수 있어요.')
            }

            // 글 같지 않으면 **한 번뿐인 기회를 쓰지 않고** 돌려보낸다(AI도 부르지 않는다).
            if (looksLikeGibberish(body)) {
                return jsonResponse({
                    alreadyUsed: false,
                    notWriting: true,
                    reason: '아직 글로 읽히지 않아요. 뜻이 통하는 문장으로 고쳐 쓴 뒤에 다시 눌러 주세요.',
                    result: { items: [] }
                }, 200, headers)
            }

            // 선점: 아직 안 쓴 글일 때만 도장을 찍는다(동시에 두 번 눌러도 한 번만 지나간다).
            const { data: claimed, error: claimError } = await supabaseAdmin
                .from('student_posts')
                .update({ spell_check_used_at: new Date().toISOString() })
                .eq('id', postId)
                .eq('student_id', studentId)
                .is('spell_check_used_at', null)
                .select('id')
                .maybeSingle()
            if (claimError || !claimed) throw new HttpError(409, '맞춤법 검사는 글 하나에 한 번만 쓸 수 있어요.')

            spellCheckPostId = String(postId)
            finalPrompt = [
                '너는 초등학교 선생님이야. 학생이 쓴 글에서 **맞춤법·띄어쓰기** 오류만 찾아줘.',
                '',
                '지켜야 할 것:',
                '- 내용·표현·문체는 절대 고치지 마. 더 멋진 표현으로 바꾸지 말고, 문장을 합치거나 나누지도 마.',
                '- 확실히 틀린 것만 골라. 애매하면 넣지 마. 최대 12개까지만.',
                '- 사람 이름·지명·상표·일부러 쓴 말은 그대로 둬.',
                '- wrong 은 글에 그대로 나온 짧은 표현이어야 하고, right 는 바르게 고친 표현이야.',
                '- why 는 초등학생이 읽을 한 문장 설명이야.',
                '- 글이 뜻이 통하지 않고 아무 글자나 늘어놓은 것이면, items 를 비우고 notWriting 을 true 로 답해.',
                '',
                '반드시 이 JSON 하나만 답해:',
                '{"items":[{"wrong":"틀린 표현","right":"바른 표현","why":"한 문장 설명"}],"notWriting":false}',
                '',
                '학생 글:',
                body.slice(0, 4000)
            ].join('\n')
        }

        const maxPromptLength = isStudentRequest
            ? (type === 'SPELL_CHECK' ? 6000 : 300)
            : (type === 'SPELLING_DRAFT' ? 80 : 10000)
        if (!finalPrompt.trim()) throw new HttpError(400, 'AI에게 전달할 내용이 없습니다.')
        if (finalPrompt.length > maxPromptLength) throw new HttpError(400, '내용이 너무 깁니다.')

        if (isStudentRequest && type === 'SAFETY_CHECK') {
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
                max_tokens: type === 'SPELL_CHECK' ? 900 : (isStudentRequest ? 100 : 1000),
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

        if (type === 'SPELL_CHECK' && spellCheckPostId) {
            const jsonMatch = resultText.match(/\{[\s\S]*\}/)
            const parsed = jsonMatch ? (() => { try { return JSON.parse(jsonMatch[0]) } catch { return null } })() : null
            const items = Array.isArray(parsed?.items) ? parsed.items : []
            const cleaned = items
                .filter((item: unknown) => item && typeof item === 'object')
                .map((item: Record<string, unknown>) => ({
                    wrong: String(item.wrong ?? '').slice(0, 80),
                    right: String(item.right ?? '').slice(0, 80),
                    why: String(item.why ?? '').slice(0, 200)
                }))
                .filter((item: { wrong: string; right: string }) => item.wrong && item.right && item.wrong !== item.right)
                .slice(0, 12)

            // AI 가 "글이 아니다" 라고 하면 **한 번뿐인 기회를 돌려준다**(선점 표시를 지운다).
            // 아무 글자나 적은 글에 "잘 썼어요"가 뜨는 것이 가장 나쁜 결과라 이 갈래를 따로 둔다.
            if (parsed?.notWriting === true && cleaned.length === 0) {
                await supabaseAdmin
                    .from('student_posts')
                    .update({ spell_check_used_at: null })
                    .eq('id', spellCheckPostId)
                return jsonResponse({
                    alreadyUsed: false,
                    notWriting: true,
                    reason: '아직 글로 읽히지 않아요. 뜻이 통하는 문장으로 고쳐 쓴 뒤에 다시 눌러 주세요.',
                    result: { items: [] }
                }, 200, headers)
            }

            const result = { items: cleaned, checkedAt: new Date().toISOString() }
            await supabaseAdmin
                .from('student_posts')
                .update({ spell_check_result: result })
                .eq('id', spellCheckPostId)

            // 나중에 기본 자료 500개를 늘리는 근거로 쓰려고 **학급·학생 이름 없이** 표현만 누적한다.
            // 실패해도 학생 화면은 그대로 결과를 받는다(집계는 곁다리다).
            if (cleaned.length > 0 && studentClassId) {
                const { error: findingError } = await supabaseAdmin.rpc('record_spelling_ai_findings_v1', {
                    p_class_id: studentClassId,
                    p_items: cleaned
                })
                if (findingError) console.error(`[vibe-ai] 맞춤법 집계 실패: ${findingError.message}`)
            }

            return jsonResponse({ alreadyUsed: false, result }, 200, headers)
        }

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
        // AI 가 실패했는데 사용 표시가 남으면 학생은 한 번뿐인 기회를 잃는다. 되돌려 준다.
        // (댓글 판정이 실패했을 때 선점을 푸는 것과 같은 이유다.)
        if (spellCheckPostId) {
            await supabaseAdmin
                .from('student_posts')
                .update({ spell_check_used_at: null })
                .eq('id', spellCheckPostId)
                .is('spell_check_result', null)
        }
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
