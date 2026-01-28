import OpenAI from 'openai';

/**
 * OpenAI 모델 호출 유틸리티 ✨
 * 사용자 요청에 따른 모델 계층화 및 폴백(Fallback) 로직을 처리합니다.
 */

const MODEL_HIERARCHY = [
    'gpt-4o',      // 가장 강력하고 지능적인 모델 (Complex reasoning)
    'gpt-4o-mini', // 빠르고 효율적인 모델 (Fast & Cheap)
    'gpt-3.5-turbo' // 레거시 폴백
];

let openaiInstance = null;

const getOpenAI = (apiKey) => {
    const key = apiKey || import.meta.env.VITE_OPENAI_API_KEY;
    if (!key) {
        throw new Error('OpenAI API 키가 설정되지 않았습니다. [설정 > AI 보안 센터]에서 키를 등록하거나 시스템 관리자에게 문의하세요.');
    }

    if (!openaiInstance || (apiKey && openaiInstance.apiKey !== apiKey)) {
        openaiInstance = new OpenAI({
            apiKey: key,
            dangerouslyAllowBrowser: true // 클라이언트 측 호출 허용 (개발 단계)
        });
    }
    return openaiInstance;
};

/**
 * OpenAI API를 호출하여 메시지를 생성합니다.
 * @param {string} prompt - 전송할 프롬프트
 */
export const callOpenAI = async (prompt) => {
    // 이제 모든 호출은 Edge Function 'vibe-ai'를 통해 이루어집니다.
    // Edge Function 내부에서 공용 키(시스템) 또는 개인 키(DB)를 자동으로 선택합니다.

    try {
        // [중요] 함수 호출 전 세션 확인 (401 방지)
        const { data: { session }, error: sessionError } = await import('./supabaseClient').then(m => m.supabase.auth.getSession());

        if (sessionError || !session) {
            console.warn('AI 호출 전 세션 만료됨, 재로그인 필요');
            throw new Error('로그인 세션이 만료되었습니다. 페이지를 새로고침하거나 다시 로그인해주세요.');
        }

        // [1차 시도] 1순위: gpt-4o-mini (가장 가성비 좋고 빠른 모델)
        // Edge Function에 model 파라미터를 전달하면 내부에서 해당 모델로 호출합니다.
        const { data: data1, error: error1 } = await import('./supabaseClient').then(m => m.supabase.functions.invoke('vibe-ai', {
            body: { prompt: prompt, model: 'gpt-4o-mini' }
        }));

        if (!error1 && data1?.text) return data1.text;

        // 401 오류인 경우 즉시 중단 (권한 문제이므로 재시도 의미 없음)
        if (error1 && (error1.code === 401 || error1.message?.includes('401'))) {
            throw new Error('AI 서버 접근 권한이 없습니다. (401 Unauthorized) - 관리자에게 문의하세요.');
        }

        console.warn('1차(gpt-4o-mini) 실패, 2차(gpt-3.5-turbo) 시도:', error1);

        // [2차 시도] 폴백: gpt-3.5-turbo
        const { data: data2, error: error2 } = await import('./supabaseClient').then(m => m.supabase.functions.invoke('vibe-ai', {
            body: { prompt: prompt, model: 'gpt-3.5-turbo' }
        }));

        if (!error2 && data2?.text) return data2.text;

        // 모든 시도 실패 시
        throw new Error(`AI 서버 연결 실패: ${error2?.message || '알 수 없는 오류'}`);

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
