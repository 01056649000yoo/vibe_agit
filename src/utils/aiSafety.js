import { callAI } from '../lib/openai';

/**
 * 댓글 내용은 서버가 commentId로 직접 읽는다. 브라우저는 대기열을 한 번 깨우기만 하며,
 * 재시도와 동시 실행 제한은 서버 작업기가 맡는다.
 */
export const checkContentSafety = async (unusedContent, { commentId = null } = {}) => {
    void unusedContent;
    if (!commentId) return { queued: false };
    try {
        const responseText = await callAI({ commentId, type: 'SAFETY_CHECK' });
        const jsonMatch = responseText.match(/\{.*\}/s);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { queued: true };
    } catch (err) {
        console.error('댓글 AI 대기열을 깨우지 못했습니다:', err);
        return { queued: false, pending: true };
    }
};
