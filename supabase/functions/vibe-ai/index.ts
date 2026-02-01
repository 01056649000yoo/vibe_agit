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

        // 4. 요청 바디 파싱
        const { prompt, content, model, studentId, type } = await req.json()

        // 5. 인증 검사 (교사 세션 또는 학생 ID)
        let user = null;
        const authHeaderValue = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';

        if (authHeaderValue && authHeaderValue.length > 20) { // 유효해 보이는 토큰인 경우만 시도
            try {
                const { data: userData, error: authErr } = await supabaseClient.auth.getUser();
                if (authErr) {
                    console.log("Auth User 확인 실패 (무시됨):", authErr.message);
                } else {
                    user = userData?.user;
                }
            } catch (e) {
                console.log("교사 세션 확인 건너뜀:", e.message);
            }
        }

        let isAuthorized = !!user;
        let isStudentRequest = false;

        // 교사용 세션이 없는 경우, 학생 ID로 보조 인증 수행
        if (!isAuthorized && studentId) {
            console.log(`학생 인증 시도 중... ID: ${studentId}`);
            try {
                const { data: student, error: studentError } = await supabaseAdmin
                    .from('students')
                    .select('id')
                    .eq('id', studentId)
                    .maybeSingle();

                if (student && !studentError) {
                    isAuthorized = true;
                    isStudentRequest = true;
                    console.log(`✅ 학생 인증 성공 (ID: ${studentId})`);
                } else {
                    console.warn(`❌ 학생 인증 실패 (ID: ${studentId}):`, studentError?.message || "학생을 찾을 수 없음");
                }
            } catch (e) {
                console.error("학생 DB 조회 중 오류 발생:", e.message);
            }
        }

        if (!isAuthorized) {
            const reason = !user && !studentId ? "세션 정보와 학생 ID가 모두 없습니다." :
                !user ? `학생 ID(${studentId || '없음'}) 인증에 실패했습니다. (DB에서 학생을 찾을 수 없거나 ID가 유효하지 않습니다.)` : "인증되지 않은 사용자입니다.";

            console.error(`🚫 최종 인증 실패: ${reason}`);
            return new Response(
                JSON.stringify({
                    error: 'Unauthorized',
                    details: reason
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            );
        }

        // 6. 용도별 모델 매핑 및 보안 제약 (핵심 방어선)
        let finalPrompt = prompt || content;
        let selectedModel = model; // 클라이언트에서 명시적으로 보낸 모델이 있으면 우선 (단, 학생/안전체크 제외)

        // 타입별 모델 강제 지정
        if (type === 'SAFETY_CHECK' || isStudentRequest) {
            selectedModel = 'gpt-5-nano';
        } else if (type === 'RECORD_ASSISTANT') {
            selectedModel = 'gpt-5-nano';
        } else if (type === 'AI_FEEDBACK') {
            selectedModel = 'gpt-4o-mini';
        }

        // 기본 모델 설정
        const finalModel = selectedModel || 'gpt-4o-mini';

        if (isStudentRequest || type === 'SAFETY_CHECK') {
            // (1) 글자수 제한 (서버 사이드 중복 검증)
            const textToCheck = content || prompt || '';
            if (textToCheck.length > 300) {
                throw new Error('댓글 내용이 너무 깁니다. (최대 300자 이내로 입력해주세요)');
            }

            // (2) 요청 타입 강제 (SAFETY_CHECK 모드인 경우 프롬프트 주입 방지)
            if (type === 'SAFETY_CHECK') {
                finalPrompt = `
너는 초등학교 선생님이야. 다음 학생이 쓴 글이 학급 커뮤니티에 올리기에 교육적으로 적절한지 판단해줘.
욕설, 비꼬는 표현, 따돌림 유도, 무시하는 말투가 있다면 부적절하다고 판단해야 해.
반드시 아래 JSON 형식으로만 답해줘.

분석할 내용: "${textToCheck}"

{
  "is_appropriate": boolean,
  "reason": "다정한 선생님의 말투로 2~3문장의 훈육 메시지"
}
`;
            }
        }

        // 7. API Key 결정 로직 (개인 키 우선 정책)
        let apiKey = '';
        let currentMode = 'SYSTEM';
        let targetTeacherId = user?.id;

        // (1) 학생이 호출한 경우, 담임 선생님의 ID를 추적
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

        // (2) 대상 교사의 프로필에서 개인 키 및 모드 조회
        if (targetTeacherId) {
            const { data: profileData } = await supabaseAdmin
                .from('profiles')
                .select('api_mode, personal_openai_api_key')
                .eq('id', targetTeacherId)
                .single();

            if (profileData?.api_mode === 'PERSONAL') {
                if (profileData?.personal_openai_api_key?.trim()) {
                    apiKey = profileData.personal_openai_api_key.trim();
                    currentMode = 'PERSONAL';
                } else {
                    // [중요] 개인 키 모드인데 키가 없는 경우, 시스템 키로 폴백하지 않고 에러 반환
                    const errorMsg = isStudentRequest
                        ? '담임 선생님의 AI 설정(개인 키)에 문제가 있어 기능을 사용할 수 없습니다.'
                        : 'AI 설정이 [개인 키 활용]으로 되어있지만, 입력된 개인 키가 없습니다. 설정에서 키를 입력해주세요.';
                    throw new Error(errorMsg);
                }
            }
        }

        // (3) 시스템 모드이거나 모드 설정이 없는 경우 최종적으로 시스템 공용 키 사용
        if (!apiKey) {
            apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
            currentMode = 'SYSTEM';
        }

        if (!apiKey) {
            throw new Error('🚨 서버 설정 오류: API 키가 준비되지 않았습니다.');
        }

        console.log(`🤖 Vibe AI Running Mode: [${currentMode}] | TeacherID: [${targetTeacherId || 'N/A'}] | Type: [${type || 'GENERAL'}]`);

        const openai = new OpenAI({ apiKey: apiKey })

        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: finalPrompt }],
            model: finalModel,
            max_tokens: 1000,
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
