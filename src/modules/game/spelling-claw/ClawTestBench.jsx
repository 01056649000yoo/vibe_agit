import { useCallback, useEffect, useState } from 'react';
import ClawCelebration from './ClawCelebration';
import ClawIntroDialog from './ClawIntroDialog';
import ClawMachineStage from './ClawMachineStage';
import QuizDragon from './QuizDragon';
import { dragonLine } from './dragonLines';
import { CLAW_PLUSHES } from './plushCatalog';
import ClawPrizeSettings from './ClawPrizeSettings';
import {
    CLAW_DEFAULT_PRIZE_SETTINGS, describeClawOdds, decorTierOf, eligibleClawDecor, normalizeClawPrizeSettings, rollClawPrize
} from './prizeTable';
import {
    buildSpellingQuizPool, createSpellingQuiz, gradeSpellingAnswer, SPELLING_QUIZ_LEVELS, SPELLING_QUIZ_TYPES,
    spellingSourcesFromEntries, spellingSourcesFromLearningEntries
} from './quiz/spellingQuizBuilder';
import { getDragonStage } from '../dragon/presentation';
import { getReaderLevel, getWriterLevel } from '../../../constants/writerLevels';
import { getElementarySpellingEntries } from '../../writing/tools/spelling-lookup/elementarySpellingEntries';
import { supabase } from '../../../lib/supabaseClient';
import { resolveActivityNotification } from '../../notifications/registry';
import './clawTestBench.css';

/*
 * 수호룡의 인형뽑기 1단계 시험대(2026-10-01, 10-02 화면 정리). DB 에 쓰지 않고 흐름을 본다.
 *   위: **대상 학생이 지금 키우는 수호룡**이 크게 나와 맞춤법 10문제를 낸다(작가 단계에 따라 그림·말투가 자란다).
 *   아래: 목표(교사가 정한 정답 수)를 달성하면 인형뽑기 창이 열린다. 상품 확률은 도움말·처음 안내에만 둔다.
 * 교사 놀이터(관리자만)와 실험실이 같은 부품을 쓴다. 실험실처럼 학급이 없으면 견본 수호룡 셋으로 본다.
 * ⚠️ 코인·상품·포인트는 화면에서만 흉내 낸다. 2단계에서 서버가 코인을 세고 상품을 뽑는다.
 */
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

// 교사 상품 설정 — 1단계는 이 브라우저에만 둔다. 2단계에서 학급 설정(DB)으로 옮기고 서버가 같은 검증으로 읽는다.
// v2(2026-10-02): 비중 → 상품마다 확률(%) 합 100. 옛 v1 값은 형식이 달라 읽지 않는다(기본값부터).
// v3(2026-10-02): 기본값을 포인트 90·아이템 9·선물 1%로 바꿔, 예전에 저장한 시험 설정 대신 새 기본값에서 시작한다.
const PRIZE_SETTINGS_KEY = 'spelling-claw-prize-settings-v3';
const readPrizeSettings = () => {
    try {
        const saved = window.localStorage.getItem(PRIZE_SETTINGS_KEY);
        return saved ? normalizeClawPrizeSettings(JSON.parse(saved)) : structuredClone(CLAW_DEFAULT_PRIZE_SETTINGS);
    } catch { return structuredClone(CLAW_DEFAULT_PRIZE_SETTINGS); }
};
const savePrizeSettings = (draft) => { try { window.localStorage.setItem(PRIZE_SETTINGS_KEY, JSON.stringify(draft)); } catch { /* 저장 못 해도 이번 화면에서는 쓴다 */ } };

