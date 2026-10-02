/**
 * 학생용 인형뽑기 세션 — 서버가 문제·채점·코인·상품을 맡는다(2026-10-02). 화면 모양은 clawSession.js 의 미리보기와 같다.
 *   오늘 상태·코인 넣기: RPC(get_my_spelling_claw_context_v1 · start_my_spelling_claw_play_v1)
 *   문제 받기·답·한 판 끝: Edge 함수 `spelling-claw`
 */
import { supabase } from '../../../lib/supabaseClient';
import {
    clawDecorFromCatalogRows, decorTierOf, describeClawOdds, eligibleClawDecor, normalizeClawClassSettings, normalizeClawPrizeSettings
} from './prizeTable';

/** 서버 오류 → 학생에게 보일 한 문장. Edge 함수 오류는 응답 본문의 message 를 쓴다. */
const messageOf = async (error, fallback) => {
    try {
        const body = await error?.context?.json?.();
        if (body?.message) return body.message;
    } catch { /* 본문이 없으면 기본 문장 */ }
    return error?.message && !/non-2xx|Failed to fetch/i.test(error.message) ? error.message : fallback;
};

const invoke = async (body) => {
    const { data, error } = await supabase.functions.invoke('spelling-claw', { body });
    if (error || !data?.success) throw new Error(await messageOf(error, data?.message || '잠시 연결이 불안정해요. 다시 해 주세요.'));
    return data;
};

const rpc = async (name, args) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(await messageOf(error, '잠시 연결이 불안정해요. 다시 해 주세요.'));
    return data;
};

const toToday = (today = {}) => ({
    coinsEarned: Number(today.coins_earned) || 0,
    rewardedQuizzes: Number(today.rewarded_quizzes) || 0,
    coinsLeft: Number(today.coins_left) || 0,
    playsDone: Number(today.plays_done) || 0,
    prizes: Number(today.prizes) || 0,
    consolationPoints: Number(today.consolation_points) || 0,
    playingId: today.playing_id || null
});

export const createServerClawSession = () => ({
    mode: 'server',
    async load() {
        const context = await rpc('get_my_spelling_claw_context_v1');
        const settings = normalizeClawClassSettings(context.settings);
        const decor = eligibleClawDecor(clawDecorFromCatalogRows(context.catalog), {
            writerLevel: context.writer_level, readerLevel: context.reader_level, owned: context.owned || []
        });
        return {
            enabled: Boolean(context.enabled),
            student: {
                name: context.name, speciesId: context.species,
                writerLevel: context.writer_level, readerLevel: context.reader_level
            },
            settings,
            odds: describeClawOdds({
                settings: normalizeClawPrizeSettings(context.prize_settings ?? undefined),
                decorTiers: [...new Set(decor.map(decorTierOf))]
            }),
            today: toToday(context.today),
            recent: (context.recent || []).map((row) => ({
                id: row.play_id, at: new Date(row.finished_at), caught: row.caught || [],
                prizes: row.prizes || [], consolationPoints: Number(row.consolation_points) || 0
            })),
            collection: context.collection || {},
            totalPoints: Number(context.total_points) || 0
        };
    },
    async startQuiz() {
        const data = await invoke({ action: 'quiz-start' });
        return { attemptId: data.attemptId, questions: data.questions };
    },
    async answer(attemptId, index, value) {
        return invoke({ action: 'quiz-answer', attemptId, index, answer: value });
    },
    async startPlay() {
        const data = await rpc('start_my_spelling_claw_play_v1');
        return { playId: data?.play_id || null, coinsLeft: Number(data?.coins_left) || 0 };
    },
    async finishPlay(playId, caught) {
        const data = await invoke({ action: 'play-finish', playId, caught });
        return { prizes: data.prizes || [], consolationPoints: Number(data.consolationPoints) || 0, totalPoints: data.totalPoints };
    }
});

