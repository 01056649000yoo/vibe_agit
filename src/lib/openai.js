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
        // [수정] 세션 여부와 상관없이 학생 ID가 있으면 무조건 전송하여 서버 인증을 보조합니다.
        if (studentSession?.id) {
            body.studentId = studentSession.id;
        }

        // [1차 시도] 1순위: gpt-4o-mini
        // Edge Function에 model 파라미터를 전달하면 내부에서 해당 모델로 호출합니다.
        const { data: data1, error: error1 } = await import('./supabaseClient').then(m => m.supabase.functions.invoke('vibe-ai', {
            body: { model: 'gpt-4o-mini', ...body }
        }));

        if (!error1 && data1?.text) return data1.text;

        // 400/401: 설정 오류, 권한 오류, 정책 위반 등
        if (error1) {
            console.error("AI Server Error Detail:", error1);

            let serverMsg = "AI 서비스를 일시적으로 사용할 수 없습니다.";
            let serverDetails = "";

            // 에러 바디에서 상세 메시지 추출 시도 (Supabase Functions 특유의 에러 구조 대응)
            if (error1.context) {
                try {
                    const response = error1.context;
                    // response.json()이 동작하지 않는 환경이 있을 수 있으므로 텍스트로 먼저 받기 시도
                    const text = await response.text();
                    try {
                        const errBody = JSON.parse(text);
                        if (errBody.error) serverMsg = errBody.error;
                        if (errBody.details) serverDetails = errBody.details;
                    } catch (e) {
                        serverDetails = text;
                    }
                } catch (e) {
                    console.warn("에러 바디 추출 실패:", e);
                }
            } else if (data1?.error) {
                serverMsg = data1.error;
                if (data1.details) serverDetails = data1.details;
            } else if (error1.message) {
                serverMsg = error1.message;
            }

            // Unauthorized 에러 한글화 및 상세 정보 결합
            if (serverMsg === 'Unauthorized' || serverMsg.includes('401')) {
                serverMsg = "로그인 정보 인증에 실패했습니다." + (serverDetails ? `\n(원인: ${serverDetails})` : "\n(다시 로그인하거나 페이지를 새로고침 해주세요.)");
            } else if (serverDetails) {
                serverMsg += `\n\n상세: ${serverDetails}`;
            }

            throw new Error(serverMsg);
        }

        // [2차 시도] 폴백: gpt-3.5-turbo (교사 호출 등의 일반 상황에서만 시도)
        if (!body.type || body.type !== 'SAFETY_CHECK') {
            console.warn('1차(gpt-4o-mini) 실패, 2차(gpt-3.5-turbo) 시도:', error1);
            const { data: data2, error: error2 } = await import('./supabaseClient').then(m => m.supabase.functions.invoke('vibe-ai', {
                body: { model: 'gpt-3.5-turbo', ...body }
            }));

            if (!error2 && data2?.text) return data2.text;
            throw new Error(`AI 서버 연결 실패: ${error2?.message || '알 수 없는 오류'}`);
        }

        throw new Error("분석에 실패했습니다. 다시 시도해주세요.");

    } catch (err) {
        console.error('AI 호출 치명적 오류:', err);
        throw new Error(err.message || 'AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
};

/**
 * 하위 호환성을 위해 callGemini 이름으로도 내보냅니다.
 * (기존 코드 변경을 최소화하기 위함)
 */
export const callGemini = callOpenAI;
export const callAI = callOpenAI;
