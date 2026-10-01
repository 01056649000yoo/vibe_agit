import { useEffect, useState } from 'react';
import ClawIntroDialog from './ClawIntroDialog';
import ClawMachineStage from './ClawMachineStage';
import QuizDragon from './QuizDragon';
import { dragonLine } from './dragonLines';
import { CLAW_PLUSHES } from './plushCatalog';
import { describeClawOdds, decorTierOf, eligibleClawDecor, rollClawPrize } from './prizeTable';
import {
    buildSpellingQuizPool, createSpellingQuiz, gradeSpellingAnswer, SPELLING_QUIZ_LEVELS, SPELLING_QUIZ_TYPES,
    spellingSourcesFromEntries, spellingSourcesFromLearningEntries
} from './quiz/spellingQuizBuilder';
import { getDragonStage } from '../dragon/presentation';
import { getReaderLevel, getWriterLevel } from '../../../constants/writerLevels';
import { getElementarySpellingEntries } from '../../writing/tools/spelling-lookup/elementarySpellingEntries';
import { supabase } from '../../../lib/supabaseClient';
import './clawTestBench.css';

/*
 * 수호룡의 인형뽑기 1단계 시험대(2026-10-01, 10-02 화면 정리). DB 에 쓰지 않고 흐름을 본다.
 *   위: **대상 학생이 지금 키우는 수호룡**이 크게 나와 맞춤법 10문제를 낸다(작가 단계에 따라 그림·말투가 자란다).
 *   아래: 목표(교사가 정한 정답 수)를 달성하면 인형뽑기 창이 열린다. 상품 확률은 도움말·처음 안내에만 둔다.
 * 교사 놀이터(관리자만)와 실험실이 같은 부품을 쓴다. 실험실처럼 학급이 없으면 견본 수호룡 셋으로 본다.
 * ⚠️ 코인·상품·포인트는 화면에서만 흉내 낸다. 2단계에서 서버가 코인을 세고 상품을 뽑는다.
 */
const SAMPLE_GIFTS = [{ id: 'seat', name: '자리 고르기권' }, { id: 'lunch', name: '급식 먼저 먹기권' }];
// 수호룡 상점 견본(실제 카탈로그의 등급·가격 구성). 대상 학생의 작가 단계로 거른다.
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
// 학급이 없을 때(실험실) 보여 줄 견본 학생 — 알·해츨링·자란 수호룡.
const SAMPLE_STUDENTS = [
    { id: 'sample-egg', name: '견본 · 알', speciesId: 'star', writerLevel: 1, readerLevel: 1 },
    { id: 'sample-hatch', name: '견본 · 해츨링', speciesId: 'forest', writerLevel: 4, readerLevel: 2 },
    { id: 'sample-grown', name: '견본 · 자란 수호룡', speciesId: 'ember', writerLevel: 8, readerLevel: 4 }
];
// 문제 묶음: 기본 사전 + 공통 자료. 2단계에서는 서버가 같은 코드로 만든다.
const QUIZ_POOL = buildSpellingQuizPool([
    ...spellingSourcesFromLearningEntries(SAMPLE_COMMON, 'common'),
    ...spellingSourcesFromEntries(getElementarySpellingEntries())
]);
const SOURCE_LABELS = { base: '기본 사전', common: '공통 자료', class: '우리 반 자료' };
const QUIZ_COUNT = 10;

