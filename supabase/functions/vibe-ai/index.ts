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
        // 2. 인증 헤더 확인 (Gateway JWT 이슈 대응을 위해 선택적으로 변경)
        const authHeader = req.headers.get('Authorization');

        // [디버그] 모든 헤더 로그 (Invalid JWT 원인 파악용)
        const allHeaders: Record<string, string> = {};
        req.headers.forEach((v, k) => { allHeaders[k] = v; });
        console.log("📥 수신된 모든 헤더:", JSON.stringify(allHeaders));

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
        const { prompt, content, model, studentId, type } = await req.json()

        // 5. 인증 검사 (교사 세션 또는 학생 ID)
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
        let jwtUserId: string | null = null;

        // [신규] JWT 수동 디코딩
        if (token && token.length > 20 && token.includes('.')) {
            try {
                const payloadBase64 = token.split('.')[1];
                const decodedPayload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
                jwtUserId = decodedPayload.sub || null;
                console.log(`🔑 인증 토큰 확인됨: ${jwtUserId}`);
            } catch (e) {
                console.warn("JWT 디코딩 실패:", e.message);
            }
        }

        let isAuthorized = false;
        let isStudentRequest = false;
        let authReason = "";
        let authedUserId = jwtUserId;

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
                            const { data: student } = await supabaseAdmin
                                .from('students')
                                .select('id')
                                .eq('id', studentId)
                                .eq('auth_id', user.id)
                                .maybeSingle();

                            if (student) {
                                isAuthorized = true;
                                isStudentRequest = true;
                                console.log(`✅ 학생 인증 성공: Student[${studentId}]`);
                            } else {
                                authReason = `학생 ID 불일치`;
                            }
                        } else {
                            authReason = "studentId 누락";
                        }
                    } else {
                        // (B) 교사/관리자
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
            authReason = "Authorization 헤더 없음 (Bypass 대기)";
        }

        if (!isAuthorized) {
            // [특수 허용] SAFETY_CHECK인 경우, 인증이 실패하더라도 AI 분석 서비스는 제공합니다.
            if (type === 'SAFETY_CHECK') {
                isAuthorized = true;
                console.warn(`⚠️ 인증 우회 허용(SAFETY_CHECK): ${authReason}`);
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
        let targetTeacherId = isStudentRequest ? null : jwtUserId;

        if (isStudentRequest && studentId) {
            const { data: studentMapping } = await supabaseAdmin
                .from('students')
                .select('class_id, classes:class_id(teacher_id)')
                .eq('id', studentId)
                .maybeSingle();

            if (studentMapping?.classes?.teacher_id) {
                targetTeacherId = studentMapping.classes.teacher_id;
            }
        }

        if (targetTeacherId) {
            const { data: profileData } = await supabaseAdmin
                .from('profiles')
                .select('api_mode, personal_openai_api_key')
                .eq('id', targetTeacherId)
                .maybeSingle();

            if (profileData?.api_mode === 'PERSONAL' && profileData?.personal_openai_api_key?.trim()) {
                apiKey = profileData.personal_openai_api_key.trim();
                currentMode = 'PERSONAL';
            }
        }

        if (!apiKey) {
            apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
            currentMode = 'SYSTEM';
        }

        if (!apiKey) throw new Error('API Key missing');

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
