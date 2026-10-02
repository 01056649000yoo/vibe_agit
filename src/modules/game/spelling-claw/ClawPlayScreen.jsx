import { useCallback, useEffect, useRef, useState } from 'react';
import ClawCelebration from './ClawCelebration';
import ClawIntroDialog from './ClawIntroDialog';
import ClawMachineStage from './ClawMachineStage';
import QuizDragon from './QuizDragon';
import { dragonLine } from './dragonLines';
import { CLAW_PLUSHES } from './plushCatalog';
import { SPELLING_QUIZ_TYPES } from './quiz/spellingQuizBuilder';
import { getDragonStage } from '../dragon/presentation';
import { clawPrizeText } from './clawSession';
import './clawTestBench.css';

/*
 * 학생이 보는 인형뽑기 화면 한 장(2026-10-02 서버 연결). 학생 놀이터와 교사 미리보기가 같은 화면을 쓰고,
 * 무엇이 서버고 무엇이 흉내인지는 `session`(clawSession.js)이 정한다 — 이 화면은 정답·상품을 스스로 정하지 않는다.
 *   위: 학생이 키우는 수호룡이 맞춤법 10문제를 낸다(한 문제씩 채점).  아래: 목표를 넘으면 받은 코인으로 3D 인형뽑기.
 *   맨 아래: 뽑기 기록(펼쳐 보고 10초 뒤 저절로 닫힘).
 */
