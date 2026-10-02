/**
 * 인형뽑기 한 사람의 하루 — 화면(`ClawPlayScreen`)이 쓰는 같은 모양의 두 가지 구현(2026-10-02).
 *
 *   createServerClawSession()  학생: 서버가 문제·채점·코인·상품을 맡는다(Edge 함수 `spelling-claw` + RPC) — clawServerSession.js
 *   createLocalClawSession()   교사 미리보기·실험실: 이 브라우저 안에서만 같은 규칙을 흉내 낸다(DB 에 쓰지 않음) — 이 파일
 *
 * 두 구현의 규칙(목표를 넘으면 코인 1개·하루 기회 수까지·한 판 상품 최대 2개·기회를 다 쓰고 못 뽑으면 최소 포인트)은
 * 서버(`20261363_spelling_claw_server.sql`)가 정본이다. 미리보기는 그 흉내라, 규칙을 바꾸면 여기와 스모크를 함께 고친다.
 *
 * 화면에 오는 상품 모양: { kind:'points', points } | { kind:'gift', gift_name } | { kind:'decor', item_name } (+ plush_id·plush_name)
 */
import {
    CLAW_MAX_PRIZES_PER_PLAY, decorTierOf, describeClawOdds, eligibleClawDecor,
    normalizeClawClassSettings, normalizeClawPrizeSettings, rollClawPrize
} from './prizeTable.js';
import {
    createSpellingQuiz, gradeSpellingAnswer, publicQuizQuestion, SPELLING_QUIZ_LEVELS
} from './quiz/spellingQuizBuilder.js';
import { CLAW_PLUSHES } from './plushCatalog.js';

const QUIZ_COUNT = 10;
const plushNameOf = (id) => CLAW_PLUSHES.find((plush) => plush.id === id)?.name || '인형';

/**
 * 교사 미리보기용. `student` 는 학급 명단에서 고른 학생(수호룡·단계·가진 아이템), `catalog` 는 앱의 수호룡 상점 목록.
 * 설정은 교사가 **저장 전에** 고친 값을 그대로 받는다(저장하기 전에 해 볼 수 있게).
 */
