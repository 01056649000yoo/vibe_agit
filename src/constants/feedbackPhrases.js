/*
 * 자주 쓰는 피드백 문장 — 다시 쓰기 지시문 보관함.
 *
 * 왜 만들었나:
 *   다시 쓰기 요청에 붙는 말을 만드는 길이 **AI 한 갈래뿐**이었다. 그런데 교사가 실제로
 *   되풀이해 쓰는 말은 "문단을 내용별로 나눠서 다시 제출하세요" 처럼 학생마다 다를 것이 없는
 *   지시문이다. 이런 말까지 AI 를 거치면 25명에 1분 가까이 걸리고 호출도 25번 나간다.
 *   그래서 **AI 갈래는 그대로 두고, 저장해 둔 문장을 고르는 갈래를 나란히 둔다(투트랙).**
 *
 * 어디에 저장하나:
 *   `profiles.feedback_phrases` (JSONB 문자열 배열). 새 표를 만들지 않았다 —
 *   `profiles.frequent_tags`(자주 쓰는 태그)와 소유자·수명·크기가 같아서 같은 방식이 맞고,
 *   새 표를 만들면 RLS·권한·RPC 표면이 그만큼 늘어난다.
 *
 * ⚠️ 아래 두 한도는 DB CHECK 제약과 **같은 값**이어야 한다.
 *    원본은 이 파일이고, SQL 은 `supabase/migrations/20261227_teacher_feedback_phrases.sql` 이다.
 *    두 곳이 어긋나면 `tests/teacherFeedbackPhrases.test.mjs` 가 잡는다.
 */

/** 한 교사가 저장할 수 있는 문장 수 */
export const MAX_FEEDBACK_PHRASES = 20;

/** 문장 하나의 길이 (DB 는 배열 형태만 보고, 길이는 화면과 이 상수가 지킨다) */
export const MAX_FEEDBACK_PHRASE_LENGTH = 200;

/**
 * 처음 여는 교사에게 담아 줄 기본 문장.
 *
 * 백지로 두면 아무도 채우지 않는다 — 이 저장소에 이미 그 기록이 있다(제보 창이 백지라
 * 교사 203명 중 제보 0건이었다. `components/teacher/FeedbackModal.jsx` 머리말).
 * 그래서 목록이 비었을 때 한 번에 담을 수 있게 미리 적어 둔다. 담은 뒤에는 교사 것이므로
 * 자유롭게 고치고 지운다.
 */
export const DEFAULT_FEEDBACK_PHRASES = Object.freeze([
    '문단을 내용별로 나눠서 형식에 맞춰 다시 제출하세요.',
    'AI 맞춤법 검사 후 제출하세요.',
    '글자 수가 모자랍니다. 겪은 일을 더 자세히 적어 다시 제출하세요.',
    '제목이 글 내용과 어울리는지 다시 살펴보고 고쳐 주세요.',
    '개요에서 정한 순서대로 내용을 다시 정리해 주세요.',
    '소리 내어 한 번 읽어 보고 어색한 문장을 고쳐 주세요.'
]);

/** 저장 전 다듬기 — 앞뒤 공백 정리, 빈 문장·중복 제거, 개수 제한 */
export const normalizeFeedbackPhrases = (raw) => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const result = [];
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const text = item.trim().slice(0, MAX_FEEDBACK_PHRASE_LENGTH);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
        if (result.length >= MAX_FEEDBACK_PHRASES) break;
    }
    return result;
};

/**
 * 새 문장이 저장 가능한지 본다. 문제가 있으면 **화면에 그대로 보여 줄 말**을 돌려준다.
 * 통과하면 빈 문자열이다.
 */
export const validateFeedbackPhrase = (text, existing = []) => {
    const value = String(text || '').trim();
    if (!value) return '문장을 입력해 주세요.';
    if (value.length > MAX_FEEDBACK_PHRASE_LENGTH) {
        return `문장은 ${MAX_FEEDBACK_PHRASE_LENGTH}자 이내로 적어 주세요.`;
    }
    if (existing.some((item) => String(item).trim() === value)) {
        return '이미 저장한 문장입니다.';
    }
    if (normalizeFeedbackPhrases(existing).length >= MAX_FEEDBACK_PHRASES) {
        return `문장은 ${MAX_FEEDBACK_PHRASES}개까지 저장할 수 있습니다. 쓰지 않는 문장을 지워 주세요.`;
    }
    return '';
};

/**
 * 고른 문장들을 학생에게 보낼 한 덩어리로 만든다.
 *
 * 하나면 문장 그대로, 둘 이상이면 번호를 붙인다 — 지시가 두 개 이상이면 학생이 무엇을
 * 몇 가지 해야 하는지 셀 수 있어야 한다.
 */
export const buildFeedbackPhraseMessage = (selected) => {
    const phrases = normalizeFeedbackPhrases(selected);
    if (phrases.length === 0) return '';
    if (phrases.length === 1) return phrases[0];
    return phrases.map((phrase, index) => `${index + 1}. ${phrase}`).join('\n');
};

/**
 * 이미 적힌 피드백 아래에 덧붙인다.
 *
 * **덮어쓰지 않는 것이 핵심이다.** AI 초안을 받아 둔 글에 지시문을 더할 때 앞의 말이
 * 사라지면 안 된다. 낱개와 일괄이 같은 규칙을 쓰도록 이 함수 하나만 쓴다.
 */
export const appendFeedbackMessage = (existing, addition) => {
    const before = String(existing || '').trimEnd();
    const after = String(addition || '').trim();
    if (!after) return before;
    if (!before) return after;
    return `${before}\n\n${after}`;
};
