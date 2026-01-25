/**
 * Gemini 모델 호출 유틸리티 ✨
 * 사용자 요청에 따른 모델 계층화 및 폴백(Fallback) 로직을 처리합니다.
 */

const MODEL_HIERARCHY = [
    'gemini-2.5-flash-lite',               // 사용자 요청 1순위
    'gemini-2.5-flash',                    // 사용자 요청 2순위
    'gemini-3-flash',                      // 사용자 요청 3순위
    'gemini-2.0-flash-lite-preview-02-05', // 현 시점 최신 Lite 폴백
    'gemini-2.0-flash',                    // 현 시점 표준 폴백
    'gemini-1.5-flash'                     // 안정적인 최종 폴백
];

/**
 * Gemini API를 호출합니다. 계층별 모델 폴백을 시도합니다.
 * @param {string} prompt - 전송할 프롬프트
 * @param {string} apiKey - API 키
 */
export const callGemini = async (prompt, apiKey) => {
    if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');

    let lastError = null;

    for (const model of MODEL_HIERARCHY) {
        try {
            const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            const response = await fetch(`${baseUrl}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (content) return content.trim();
                throw new Error('응답 데이터가 비어있습니다.');
            }

            const errorData = await response.json();
            const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;

            // 404(모델 없음), 429(속도 제한), 400(잘못된 요청 - 모델 관련인 경우) 등에 대해 폴백 시도
            console.warn(`모델 ${model} 호출 실패, 다음 모델 시도 중:`, errorMsg);
            lastError = errorMsg;
            continue;

        } catch (err) {
            console.error(`모델 ${model} 오류:`, err.message);
            lastError = err.message;
            continue;
        }
    }

    throw new Error(`모든 모델 호출에 실패했습니다. 최후 오류: ${lastError}`);
};