// 탭: 교사 관리(학급 전체 설정·상품 설정) / 학생 화면(학생이 보는 그대로 미리 해 보기). 마지막 탭을 이 브라우저에 기억한다.
const BENCH_TABS = [
    { id: 'manage', icon: '🛠️', label: '교사 관리' },
    { id: 'student', icon: '🧒', label: '학생 화면' },
    { id: 'history', icon: '📜', label: '뽑기 내역' }
];
const TAB_KEY = 'spelling-claw-bench-tab-v1';
const readTab = () => { try { const saved = window.localStorage.getItem(TAB_KEY); return BENCH_TABS.some((item) => item.id === saved) ? saved : 'manage'; } catch { return 'manage'; } };
const saveTab = (id) => { try { window.localStorage.setItem(TAB_KEY, id); } catch { /* 다음에 교사 관리부터 보일 뿐 */ } };

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
    const [tab, setTab] = useState(readTab);
    const changeTab = (next) => { setTab(next); saveTab(next); };

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
    // 뽑기 누적 기록: 아래 띠를 펼쳐 보고, 10초 뒤 저절로 닫힌다. 새로 뽑으면 잠깐 열어 보여 준다.
    const [history, setHistory] = useState([]);
    // 큰 상품(선생님 선물·수호룡 아이템) 당첨 축하 화면.
    const [celebration, setCelebration] = useState(null);
    const [historyFilter, setHistoryFilter] = useState('all');
    // 시험용 축하 미리보기: 누를 때마다 선물·수호룡 아이템을 번갈아 보인다.
    const [celebrationSample, setCelebrationSample] = useState(0);
    const [recordOpen, setRecordOpen] = useState(false);
    const [recordHold, setRecordHold] = useState(10000);
    const [perf, setPerf] = useState(null);
    const [consolationGiven, setConsolationGiven] = useState(false);
    const [earnedThisQuiz, setEarnedThisQuiz] = useState(false);
    // 시험대에서만: 최소 포인트를 받을 때 학생 홈에 갈 알림이 어떻게 보일지 미리 보여 준다(2단계에서 서버가 실제로 보낸다).
    const [notificationPreview, setNotificationPreview] = useState(null);

    // 교사 상품 설정: 입력 중인 그대로(draft)를 두고, 추첨·확률에는 검증한 값(prizeSettings)만 쓴다.
    const [prizeDraft, setPrizeDraft] = useState(readPrizeSettings);
    const changePrizeDraft = (next) => { setPrizeDraft(next); savePrizeSettings(next); };

    useEffect(() => {
        if (!recordOpen) return undefined;
        const timer = setTimeout(() => setRecordOpen(false), recordHold);
        return () => clearTimeout(timer);
    }, [recordOpen, recordHold]);

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
    // 가벼운 계산이라 그때그때 한다(교사 상품 설정 검증, 대상 학생 작가 단계로 거른 수호룡 아이템·공개 확률).
    const prizeSettings = normalizeClawPrizeSettings(prizeDraft);
    const eligibleDecor = eligibleClawDecor(SAMPLE_DECOR, { writerLevel: student.writerLevel, readerLevel: student.readerLevel });
    const odds = describeClawOdds({
        settings: prizeSettings,
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
        const rolled = rollClawPrize({ settings: prizeSettings, eligibleDecor });
        const prize = prizeText(rolled);
        setLastPrize(`${plush?.name || plushId} 인형! 상품: ${prize}`);
        setHistory((rows) => [{
            id: `${Date.now()}-${rows.length}`, at: new Date(), studentName: student.name, kind: rolled.kind,
            plushId, name: plush?.name || plushId, prize
        }, ...rows].slice(0, 100));
        if (rolled.kind === 'gift' || rolled.kind === 'decor') setCelebration({ prize: rolled, plushName: plush?.name || plushId });
        // 학생 홈 알림 미리보기: 본인 상품 알림, 선생님 선물이면 반 전체 알림도(2단계에서 서버가 실제로 보낸다).
        const own = resolveActivityNotification({ event_type: 'spelling-claw.prize_awarded', payload: {
            kind: rolled.kind, points: rolled.points, gift_name: rolled.gift?.name, item_name: rolled.item?.name, plush_name: plush?.name
        } });
        setNotificationPreview(rolled.kind === 'gift'
            ? { ...resolveActivityNotification({ event_type: 'spelling-claw.class_gift_won', payload: { winner_name: student.name, gift_name: rolled.gift?.name } }),
                audience: `반 친구 모두에게 이렇게 가요 · ${student.name}에게는 “${own.message}”` }
            : { ...own, audience: `${student.name}의 학생 홈 활동 알림으로 이렇게 가요` });
        setRecordHold(6000);
        setRecordOpen(true);
    };
    const onRoundEnd = (won) => {
        setRoundActive(false);
        const used = playsUsed + 1;
        setPlaysUsed(used);
        if (won.length === 0) setLastPrize('아쉽게 놓쳤어요');
        if (used >= dailyPlays && winsToday + won.length === 0 && !consolationGiven) {
            setConsolationGiven(true);
            setLastPrize(`오늘 기회를 다 썼어요 — 문제를 풀었으니 ${minPoints}P를 받아요`);
            setNotificationPreview(resolveActivityNotification({
                event_type: 'spelling-claw.consolation_awarded', payload: { points: minPoints, plays: dailyPlays }
            }));
        }
    };
    const resetDay = () => {
        setCoins(0); setCoinsEarned(0); setPlaysUsed(0); setWinsToday(0); setConsolationGiven(false); setLastPrize(''); setRoundActive(false);
        setNotificationPreview(null);
    };
    const closeCelebration = useCallback(() => { setCelebration(null); setCelebrationSample((value) => value + 1); }, []);
    const closeIntro = () => { markIntroSeen(); setIntroOpen(false); };

    const dragonSays = finished
        ? (score >= passCount
            ? (earnedThisQuiz ? dragonLine(dragonForm, 'pass') : '오늘 받을 코인은 다 받았어. 내일 또 하자!')
            : `${passCount}개 이상 맞히면 코인을 줄게. 다시 해 보자!`)
        : result ? dragonLine(dragonForm, result.correct ? 'right' : 'wrong') : dragonLine(dragonForm, 'ask', question.type);

    return <div className="claw-bench">
        {celebration && <ClawCelebration prize={celebration.prize} plushName={celebration.plushName} onClose={closeCelebration} />}
        {tab === 'student' && introOpen && <ClawIntroDialog
            speciesId={student.speciesId} writerLevel={student.writerLevel} passCount={passCount} dailyPlays={dailyPlays}
            minPoints={minPoints} odds={odds} onClose={closeIntro}
        />}

        {/* 탭과 미리보기 도구는 학생 화면 밖(위)에 둔다 — 탭 안에는 학생에게 보이는 내용만. */}
        <div className="claw-bench__topbar">
            <div className="claw-bench__tabs" role="tablist" aria-label="인형뽑기 화면 선택">
                {BENCH_TABS.map((item, index) => <button key={item.id} id={`claw-bench-tab-${item.id}`} type="button" role="tab"
                    aria-selected={tab === item.id} aria-controls={`claw-bench-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
                    className={tab === item.id ? 'is-active' : ''} onClick={() => changeTab(item.id)}
                    onKeyDown={(event) => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const last = BENCH_TABS.length - 1;
                        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? last
                            : event.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : (index === 0 ? last : index - 1);
                        const nextTab = BENCH_TABS.at(nextIndex).id;
                        changeTab(nextTab);
                        event.currentTarget.parentElement?.querySelector(`#claw-bench-tab-${nextTab}`)?.focus();
                    }}>
                    <span aria-hidden="true">{item.icon}</span>{item.label}
                </button>)}
            </div>
            {tab === 'student' && <section className="claw-bench__preview-tools" aria-label="학생 화면 미리보기 도구">
                <label>대상 학생 <select value={student.id} onChange={(event) => setStudentId(event.target.value)}>
                    {students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select></label>
                <label>화질 <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                    <option value="auto">보통</option><option value="low">가볍게(태블릿)</option>
                </select></label>
                {perf && <span className="claw-bench__perf">{perf.fps}fps</span>}
                <button type="button" onClick={() => setCoins((value) => value + 1)}>코인 +1 (시험용)</button>
                <button type="button" onClick={() => setCelebration({
                    prize: celebrationSample % 2 === 0 ? { kind: 'gift', gift: { name: '자리 고르기권' } } : { kind: 'decor', item: { name: '구름 프레임' } },
                    plushName: '시바견'
                })}>큰 상품 축하 보기 (시험용)</button>
                <button type="button" onClick={resetDay}>하루 새로 시작</button>
                {studentsNote && <p className="claw-bench__note">{studentsNote}</p>}
            </section>}
        </div>

        <div id="claw-bench-panel-manage" role="tabpanel" aria-labelledby="claw-bench-tab-manage" className="claw-bench__manage" hidden={tab !== 'manage'}>
            <section className="claw-bench__panel" aria-label="학급 설정">
                <header><b>학급 설정</b><span>우리 반 학생 모두에게 같이 적용돼요</span></header>
                <div className="claw-bench__fields">
                    <label><span>목표 <small>문제 10개 중 이만큼 맞히면 코인 1개</small></span><select value={passCount} onChange={(event) => setPassCount(Number(event.target.value))}>
                        {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}/10</option>)}
                    </select></label>
                    <label><span>하루 기회 <small>하루에 받을 수 있는 코인(뽑기) 수</small></span><select value={dailyPlays} onChange={(event) => setDailyPlays(Number(event.target.value))}>
                        {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}번</option>)}
                    </select></label>
                    <label><span>난이도 <small>직접 고쳐 쓰는 문제 수</small></span><select value={level} onChange={(event) => { setLevel(event.target.value); restartQuiz(event.target.value); }}>
                        {Object.values(SPELLING_QUIZ_LEVELS).map((item) => <option key={item.id} value={item.id}>{item.label}(주관식 {item.writeCount})</option>)}
                    </select></label>
                    <label><span>최소 포인트 <small>기회를 다 쓰고 하나도 못 뽑았을 때</small></span><select value={minPoints} onChange={(event) => setMinPoints(Number(event.target.value))}>
                        {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}P</option>)}
                    </select></label>
                    <label><span>집게 힘 <small>튼튼할수록 잘 잡혀요</small></span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                        <option value="easy">튼튼</option><option value="normal">보통</option><option value="hard">흐물</option>
                    </select></label>
                </div>
                <p className="claw-bench__note-muted">시험 단계라 학생에게는 아직 보이지 않고, 상품 설정은 이 브라우저에만 저장돼요.</p>
            </section>

            <section className="claw-bench__panel claw-bench__prizes" aria-label="상품 설정">
                <header><b>상품 설정</b><span>인형 하나를 뽑았을 때 각 상품이 나올 확률 · 합계 100% · 학생은 처음 안내의 ‘상품이 나올 확률 보기’로 봐요</span></header>
                <ClawPrizeSettings draft={prizeDraft} onChange={changePrizeDraft} />
            </section>
        </div>

        <div id="claw-bench-panel-history" role="tabpanel" aria-labelledby="claw-bench-tab-history" className="claw-bench__history" hidden={tab !== 'history'}>
            <section className="claw-bench__panel" aria-label="뽑기 내역">
                <header><b>뽑기 내역</b><span>누가 언제 무엇을 받았는지 한곳에서 봐요</span></header>
                <div className="claw-bench__history-summary">
                    <div><small>뽑은 인형</small><strong>{history.length}</strong></div>
                    <div><small>🎁 선생님 선물</small><strong>{history.filter((row) => row.kind === 'gift').length}</strong></div>
                    <div><small>🐉 수호룡 아이템</small><strong>{history.filter((row) => row.kind === 'decor').length}</strong></div>
                    <div><small>포인트</small><strong>{history.filter((row) => row.kind === 'points').length}</strong></div>
                </div>
                <div className="claw-bench__history-filter" role="group" aria-label="내역 거르기">
                    {[['all', '전체'], ['gift', '🎁 선물만'], ['decor', '🐉 수호룡 아이템만'], ['points', '포인트만']].map(([id, label]) => (
                        <button key={id} type="button" aria-pressed={historyFilter === id} onClick={() => setHistoryFilter(id)}>{label}</button>
                    ))}
                </div>
                {history.length === 0 ? <p className="claw-bench__note-muted">아직 뽑은 내역이 없어요. 학생 화면 탭에서 뽑아 보면 여기에 쌓여요.</p>
                    : <table className="claw-bench__history-table">
                        <thead><tr><th>시각</th><th>학생</th><th>뽑은 인형</th><th>상품</th></tr></thead>
                        <tbody>
                            {history.filter((row) => historyFilter === 'all' || row.kind === historyFilter).map((row) => <tr key={row.id} className={`is-${row.kind}`}>
                                <td>{row.at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td>{row.studentName}</td>
                                <td>{row.name}</td>
                                <td><b>{row.prize}</b></td>
                            </tr>)}
                        </tbody>
                    </table>}
                <p className="claw-bench__note-muted">시험 단계라 이 화면에서 뽑은 것만 보여요. 학생에게 열면 우리 반 전체 내역이 서버에 쌓이고, 이 탭을 보고 있는 동안 12초마다 저절로 새로 고쳐져요.</p>
            </section>
        </div>

        <div id="claw-bench-panel-student" role="tabpanel" aria-labelledby="claw-bench-tab-student" className="claw-bench__student" hidden={tab !== 'student'}>
            <section className="claw-bench__quiz" aria-label="수호룡의 맞춤법 문제">
                <aside className="claw-bench__host">
                    <QuizDragon speciesId={student.speciesId} writerLevel={student.writerLevel} readerLevel={student.readerLevel} size="hero" line={dragonSays} />
                </aside>

                <div className="claw-bench__main">
                    <div className="claw-bench__progress">
                        {!finished ? <div className="claw-bench__tags">
                            <span>{Reflect.get(SPELLING_QUIZ_TYPES, question.type)?.label}</span>
                            <span>{question.kind === 'write' ? '주관식' : '객관식'}</span>
                            <span>{Reflect.get(SOURCE_LABELS, question.source)}</span>
                        </div> : <span />}
                        <div className="claw-bench__score" aria-live="polite">
                            <strong>{Math.min(index + 1, QUIZ_COUNT)}<small>/{QUIZ_COUNT}</small></strong>
                            <span>맞힌 문제 <b>{score}</b> · 목표 <b>{passCount}</b></span>
                        </div>
                    </div>

                    {!finished ? <div className="claw-bench__question">
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
                </div>
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
                    {/* 한 판이 끝나 창이 잠겨도 방금 받은 상품은 크게 보인다(2026-10-02 작은 회색 글씨라 안 보였다). */}
                    {lastPrize && <p className="claw-bench__prize" role="status">{lastPrize}</p>}
                    <small>{`문제 ${QUIZ_COUNT}개 중 ${passCount}개 이상 맞히면 코인 1개!`}</small>
                </div>}
            </section>

            {notificationPreview && <section className="claw-bench__notice-preview" aria-label="학생 홈 알림 미리보기">
                <small>{notificationPreview.audience || '학생 홈 활동 알림으로 이렇게 가요'} (시험 중이라 실제로는 보내지 않아요)</small>
                <div>
                    <span aria-hidden="true">{notificationPreview.icon}</span>
                    <p><b>{notificationPreview.title}</b>{notificationPreview.message}</p>
                    <button type="button" onClick={() => setNotificationPreview(null)}>{notificationPreview.actionLabel}</button>
                </div>
            </section>}

            <section className={`claw-bench__record${recordOpen ? ' is-open' : ''}`} aria-label="뽑기 기록">
                <button type="button" className="claw-bench__record-bar" aria-expanded={recordOpen}
                    onClick={() => { setRecordHold(10000); setRecordOpen((open) => !open); }}>
                    <span>🧸 뽑기 기록</span>
                    <span>뽑은 인형 <b>{history.length}</b>개 · 모은 종류 <b>{CLAW_PLUSHES.filter((plush) => Reflect.get(book, plush.id)).length}</b>/{CLAW_PLUSHES.length}</span>
                    <span aria-hidden="true">{recordOpen ? '▲ 닫기' : '▼ 펼쳐 보기'}</span>
                </button>
                {recordOpen && <div className="claw-bench__record-body">
                    {history.length === 0 ? <p>아직 뽑은 인형이 없어요. 목표를 달성하고 인형을 뽑아 보세요!</p> : <>
                        <div className="claw-bench__record-plushes">
                            {CLAW_PLUSHES.filter((plush) => Reflect.get(book, plush.id)).map((plush) => <figure key={plush.id}>
                                {Reflect.get(thumbs, plush.id) && <img src={Reflect.get(thumbs, plush.id)} alt="" />}
                                <figcaption>{plush.name} ×{Reflect.get(book, plush.id)}</figcaption>
                            </figure>)}
                        </div>
                        <ol className="claw-bench__record-list">
                            {history.map((row) => <li key={row.id}><span>{row.name}</span><b>{row.prize}</b></li>)}
                        </ol>
                    </>}
                </div>}
            </section>
        </div>
    </div>;
}
