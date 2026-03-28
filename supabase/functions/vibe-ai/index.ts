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
    let allowedOrigin = '*'; // Default to wildcard for maximum compatibility during debugging

    if (requestOrigin) {
        const cleanOrigin = requestOrigin.replace(/\/$/, '');
        if (ALLOWED_ORIGINS.includes(cleanOrigin) ||
            cleanOrigin.startsWith('http://localhost:') ||
            cleanOrigin.startsWith('http://127.0.0.1:')) {
            allowedOrigin = requestOrigin;
        }
    }

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Headers': '*', // Explicitly allow all headers to bypass preflight issues
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

console.log("Hello from vibe-ai Functions!")

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);

    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders, status: 204 })
    }

    try {
        // 2. 인증 헤더 확인
        // X-Customer-Auth가 있으면 우선 사용 (Gateway 우회 시 anon key로 통과하고 실제 유저 토큰을 이 헤더로 전달)
        const customerAuth = req.headers.get('X-Customer-Auth');
        let authHeader: string | null;
        if (customerAuth) {
            authHeader = customerAuth.startsWith('Bearer ') ? customerAuth : `Bearer ${customerAuth}`;
            console.log("🛡️ X-Customer-Auth 헤더로 인증 처리");
        } else {
            authHeader = req.headers.get('Authorization');
        }

        // [보안] 민감 헤더 마스킹 로그
        const safeHeaders: Record<string, string> = {};
        req.headers.forEach((v, k) => {
            if (k.toLowerCase() === 'authorization' || k.toLowerCase() === 'x-customer-auth') {
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
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
        let jwtUserId: string | null = null;

        // [신규] JWT 수동 디코딩 (Gateway 이슈 등으로 getUser가 실패할 때를 대비한 안전장치)
        if (token && token.length > 20 && token.includes('.')) {
            try {
                const payloadBase64 = token.split('.')[1];
                const decodedPayload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
                jwtUserId = decodedPayload.sub || null;
                console.log(`🔑 인증 토큰 확인됨 (JWT): ${jwtUserId}`);
            } catch (e) {
                console.warn("JWT 디코딩 실패:", e.message);
            }
        }

        let isAuthorized = false;
        let isStudentRequest = false;
        let authReason = "";
        let authedUserId: string | null = jwtUserId;
        let targetTeacherId: string | null = jwtUserId; // 교사 본인인 경우 기본값

        // --- 인증 통합 검사 ---
        if (authHeader) {
            try {
                const { data: userData, error: userError } = await supabaseClient.auth.getUser();
                const user = userData?.user;

                if (user && !userError) {
                    authedUserId = user.id;
                    targetTeacherId = user.id; // 기본적으로 교사 본인
                    console.log(`👤 인증된 사용자 확인: ${user.id} (Anonymous: ${user.is_anonymous})`);

                    if (user.is_anonymous) {
                        // (A) 학생(익명)인 경우
                        if (studentId) {
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
                        // (B) 정식 교사/관리자
                        isAuthorized = true;
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
            // [특수 허용] SAFETY_CHECK 또는 JWT fallback
            if (type === 'SAFETY_CHECK') {
                isAuthorized = true;
                console.warn(`⚠️ 인증 우회 허용(SAFETY_CHECK): ${authReason}`);
            } else if (jwtUserId && !studentId) {
                isAuthorized = true;
                authedUserId = jwtUserId;
                targetTeacherId = jwtUserId;
                console.warn(`⚠️ JWT 수동 인증 fallback 허용: ${jwtUserId}`);
            } else {
                console.error(`🚫 차단: ${authReason}`);
                return new Response(
                    JSON.stringify({ error: 'Unauthorized', details: authReason }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
                );
            }
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
        const { data: globalSettings } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', 'public_api_enabled')
            .maybeSingle();
        
        const isPublicEnabled = globalSettings ? (globalSettings.value === true) : true;

        let dbApiMode = 'UNKNOWN';
        let hasPersonalKey = false;

        // 테스트/진단 요청 여부 (overrideApiKey 허용 범위 제한용)
        const isTestRequest = type === 'CONNECTION_TEST' || type === 'DIAG';

        if (targetTeacherId) {
            // (2) 해당 교사의 DB API 모드 확인 (항상 DB 기준이 우선)
            const { data: profileData } = await supabaseAdmin
                .from('profiles')
                .select('api_mode')
                .eq('id', targetTeacherId)
                .maybeSingle();

            dbApiMode = profileData?.api_mode || 'PERSONAL'; // DB에 없으면 보안상 PERSONAL(제한적)로 간주

            // [보안] overrideApiMode는 테스트 요청에서만 허용하되,
            // SYSTEM 모드로의 변경(권한 상승)은 절대 허용 안 함
            const effectiveApiMode = (isTestRequest && overrideApiMode && overrideApiMode !== 'SYSTEM')
                ? overrideApiMode
                : dbApiMode;

            console.log(`🔍 [Auth Log] targetTeacherId: ${targetTeacherId} | DB Mode: ${dbApiMode} | Effective Mode: ${effectiveApiMode} | isTest: ${isTestRequest}`);

            if (effectiveApiMode === 'PERSONAL') {
                // [보안] overrideApiKey(미저장 테스트 키)는 테스트 요청에서만 허용
                const clientKey = isTestRequest ? overrideApiKey : null;
                let personalKey = clientKey;

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
                    hasPersonalKey = true;
                } else {
                    apiErrorMsg = '개인 API 키가 등록되지 않았습니다. [설정 > AI 자동 피드백 설정]에서 API 키를 입력하고 저장해 주세요.';
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

        // [신규] 진단 모드 응답
        if (type === 'DIAG') {
            return new Response(
                JSON.stringify({
                    targetTeacherId,
                    dbApiMode,
                    overrideApiMode,
                    currentMode,
                    isPublicEnabled,
                    hasPersonalKey,
                    apiErrorMsg
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
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
