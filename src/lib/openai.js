// import OpenAI from 'openai'; // Edge Function 사용으로 불필요

/**
 * OpenAI 모델 호출 유틸리티 ✨
 * 사용자 요청에 따른 모델 계층화 및 폴백(Fallback) 로직을 처리합니다.
 */

const MODEL_HIERARCHY = [
    'gpt-4o',      // 가장 강력하고 지능적인 모델 (Complex reasoning)
    'gpt-4o-mini', // 빠르고 효율적인 모델 (Fast & Cheap)
    'gpt-3.5-turbo' // 레거시 폴백
];

// Edge Function 전용으로 전환되어 getOpenAI(클라이언트 직접 호출)는 제거되었습니다.

/**
 * OpenAI API를 호출하여 메시지를 생성합니다.
 * @param {string|object} payload - 전송할 프롬프트 문자열 또는 옵션 객체
 * @param {object} options - 추가 옵션 (type: 'SAFETY_CHECK' 등)
 */
export const callOpenAI = async (payload, options = {}) => {
    // 이제 모든 호출은 Edge Function 'vibe-ai'를 통해 이루어집니다.
    // payload가 문자열이면 prompt로 처리, 객체면 해당 속성들을 사용

    let body = {};
    if (typeof payload === 'string') {
        body.prompt = payload;
    } else {
        body = { ...payload };
    }

    // 추가 옵션 병합
    body = { ...body, ...options };

    try {
        // [중요] 함수 호출 전 세션 확인 (교사용 Supabase 세션 또는 학생용 로컬 세션)
        const { data: { session }, error: sessionError } = await import('./supabaseClient').then(m => m.supabase.auth.getSession());

        // 학생 로컬 세션 정보 가져오기
        const studentRaw = localStorage.getItem('student_session');
        const studentSession = studentRaw ? JSON.parse(studentRaw) : null;

        if (!session && !studentSession) {
            console.warn('AI 호출 전 세션 감지 안 됨');
            throw new Error('로그인이 필요합니다. 페이지를 새로고침하거나 다시 로그인해주세요.');
        }

        if (sessionError) {
            console.warn('세션 확인 중 오류 발생:', sessionError);
        }

        // 학생 세션이 있다면 body에 studentId 포함 (서버 보안 인증용)
        if (studentSession?.id) {
            body.studentId = studentSession.id;
        }

        // [1차 시도] 1순위: gpt-4o-mini
        const { data: data1, error: error1 } = await import('./supabaseClient').then(m => m.supabase.functions.invoke('vibe-ai', {
            body: { model: 'gpt-4o-mini', ...body }
        }));

        if (!error1 && data1?.text) return data1.text;

        // 에러 처리 로직
        if (error1) {
            console.error("AI Server Error Detail:", error1);

            let serverMsg = "AI 서비스를 일시적으로 사용할 수 없습니다.";
            let serverDetails = "";
            const statusCode = error1.status || (error1.context?.status);

            // 응답 바디에서 상세 정보 추출
            if (error1.context && typeof error1.context.text === 'function' && !error1.context.bodyUsed) {
                try {
                    const text = await error1.context.text();
                    try {
                        const errBody = JSON.parse(text);
                        if (errBody.error) serverMsg = errBody.error;
                        if (errBody.details) serverDetails = errBody.details;
                    } catch (e) {
                        if (text && text.length < 200) serverDetails = text;
                    }
                } catch (e) {
                    console.warn("에러 디테일 추출 실패:", e.message);
                }
            } else if (error1.message && error1.message.includes('CORS')) {
                serverMsg = "CORS 차단: 로컬 개발 환경(localhost)이 허용되지 않았습니다.";
            } else if (error1.message) {
                serverMsg = error1.message;
            }

            // 폴백 결정: 안전 검사가 아니면 2차 모델 시도
            if (!body.type || body.type !== 'SAFETY_CHECK') {
                console.warn('1차 실패, 2차(gpt-3.5-turbo) 시도...');
                const { data: data2, error: error2 } = await import('./supabaseClient').then(m => m.supabase.functions.invoke('vibe-ai', {
                    body: { model: 'gpt-3.5-turbo', ...body }
                }));
                if (!error2 && data2?.text) return data2.text;
                if (error2) console.error("2차 폴백 실패:", error2);
            }

            // 최종 에러 메시지 구성
            let finalError = serverMsg;
            if (statusCode === 401) {
                finalError = "로그인 인증 실패: " + (serverDetails || "다시 로그인해주세요.");
            } else if (serverDetails) {
                finalError += ` (${serverDetails})`;
            }

            throw new Error(finalError);
        }

        throw new Error("분석 결과가 비어있습니다.");

    } catch (err) {
        console.error('AI 호출 치명적 오류:', err);
        throw new Error(err.message || 'AI 서비스 연결 실패');
    }
};

export const callGemini = callOpenAI;
export const callAI = callOpenAI;
