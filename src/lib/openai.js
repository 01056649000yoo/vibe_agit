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
export const callOpenAI = async (prompt, apiKey) => {
    // 1. 개인 키가 있으면 기존처럼 클라이언트에서 직접 호출 (개인 비용 사용)
    if (apiKey) {
        let openaiInstance = getOpenAI(apiKey);
        let lastError = null;

        for (const model of MODEL_HIERARCHY) {
            try {
                const completion = await openaiInstance.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: model,
                });
                return completion.choices[0]?.message?.content?.trim();
            } catch (err) {
                console.warn(`모델 ${model} 호출 실패:`, err.message);
                lastError = err.message;
                continue;
            }
        }
        throw new Error(`개인 API 키 호출 실패: ${lastError}`);
    }

    // 2. 개인 키가 없으면 서버(Edge Function)를 통해 공용 키 사용 (보안)
    // Edge Function은 'vibe-ai'라는 이름으로 배포되어 있어야 합니다.
    try {
        const { data, error } = await import('./supabaseClient').then(m => m.supabase.functions.invoke('vibe-ai', {
            body: {
                prompt: prompt,
                model: 'gpt-4o-mini' // 기본적으로 빠르고 저렴한 모델 사용
            }
        }));

        if (error) {
            // Edge Function이 없거나 에러인 경우, 로컬 환경변수 확인 (개발자용 백업)
            console.warn('Edge Function 호출 실패, 로컬 환경 변수 시도:', error);
            if (import.meta.env.VITE_OPENAI_API_KEY) {
                return callOpenAI(prompt, import.meta.env.VITE_OPENAI_API_KEY);
            }
            throw new Error(`AI 서버 연결 실패: ${error.message}`);
        }

        return data.text;
    } catch (err) {
        console.error('AI 호출 치명적 오류:', err);
        throw new Error('AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
};

/**
 * 하위 호환성을 위해 callGemini 이름으로도 내보냅니다.
 * (기존 코드 변경을 최소화하기 위함)
 */
export const callGemini = callOpenAI;
