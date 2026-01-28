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

        // 3. Supabase 클라이언트 생성
        // (1) 사용자 인증용 (RLS 적용)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        // (2) 시스템 관리용 (Service Role - 모든 권한) -> system_settings 조회용
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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
        // 6. API Key 결정 로직 (교사 개별 설정 최우선 적용)
        let apiKey = '';
        let currentMode = 'SYSTEM'; // 로깅용

        // (1) 사용자 프로필 설정 조회 (api_mode, personal_openai_api_key)
        const { data: profileData, error: profileError } = await supabaseClient
            .from('profiles')
            .select('api_mode, personal_openai_api_key')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('프로필 조회 실패:', profileError);
            throw new Error('사용자 설정을 확인할 수 없습니다.');
        }

        const apiMode = profileData?.api_mode || 'SYSTEM';

        // (2) 모드에 따른 엄격한 키 선택 (Fallback 없음)
        if (apiMode === 'PERSONAL') {
            currentMode = 'PERSONAL';
            // 공백 제거 및 유효성 확인
            apiKey = (profileData?.personal_openai_api_key || '').trim();

            // [중요] 개인 키 모드인데 키가 없으면 즉시 에러 발생 (시스템 키로 Fallback 금지)
            if (!apiKey) {
                throw new Error('⛔ [개인 키 모드] API 키가 등록되지 않았습니다. 설정 탭에서 OpenAI 키를 입력 저장해주세요.');
            }
        } else {
            currentMode = 'SYSTEM';
            apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

            if (!apiKey) {
                throw new Error('🚨 서버 설정 오류: 시스템 공용 키가 없습니다.');
            }
        }

        console.log(`🤖 Vibe AI Running Mode: [${currentMode}]`);

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
