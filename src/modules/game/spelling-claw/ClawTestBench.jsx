import { useMemo, useState } from 'react';
import ClawIntroDialog from './ClawIntroDialog';
import QuizDragon from './QuizDragon';
import { dragonLine } from './dragonLines';
import { DRAGON_SPECIES, getDragonStage } from '../dragon/presentation';
import ClawMachineStage from './ClawMachineStage';
import { CLAW_PLUSHES } from './plushCatalog';
import { describeClawOdds, eligibleClawDecor, rollClawPrize, decorTierOf } from './prizeTable';
import { getElementarySpellingEntries } from '../../writing/tools/spelling-lookup/elementarySpellingEntries';
import {
    buildSpellingQuizPool, createSpellingQuiz, gradeSpellingAnswer, SPELLING_QUIZ_LEVELS, SPELLING_QUIZ_TYPES,
    spellingSourcesFromEntries, spellingSourcesFromLearningEntries
} from './quiz/spellingQuizBuilder';
import './clawTestBench.css';

/*
 * 수호룡의 인형뽑기 1단계 시제품(2026-10-01). DB 없이 한 화면에서 흐름과 태블릿 성능을 본다.
 * 문제는 학생이 키운 수호룡이 낸다(작가 단계에 따라 그림·말투가 자란다). 처음 들어오면 수호룡이 놀이와 상품 확률을 알려 준다.
 * 실험실(`?dev-lab=spelling-claw`)과 관리자 화면 `📚 검수 → 🧸 인형뽑기 시험` 이 같은 부품을 쓴다(관리자만 시험).
 *   맞춤법 10문제(기본 500개에서) → 교사가 정한 개수 이상 맞히면 코인 1개(하루 기회 수까지)
 *   → 인형뽑기 → 인형을 뽑으면 상품 추첨(확률표 기본안) → 하루 기회를 다 쓰고 하나도 못 뽑았으면 최소 포인트.
 * ⚠️ 여기서는 코인·상품·포인트를 **화면에서만** 흉내 낸다. 2단계에서 서버가 코인을 세고 상품을 뽑는다.
 */
const SAMPLE_GIFTS = [{ id: 'seat', name: '자리 고르기권' }, { id: 'lunch', name: '급식 먼저 먹기권' }];
// 수호룡 상점 견본(실제 카탈로그의 등급·가격 구성). 작가 단계 3 학생 기준으로 거른다.
const SAMPLE_DECOR = [
    { id: 'starter-a', name: '새싹 받침대', rarity: 'starter', price: 300, requiredWriterLevel: 1 },
    { id: 'starter-b', name: '별빛 문패', rarity: 'starter', price: 300, requiredWriterLevel: 1 },
    { id: 'common-a', name: '구름 프레임', rarity: 'common', price: 700, requiredWriterLevel: 3 },
    { id: 'rare-a', name: '무지개 소품', rarity: 'rare', price: 1500, requiredWriterLevel: 5 },
    { id: 'legend', name: '전설의 황금 성소', rarity: 'legendary', price: 0, requiredWriterLevel: 10, acquisitionType: 'achievement' }
];

// 관리자가 게시한 실제 공통 자료 몇 개(2026-10-01 운영 DB에서 옮김). 게시된 자료가 저절로 출제되는지 보는 견본이다.
const SAMPLE_COMMON = [
    { id: 'sample-1', status: 'approved', wrong_expression: '되던해', correct_expression: '되던 해', label: '되던 해 띄어쓰기', explanation: '‘해’가 명사로 쓰일 때는 앞말과 띄어 써요.', examples: ['어릴 때 되던 해를 떠올렸다.'] },
    { id: 'sample-2', status: 'approved', wrong_expression: '할 수있을', correct_expression: '할 수 있을', label: '할 수 있다 띄어쓰기', explanation: '‘수’는 앞뒤 말을 띄어 써요.', examples: ['나는 내일 갈 수 있을 것 같다.'] },
    { id: 'sample-3', status: 'approved', wrong_expression: '완성 될', correct_expression: '완성될', label: '완성될 띄어쓰기', explanation: '‘완성되다’는 한 낱말이므로 붙여 써요.', examples: ['곧 완성될 작품이다.'] },
    { id: 'sample-4', status: 'approved', wrong_expression: '돼었으면', correct_expression: '되었으면', label: '되었으면 / 돼었으면', explanation: '‘되다’에 ‘-었으면’이 붙은 말이에요.', examples: ['일이 잘 되었으면 좋겠다.'] }
];
// 문제 묶음: 기본 사전 + 공통 자료. 2단계에서는 서버가 같은 코드로 만든다.
const QUIZ_POOL = buildSpellingQuizPool([
    ...spellingSourcesFromLearningEntries(SAMPLE_COMMON, 'common'),
    ...spellingSourcesFromEntries(getElementarySpellingEntries())
]);
const SOURCE_LABELS = { base: '기본 사전', common: '공통 자료', class: '우리 반 자료' };

