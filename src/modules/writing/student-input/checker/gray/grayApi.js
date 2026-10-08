import { supabase } from '../../../../../lib/supabaseClient';

/**
 * 회색 점선 서버 창구 — 서버 함수 spelling-look-closer 를 부른다. 글은 맥미니 밖으로 나가지 않는다.
 * 창구가 꺼져 있거나(available:false) 막히면 잠시 쉬었다가 다시 묻는다 — 그동안 회색 점선만 안 보인다.
 */
const PAUSE_WHEN_OFF_MS = 5 * 60_000;
const PAUSE_WHEN_BUSY_MS = 30_000;
let pausedUntil = 0;

export const isGrayPaused = () => Date.now() < pausedUntil;

/** @returns {Promise<Map<string, Array>>} 문단 글 → 제안 목록. 쉬는 중이면 빈 Map. */
export const fetchGraySuggestions = async (paragraphs) => {
    if (!paragraphs.length || isGrayPaused()) return new Map();
    const body = { paragraphs: paragraphs.map((paragraph, index) => ({ key: `p${index}`, text: paragraph.text })) };
    const { data, error } = await supabase.functions.invoke('spelling-look-closer', { body });
    if (error) {
        pausedUntil = Date.now() + PAUSE_WHEN_BUSY_MS;
        return new Map();
    }
    if (!data?.available) {
        pausedUntil = Date.now() + PAUSE_WHEN_OFF_MS;
        return new Map();
    }
    const byKey = new Map((data.results || []).map((result) => [result.key, Array.isArray(result.suggestions) ? result.suggestions : []]));
    return new Map(paragraphs.map((paragraph, index) => [paragraph.text, byKey.get(`p${index}`) || []]));
};

// 학생이 고른 결과는 모아서 3초 뒤(또는 20개가 차면) 한 번에 기록한다. 실패해도 글쓰기에는 영향이 없다.
const FEEDBACK_DELAY_MS = 3000;
let feedbackQueue = [];
let feedbackTimer = null;

const flushFeedback = () => {
    feedbackTimer = null;
    const items = feedbackQueue.splice(0, 20);
    if (!items.length) return;
    supabase.rpc('record_spelling_gray_feedback_v1', { p_items: items }).then(() => {}, () => {});
    if (feedbackQueue.length) feedbackTimer = setTimeout(flushFeedback, FEEDBACK_DELAY_MS);
};

export const recordGrayChoice = (issue, choice) => {
    feedbackQueue.push({
        category: issue.category,
        original: String(issue.original).slice(0, 30),
        suggestion: String(issue.suggestion).slice(0, 30),
        choice
    });
    if (feedbackQueue.length >= 20) {
        clearTimeout(feedbackTimer);
        flushFeedback();
    } else if (!feedbackTimer) {
        feedbackTimer = setTimeout(flushFeedback, FEEDBACK_DELAY_MS);
    }
};
