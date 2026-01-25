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

const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true // 클라이언트 측 호출 허용 (개발 단계)
});

/**
 * OpenAI API를 호출하여 메시지를 생성합니다.
 * @param {string} prompt - 전송할 프롬프트
 */
export const callOpenAI = async (prompt) => {
    if (!import.meta.env.VITE_OPENAI_API_KEY) {
        throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    let lastError = null;

    for (const model of MODEL_HIERARCHY) {
        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: model,
            });

            const content = completion.choices[0]?.message?.content;
            if (content) return content.trim();
            throw new Error('응답 데이터가 비어있습니다.');

        } catch (err) {
            console.warn(`모델 ${model} 호출 실패, 다음 모델 시도 중:`, err.message);
            lastError = err.message;
            // 404(모델 없음) 또는 권한 문제 등으로 인해 실패할 경우 다음 모델 시도
            continue;
        }
    }

    throw new Error(`모든 모델 호출에 실패했습니다. 최후 오류: ${lastError}`);
};

/**
 * 하위 호환성을 위해 callGemini 이름으로도 내보냅니다.
 * (기존 코드 변경을 최소화하기 위함)
 */
export const callGemini = callOpenAI;
