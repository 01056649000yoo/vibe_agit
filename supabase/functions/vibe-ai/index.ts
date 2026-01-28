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

        // 6. API Key 결정 로직
        let apiKey = '';

        // (1) [상위 권한] 시스템 전역 설정(use_central_api) 조회
        const { data: settingsData } = await supabaseClient
            .from('system_settings')
            .select('value')
            .eq('key', 'use_central_api')
            .single();

        // 전역 설정이 'true'(관리자 키 강제 사용)이면 개별 설정 무시
        const forceCentralApi = settingsData?.value ?? true;

        if (forceCentralApi) {
            console.log('API Mode: FORCE SYSTEM (Global Setting)');
            apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
            if (!apiKey) throw new Error('Server misconfiguration: OPENAI_API_KEY missing');
        } else {
            // (2) [개별 권한] 사용자 프로필 설정 조회
            const { data: profileData, error: profileError } = await supabaseClient
                .from('profiles')
                .select('api_mode, personal_openai_api_key')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('프로필 조회 실패:', profileError);
                throw new Error('사용자 정보를 불러오는데 실패했습니다.');
            }

            const apiMode = profileData?.api_mode || 'SYSTEM';

            if (apiMode === 'SYSTEM') {
                console.log('API Mode: SYSTEM (User Profile)');
                apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
                if (!apiKey) throw new Error('Server misconfiguration: OPENAI_API_KEY missing');
            } else {
                console.log('API Mode: PERSONAL (User Profile)');
                apiKey = profileData?.personal_openai_api_key ?? '';
                if (!apiKey) throw new Error('개인 API 키가 설정되지 않았습니다. [설정 > AI 보안 센터]에서 키를 등록해주세요.');
            }
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