export const createLocalClawSession = ({ student, classSettings, prizeSettings, catalog, quizPool }) => {
    const settings = normalizeClawClassSettings(classSettings);
    const prizes = normalizeClawPrizeSettings(prizeSettings);
    const owned = [...(student.owned || [])];
    let plays = [];
    let attempt = null;
    let recent = [];
    let collection = {};
    let consolationGiven = false;
    let sequence = 0;
    const nextId = () => `local-${Date.now()}-${(sequence += 1)}`;
    const decorNow = () => eligibleClawDecor(catalog, {
        writerLevel: student.writerLevel, readerLevel: student.readerLevel, owned
    });
    const today = () => ({
        coinsEarned: plays.length,
        coinsLeft: plays.filter((play) => play.status === 'coin').length,
        playsDone: plays.filter((play) => play.status === 'done').length,
        prizes: plays.reduce((sum, play) => sum + (play.prizes?.length || 0), 0),
        consolationPoints: consolationGiven ? settings.minPoints : 0,
        playingId: plays.find((play) => play.status === 'playing')?.id || null
    });

    return {
        mode: 'local',
        async load() {
            return {
                enabled: true,
                student: { name: student.name, speciesId: student.speciesId, writerLevel: student.writerLevel, readerLevel: student.readerLevel },
                settings,
                odds: describeClawOdds({ settings: prizes, decorTiers: [...new Set(decorNow().map(decorTierOf))] }),
                today: today(),
                recent: [...recent],
                collection: { ...collection },
                totalPoints: 0
            };
        },
        async startQuiz() {
            const writeCount = Reflect.get(SPELLING_QUIZ_LEVELS, settings.quizLevel)?.writeCount ?? 4;
            const questions = createSpellingQuiz(quizPool, { count: QUIZ_COUNT, writeCount });
            attempt = { id: nextId(), questions, answers: [], correct: 0, done: false };
            return { attemptId: attempt.id, questions: questions.map(publicQuizQuestion) };
        },
        async answer(attemptId, index, value) {
            if (!attempt || attempt.id !== attemptId || attempt.done || index !== attempt.answers.length) {
                throw new Error('문제를 찾을 수 없어요. 새 문제를 받아 주세요.');
            }
            const question = attempt.questions.at(index);
            const graded = gradeSpellingAnswer(question, value);
            attempt.answers.push(graded.correct);
            if (graded.correct) attempt.correct += 1;
            const finished = attempt.answers.length >= attempt.questions.length;
            const passed = finished && attempt.correct >= settings.passCount;
            let coinGranted = false;
            if (finished) {
                attempt.done = true;
                if (passed && plays.length < settings.dailyPlays) {
                    plays = [...plays, { id: nextId(), status: 'coin' }];
                    coinGranted = true;
                }
            }
            return {
                correct: graded.correct, nearMiss: graded.nearMiss, answer: question.answer, solution: question.solution,
                explanation: question.explanation, answered: attempt.answers.length, correctCount: attempt.correct,
                finished, passed, coinGranted, coinsLeft: today().coinsLeft, coinsEarned: plays.length
            };
        },
        async startPlay() {
            const playing = plays.find((play) => play.status === 'playing');
            const coin = playing || plays.find((play) => play.status === 'coin');
            if (coin) coin.status = 'playing';
            return { playId: coin?.id || null, coinsLeft: today().coinsLeft };
        },
        async finishPlay(playId, caught) {
            const play = plays.find((item) => item.id === playId);
            if (!play || play.status !== 'playing') throw new Error('이 판을 찾을 수 없어요.');
            const won = caught.filter((id) => CLAW_PLUSHES.some((plush) => plush.id === id)).slice(0, 8);
            const given = [];
            for (const plushId of won.slice(0, CLAW_MAX_PRIZES_PER_PLAY)) {
                const rolled = rollClawPrize({ settings: prizes, eligibleDecor: decorNow() });
                const base = { plush_id: plushId, plush_name: plushNameOf(plushId) };
                if (rolled.kind === 'decor') {
                    owned.push(rolled.item.id);
                    given.push({ ...base, kind: 'decor', item_id: rolled.item.id, item_name: rolled.item.name });
                } else if (rolled.kind === 'gift') given.push({ ...base, kind: 'gift', gift_name: rolled.gift.name });
                else given.push({ ...base, kind: 'points', points: rolled.points });
            }
            play.status = 'done';
            play.prizes = given;
            won.forEach((id) => { collection = { ...collection, [id]: (Reflect.get(collection, id) || 0) + 1 }; });
            let consolationPoints = 0;
            const state = today();
            if (!given.length && !consolationGiven && state.playsDone >= settings.dailyPlays && state.prizes === 0) {
                consolationGiven = true;
                consolationPoints = settings.minPoints;
            }
            if (won.length || consolationPoints) {
                recent = [{ id: playId, at: new Date(), caught: won, prizes: given, consolationPoints }, ...recent].slice(0, 30);
            }
            return { prizes: given, consolationPoints, totalPoints: null };
        },
        /** 미리보기 도구 */
        addCoin() { plays = [...plays, { id: nextId(), status: 'coin' }]; },
        resetDay() { plays = []; attempt = null; consolationGiven = false; }
    };
};

/** 미리보기용 학급 명단 행(`get_teacher_dragon_growth_dashboard`) → 미리보기 학생. */
export const previewStudentFromRoster = (raw, levelOf) => ({
    id: raw.student_id,
    name: raw.name || '이름 없음',
    speciesId: raw.pet_data?.species,
    ...levelOf(raw),
    owned: [
        ...(Array.isArray(raw.pet_data?.ownedDecorItems) ? raw.pet_data.ownedDecorItems : []),
        ...(Array.isArray(raw.pet_data?.ownedItems) ? raw.pet_data.ownedItems : [])
    ]
});

export const clawPrizeText = (prize) => prize.kind === 'points' ? `${prize.points}P`
    : prize.kind === 'gift' ? `🎁 ${prize.gift_name || '선생님 선물'}` : `🐉 ${prize.item_name || '수호룡 아이템'}`;
