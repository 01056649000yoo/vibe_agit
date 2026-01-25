const OPENAI_MODEL_HIERARCHY = [
    'gpt-5-mini',
    'gpt-5.1',
    'gpt-5-nano',
];

/**
 * OpenAI API를 호출합니다.
 */
export const callOpenAI = async (prompt, apiKey) => {
    const key = apiKey || import.meta.env.VITE_OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API 키가 설정되지 않았습니다.');

    let lastError = null;

    for (const model of OPENAI_MODEL_HIERARCHY) {
        try {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (content) return content.trim();
            } else {
                const errorData = await response.json();
                lastError = errorData?.error?.message || `HTTP ${response.status}`;
            }
        } catch (err) {
            lastError = err.message;
        }
    }
    throw new Error(`OpenAI 호출 실패: ${lastError}`);
};

/**
 * 설정된 공급자에 따라 AI를 호출합니다. (GPT 전용으로 통합) ✨
 */
export const callAI = async (prompt) => {
    return await callOpenAI(prompt);
};

// 하위 호환성을 위해 남겨둠 (기존 코드에서 callGemini를 참조하는 경우를 대비)
export const callGemini = (prompt) => {
    console.warn('callGemini is deprecated. Using OpenAI instead.');
    return callOpenAI(prompt);
};