/** 고칠 곳을 굵게 보여 준다. */
const Highlighted = ({ text, part }) => {
    const at = part ? text.indexOf(part) : -1;
    if (at < 0) return text;
    return <>{text.slice(0, at)}<mark>{part}</mark>{text.slice(at + part.length)}</>;
};

// 처음 들어온 사람에게 한 번 수호룡이 놀이와 상품 확률을 알려 준다. 이 브라우저에만 기억한다.
const INTRO_SEEN_KEY = 'spelling-claw-intro-seen-v1';
const readIntroSeen = () => { try { return window.localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch { return false; } };
const markIntroSeen = () => { try { window.localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* 저장 못 해도 다음에 한 번 더 보일 뿐 */ } };

const prizeText = (prize) => prize.kind === 'points' ? `${prize.points}P`
    : prize.kind === 'gift' ? `🎁 ${prize.gift.name}` : `🐉 ${prize.item.name}`;

export default function ClawTestBench() {
    const [passCount, setPassCount] = useState(7);
    const [dailyPlays, setDailyPlays] = useState(3);
    const [minPoints, setMinPoints] = useState(20);
    const [difficulty, setDifficulty] = useState('easy');
    const [quality, setQuality] = useState('auto');
    const [writerLevel, setWriterLevel] = useState(3);
    const [level, setLevel] = useState('normal');
    // 2단계에서는 학생이 키운 수호룡(종류·작가 단계)이 그대로 들어온다. 시험대에서는 골라서 자라는 모습을 본다.
    const [speciesId, setSpeciesId] = useState('forest');
    const [introOpen, setIntroOpen] = useState(() => !readIntroSeen());
    const closeIntro = () => { markIntroSeen(); setIntroOpen(false); };

    const makeQuiz = (levelId) => createSpellingQuiz(QUIZ_POOL, { writeCount: Reflect.get(SPELLING_QUIZ_LEVELS, levelId)?.writeCount ?? 4 });
    const [quiz, setQuiz] = useState(() => makeQuiz('normal'));
    const [index, setIndex] = useState(0);
    const [picked, setPicked] = useState('');
    const [typed, setTyped] = useState('');
    const [result, setResult] = useState(null);
    const [score, setScore] = useState(0);
    const [coins, setCoins] = useState(0);
    const [coinsEarned, setCoinsEarned] = useState(0);
    const [playsUsed, setPlaysUsed] = useState(0);
    const [winsToday, setWinsToday] = useState(0);
    const [log, setLog] = useState([]);
    const [book, setBook] = useState({});
    const [thumbs, setThumbs] = useState({});
    const [perf, setPerf] = useState(null);
    const [consolationGiven, setConsolationGiven] = useState(false);

    const eligibleDecor = useMemo(() => eligibleClawDecor(SAMPLE_DECOR, { writerLevel, readerLevel: 7 }), [writerLevel]);
    const odds = useMemo(() => describeClawOdds({
        hasGifts: SAMPLE_GIFTS.length > 0,
        decorTiers: [...new Set(eligibleDecor.map(decorTierOf))]
    }), [eligibleDecor]);
    const finished = index >= quiz.length;
    const question = quiz.at(index);
    const addLog = (text) => setLog((rows) => [{ id: `${Date.now()}-${Math.random()}`, text }, ...rows].slice(0, 12));

    // 객관식은 누르면, 주관식은 `확인` 을 누르면 채점한다. 채점 규칙은 spellingQuizBuilder 한 곳.
    const submit = (value) => {
        if (result || finished) return;
        const graded = gradeSpellingAnswer(question, value);
        setPicked(value);
        setResult(graded);
        if (graded.correct) setScore((current) => current + 1);
    };
    const next = () => {
        if (!result) return;
        const nextIndex = index + 1;
        setIndex(nextIndex);
        setPicked('');
        setTyped('');
        setResult(null);
        if (nextIndex >= quiz.length) {
            const finalScore = score;
            if (finalScore >= passCount && coinsEarned < dailyPlays) {
                setCoins((value) => value + 1);
                setCoinsEarned((value) => value + 1);
                addLog(`퀴즈 ${finalScore}/10 통과 → 코인 1개`);
            } else if (finalScore >= passCount) {
                addLog(`퀴즈 ${finalScore}/10 통과 — 오늘 기회 ${dailyPlays}번을 다 받았어요`);
            } else {
                addLog(`퀴즈 ${finalScore}/10 — ${passCount}개 이상 맞히면 코인을 받아요`);
            }
        }
    };
    const restartQuiz = (levelId = level) => { setQuiz(makeQuiz(levelId)); setIndex(0); setPicked(''); setTyped(''); setResult(null); setScore(0); };

    const onWon = (plushId, thumb) => {
        const plush = CLAW_PLUSHES.find((item) => item.id === plushId);
        setBook((current) => ({ ...current, [plushId]: (Reflect.get(current, plushId) || 0) + 1 }));
        if (thumb) setThumbs((current) => ({ ...current, [plushId]: thumb }));
        setWinsToday((value) => value + 1);
        const prize = rollClawPrize({ gifts: SAMPLE_GIFTS, eligibleDecor });
        addLog(`${plush?.name || plushId} 인형! 상품: ${prizeText(prize)}`);
    };
    const onRoundEnd = (won) => {
        const used = playsUsed + 1;
        setPlaysUsed(used);
        if (won.length === 0) addLog('아쉽게 놓쳤어요');
        if (used >= dailyPlays && winsToday + won.length === 0 && !consolationGiven) {
            setConsolationGiven(true);
            addLog(`오늘 기회를 다 썼어요 — 문제를 풀었으니 최소 ${minPoints}P`);
        }
    };
    const resetDay = () => { setCoins(0); setCoinsEarned(0); setPlaysUsed(0); setWinsToday(0); setConsolationGiven(false); setLog([]); };

    const dragonForm = getDragonStage(writerLevel, speciesId).form;

    return <div className="claw-preview">
        {introOpen && <ClawIntroDialog
            speciesId={speciesId} writerLevel={writerLevel} passCount={passCount} dailyPlays={dailyPlays}
            minPoints={minPoints} odds={odds} onClose={closeIntro}
        />}
        <section className="claw-preview__settings" aria-label="교사 설정(시제품)">
            <strong>교사 설정</strong>
            <label>통과 기준 <select value={passCount} onChange={(e) => setPassCount(Number(e.target.value))}>{[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}/10</option>)}</select></label>
            <label>하루 기회 <select value={dailyPlays} onChange={(e) => setDailyPlays(Number(e.target.value))}>{[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}번</option>)}</select></label>
            <label>퀴즈 난이도 <select value={level} onChange={(e) => { setLevel(e.target.value); restartQuiz(e.target.value); }}>
                {Object.values(SPELLING_QUIZ_LEVELS).map((item) => <option key={item.id} value={item.id}>{item.label}(주관식 {item.writeCount})</option>)}
            </select></label>
            <label>최소 포인트 <select value={minPoints} onChange={(e) => setMinPoints(Number(e.target.value))}>{[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}P</option>)}</select></label>
            <label>집게 힘 <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="easy">튼튼</option><option value="normal">보통</option><option value="hard">흐물</option></select></label>
            <label>수호룡 <select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
                {DRAGON_SPECIES.map((species) => <option key={species.id} value={species.id}>{species.shortName}</option>)}
            </select></label>
            <label>학생 작가 단계 <select value={writerLevel} onChange={(e) => setWriterLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label>화질 <select value={quality} onChange={(e) => setQuality(e.target.value)}><option value="auto">보통</option><option value="low">가볍게(태블릿)</option></select></label>
            <span className="claw-preview__perf">{perf ? `${perf.fps}fps · 물리 ${perf.stepMs}ms` : '측정 중…'}</span>
            <button type="button" onClick={() => setCoins((value) => value + 1)}>코인 +1 (시험용)</button>
            <button type="button" onClick={resetDay}>하루 새로 시작</button>
        </section>

        <div className="claw-preview__main">
            <aside className="claw-preview__side">
                <section className="claw-preview__card" aria-label="수호룡의 맞춤법 문제">
                    <header><b>수호룡의 맞춤법 문제</b><span>{Math.min(index + 1, 10)}/10 · 맞힘 {score} · 기준 {passCount}</span></header>
                    <QuizDragon speciesId={speciesId} writerLevel={writerLevel} compact line={
                        finished ? (score >= passCount ? dragonLine(dragonForm, 'pass') : `${passCount}개 이상 맞히면 코인을 줄게. 다시 해 보자!`)
                            : result ? (result.correct ? dragonLine(dragonForm, 'right') : dragonLine(dragonForm, 'wrong'))
                                : dragonLine(dragonForm, 'ask', question.type)
                    } />
                    {!finished ? <>
                        <div className="claw-preview__tags">
                            <span>{Reflect.get(SPELLING_QUIZ_TYPES, question.type)?.label}</span>
                            <span>{question.kind === 'write' ? '주관식' : '객관식'}</span>
                            <span>{Reflect.get(SOURCE_LABELS, question.source)}</span>
                        </div>
                        <p className="claw-preview__prompt"><Highlighted text={question.prompt} part={question.highlight} /></p>
                        {question.kind === 'choice' ? <div className="claw-preview__choices">
                            {question.choices.map((choice) => <button key={choice} type="button" onClick={() => submit(choice)}
                                className={result ? (choice === question.answer ? 'is-right' : choice === picked ? 'is-wrong' : '') : ''}>{choice}</button>)}
                        </div> : <form className="claw-preview__write" onSubmit={(e) => { e.preventDefault(); submit(typed); }}>
                            <label><span>{question.hint}</span>
                                <input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={Boolean(result)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
                            </label>
                            <button type="submit" disabled={Boolean(result) || !typed.trim()}>확인</button>
                        </form>}
                        {result && <p className={`claw-preview__explain ${result.correct ? 'is-right' : 'is-wrong'}`}>
                            {result.correct ? '' : result.nearMiss ? '거의 맞았어요 — 띄어쓰기를 다시 보세요. ' : `정답: ${question.answer}. `}
                            {question.explanation}
                        </p>}
                        <button type="button" className="claw-preview__next" onClick={next} disabled={!result}>{index === 9 ? '채점' : '다음'}</button>
                    </> : <>
                        <p className="claw-preview__prompt">{score}/10 맞혔어요 {score >= passCount ? '🎉' : ''}</p>
                        <button type="button" className="claw-preview__next" onClick={() => restartQuiz()}>새 10문제</button>
                    </>}
                    <footer>오늘 코인 {coinsEarned}/{dailyPlays} · 뽑기 {playsUsed}/{dailyPlays}
                        <button type="button" className="claw-preview__intro-link" onClick={() => setIntroOpen(true)}>처음 안내 다시 보기</button>
                    </footer>
                </section>

                <section className="claw-preview__card" aria-label="상품 확률(기본안)">
                    <header><b>상품 확률</b><span>인형을 뽑았을 때</span></header>
                    <ul className="claw-preview__odds">
                        {odds.points.map((row) => <li key={row.label}><span>{row.label}</span><b>{row.percent}%</b></li>)}
                        {odds.gift > 0 && <li><span>🎁 선생님 선물</span><b>{odds.gift}%</b></li>}
                        {odds.decor.map((row) => <li key={row.label}><span>🐉 수호룡 {row.label}</span><b>{row.percent}%</b></li>)}
                    </ul>
                </section>

                <section className="claw-preview__card" aria-label="기록">
                    <header><b>기록</b></header>
                    <ol className="claw-preview__log">{log.length ? log.map((row) => <li key={row.id}>{row.text}</li>) : <li>퀴즈를 통과해 코인을 받아 보세요.</li>}</ol>
                </section>
            </aside>

            <div className="claw-preview__machine">
                <ClawMachineStage
                    coins={coins} quality={quality} difficulty={difficulty}
                    onSpendCoin={() => { if (coins <= 0) return false; setCoins((value) => value - 1); return true; }}
                    onWon={onWon} onRoundEnd={onRoundEnd} onPerf={setPerf}
                />
                <section className="claw-preview__book" aria-label="인형 도감">
                    {CLAW_PLUSHES.map((plush) => <div key={plush.id} className={book[plush.id] ? 'is-got' : ''}>
                        {thumbs[plush.id] ? <img src={thumbs[plush.id]} alt="" /> : <span aria-hidden="true">?</span>}
                        <small>{book[plush.id] ? `${plush.name} ×${book[plush.id]}` : '???'}</small>
                    </div>)}
                </section>
            </div>
        </div>
    </div>;
}
