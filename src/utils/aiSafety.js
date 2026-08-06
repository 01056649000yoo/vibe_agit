import { callAI } from '../lib/openai';

/**
 * AI를 사용하여 텍스트의 적절성을 분석합니다. ✨
 */
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * 한 번 실패하면 그 댓글은 영영 `pending` 에 갇힌다(운영에서 112건이 그렇게 3~4개월 묶여 있었다).
 * 429·순간 오류는 잠깐 쉬고 다시 물어보면 대개 풀린다. 2회까지 다시 시도한다.
 */
export const checkContentSafety = async (content, { retries = 2, commentId = null } = {}) => {
    if (!content || content.trim().length < 2) return { is_appropriate: true, reason: '' };

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const result = await runSafetyCheck(content, commentId);
        if (result.ok) return result.value;
        if (attempt < retries) await wait(600 * (attempt + 1));
    }
    // 끝내 실패하면 막지 않는다. 1단계 로컬 필터가 있고, 통과시키는 편이 학생에게 덜 억울하다.
    return { is_appropriate: true, reason: '', unchecked: true };
};

const runSafetyCheck = async (content, commentId) => {
    try {
        // 서버가 commentId로 본인 댓글을 다시 읽고 판정과 DB 기록까지 마친다.
        // 클라이언트 content는 화면 응답용이며 판정 원문으로 신뢰하지 않는다.
        const responseText = await callAI({ content, commentId, type: 'SAFETY_CHECK' });

        // JSON 부분만 추출 (서버 응답이 텍스트 형태일 경우 대비)
        const jsonMatch = responseText.match(/\{.*\}/s);
        if (jsonMatch) {
            return { ok: true, value: JSON.parse(jsonMatch[0]) };
        }
        return { ok: true, value: { is_appropriate: true, reason: '' } };
    } catch (err) {
        console.error('AI Safety Check Error:', err);
        return { ok: false };
    }
};
