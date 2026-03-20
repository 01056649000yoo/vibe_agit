import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// 관리자 이메일 (여기로 알림이 전송됩니다)
const ADMIN_EMAIL = 'admin@kku-azit.com'

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-auth' } })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401 })
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        })

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }

        const { title, content, teacherId } = await req.json()

        // 보안: 요청한 teacherId가 로그인한 사용자와 다른지 확인 (선택 사항이지만 권장)
        if (teacherId && teacherId !== user.id) {
            console.warn(`⚠️ ID mismatch: Request[${teacherId}] vs Auth[${user.id}]`)
        }

        // 이메일 발송 로직 (Resend 예시)
        // 실제 사용 시 Supabase 대시보드에서 RESEND_API_KEY를 설정해야 합니다.
        if (RESEND_API_KEY) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${RESEND_API_KEY}`
                },
                body: JSON.stringify({
                    from: 'Feedback <onboarding@resend.dev>',
                    to: [ADMIN_EMAIL],
                    subject: `[앱 피드백] ${title}`,
                    html: `
            <h1>새로운 피드백이 도착했습니다!</h1>
            <p><strong>작성자 ID:</strong> ${teacherId}</p>
            <p><strong>제목:</strong> ${title}</p>
            <p><strong>내용:</strong></p>
            <div style="background: #f0f0f0; padding: 15px; border-radius: 5px;">
              ${content.replace(/\n/g, '<br>')}
            </div>
            <p>관리자 대시보드에서 확인해주세요.</p>
          `
                })
            })

            if (!res.ok) {
                console.error('Email sending failed:', await res.text())
            }
        } else {
            console.log('RESEND_API_KEY not found. Skipping email sending. Logged to console instead.')
            console.log(`[Feedback] Title: ${title}, Content: ${content}, By: ${teacherId}`)
        }

        return new Response(
            JSON.stringify({ message: 'Feedback processed' }),
            { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        )
    }
})
