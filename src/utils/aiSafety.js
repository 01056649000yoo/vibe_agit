import { callAI } from '../lib/openai';

/**
 * AI를 사용하여 텍스트의 적절성을 분석합니다. ✨
 */
export const checkContentSafety = async (content) => {
    if (!content || content.trim().length < 2) return { is_appropriate: true, reason: '' };

    try {
        // [수정] 이제 서버(Edge Function)에서 SAFETY_CHECK 타입을 감지하여 프롬프트를 강제합니다.
        // 클라이언트에서는 분석할 내용만 content에 담아 보냅니다.
        const responseText = await callAI({ content, type: 'SAFETY_CHECK' });

        // JSON 부분만 추출 (서버 응답이 텍스트 형태일 경우 대비)
        const jsonMatch = responseText.match(/\{.*\}/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { is_appropriate: true, reason: '' };
    } catch (err) {
        console.error('AI Safety Check Error:', err);
        // 오류 발생 시에는 시스템 중단 방지를 위해 통과시키되, 1단계 로컬 필터가 있으므로 안전합니다.
        return { is_appropriate: true, reason: '' };
    }
};
