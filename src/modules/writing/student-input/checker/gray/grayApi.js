// 서버 연결은 쓸 때만 불러온다(노드 검사에서도 이 파일을 불러 줄 세우기를 시험할 수 있게).
const getSupabase = async () => (await import('../../../../../lib/supabaseClient')).supabase;
import { GRAY_MAX_PARAGRAPH_CHARS, GRAY_MAX_PARAGRAPHS, GRAY_MAX_TOTAL_CHARS } from './paragraphs.js';

/**
 * 회색 점선 서버 창구 — 서버 함수 spelling-look-closer 를 부른다. 글은 맥미니 밖으로 나가지 않는다.
 *
 * 한 화면에 입력칸이 여러 개(시의 연·편지의 칸)여도 **요청은 하나로 모아** 보낸다(2026-10-09 시뮬레이션에서 찾음 —
 * 칸마다 따로 보내면 저장된 글을 다시 열 때 동시에 쏟아져 서버 횟수 제한(0.5초·1분 40번)에 걸리고, 걸린 칸은
 * 다시 묻지 않아 회색 점선이 빠졌다). 0.25초 동안 들어온 문단을 모아 한 번에(12문단·6,000자까지) 보내고,
 * 남은 것·막힌 것은 0.6초 뒤 다음 차례에 보낸다. 결과는 모든 입력칸이 함께 쓰는 기억(cache)에 넣고 알린다.
 * 창구가 꺼져 있으면(available:false) 5분, 서버 오류면 30초 묻지 않는다 — 그동안 회색 점선만 안 보인다.
 */
const GATHER_MS = 250;
const NEXT_MS = 600;
const PAUSE_WHEN_OFF_MS = 5 * 60_000;
const PAUSE_WHEN_BUSY_MS = 30_000;
const RETRY_WHEN_LIMITED_MS = 1500;

let pausedUntil = 0;
const waiting = new Map();      // 문단 글 → 기다리는 수
let timer = null;
let inFlight = false;
let defaultSender = null;

export const isGrayPaused = () => Date.now() < pausedUntil;

const resultListeners = new Set();
const doneListeners = new Set();
const notifyDone = () => doneListeners.forEach((listener) => listener());


const callServer = async (paragraphs) => {
    const body = { paragraphs: paragraphs.map((text, index) => ({ key: `p${index}`, text })) };
    const supabase = await getSupabase();
    const { data, error } = await supabase.functions.invoke('spelling-look-closer', { body });
    if (error) {
        const status = error?.context?.status;
        return { status: status === 429 ? 'limited' : 'error' };
    }
    if (!data?.available) return { status: 'off' };
    const byKey = new Map((data.results || []).map((result) => [result.key, Array.isArray(result.suggestions) ? result.suggestions : []]));
    return { status: 'ok', results: new Map(paragraphs.map((text, index) => [text, byKey.get(`p${index}`) || []])) };
};

const schedule = (delay) => {
    if (timer || inFlight) return;
    timer = setTimeout(flush, delay);
};

async function flush() {
    timer = null;
    if (!waiting.size) return;
    if (isGrayPaused()) {
        schedule(pausedUntil - Date.now() + 50);
        return;
    }
    const batch = [];
    let total = 0;
    for (const text of waiting.keys()) {
        if (batch.length >= GRAY_MAX_PARAGRAPHS || total + text.length > GRAY_MAX_TOTAL_CHARS) break;
        batch.push(text);
        total += text.length;
    }
    inFlight = true;
    let outcome;
    try {
        outcome = await (defaultSender || callServer)(batch);
    } catch {
        outcome = { status: 'error' };
    }
    inFlight = false;
    if (outcome.status === 'ok') {
        for (const text of batch) waiting.delete(text);
        outcome.results.forEach((suggestions, text) => resultListeners.forEach((listener) => listener(text, suggestions)));
        notifyDone();
        if (waiting.size) schedule(NEXT_MS);
    } else if (outcome.status === 'limited') {
        schedule(RETRY_WHEN_LIMITED_MS);
    } else {
        pausedUntil = Date.now() + (outcome.status === 'off' ? PAUSE_WHEN_OFF_MS : PAUSE_WHEN_BUSY_MS);
        schedule(pausedUntil - Date.now() + 50);
    }
}

/** 결과가 올 때마다 (문단 글, 제안 목록) 을 받는다. 돌려준 함수로 그만 받는다. */
export const onGrayResult = (listener) => {
    resultListeners.add(listener);
    return () => resultListeners.delete(listener);
};

/** 한 번의 보내기가 끝날 때마다 알린다(입력칸이 다시 그리도록). */
export const onGrayBatchDone = (listener) => {
    doneListeners.add(listener);
    return () => doneListeners.delete(listener);
};

/** 문단들을 물어볼 줄에 세운다(같은 문단은 한 번만). 너무 긴 문단은 보내지 않는다. */
export const requestGraySuggestions = (texts) => {
    let added = false;
    for (const text of texts) {
        if (!text || text.length > GRAY_MAX_PARAGRAPH_CHARS || waiting.has(text)) continue;
        waiting.set(text, 1);
        added = true;
    }
    if (added) schedule(GATHER_MS);
};

/** 검사·미리보기용: 서버 대신 부를 함수를 끼운다(null 이면 원래대로). */
export const setGraySenderForTest = (sender) => {
    defaultSender = sender;
    pausedUntil = 0;
    waiting.clear();
    if (timer) clearTimeout(timer);
    timer = null;
    inFlight = false;
};

// 학생이 고른 결과는 모아서 3초 뒤(또는 20개가 차면) 한 번에 기록한다. 실패해도 글쓰기에는 영향이 없다.
const FEEDBACK_DELAY_MS = 3000;
let feedbackQueue = [];
let feedbackTimer = null;

const flushFeedback = () => {
    feedbackTimer = null;
    const items = feedbackQueue.splice(0, 20);
    if (!items.length) return;
    getSupabase().then((supabase) => supabase.rpc('record_spelling_gray_feedback_v1', { p_items: items })).then(() => {}, () => {});
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
