import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ADMIN_MODE_PASSWORD = Deno.env.get('ADMIN_MODE_PASSWORD') ?? ''

// 다른 엣지 함수(vibe-ai 등)와 같은 규칙: ALLOWED_ORIGIN 이 있으면 그 출처(와 개발용 localhost)만, 없으면 모두.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((v) => v.trim().replace(/\/$/, '')).filter(Boolean)
const allowOrigin = (origin: string | null) => {
  if (!ALLOWED_ORIGINS.length) return '*'
  const normalized = (origin ?? '').replace(/\/$/, '')
  return normalized && (ALLOWED_ORIGINS.includes(normalized) || normalized.startsWith('http://localhost:')) ? normalized : 'null'
}

// 비밀번호 비교는 길이·내용과 상관없이 같은 시간이 걸리게 한다(시간차로 한 글자씩 맞히는 것 방지).
const constantTimeEqual = (a: string, b: string) => {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}

const baseCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // 요청마다 따로 만든다 — 전역 값을 덮어쓰면 동시에 온 요청이 서로의 출처를 받는다.
  const corsHeaders = { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowOrigin(req.headers.get('Origin')), Vary: 'Origin' }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: '로그인이 필요합니다.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: '인증 정보를 확인할 수 없습니다.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { password } = await req.json()
    if (!password) {
      return new Response(
        JSON.stringify({ success: false, message: '비밀번호를 입력해주세요.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!ADMIN_MODE_PASSWORD) {
      return new Response(
        JSON.stringify({ success: false, message: '서버에 관리자 비밀번호가 설정되지 않았습니다.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    if (profile?.role !== 'ADMIN') {
      return new Response(
        JSON.stringify({ success: false, message: '관리자 계정만 접근할 수 있습니다.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (typeof password !== 'string' || !constantTimeEqual(password, ADMIN_MODE_PASSWORD)) {
      return new Response(
        JSON.stringify({ success: false, message: '비밀번호가 올바르지 않습니다.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[verify-admin-mode] failure:', error)
    return new Response(
      // 내부 오류 문구는 보내지 않는다(KISA 에러처리: 오류 메시지 정보 노출).
      JSON.stringify({ success: false, message: '관리자 모드 확인에 실패했습니다.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
