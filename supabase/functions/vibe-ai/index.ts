import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
// OpenAI SDK 대신 Deno 네이티브 fetch 사용 (Edge Function 환경 호환성 보장)

// CORS: 허용 도메인은 Supabase Dashboard → Edge Functions → Secrets에서
// ALLOWED_ORIGIN 환경 변수로 설정하세요. (예: https://your-app.vercel.app)
// 여러 도메인 허용 시 쉼표로 구분: https://app.com,https://www.app.com
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, '')) // ✅ Remove trailing slash
    .filter(Boolean);

function isAllowedOrigin(requestOrigin: string | null) {
    if (!requestOrigin) return true;

    const cleanOrigin = requestOrigin.replace(/\/$/, '');
    return (
        ALLOWED_ORIGINS.length === 0 ||
        ALLOWED_ORIGINS.includes(cleanOrigin) ||
        cleanOrigin.startsWith('http://localhost:') ||
        cleanOrigin.startsWith('http://127.0.0.1:')
    );
}

function getCorsHeaders(requestOrigin: string | null) {
    let allowedOrigin = ALLOWED_ORIGINS.length === 0 ? '*' : 'null';

    if (requestOrigin && isAllowedOrigin(requestOrigin)) {
        allowedOrigin = requestOrigin;
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

    if (!isAllowedOrigin(origin)) {
        return new Response(
            JSON.stringify({ error: 'Forbidden origin' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
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
            if (['authorization', 'x-customer-auth', 'apikey'].includes(k.toLowerCase())) {
                safeHeaders[k] = '***';
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
        const { prompt, content, studentId, type, commentId } = await req.json()

        // 5. 인증 검사 (교사 세션 또는 학생 ID)
        let isAuthorized = false;
        let isStudentRequest = false;
        let authReason = "";
        let targetTeacherId: string | null = null;

        // --- 인증 통합 검사 ---
        if (authHeader) {
            try {
                const { data: userData, error: userError } = await supabaseClient.auth.getUser();
                const user = userData?.user;

                if (user && !userError) {
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
            console.error(`🚫 차단: ${authReason}`);
            return new Response(
                JSON.stringify({ error: 'Unauthorized', details: authReason }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            );
        }

        // 6. 용도별 모델 매핑 및 보안 제약
        let finalPrompt = prompt || content;
        let moderationCommentId: string | null = null;

        // 새 화면의 댓글 안전 판정은 클라이언트가 보낸 문장을 그대로 믿지 않는다. 인증된 학생 본인의
        // pending 댓글을 서버에서 다시 읽어 그 내용만 판정한다. 이미 끝난 판정은 재호출하지 않는다.
        // commentId가 없는 호출은 배포 직후 캐시된 구버전 화면을 위한 과도기 호환 경로다. 인증된 학생의
        // 300자 이하 요청만 판정하고, 구버전 화면이 기존 RPC로 결과를 기록한다.
        if (type === 'SAFETY_CHECK') {
            if (!isStudentRequest || !studentId) {
                throw new Error('댓글 안전 판정에는 인증된 학생이 필요합니다.');
            }

            if (commentId != null) {
                if (typeof commentId !== 'string' || !commentId) {
                    throw new Error('댓글 ID 형식이 올바르지 않습니다.');
                }

                const { data: pendingComment, error: commentError } = await supabaseAdmin
                    .from('post_comments')
                    .select('id, content, status, moderation_reason')
                    .eq('id', commentId)
                    .eq('student_id', studentId)
                    .maybeSingle();

                if (commentError) throw commentError;
                if (!pendingComment) throw new Error('판정할 댓글을 찾지 못했습니다.');

                if (pendingComment.status !== 'pending') {
                    const existingResult = {
                        is_appropriate: pendingComment.status === 'approved',
                        reason: pendingComment.moderation_reason || ''
                    };
                    return new Response(
                        JSON.stringify({
                            text: JSON.stringify(existingResult),
                            reviewRecorded: false,
                            currentStatus: pendingComment.status
                        }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                    );
                }

                moderationCommentId = pendingComment.id;
                finalPrompt = pendingComment.content;
            }
        }

        const MAX_PROMPT_LENGTH = isStudentRequest ? 300 : 10000;
        if (finalPrompt && finalPrompt.length > MAX_PROMPT_LENGTH) {
            throw new Error(`길이 제한 초과`);
        }

        // 비용과 동작을 예측 가능하게 유지하기 위해 클라이언트 모델 지정은 허용하지 않는다.
        const finalModel = 'gpt-4o-mini';

        if (isStudentRequest || type === 'SAFETY_CHECK') {
            const textToCheck = finalPrompt || '';
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

        // 7. 공용 AI 키 결정: 개인 키와 클라이언트 모드 오버라이드는 지원하지 않는다.
        // 키 원문은 Edge Function 환경 변수에서만 읽는다.
        const { data: globalSettings } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', 'public_api_enabled')
            .maybeSingle();
        
        const isPublicEnabled = globalSettings ? (globalSettings.value === true) : true;

        const currentMode = 'SYSTEM';
        const apiKey = isPublicEnabled ? (Deno.env.get('OPENAI_API_KEY') ?? '') : '';
        const apiErrorMsg = isPublicEnabled ? '' : '현재 시스템 공용 AI 서비스가 비활성화 상태입니다.';

        // [신규] 진단 모드 응답
        if (type === 'DIAG') {
            return new Response(
                JSON.stringify({
                    targetTeacherId,
                    currentMode,
                    isPublicEnabled,
                    apiErrorMsg
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        if (apiErrorMsg) {
            throw new Error(apiErrorMsg);
        }

        if (!apiKey) throw new Error('AI 서비스 연결을 위한 API 키를 찾을 수 없습니다.');

        // [보안] API 키에서 HTTP 헤더에 허용되지 않는 문자 제거 (줄바꿈, 유니코드 등)
        // 유효 범위: 출력 가능한 ASCII 문자(0x20-0x7E)만 허용
        const cleanApiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim();
        if (!cleanApiKey) throw new Error('API 키 형식이 올바르지 않습니다. 키에 특수문자나 줄바꿈이 포함되었는지 확인해 주세요.');

        console.log(`🤖 Mode: [${currentMode}] | Teacher: [${targetTeacherId || 'N/A'}] | Type: [${type || 'N/A'}]`);

        // Deno 네이티브 fetch로 OpenAI API 직접 호출 (SDK 호환성 문제 우회)
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${cleanApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: finalModel,
                messages: [{ role: 'user', content: finalPrompt }],
                // 댓글 판정은 짧은 JSON만 필요하다. 교사용 피드백은 기존 길이를 유지한다.
                max_tokens: type === 'SAFETY_CHECK' ? 100 : 1000,
                ...(type === 'SAFETY_CHECK' ? { temperature: 0 } : {}),
            }),
        });

        if (!openaiResponse.ok) {
            const errData = await openaiResponse.json().catch(() => ({}));
            const errMsg = errData?.error?.message ?? `OpenAI API 오류 (${openaiResponse.status})`;
            console.error(`❌ OpenAI 응답 에러: ${openaiResponse.status} - ${errMsg}`);
            throw new Error(errMsg);
        }

        const openaiData = await openaiResponse.json();
        const resultText = openaiData.choices?.[0]?.message?.content ?? '';

        // 화면이 닫혀도 댓글이 pending에 갇히지 않도록 Edge Function이 판정 저장까지 끝낸다.
        if (type === 'SAFETY_CHECK' && moderationCommentId && studentId) {
            const jsonMatch = resultText.match(/\{.*\}/s);
            if (!jsonMatch) throw new Error('AI 댓글 판정 형식이 올바르지 않습니다.');

            const safetyResult = JSON.parse(jsonMatch[0]);
            if (typeof safetyResult.is_appropriate !== 'boolean') {
                throw new Error('AI 댓글 판정 값이 올바르지 않습니다.');
            }

            const nextStatus = safetyResult.is_appropriate ? 'approved' : 'blocked';
            const moderationReason = safetyResult.is_appropriate
                ? null
                : String(safetyResult.reason || '').trim() || null;
            const { data: recordedComment, error: recordError } = await supabaseAdmin
                .from('post_comments')
                .update({
                    status: nextStatus,
                    moderation_reason: moderationReason,
                    moderated_at: new Date().toISOString(),
                    moderated_by: 'ai'
                })
                .eq('id', moderationCommentId)
                .eq('student_id', studentId)
                .eq('status', 'pending')
                .select('id')
                .maybeSingle();

            if (recordError) throw recordError;

            return new Response(
                JSON.stringify({ text: resultText, reviewRecorded: !!recordedComment, currentStatus: nextStatus }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        return new Response(
            JSON.stringify({ text: resultText }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        const errMsg = error?.message ?? 'Unknown error';
        const errType = error?.constructor?.name ?? 'Error';
        console.error(`🔥 [${errType}] ${errMsg}`);
        return new Response(
            JSON.stringify({ error: errMsg, type: errType }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
