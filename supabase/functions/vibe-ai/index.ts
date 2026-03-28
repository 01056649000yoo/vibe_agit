import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'jsr:@openai/openai@^4.28.0'

// CORS: 허용 도메인은 Supabase Dashboard → Edge Functions → Secrets에서
// ALLOWED_ORIGIN 환경 변수로 설정하세요. (예: https://your-app.vercel.app)
// 여러 도메인 허용 시 쉼표로 구분: https://app.com,https://www.app.com
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, '')) // ✅ Remove trailing slash
    .filter(Boolean);

function getCorsHeaders(requestOrigin: string | null) {
    let allowedOrigin = ALLOWED_ORIGINS[0] || '*';

    if (ALLOWED_ORIGINS.length === 0) {
        allowedOrigin = '*';
    } else if (requestOrigin) {
        // Remove trailing slash from request origin as well just in case
        const cleanOrigin = requestOrigin.replace(/\/$/, '');

        // 명시된 허용 도메인이거나, 로컬 호스트인 경우 허용
        if (ALLOWED_ORIGINS.includes(cleanOrigin) ||
            cleanOrigin.startsWith('http://localhost:') ||
            cleanOrigin.startsWith('http://127.0.0.1:')) {
            allowedOrigin = requestOrigin; // 브라우저가 보낸 Origin 그대로 다시 돌려줘야 CORS 통과
        }
    }

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Vary': 'Origin',
    };
}

console.log("Hello from vibe-ai Functions!")

