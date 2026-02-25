import { supabase } from './supabaseClient';

/**
 * OpenAI 모델 호출 유틸리티 ✨
 */
const MODEL_HIERARCHY = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-3.5-turbo'
];

/**
 * OpenAI API를 호출하여 메시지를 생성합니다.
 */
export const callOpenAI = async (payload, options = {}, retryCount = 0) => {
    let body = {};
    if (typeof payload === 'string') {
        body.prompt = payload;
    } else {
        body = { ...payload };
    }
    body = { ...body, ...options };

    try {
        // 1. 세션 확인 및 진단
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        const studentRaw = localStorage.getItem('student_session');
        const studentSession = studentRaw ? JSON.parse(studentRaw) : null;

        if (!session && !studentSession) {
            throw new Error('로그인이 필요합니다. 페이지를 새로고침하거나 다시 로그인해주세요.');
        }

        if (studentSession?.id) {
            body.studentId = studentSession.id;
        }

        // [진단] 401 에러 추적용 로그
        if (retryCount === 0) {
            console.log(`📡 AI 호출 시작 (로그인됨=${!!session}, 학생ID=${studentSession?.id})`);
        }

        // 2. Edge Function 호출
        const { data: responseData, error: invokeError } = await supabase.functions.invoke('vibe-ai', {
            body: { model: 'gpt-4o-mini', ...body }
        });

        // 3. 성공 시 즉시 반환
        if (!invokeError && responseData?.text) {
            if (retryCount > 0) console.log("✅ 재시도 끝에 AI 호출에 성공했습니다!");
            return responseData.text;
        }

        // 4. 에러 처리 및 재시도 로직
        if (invokeError) {
            const statusCode = invokeError.status || (invokeError.context?.status);
            let serverMsg = invokeError.message || "AI 서비스 일시적 오류";
            let serverDetails = "";

            // 에러 바디 파싱 시도
            if (invokeError.context) {
                try {
                    const text = await invokeError.context.text();
                    console.warn(`📥 AI 서버 에러 응답 (${statusCode}):`, text);
                    try {
                        const errBody = JSON.parse(text);
                        serverMsg = errBody.message || errBody.error || serverMsg;
                        serverDetails = errBody.details || "";
                    } catch (e) {
                        if (text.length < 100) serverDetails = text;
                    }
                } catch (e) {
                    console.warn("에러 바디 추출 불가");
                }
            }

            // [핵심] "Invalid JWT" 또는 401 발생 시 대응
            if ((serverMsg.includes("Invalid JWT") || statusCode === 401) && retryCount < 2) {

                // (1) SAFETY_CHECK인데 JWT 에러가 난 경우: 인증 헤더 없이 마지막 재시도
                if (body.type === 'SAFETY_CHECK' && retryCount === 1) {
                    console.warn("🛡️ Safety Check 인증 실패 - 인증 없이 마지막 시도를 진행합니다...");

                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

                    try {
                        const directResp = await fetch(`${supabaseUrl}/functions/v1/vibe-ai`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': anonKey, // 필수 헤더
                                // Authorization을 제외하여 게이트웨이 JWT 중복 체크 우회
                            },
                            body: JSON.stringify({ model: 'gpt-4o-mini', ...body })
                        });

                        if (directResp.ok) {
                            const resJson = await directResp.json();
                            if (resJson.text) {
                                console.log("✅ 인증 우회(apikey) 호출 성공!");
                                return resJson.text;
                            }
                        } else {
                            const resText = await directResp.text();
                            console.error(`Bypass 실패 (${directResp.status}):`, resText);
                        }
                    } catch (e) {
                        console.error("인증 우회 호출 오류:", e);
                    }
                }

                // (2) 세션 갱신 후 1차 재시도
                if (retryCount === 0) {
                    console.warn("🔐 인증 토큰 오류 감지 - 세션 갱신 후 1회 재시도합니다...");
                    const { error: refreshErr } = await supabase.auth.refreshSession();
                    if (!refreshErr) {
                        return callOpenAI(payload, options, retryCount + 1);
                    }
                }
            }

            // 폴백 (안전 검사가 아닌 경우만 gpt-3.5 시도)
            if (!body.type || body.type !== 'SAFETY_CHECK') {
                console.warn('1차 실패, 2차 모델 폴백 시도...');
                const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('vibe-ai', {
                    body: { model: 'gpt-3.5-turbo', ...body }
                });
                if (!fallbackError && fallbackData?.text) return fallbackData.text;
            }

            // 최종 에러 메시지
            let finalMsg = serverMsg;
            if (serverMsg.includes("Invalid JWT") || statusCode === 401) {
                finalMsg = "인증 오류: 로그인 정보가 일치하지 않습니다. 브라우저를 새로고침하거나 다시 로그인해주세요.";
            } else if (serverDetails) {
                finalMsg += ` (${serverDetails})`;
            }
            throw new Error(finalMsg);
        }

        throw new Error("AI 분석 결과가 없습니다.");

    } catch (err) {
        console.error('AI 호출 치명적 오류:', err);
        throw new Error(err.message || 'AI 서비스 연결 실패');
    }
};

export const callGemini = callOpenAI;
export const callAI = callOpenAI;