// 처음 들어온 사람에게 한 번 수호룡이 놀이와 상품 확률을 알려 준다. 이 브라우저에만 기억한다.
const INTRO_SEEN_KEY = 'spelling-claw-intro-seen-v1';
const readIntroSeen = () => { try { return window.localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch { return false; } };
const markIntroSeen = () => { try { window.localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* 저장 못 해도 다음에 한 번 더 보일 뿐 */ } };

/** 학급의 수호룡 현황(교사 학생 아지트 화면과 같은 RPC). 학생이 지금 키우는 수호룡의 종류·작가 단계를 얻는다. */
const toStudent = (raw) => ({
    id: raw.student_id,
    name: raw.name || '이름 없음',
    speciesId: raw.pet_data?.species,
    writerLevel: getWriterLevel(raw.writer_total_chars, raw.writer_completed_posts, raw.writer_level_override).level,
    readerLevel: getReaderLevel(raw.reader_score, raw.reader_level_override).level
});

/** 고칠 곳을 빨갛게 보여 준다. */
const Highlighted = ({ text, part }) => {
    const at = part ? text.indexOf(part) : -1;
    if (at < 0) return text;
    return <>{text.slice(0, at)}<mark>{part}</mark>{text.slice(at + part.length)}</>;
};

const prizeText = (prize) => prize.kind === 'points' ? `${prize.points}P`
    : prize.kind === 'gift' ? `🎁 ${prize.gift.name}` : `🐉 ${prize.item.name}`;

export default function ClawTestBench({ activeClass }) {
    const classId = activeClass?.id || null;
    const [students, setStudents] = useState(classId ? [] : SAMPLE_STUDENTS);
    const [studentsNote, setStudentsNote] = useState(classId ? '학생 수호룡을 불러오는 중…' : '');
    const [studentId, setStudentId] = useState(classId ? '' : SAMPLE_STUDENTS[1].id);

    const [passCount, setPassCount] = useState(7);
    const [dailyPlays, setDailyPlays] = useState(3);
    const [minPoints, setMinPoints] = useState(20);
    const [difficulty, setDifficulty] = useState('easy');
    const [quality, setQuality] = useState('auto');
    const [level, setLevel] = useState('normal');
    const [introOpen, setIntroOpen] = useState(() => !readIntroSeen());

    const makeQuiz = (levelId) => createSpellingQuiz(QUIZ_POOL, { count: QUIZ_COUNT, writeCount: Reflect.get(SPELLING_QUIZ_LEVELS, levelId)?.writeCount ?? 4 });
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
    const [roundActive, setRoundActive] = useState(false);
    const [lastPrize, setLastPrize] = useState('');
    const [book, setBook] = useState({});
    const [thumbs, setThumbs] = useState({});
    const [perf, setPerf] = useState(null);
    const [consolationGiven, setConsolationGiven] = useState(false);
    const [earnedThisQuiz, setEarnedThisQuiz] = useState(false);

    useEffect(() => {
        if (!classId) return undefined;
        let cancelled = false;
        supabase.rpc('get_teacher_dragon_growth_dashboard', { p_class_id: classId }).then(({ data, error }) => {
            if (cancelled) return;
            const list = error ? [] : (data?.students || []).slice(0, 100).map(toStudent);
            setStudents(list.length ? list : SAMPLE_STUDENTS);
            setStudentsNote(error ? '학생 수호룡을 불러오지 못해 견본으로 보여요.' : list.length ? '' : '학생이 없어 견본으로 보여요.');
            setStudentId((list[0] || SAMPLE_STUDENTS[1]).id);
        });
        return () => { cancelled = true; };
    }, [classId]);

    const student = students.find((item) => item.id === studentId) || students[0] || SAMPLE_STUDENTS[1];
    const dragonForm = getDragonStage(student.writerLevel, student.speciesId).form;
    // 가벼운 계산이라 그때그때 한다(대상 학생 작가 단계로 거른 수호룡 아이템·공개 확률).
    const eligibleDecor = eligibleClawDecor(SAMPLE_DECOR, { writerLevel: student.writerLevel, readerLevel: student.readerLevel });
    const odds = describeClawOdds({
        hasGifts: SAMPLE_GIFTS.length > 0,
        decorTiers: [...new Set(eligibleDecor.map(decorTierOf))]
    });

    const finished = index >= quiz.length;
    const question = quiz.at(index);
    // 뽑기 창은 코인이 있거나 한 판이 진행 중일 때만 열린다(목표를 달성해야 열린다).
    const clawOpen = coins > 0 || roundActive;

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
            const earned = score >= passCount && coinsEarned < dailyPlays;
            setEarnedThisQuiz(earned);
            if (earned) {
                setCoins((value) => value + 1);
                setCoinsEarned((value) => value + 1);
            }
        }
    };
    const restartQuiz = (levelId = level) => {
        setQuiz(makeQuiz(levelId)); setIndex(0); setPicked(''); setTyped(''); setResult(null); setScore(0);
    };
    const onWon = (plushId, thumb) => {
        const plush = CLAW_PLUSHES.find((item) => item.id === plushId);
        setBook((current) => ({ ...current, [plushId]: (Reflect.get(current, plushId) || 0) + 1 }));
        if (thumb) setThumbs((current) => ({ ...current, [plushId]: thumb }));
        setWinsToday((value) => value + 1);
        setLastPrize(`${plush?.name || plushId} 인형! 상품: ${prizeText(rollClawPrize({ gifts: SAMPLE_GIFTS, eligibleDecor }))}`);
    };
    const onRoundEnd = (won) => {
        setRoundActive(false);
        const used = playsUsed + 1;
        setPlaysUsed(used);
        if (won.length === 0) setLastPrize('아쉽게 놓쳤어요');
        if (used >= dailyPlays && winsToday + won.length === 0 && !consolationGiven) {
            setConsolationGiven(true);
            setLastPrize(`오늘 기회를 다 썼어요 — 문제를 풀었으니 ${minPoints}P를 받아요`);
        }
    };
    const resetDay = () => {
        setCoins(0); setCoinsEarned(0); setPlaysUsed(0); setWinsToday(0); setConsolationGiven(false); setLastPrize(''); setRoundActive(false);
    };
    const closeIntro = () => { markIntroSeen(); setIntroOpen(false); };

    const dragonSays = finished
        ? (score >= passCount
            ? (earnedThisQuiz ? dragonLine(dragonForm, 'pass') : '오늘 받을 코인은 다 받았어. 내일 또 하자!')
            : `${passCount}개 이상 맞히면 코인을 줄게. 다시 해 보자!`)
        : result ? dragonLine(dragonForm, result.correct ? 'right' : 'wrong') : dragonLine(dragonForm, 'ask', question.type);

    return <div className="claw-bench">
        {introOpen && <ClawIntroDialog
            speciesId={student.speciesId} writerLevel={student.writerLevel} passCount={passCount} dailyPlays={dailyPlays}
            minPoints={minPoints} odds={odds} onClose={closeIntro}
        />}

        <section className="claw-bench__settings" aria-label="교사 설정(시험)">
            <label>대상 학생 <select value={student.id} onChange={(event) => setStudentId(event.target.value)}>
                {students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <label>목표 <select value={passCount} onChange={(event) => setPassCount(Number(event.target.value))}>
                {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}/10</option>)}
            </select></label>
            <label>하루 기회 <select value={dailyPlays} onChange={(event) => setDailyPlays(Number(event.target.value))}>
                {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}번</option>)}
            </select></label>
            <label>난이도 <select value={level} onChange={(event) => { setLevel(event.target.value); restartQuiz(event.target.value); }}>
                {Object.values(SPELLING_QUIZ_LEVELS).map((item) => <option key={item.id} value={item.id}>{item.label}(주관식 {item.writeCount})</option>)}
            </select></label>
            <label>최소 포인트 <select value={minPoints} onChange={(event) => setMinPoints(Number(event.target.value))}>
                {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}P</option>)}
            </select></label>
            <label>집게 힘 <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="easy">튼튼</option><option value="normal">보통</option><option value="hard">흐물</option>
            </select></label>
            <label>화질 <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                <option value="auto">보통</option><option value="low">가볍게(태블릿)</option>
            </select></label>
            <div className="claw-bench__tools">
                {perf && <span className="claw-bench__perf">{perf.fps}fps</span>}
                <button type="button" onClick={() => setCoins((value) => value + 1)}>코인 +1 (시험용)</button>
                <button type="button" onClick={resetDay}>하루 새로 시작</button>
            </div>
            {studentsNote && <p className="claw-bench__note">{studentsNote}</p>}
        </section>

        <section className="claw-bench__quiz" aria-label="수호룡의 맞춤법 문제">
            <div className="claw-bench__host">
                <QuizDragon speciesId={student.speciesId} writerLevel={student.writerLevel} readerLevel={student.readerLevel} size="large" line={dragonSays} />
                <div className="claw-bench__score" aria-live="polite">
                    <strong>{Math.min(index + 1, QUIZ_COUNT)}<small>/{QUIZ_COUNT}</small></strong>
                    <span>맞힌 문제 <b>{score}</b> · 목표 <b>{passCount}</b></span>
                </div>
            </div>

            {!finished ? <div className="claw-bench__question">
                <div className="claw-bench__tags">
                    <span>{Reflect.get(SPELLING_QUIZ_TYPES, question.type)?.label}</span>
                    <span>{question.kind === 'write' ? '주관식' : '객관식'}</span>
                    <span>{Reflect.get(SOURCE_LABELS, question.source)}</span>
                </div>
                <p className="claw-bench__prompt"><Highlighted text={question.prompt} part={question.highlight} /></p>
                {question.kind === 'choice' ? <div className="claw-bench__choices">
                    {question.choices.map((choice) => <button key={choice} type="button" onClick={() => submit(choice)}
                        className={result ? (choice === question.answer ? 'is-right' : choice === picked ? 'is-wrong' : '') : ''}>{choice}</button>)}
                </div> : <form className="claw-bench__write" onSubmit={(event) => { event.preventDefault(); submit(typed); }}>
                    <label><span>{question.hint}</span>
                        <input value={typed} onChange={(event) => setTyped(event.target.value)} disabled={Boolean(result)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
                    </label>
                    <button type="submit" disabled={Boolean(result) || !typed.trim()}>확인</button>
                </form>}
                {result && <p className={`claw-bench__explain ${result.correct ? 'is-right' : 'is-wrong'}`}>
                    {result.correct ? '' : result.nearMiss ? '거의 맞았어요 — 띄어쓰기를 다시 보세요. ' : `정답: ${question.answer}. `}
                    {question.explanation}
                </p>}
                <button type="button" className="claw-bench__next" onClick={next} disabled={!result}>{index === QUIZ_COUNT - 1 ? '채점하기' : '다음 문제'}</button>
            </div> : <div className="claw-bench__question">
                <p className="claw-bench__prompt">{score}/{QUIZ_COUNT} 맞혔어요 {score >= passCount ? '🎉' : ''}</p>
                <button type="button" className="claw-bench__next" onClick={() => restartQuiz()}>새 문제 10개</button>
            </div>}

            <footer className="claw-bench__counts">
                <span>오늘 코인 <b>{coinsEarned}/{dailyPlays}</b></span>
                <span>뽑기 <b>{playsUsed}/{dailyPlays}</b></span>
                <button type="button" className="claw-bench__intro-link" onClick={() => setIntroOpen(true)}>처음 안내 다시 보기</button>
            </footer>
        </section>

        <section className={`claw-bench__claw${clawOpen ? ' is-open' : ''}`} aria-label="인형뽑기">
            {clawOpen ? <>
                {lastPrize && <p className="claw-bench__prize" role="status">{lastPrize}</p>}
                <ClawMachineStage
                    coins={coins} quality={quality} difficulty={difficulty}
                    onSpendCoin={() => { if (coins <= 0) return false; setCoins((value) => value - 1); setRoundActive(true); return true; }}
                    onWon={onWon} onRoundEnd={onRoundEnd} onPerf={setPerf}
                />
            </> : <div className="claw-bench__locked">
                <span aria-hidden="true">🔒</span>
                <strong>목표를 달성하면 인형뽑기 창이 열려요</strong>
                <small>{lastPrize || `문제 ${QUIZ_COUNT}개 중 ${passCount}개 이상 맞히면 코인 1개!`}</small>
            </div>}
            <div className="claw-bench__book" aria-label="인형 도감">
                {CLAW_PLUSHES.map((plush) => <div key={plush.id} className={Reflect.get(book, plush.id) ? 'is-got' : ''}>
                    {Reflect.get(thumbs, plush.id) ? <img src={Reflect.get(thumbs, plush.id)} alt="" /> : <span aria-hidden="true">?</span>}
                    <small>{Reflect.get(book, plush.id) ? `${plush.name} ×${Reflect.get(book, plush.id)}` : '???'}</small>
                </div>)}
            </div>
        </section>
    </div>;
}