Deno.serve(async (req) => {
    // 요청 출처 추출 (CORS 응답에 사용)
    const origin = req.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);

    // 1. CORS 처리
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. 인증 헤더 확인
        const authHeader = req.headers.get('Authorization');

        // [보안] 민감 헤더 마스킹 로그
        const safeHeaders: Record<string, string> = {};
        req.headers.forEach((v, k) => {
            if (k.toLowerCase() === 'authorization') {
                safeHeaders[k] = `Bearer ***${v.slice(-8)}`;
            } else {
                safeHeaders[k] = v;
            }
        });
        console.log("📥 수신 헤더(마스킹):", JSON.stringify(safeHeaders));

        // 3. Supabase 클라이언트 생성
        // (1) 사용자 인증용 (유효한 헤더가 있을 때만 RLS 적용)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
        )
        // (2) 시스템 관리용 (Service Role - 모든 권한) -> system_settings 조회용
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 4. 요청 바디 파싱
        const { prompt, content, model, studentId, type, overrideApiMode, overrideApiKey } = await req.json()

        // 5. 인증 검사 (교사 세션 또는 학생 ID)
        let isAuthorized = false;
        let isStudentRequest = false;
        let authReason = "";
        let authedUserId: string | null = null;
        let targetTeacherId: string | null = null;

        // --- 인증 통합 검사 ---
        if (authHeader) {
            try {
                const { data: userData, error: userError } = await supabaseClient.auth.getUser();
                const user = userData?.user;

                if (user && !userError) {
                    authedUserId = user.id;
                    console.log(`👤 인증된 사용자 확인: ${user.id} (Anonymous: ${user.is_anonymous})`);

                    if (user.is_anonymous) {
                        // (A) 학생(익명)인 경우
                        if (studentId) {
                            // [최적화] 인증 검사와 교사 정보 조회를 하나의 JOIN 쿼리로 통합 (N+1 쿼리 방지)
                            const { data: student } = await supabaseAdmin
                                .from('students')
                                .select('id, classes:class_id(teacher_id)')
                                .eq('id', studentId)
                                .eq('auth_id', user.id)
                                .maybeSingle();

                            if (student) {
                                isAuthorized = true;
                                isStudentRequest = true;
                                targetTeacherId = Array.isArray(student.classes) 
                                    ? student.classes[0]?.teacher_id 
                                    : student.classes?.teacher_id || null;
                                console.log(`✅ 학생 인증 성공: Student[${studentId}] (Teacher: ${targetTeacherId})`);
                            } else {
                                authReason = `학생 ID 불일치`;
                            }
                        } else {
                            authReason = "studentId 누락";
                        }
                    } else {
                        // (B) 교사/관리자
                        isAuthorized = true;
                        targetTeacherId = user.id;
                        console.log(`✅ 교사/관리자 인증 성공: ${user.id}`);
                    }
                } else if (userError) {
                    authReason = `Auth 에러: ${userError.message}`;
                }
            } catch (e) {
                console.error("인증 예외:", e.message);
                authReason = `인증 예외: ${e.message}`;
            }
        } else {
            authReason = "Authorization 헤더 없음";
        }

        if (!isAuthorized) {
            console.error(`🚫 차단: ${authReason}`);
            return new Response(
                JSON.stringify({ error: 'Unauthorized', details: authReason }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            );
        }

        // 6. 용도별 모델 매핑 및 보안 제약
        let finalPrompt = prompt || content;
        let selectedModel = model;

        const MAX_PROMPT_LENGTH = isStudentRequest ? 300 : 10000;
        if (finalPrompt && finalPrompt.length > MAX_PROMPT_LENGTH) {
            throw new Error(`길이 제한 초과`);
        }

        if (type === 'SAFETY_CHECK' || isStudentRequest) {
            selectedModel = 'gpt-4o-mini';
        }

        const finalModel = selectedModel || 'gpt-4o-mini';

        if (isStudentRequest || type === 'SAFETY_CHECK') {
            const textToCheck = content || prompt || '';
            finalPrompt = `
너는 초등학교 선생님이야. 다음 학생이 쓴 글이 학급 커뮤니티에 올리기에 교육적으로 적절한지 판단해줘.

[판단 기준]
1. 욕설, 비꼬는 표현, 따돌림 유도, 무시하는 말투가 있는가?
2. **의미 없는 무작위 문자열(예: 'asdf', 'qwerty', 'ㄱㄴㄷㄹ')이나 무성의한 도배글인가?**

위 기준 중 하나라도 해당되면 부적절하다고 판단해야 해.
반드시 아래 JSON 형식으로만 답해줘.

분석할 내용: "${textToCheck.replace(/"/g, "'")}"

{
  "is_appropriate": boolean,
  "reason": "부적절할 경우, 다정한 선생님의 말투로 친구와 의미 있는 대화를 나누도록 권유하는 2~3문장의 훈육 메시지"
}
`;
        }

        // 7. API Key 결정
        let apiKey = '';
        let currentMode = 'SYSTEM';
        let apiErrorMsg = '';

        // (1) 먼저 시스템 설정에서 공용 API 활성화 여부 확인
        const { data: globalSettings, error: settingsError } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', 'public_api_enabled')
            .maybeSingle();
        
        // 데이터가 없거나 에러가 나면 기본적으로 'true'로 간주 (기본 서비스 보장)
        const isPublicEnabled = globalSettings ? (globalSettings.value === true) : true;

        if (targetTeacherId) {
            // (2) 해당 교사의 API 모드 확인
            const { data: profileData } = await supabaseAdmin
                .from('profiles')
                .select('api_mode')
                .eq('id', targetTeacherId)
                .maybeSingle();

            const effectiveApiMode = overrideApiMode || profileData?.api_mode || 'SYSTEM';
            console.log(`🔍 [Auth Log] targetTeacherId: ${targetTeacherId} | DB Mode: ${profileData?.api_mode} | Effective Mode: ${effectiveApiMode}`);

            if (effectiveApiMode === 'PERSONAL') {
                let personalKey = overrideApiKey;
                
                if (!personalKey) {
                    const { data: secretData } = await supabaseAdmin
                        .from("profile_secrets")
                        .select("personal_openai_api_key")
                        .eq("id", targetTeacherId)
                        .maybeSingle();
                    personalKey = secretData?.personal_openai_api_key;
                }

                if (personalKey?.trim()) {
                    apiKey = personalKey.trim();
                    currentMode = 'PERSONAL';
                } else {
                    // [핵심 변경] 개인키 모드인데 키가 없으면 절대 폴백하지 않고 에러 리턴
                    apiErrorMsg = '개인 API 키가 설정되지 않았습니다. [설정 > AI 자동 피드백 설정]에서 API 키를 입력하고 저장해 주세요.';
                }
            } else {
                // SYSTEM 모드인 경우 공용 스위치 확인
                if (isPublicEnabled) {
                    apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
                    currentMode = 'SYSTEM';
                } else {
                    apiErrorMsg = '현재 시스템 공용 AI 서비스가 비활성화 상태입니다. 관리자에게 문의하거나 개인 API 키를 사용해 주세요.';
                }
            }
        } else {
            // 교사 정보가 없는 경우 (익명 학생 요청 등) 시스템 설정에 따름
            if (isPublicEnabled) {
                apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
                currentMode = 'SYSTEM';
            } else {
                apiErrorMsg = '현재 시스템 공용 AI 서비스가 비활성화 상태입니다.';
            }
        }

        if (apiErrorMsg) {
            throw new Error(apiErrorMsg);
        }

        if (!apiKey) throw new Error('AI 서비스 연결을 위한 API 키를 찾을 수 없습니다.');

        console.log(`🤖 Mode: [${currentMode}] | Teacher: [${targetTeacherId || 'N/A'}] | Type: [${type || 'N/A'}]`);

        const openai = new OpenAI({ apiKey: apiKey })
        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: finalPrompt }],
            model: finalModel,
            max_tokens: 1000
        });

        return new Response(
            JSON.stringify({ text: completion.choices[0]?.message?.content }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        console.error("🔥 Error:", error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