const SOURCE_LABELS = { base: '기본 사전', common: '공통 자료', class: '우리 반 자료' };
const INTRO_SEEN_KEY = 'spelling-claw-intro-seen-v1';
const readIntroSeen = () => { try { return window.localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch { return false; } };
const markIntroSeen = () => { try { window.localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* 다음에 한 번 더 보일 뿐 */ } };
const plushName = (id) => CLAW_PLUSHES.find((plush) => plush.id === id)?.name || id;

/** 고칠 곳을 빨갛게 보여 준다. */
const Highlighted = ({ text, part }) => {
    const at = part && text ? text.indexOf(part) : -1;
    if (at < 0) return text || '';
    return <>{text.slice(0, at)}<mark>{part}</mark>{text.slice(at + part.length)}</>;
};

/** 축하 화면이 읽는 모양으로. */
const celebrationPrize = (prize) => ({ kind: prize.kind, gift: { name: prize.gift_name }, item: { name: prize.item_name } });

export default function ClawPlayScreen({ session, quality = 'auto', refreshKey = 0, onPerf, onPointsChange, onPlayResult }) {
    const [data, setData] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [quiz, setQuiz] = useState(null);
    const [index, setIndex] = useState(0);
    const [picked, setPicked] = useState('');
    const [typed, setTyped] = useState('');
    const [result, setResult] = useState(null);
    const [score, setScore] = useState(0);
    const [summary, setSummary] = useState(null);
    const [busy, setBusy] = useState(false);
    const [quizError, setQuizError] = useState('');
    const [roundActive, setRoundActive] = useState(false);
    const [lastPrize, setLastPrize] = useState('');
    const [pendingFinish, setPendingFinish] = useState(null);
    const [celebration, setCelebration] = useState(null);
    const [recordOpen, setRecordOpen] = useState(false);
    const [recordHold, setRecordHold] = useState(10000);
    const [introOpen, setIntroOpen] = useState(() => !readIntroSeen());
    const playRef = useRef({ playId: null, caught: [] });

    const startQuiz = useCallback(async () => {
        setQuizError('');
        setBusy(true);
        try {
            const next = await session.startQuiz();
            setQuiz(next); setIndex(0); setPicked(''); setTyped(''); setResult(null); setScore(0); setSummary(null);
        } catch (error) {
            setQuizError(error.message);
        } finally {
            setBusy(false);
        }
    }, [session]);

    // 열 때(그리고 미리보기 도구가 바꿨을 때) 오늘 상태를 한 번 읽는다. 첫 번에는 문제도 받아 온다.
    useEffect(() => {
        let cancelled = false;
        session.load().then((next) => {
            if (cancelled) return;
            setData(next);
            setLoadError(next.enabled ? '' : '선생님이 인형뽑기를 아직 열지 않았어요.');
            if (next.enabled && !quiz) startQuiz();
        }).catch((error) => { if (!cancelled) setLoadError(error.message); });
        return () => { cancelled = true; };
        // 문제는 처음 한 번만 자동으로 받는다(quiz 를 의존에 넣으면 새로 받을 때마다 다시 읽는다).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, refreshKey, startQuiz]);

    useEffect(() => {
        if (!recordOpen) return undefined;
        const timer = setTimeout(() => setRecordOpen(false), recordHold);
        return () => clearTimeout(timer);
    }, [recordOpen, recordHold]);

    const closeCelebration = useCallback(() => setCelebration(null), []);

    if (loadError) {
        return <div className="claw-bench__state" role="alert"><span aria-hidden="true">🐉</span><p>{loadError}</p></div>;
    }
    if (!data) return <div className="claw-bench__state" role="status"><span aria-hidden="true">🐉</span><p>수호룡을 부르는 중…</p></div>;

    const { student, settings, today } = data;
    const dragonForm = getDragonStage(student.writerLevel, student.speciesId).form;
    const questions = quiz?.questions || [];
    const question = questions.at(index);
    const finished = Boolean(quiz) && index >= questions.length;
    // 끝내지 못한 판(창을 닫음)도 코인 하나로 센다 — 넣으면 그 판을 이어 한다.
    const coins = today.coinsLeft + (today.playingId && !roundActive ? 1 : 0);
    const clawOpen = coins > 0 || roundActive || Boolean(pendingFinish);
    const patchToday = (patch) => setData((current) => ({ ...current, today: { ...current.today, ...patch } }));

    const submit = async (value) => {
        if (result || busy || !question) return;
        setBusy(true);
        setPicked(value);
        try {
            const graded = await session.answer(quiz.attemptId, index, value);
            setResult(graded);
            setScore(graded.correctCount);
            if (graded.finished) {
                setSummary({ passed: graded.passed, coinGranted: graded.coinGranted });
                patchToday({ coinsLeft: graded.coinsLeft, coinsEarned: graded.coinsEarned });
            }
        } catch (error) {
            setQuizError(error.message);
            setPicked('');
        } finally {
            setBusy(false);
        }
    };
    const next = () => {
        if (!result) return;
        setIndex(index + 1); setPicked(''); setTyped(''); setResult(null);
    };

    const spendCoin = async () => {
        if (coins <= 0) return false;
        try {
            const started = await session.startPlay();
            if (!started.playId) { patchToday({ coinsLeft: 0, playingId: null }); return false; }
            playRef.current = { playId: started.playId, caught: [] };
            patchToday({ coinsLeft: started.coinsLeft, playingId: started.playId });
            setRoundActive(true);
            setLastPrize('');
            return true;
        } catch (error) {
            setLastPrize(error.message);
            return false;
        }
    };
    const onWon = (plushId) => {
        playRef.current.caught = [...playRef.current.caught, plushId];
        setLastPrize(`${plushName(plushId)} 인형을 잡았어요! 상품을 확인하는 중…`);
    };
    const finishPlay = async ({ playId, caught }) => {
        setPendingFinish({ playId, caught, error: '' });
        try {
            const done = await session.finishPlay(playId, caught);
            setPendingFinish(null);
            const prizeLine = done.prizes.map((prize) => `${prize.plush_name || plushName(prize.plush_id)} 인형! 상품: ${clawPrizeText(prize)}`).join(' · ');
            setLastPrize(done.consolationPoints
                ? `오늘 기회를 다 썼어요 — 문제를 풀었으니 ${done.consolationPoints}P를 받아요`
                : prizeLine || '아쉽게 놓쳤어요');
            const big = done.prizes.find((prize) => prize.kind === 'gift' || prize.kind === 'decor');
            if (big) setCelebration({ prize: celebrationPrize(big), plushName: big.plush_name || plushName(big.plush_id) });
            setData((current) => ({
                ...current,
                today: {
                    ...current.today, playingId: null, playsDone: current.today.playsDone + 1,
                    prizes: current.today.prizes + done.prizes.length,
                    consolationPoints: current.today.consolationPoints + done.consolationPoints
                },
                recent: caught.length || done.consolationPoints
                    ? [{ id: playId, at: new Date(), caught, prizes: done.prizes, consolationPoints: done.consolationPoints }, ...current.recent].slice(0, 30)
                    : current.recent,
                collection: caught.reduce((all, id) => ({ ...all, [id]: (Reflect.get(all, id) || 0) + 1 }), current.collection)
            }));
            if (typeof done.totalPoints === 'number') onPointsChange?.(done.totalPoints);
            onPlayResult?.({ ...done, caught, studentName: student.name });
            if (caught.length) { setRecordHold(6000); setRecordOpen(true); }
        } catch (error) {
            setPendingFinish({ playId, caught, error: error.message });
        }
    };
    const onRoundEnd = (won) => {
        setRoundActive(false);
        const { playId } = playRef.current;
        if (!playId) return;
        playRef.current = { playId: null, caught: [] };
        finishPlay({ playId, caught: won?.length ? won : [] });
    };
    const closeIntro = () => { markIntroSeen(); setIntroOpen(false); };

    const dragonSays = !quiz ? '문제를 준비하고 있어…'
        : finished
            ? (summary?.passed
                ? (summary.coinGranted ? dragonLine(dragonForm, 'pass') : '오늘 받을 코인은 다 받았어. 내일 또 하자!')
                : `${settings.passCount}개 이상 맞히면 코인을 줄게. 다시 해 보자!`)
            : result ? dragonLine(dragonForm, result.correct ? 'right' : 'wrong') : dragonLine(dragonForm, 'ask', question?.type);
    const plushesCaught = Object.values(data.collection).reduce((sum, count) => sum + Number(count || 0), 0);

    return <div className="claw-bench__student">
        {celebration && <ClawCelebration prize={celebration.prize} plushName={celebration.plushName} onClose={closeCelebration} />}
        {introOpen && <ClawIntroDialog
            speciesId={student.speciesId} writerLevel={student.writerLevel} passCount={settings.passCount}
            dailyPlays={settings.dailyPlays} minPoints={settings.minPoints} odds={data.odds} onClose={closeIntro}
        />}

        <section className="claw-bench__quiz" aria-label="수호룡의 맞춤법 문제">
            <aside className="claw-bench__host">
                <QuizDragon speciesId={student.speciesId} writerLevel={student.writerLevel} readerLevel={student.readerLevel} size="hero" line={dragonSays} />
            </aside>

            <div className="claw-bench__main">
                <div className="claw-bench__progress">
                    {question && !finished ? <div className="claw-bench__tags">
                        <span>{Reflect.get(SPELLING_QUIZ_TYPES, question.type)?.label}</span>
                        <span>{question.kind === 'write' ? '주관식' : '객관식'}</span>
                        <span>{Reflect.get(SOURCE_LABELS, question.source)}</span>
                    </div> : <span />}
                    <div className="claw-bench__score" aria-live="polite">
                        <strong>{Math.min(index + 1, questions.length || 10)}<small>/{questions.length || 10}</small></strong>
                        <span>맞힌 문제 <b>{score}</b> · 목표 <b>{settings.passCount}</b></span>
                    </div>
                </div>

                {quizError && <p className="claw-bench__error" role="alert">{quizError}</p>}

                {!quiz ? <div className="claw-bench__question">
                    <p className="claw-bench__prompt">{busy ? '문제를 받는 중…' : '문제를 받지 못했어요.'}</p>
                    {!busy && <button type="button" className="claw-bench__next" onClick={startQuiz}>다시 받기</button>}
                </div> : !finished ? <div className="claw-bench__question">
                    <p className="claw-bench__prompt"><Highlighted text={question.prompt} part={question.highlight} /></p>
                    {question.kind === 'choice' ? <div className="claw-bench__choices">
                        {question.choices.map((choice) => <button key={choice} type="button" disabled={busy} onClick={() => submit(choice)}
                            className={result ? (choice === result.answer ? 'is-right' : choice === picked ? 'is-wrong' : '') : ''}>{choice}</button>)}
                    </div> : <form className="claw-bench__write" onSubmit={(event) => { event.preventDefault(); submit(typed); }}>
                        <label><span>{question.hint}</span>
                            <input value={typed} onChange={(event) => setTyped(event.target.value)} disabled={Boolean(result) || busy} autoComplete="off" autoCapitalize="off" spellCheck={false} />
                        </label>
                        <button type="submit" disabled={Boolean(result) || busy || !typed.trim()}>확인</button>
                    </form>}
                    {result && <p className={`claw-bench__explain ${result.correct ? 'is-right' : 'is-wrong'}`}>
                        {result.correct ? '' : result.nearMiss ? '거의 맞았어요 — 띄어쓰기를 다시 보세요. ' : `정답: ${result.answer}. `}
                        {result.explanation}
                    </p>}
                    <button type="button" className="claw-bench__next" onClick={next} disabled={!result}>{index === questions.length - 1 ? '채점하기' : '다음 문제'}</button>
                </div> : <div className="claw-bench__question">
                    <p className="claw-bench__prompt">{score}/{questions.length} 맞혔어요 {summary?.passed ? '🎉' : ''}</p>
                    <button type="button" className="claw-bench__next" onClick={startQuiz} disabled={busy}>새 문제 10개</button>
                </div>}

                <footer className="claw-bench__counts">
                    <span>오늘 코인 <b>{today.coinsEarned}/{settings.dailyPlays}</b></span>
                    <span>뽑기 <b>{today.playsDone}/{settings.dailyPlays}</b></span>
                    <button type="button" className="claw-bench__intro-link" onClick={() => setIntroOpen(true)}>처음 안내 다시 보기</button>
                </footer>
            </div>
        </section>

        <section className={`claw-bench__claw${clawOpen ? ' is-open' : ''}`} aria-label="인형뽑기">
            {clawOpen ? <>
                {lastPrize && <p className="claw-bench__prize" role="status">{lastPrize}</p>}
                {pendingFinish?.error && <p className="claw-bench__error" role="alert">
                    {pendingFinish.error} <button type="button" onClick={() => finishPlay(pendingFinish)}>상품 다시 확인하기</button>
                </p>}
                <ClawMachineStage
                    coins={coins} quality={quality} difficulty={settings.grip}
                    onSpendCoin={spendCoin} onWon={onWon} onRoundEnd={onRoundEnd} onPerf={onPerf}
                />
            </> : <div className="claw-bench__locked">
                <span aria-hidden="true">🔒</span>
                <strong>목표를 달성하면 인형뽑기 창이 열려요</strong>
                {/* 한 판이 끝나 창이 잠겨도 방금 받은 상품은 크게 보인다(2026-10-02 작은 회색 글씨라 안 보였다). */}
                {lastPrize && <p className="claw-bench__prize" role="status">{lastPrize}</p>}
                <small>{today.coinsEarned >= settings.dailyPlays
                    ? '오늘 받을 수 있는 코인을 다 받았어요. 내일 또 만나요!'
                    : `문제 ${questions.length || 10}개 중 ${settings.passCount}개 이상 맞히면 코인 1개!`}</small>
            </div>}
        </section>

        <section className={`claw-bench__record${recordOpen ? ' is-open' : ''}`} aria-label="뽑기 기록">
            <button type="button" className="claw-bench__record-bar" aria-expanded={recordOpen}
                onClick={() => { setRecordHold(10000); setRecordOpen((open) => !open); }}>
                <span>🧸 뽑기 기록</span>
                <span>뽑은 인형 <b>{plushesCaught}</b>개 · 모은 종류 <b>{CLAW_PLUSHES.filter((plush) => Reflect.get(data.collection, plush.id)).length}</b>/{CLAW_PLUSHES.length}</span>
                <span aria-hidden="true">{recordOpen ? '▲ 닫기' : '▼ 펼쳐 보기'}</span>
            </button>
            {recordOpen && <div className="claw-bench__record-body">
                {/* 인형 도감(2026-10-02): 8종을 늘 보여 주고, 아직 못 뽑은 인형은 그림자와 `?` 로. 수는 서버 장부(모든 날)에서. */}
                <ul className="claw-bench__dex" aria-label="인형 도감">
                    {CLAW_PLUSHES.map((plush) => {
                        const count = Number(Reflect.get(data.collection, plush.id)) || 0;
                        return <li key={plush.id} className={count ? 'is-caught' : 'is-missing'}>
                            <img src={plush.thumb} alt="" loading="lazy" />
                            <span>{count ? plush.name : '?'}</span>
                            {count > 0 && <b>×{count}</b>}
                        </li>;
                    })}
                </ul>
                {data.recent.length === 0 ? <p>아직 뽑은 인형이 없어요. 목표를 달성하고 인형을 뽑아 보세요!</p>
                    : <ol className="claw-bench__record-list">
                        {data.recent.map((row) => <li key={row.id}>
                            <span>{row.caught.length ? row.caught.map(plushName).join(' · ') : '하루 기회를 다 씀'}</span>
                            <b>{row.prizes.length ? row.prizes.map((prize) => `${clawPrizeText(prize)}${prize.given_at ? ' (선생님이 줬어요)' : ''}`).join(' · ') : `${row.consolationPoints}P`}</b>
                        </li>)}
                    </ol>}
            </div>}
        </section>
    </div>;
}
