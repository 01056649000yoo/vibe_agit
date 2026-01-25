import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'jsr:@openai/openai@^4.28.0'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log("Hello from vibe-ai Functions!")

Deno.serve(async (req) => {
    // 1. CORS 처리
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. 인증 헤더 확인 (Supabase가 자동으로 검증하지만, 추가 클라이언트 생성)
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        // 3. Supabase 클라이언트 생성 (요청한 사용자 정보를 확인하기 위함)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        // 4. 사용자 정보 가져오기 (보안 검증)
        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) {
            throw new Error('Unauthorized')
        }

        // 5. 요청 바디 파싱
        const { prompt, model } = await req.json()

        // 6. OpenAI 호출 (서버 환경변수 OPENAI_API_KEY 사용)
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) {
            throw new Error('Server misconfiguration: OPENAI_API_KEY missing');
        }

        const openai = new OpenAI({
            apiKey: apiKey,
        })

        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: model || 'gpt-4o-mini', // 기본값 설정
            max_tokens: 1500, // 필요시 조정
        })

        const generatedText = completion.choices[0]?.message?.content;

        // 7. 결과 반환
        return new Response(
            JSON.stringify({ text: generatedText }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            }
        )
    }
})
