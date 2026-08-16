import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import useVocabularyTower from './useVocabularyTower';
import V2DeckMap from './V2DeckMap';
import { mapV2Question, ROOM_INFO } from './vocabTowerEngine';
import './vocabularyTowerGame.css';

const BOONS = Object.freeze([
    { id: 'time', icon: '⏳', name: '시간의 모래', description: '다음 층 제한 시간이 20초 늘어나요.' },
    { id: 'eliminate', icon: '🪄', name: '선택 지우개', description: '다음 층은 보기 하나가 사라져요.' },
    { id: 'hint', icon: '🔤', name: '첫 글자 등불', description: '다음 층 정답의 첫 글자를 보여줘요.' },
    { id: 'focus', icon: '✨', name: '집중의 깃털', description: '다음 층 정답 학습 경험치가 5 늘어요.' },
    { id: 'shield', icon: '🛡️', name: '오답 방패', description: '다음 층에서 틀려도 학습 경험치를 더 받아요.' }
]);

const initialRun = {
    runId: null,
    answerCount: 0,
    correctCount: 0,
    wrongCount: 0,
    reviewCorrectCount: 0,
    currentFloor: 1,
    currentCombo: 0,
    maxCombo: 0,
    deckNumber: null,
    targetQuestionCount: 30
};

const fromServerRun = (data, current = initialRun) => ({
    runId: data?.run_id || current.runId,
    answerCount: Number(data?.answer_count ?? current.answerCount),
    correctCount: Number(data?.correct_count ?? current.correctCount),
    wrongCount: Number(data?.wrong_count ?? current.wrongCount),
    reviewCorrectCount: Number(data?.review_correct_count ?? current.reviewCorrectCount),
    currentFloor: Number(data?.current_floor ?? current.currentFloor),
    currentCombo: Number(data?.current_combo ?? current.currentCombo),
    maxCombo: Number(data?.max_combo ?? current.maxCombo),
    deckNumber: data?.deck_number == null ? current.deckNumber : Number(data.deck_number),
    targetQuestionCount: Number(data?.target_question_count ?? current.targetQuestionCount)
});

const pickBoonChoices = () => [...BOONS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

const VocabularyTowerGame = ({
    studentSession,
    onBack,
    forcedGrade,
    dailyLimit = 3,
    timeLimit = 40,
    contentVersion = 'v1'
}) => {
    const isV2 = contentVersion === 'v2';
    const [selectedGrade, setSelectedGrade] = useState(Number(forcedGrade || studentSession?.grade || 3));
    const [phase, setPhase] = useState('loading');
    const [status, setStatus] = useState(null);
    const [v2Decks, setV2Decks] = useState([]);
    const [selectedDeck, setSelectedDeck] = useState(null);
    const [run, setRun] = useState(initialRun);
    const [floorTimeLimit, setFloorTimeLimit] = useState(Number(timeLimit || 40));
    const [timeLeft, setTimeLeft] = useState(Number(timeLimit || 40));
    const [activeBoon, setActiveBoon] = useState(null);
    const [boonChoices, setBoonChoices] = useState([]);
    const [lastResult, setLastResult] = useState(null);
    const [pendingServerResult, setPendingServerResult] = useState(null);
    const [learningExp, setLearningExp] = useState(0);
    const [summary, setSummary] = useState(null);
    const [notice, setNotice] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [typedAnswer, setTypedAnswer] = useState('');
    const [returnPhase, setReturnPhase] = useState('playing');
    const finishingRef = useRef(false);

    const {
        currentQuiz,
        reviewWords,
        isLoading: wordsLoading,
        error: wordsError,
        createQuiz,
        recordAnswer,
        resetJourney,
        setServerQuiz
    } = useVocabularyTower(selectedGrade, !isV2);

    const loadStatus = useCallback(async () => {
        setNotice('');
        const { data, error } = await supabase.rpc(isV2
            ? 'get_my_vocab_tower_v2_overview_v1'
            : 'get_my_vocab_tower_status');
        if (error) {
            console.error('어휘의 탑 상태 조회 실패:', error);
            setNotice('오늘의 도전 정보를 불러오지 못했어요.');
            setPhase('error');
            return;
        }
        if (isV2 && !data?.success) {
            setNotice(data?.error || 'V2 덱 지도를 불러오지 못했어요.');
            setPhase('error');
            return;
        }
        if (isV2) {
            setSelectedGrade(Number(data.grade || 3));
            setV2Decks(Array.isArray(data.decks) ? data.decks : []);
            setStatus({
                active_run: data.active_run,
                deckRewardPoints: Number(data.deck_reward_points || 0)
            });
            setSelectedDeck(data.active_run?.deck_number ? Number(data.active_run.deck_number) : null);
            setPhase('deck-map');
            return;
        }
        setStatus(data);
        setFloorTimeLimit(Number(data?.floor_time_limit || timeLimit || 40));
        setTimeLeft(Number(data?.floor_time_limit || timeLimit || 40));
        setPhase('intro');
    }, [isV2, timeLimit]);

    useEffect(() => {
        if (wordsLoading || wordsError) return undefined;
        const timerId = window.setTimeout(() => void loadStatus(), 0);
        return () => window.clearTimeout(timerId);
    }, [loadStatus, wordsError, wordsLoading]);

    useEffect(() => {
        if (isV2 || phase !== 'playing' || submitting) return undefined;
        if (timeLeft <= 0) return undefined;
        const timerId = window.setInterval(() => setTimeLeft((current) => Math.max(0, current - 1)), 1000);
        return () => window.clearInterval(timerId);
    }, [isV2, phase, submitting, timeLeft]);

    const finishRun = useCallback(async (reason, runIdOverride = null) => {
        const targetRunId = runIdOverride || run.runId;
        if (!targetRunId || finishingRef.current) return;
        finishingRef.current = true;
        setSubmitting(true);
        const { data, error } = await supabase.rpc(isV2
            ? 'finish_my_vocab_tower_v2_practice_v1'
            : 'finish_my_vocab_tower_run', {
            p_run_id: targetRunId,
            p_reason: isV2 && reason === 'time_up' ? 'exited' : reason
        });
        setSubmitting(false);
        finishingRef.current = false;
        if (error) {
            console.error('어휘의 탑 종료 실패:', error);
            setNotice('탐험 결과를 저장하지 못했어요. 다시 눌러주세요.');
            return;
        }
        setSummary(data);
        setPhase('summary');
    }, [isV2, run.runId]);

    useEffect(() => {
        if (isV2 || phase !== 'playing' || timeLeft !== 0) return undefined;
        const timerId = window.setTimeout(() => void finishRun('time_up'), 0);
        return () => window.clearTimeout(timerId);
    }, [finishRun, isV2, phase, timeLeft]);

    const prepareQuiz = useCallback(async (floor, roomIndex, boon = activeBoon, runIdOverride = null) => {
        let quiz;
        if (isV2) {
            setSubmitting(true);
            const { data, error } = await supabase.rpc('get_next_my_vocab_tower_v2_practice_question_v1', {
                p_run_id: runIdOverride || run.runId
            });
            setSubmitting(false);
            if (error) {
                console.error('V2 문항 발급 실패:', error);
                setNotice(error.message || '다음 문제를 준비하지 못했어요.');
                return false;
            }
            quiz = mapV2Question(data);
            setServerQuiz(quiz);
        } else {
            quiz = createQuiz({
                floor,
                roomIndex,
                reduceOptions: boon?.id === 'eliminate'
            });
        }
        if (!quiz) {
            setNotice('다음 문제를 준비하지 못했어요. 다시 시도해주세요.');
            return false;
        }
        setLastResult(null);
        setPendingServerResult(null);
        setTypedAnswer('');
        setPhase('playing');
        return true;
    }, [activeBoon, createQuiz, isV2, run.runId, setServerQuiz]);

    const handleStart = async (deckNumber = null) => {
        if (submitting) return;
        setSubmitting(true);
        setNotice('');
        const targetDeckNumber = isV2
            ? Number(deckNumber || selectedDeck || status?.active_run?.deck_number || 1)
            : null;
        const { data, error } = await supabase.rpc(isV2
            ? 'start_my_vocab_tower_v2_practice_v1'
            : 'start_my_vocab_tower_run', isV2 ? { p_deck_number: targetDeckNumber } : undefined);
        setSubmitting(false);
        if (error || !data?.success) {
            console.error('어휘의 탑 시작 실패:', error || data?.error);
            setNotice(data?.error || '탐험을 시작하지 못했어요.');
            return;
        }

        const nextRun = fromServerRun(data);
        const nextGrade = Number(data.grade || selectedGrade);
        const nextTimeLimit = Number(data.floor_time_limit || floorTimeLimit);
        if (isV2) setSelectedDeck(Number(data.deck_number || targetDeckNumber));
        setSelectedGrade(nextGrade);
        setFloorTimeLimit(nextTimeLimit);
        setTimeLeft(nextTimeLimit);
        setRun(nextRun);
        setLearningExp(nextRun.correctCount * 20 + nextRun.wrongCount * 4);
        setActiveBoon(null);
        resetJourney(data.review_words || []);

        if (nextRun.answerCount >= nextRun.targetQuestionCount) {
            setRun(nextRun);
            window.setTimeout(() => void finishRun('completed', nextRun.runId), 0);
            return;
        }
        window.setTimeout(() => void prepareQuiz(nextRun.currentFloor, nextRun.answerCount % 3, null, nextRun.runId), 0);
    };

    const handleAnswer = async (answer) => {
        if (!currentQuiz || submitting || phase !== 'playing') return;
        setSubmitting(true);
        setNotice('');
        const usedHint = activeBoon?.id === 'hint';
        const rpcName = isV2 ? 'submit_my_vocab_tower_v2_practice_answer_v1' : 'submit_my_vocab_tower_answer';
        const params = isV2 ? {
            p_run_id: run.runId,
            p_question_key: currentQuiz.questionKey,
            p_selected_answer: answer,
            p_used_hint: usedHint
        } : {
            p_run_id: run.runId,
            p_question_key: currentQuiz.questionKey,
            p_room_type: currentQuiz.roomType,
            p_word: currentQuiz.correctAnswer,
            p_selected_answer: answer,
            p_used_hint: usedHint
        };
        const { data, error } = await supabase.rpc(rpcName, params);
        setSubmitting(false);
        if (error || !data?.success) {
            console.error('어휘의 탑 정답 저장 실패:', error || data);
            setNotice(error?.message || '정답을 저장하지 못했어요. 다시 선택해주세요.');
            return;
        }

        const isCorrect = Boolean(data.is_correct);
        // 직접 입력형은 정답이 새지 않도록 낱말·뜻·예문을 가린 채 내려오므로 채점 응답으로 되채운다.
        const answeredQuiz = isV2 ? {
            ...currentQuiz,
            correctAnswer: data.correct_answer,
            explanation: data.explanation,
            word: {
                ...currentQuiz.word,
                word: data.word || currentQuiz.word.word,
                definition: data.definition || currentQuiz.word.definition,
                example: data.example || currentQuiz.word.example
            }
        } : currentQuiz;
        if (isV2) setServerQuiz(answeredQuiz);
        const { learnedFromReview } = recordAnswer({ quiz: answeredQuiz, isCorrect });
        const earnedExp = isCorrect
            ? 20 + (activeBoon?.id === 'focus' ? 5 : 0) + (currentQuiz.roomType === 'boss' ? 5 : 0)
            : activeBoon?.id === 'shield' ? 8 : 4;
        setLearningExp((current) => current + earnedExp);
        setRun((current) => fromServerRun(data, current));
        setPendingServerResult(data);
        setLastResult({
            selectedAnswer: answer,
            isCorrect,
            earnedExp,
            learnedFromReview: learnedFromReview || Boolean(data.is_review_correct)
        });
        setPhase('answer');
    };

    const handleNext = () => {
        if (!pendingServerResult) return;
        if (pendingServerResult.completed) {
            void finishRun('completed');
            return;
        }
        if (isV2) {
            void prepareQuiz(selectedDeck, Number(pendingServerResult.answer_count) % 3, null);
            return;
        }
        if (pendingServerResult.floor_cleared) {
            setBoonChoices(pickBoonChoices());
            setPhase('reward');
            return;
        }
        void prepareQuiz(Number(pendingServerResult.current_floor), Number(pendingServerResult.answer_count) % 3);
    };

    const chooseBoon = (boon) => {
        setActiveBoon(boon);
        const nextTime = floorTimeLimit + (boon.id === 'time' ? 20 : 0);
        setTimeLeft(nextTime);
        void prepareQuiz(run.currentFloor, run.answerCount % 3, boon);
    };

    const floorProgress = useMemo(() => {
        const completedRooms = run.answerCount % 3;
        return [0, 1, 2].map((index) => ({
            ...Reflect.get(ROOM_INFO, (run.currentFloor === 5 || run.currentFloor === 10) && index === 2
                ? 'boss'
                : Reflect.get(['meaning', 'sentence', 'distinction'], index)),
            completed: index < completedRooms,
            current: index === completedRooms
        }));
    }, [run.answerCount, run.currentFloor]);

    if (wordsLoading || phase === 'loading') {
        return <div className="vocab-journey vocab-journey--center"><div className="vocab-journey__loader">🏰</div><p>탑의 방을 준비하고 있어요...</p></div>;
    }

    if (wordsError || phase === 'error') {
        return (
            <div className="vocab-journey vocab-journey--center">
                <div className="vocab-journey__dialog">
                    <span className="vocab-journey__dialog-icon">😢</span>
                    <h2>탑 문이 열리지 않아요</h2>
                    <p>{wordsError || notice}</p>
                    <div className="vocab-journey__dialog-actions">
                        <button type="button" onClick={loadStatus}>다시 시도</button>
                        <button type="button" className="is-quiet" onClick={onBack}>놀이터로 돌아가기</button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'deck-map' && isV2) {
        return (
            <V2DeckMap
                grade={selectedGrade}
                decks={v2Decks}
                activeRun={status?.active_run}
                submitting={submitting}
                notice={notice}
                onStart={handleStart}
                onBack={onBack}
            />
        );
    }

    if (phase === 'intro') {
        const hasActiveRun = Boolean(status?.active_run);
        const remaining = Number(status?.remaining_attempts ?? dailyLimit);
        const canStart = hasActiveRun || remaining > 0;
        return (
            <div className="vocab-journey vocab-journey--intro">
                <main className="vocab-intro-card">
                    <button type="button" className="vocab-journey__back" onClick={onBack}>← 놀이터</button>
                    <div className="vocab-intro-card__tower" aria-hidden="true">🏰</div>
                    <p className="vocab-intro-card__eyebrow">틀린 낱말을 다시 만나며 성장하는 탐험</p>
                    <h1>새로운 어휘의 탑</h1>
                    <p className="vocab-intro-card__lead">방 세 개를 통과하고, 층마다 특별한 능력을 골라 정상까지 올라가요.</p>

                    <div className="vocab-intro-card__rooms">
                        {Object.values(ROOM_INFO).slice(0, 3).map((room) => (
                            <article key={room.id}><span>{room.icon}</span><strong>{room.name}</strong><small>{room.guide}</small></article>
                        ))}
                    </div>

                    <div className="vocab-intro-card__limits">
                        <div><span>오늘 남은 도전</span><strong>{hasActiveRun ? '이어할 탐험 있음' : `${remaining}회`}</strong></div>
                        <div><span>층별 시간</span><strong>{status?.floor_time_limit || timeLimit}초</strong></div>
                        <div><span>게임 포인트</span><strong>{status?.daily_points || 0}/80P</strong></div>
                    </div>

                    <p className="vocab-intro-card__rule">틀려도 경험치는 줄지 않아요. 설명을 읽고 보스전에서 다시 맞히면 ‘새로 익힌 낱말’이 됩니다.</p>
                    {notice && <p className="vocab-journey__notice" role="alert">{notice}</p>}
                    <button type="button" className="vocab-journey__primary" onClick={handleStart} disabled={!canStart || submitting}>
                        {submitting ? '탑 문을 여는 중...' : hasActiveRun ? '탐험 이어하기' : canStart ? '탐험 시작하기' : '오늘의 도전을 모두 사용했어요'}
                    </button>
                </main>
            </div>
        );
    }

    if (phase === 'summary' && summary) {
        if (isV2) {
            return (
                <div className="vocab-journey vocab-journey--summary">
                    <main className="vocab-summary-card">
                        <span className="vocab-summary-card__icon">📚</span>
                        <p className="vocab-intro-card__eyebrow">{summary.deck_number}층 개인 연습 결과</p>
                        <h1>{summary.practice_completed ? '12문항 연습을 마쳤어요!' : '오늘 배운 곳까지 저장했어요'}</h1>
                        <div className="vocab-summary-card__stats vocab-summary-card__stats--practice">
                            <div><span>풀은 문항</span><strong>{summary.answer_count}/{summary.target_question_count}</strong></div>
                            <div><span>정답</span><strong>{summary.correct_count}개</strong></div>
                            <div><span>새로 만남</span><strong>{summary.new_words_seen || 0}개</strong></div>
                            <div><span>덱 익힘</span><strong>{summary.mastered_count || 0}/{summary.item_count || 0}</strong></div>
                        </div>
                        <div className="vocab-summary-card__reward">
                            <span>{Number(summary.reward_points || 0) > 0 ? '이번에 넘은 진도 보상' : '진도 보상'}</span>
                            <strong>+{summary.reward_points || 0}P</strong>
                            <small>{Number(summary.reward_points || 0) > 0
                                ? `${(summary.awarded_milestones || []).map((milestone) => `${milestone.percent}%`).join('·')} 목표를 넘었어요!`
                                : summary.next_milestone_percent
                                    ? `${summary.next_milestone_percent}% 목표까지 ${summary.next_milestone_remaining}개 더 익히면 +${summary.next_milestone_points}P`
                                    : `${summary.deck_number}층 포인트를 모두 모았어요.`}</small>
                        </div>
                        <p>{Number(summary.needs_review_count || 0) > 0
                            ? `복습할 낱말 ${summary.needs_review_count}개를 다음 연습에서 먼저 만나요.`
                            : '연습 결과와 낱말별 익힘 상태는 층별로 계속 쌓여요.'}</p>
                        <button type="button" className="vocab-journey__primary" onClick={loadStatus}>덱 지도로 돌아가기</button>
                        <button type="button" className="vocab-summary-card__back" onClick={onBack}>놀이터로 나가기</button>
                    </main>
                </div>
            );
        }
        return (
            <div className="vocab-journey vocab-journey--summary">
                <main className="vocab-summary-card">
                    <span className="vocab-summary-card__icon">{Number(summary.answer_count) >= 30 ? '👑' : '📚'}</span>
                    <p className="vocab-intro-card__eyebrow">오늘의 어휘 탐험 기록</p>
                    <h1>{Number(summary.answer_count) >= 30 ? '정상까지 도착했어요!' : '배운 만큼 성장했어요!'}</h1>
                    <div className="vocab-summary-card__stats">
                        <div><span>도달 층</span><strong>{summary.max_floor}층</strong></div>
                        <div><span>정답</span><strong>{summary.correct_count}개</strong></div>
                        <div><span>새로 익힘</span><strong>{summary.review_correct_count}개</strong></div>
                        <div><span>최고 연속</span><strong>{summary.max_combo}개</strong></div>
                    </div>
                    <div className="vocab-summary-card__reward">
                        <span>탐험 보상</span><strong>+{summary.reward_points || 0}P</strong>
                        <small>오늘 게임 포인트 {summary.daily_points ?? status?.daily_points ?? 0}/80P · 이번 주 {summary.weekly_points ?? status?.weekly_points ?? 0}/250P</small>
                    </div>
                    <p>포인트를 모두 받아도 낱말 학습과 최고 기록 도전은 계속할 수 있어요.</p>
                    <button type="button" className="vocab-journey__primary" onClick={onBack}>놀이터로 돌아가기</button>
                </main>
            </div>
        );
    }

    return (
        <div className={`vocab-journey vocab-journey--floor-${isV2 ? selectedDeck : run.currentFloor}`}>
            <header className="vocab-journey__header">
                <button type="button" onClick={() => { setReturnPhase(phase); setPhase('confirm'); }}>← 나가기</button>
                <div><span>{isV2 ? `${selectedDeck}층 개인 연습` : `${run.currentFloor}층`}</span><strong>{currentQuiz?.room?.name || '층 보상 선택'}</strong></div>
                {isV2
                    ? <div className="vocab-journey__timer">{run.answerCount}/{run.targetQuestionCount}</div>
                    : <div className={`vocab-journey__timer${timeLeft <= 10 ? ' is-low' : ''}`}>⏱ {timeLeft}초</div>}
            </header>

            {isV2 ? (
                <div className="vocab-practice-progress" aria-label={`12문항 중 ${run.answerCount}문항 완료`}>
                    <span style={{ width: `${Math.min(100, run.answerCount / run.targetQuestionCount * 100)}%` }} />
                </div>
            ) : (
                <div className="vocab-journey__floor-map" aria-label={`현재 ${run.currentFloor}층`}>
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((floor) => (
                        <span key={floor} className={floor < run.currentFloor ? 'is-passed' : floor === run.currentFloor ? 'is-current' : ''}>{floor}</span>
                    ))}
                </div>
            )}

            <div className="vocab-journey__status-row">
                <div><span>학습 경험치</span><strong>{learningExp} EXP</strong></div>
                <div><span>연속 정답</span><strong>{run.currentCombo}개</strong></div>
                <div><span>{isV2 ? '남은 문항' : '복습할 낱말'}</span><strong>{isV2 ? Math.max(0, run.targetQuestionCount - run.answerCount) : reviewWords.length}개</strong></div>
                {!isV2 && activeBoon && <div className="is-boon"><span>층 능력</span><strong>{activeBoon.icon} {activeBoon.name}</strong></div>}
            </div>

            {!isV2 && <div className="vocab-journey__rooms" aria-label="현재 층의 방 진행">
                {floorProgress.map((room) => (
                    <div key={room.id} className={room.completed ? 'is-completed' : room.current ? 'is-current' : ''}>
                        <span>{room.completed ? '✓' : room.icon}</span><strong>{room.name}</strong>
                    </div>
                ))}
            </div>}

            <main className="vocab-journey__main">
                {(phase === 'playing' || phase === 'answer') && currentQuiz && (
                    <motion.section key={currentQuiz.questionKey} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="vocab-question-card">
                        <div className="vocab-question-card__heading">
                            <span>{currentQuiz.room.icon}</span>
                            <div><strong>{currentQuiz.room.name}</strong><small>{currentQuiz.room.guide}</small></div>
                            <em>{isV2 && currentQuiz.practiceFocus === 'weak'
                                ? '복습 우선'
                                : isV2 && currentQuiz.practiceFocus === 'review'
                                    ? '다시 확인'
                                    : `난이도 ${currentQuiz.word.level}`}</em>
                        </div>
                        <p className="vocab-question-card__prompt">{currentQuiz.prompt}</p>
                        {activeBoon?.id === 'hint' && <p className="vocab-question-card__hint">💡 핵심 낱말 첫 글자: <strong>{(currentQuiz.correctAnswer || currentQuiz.word.word).slice(0, 1)}</strong></p>}
                        {currentQuiz.isInput ? (
                            <form
                                className="vocab-question-card__input"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const answer = typedAnswer.trim();
                                    if (!answer) {
                                        setNotice('낱말을 입력한 뒤 확인을 눌러주세요.');
                                        return;
                                    }
                                    void handleAnswer(answer);
                                }}
                            >
                                <label htmlFor="vocab-typed-answer">낱말을 직접 써 보세요</label>
                                <input
                                    id="vocab-typed-answer"
                                    type="text"
                                    value={phase === 'answer' ? (lastResult?.selectedAnswer ?? typedAnswer) : typedAnswer}
                                    onChange={(event) => setTypedAnswer(event.target.value)}
                                    disabled={phase !== 'playing' || submitting}
                                    className={phase === 'answer' ? (lastResult?.isCorrect ? 'is-correct' : 'is-wrong') : ''}
                                    maxLength={50}
                                    autoComplete="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    placeholder="예: 관찰"
                                />
                                <button type="submit" disabled={phase !== 'playing' || submitting || !typedAnswer.trim()}>
                                    확인
                                </button>
                            </form>
                        ) : (
                        <div className="vocab-question-card__options">
                            {currentQuiz.options.map((option) => {
                                const isSelected = lastResult?.selectedAnswer === option;
                                const isAnswer = currentQuiz.correctAnswer === option;
                                const stateClass = phase === 'answer'
                                    ? isAnswer ? 'is-correct' : isSelected ? 'is-wrong' : 'is-muted'
                                    : '';
                                return (
                                    <motion.button
                                        key={option}
                                        type="button"
                                        whileTap={phase === 'playing' ? { scale: .98 } : undefined}
                                        className={stateClass}
                                        disabled={phase !== 'playing' || submitting}
                                        onClick={() => handleAnswer(option)}
                                    >
                                        {option}{stateClass === 'is-correct' ? ' ✓' : stateClass === 'is-wrong' ? ' ×' : ''}
                                    </motion.button>
                                );
                            })}
                        </div>
                        )}
                        {notice && <p className="vocab-journey__notice" role="alert">{notice}</p>}
                        <AnimatePresence>
                            {phase === 'answer' && lastResult && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`vocab-answer-note${lastResult.isCorrect ? ' is-correct' : ' is-wrong'}`}>
                                    <strong>{lastResult.isCorrect ? lastResult.learnedFromReview ? '🎉 헷갈렸던 낱말을 익혔어요!' : '정답이에요!' : `정답은 ‘${currentQuiz.correctAnswer}’이에요.`}</strong>
                                    <span>학습 경험치 +{lastResult.earnedExp}</span>
                                    {!lastResult.isCorrect && <p>{currentQuiz.explanation || currentQuiz.word.definition}<br /><small>예: {currentQuiz.word.example}</small></p>}
                                    <button type="button" onClick={handleNext} disabled={submitting}>{pendingServerResult?.completed ? isV2 ? '연습 결과 확인하기' : '정상 기록 확인하기' : pendingServerResult?.floor_cleared ? '층 보상 고르기' : '다음 문제로'}</button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.section>
                )}

                {phase === 'reward' && (
                    <section className="vocab-boon-card">
                        <span className="vocab-boon-card__icon">🎁</span>
                        <p className="vocab-intro-card__eyebrow">{Math.max(1, run.currentFloor - 1)}층 통과</p>
                        <h2>다음 층에서 쓸 능력을 하나 골라요</h2>
                        <div className="vocab-boon-card__choices">
                            {boonChoices.map((boon) => (
                                <button type="button" key={boon.id} onClick={() => chooseBoon(boon)}>
                                    <span>{boon.icon}</span><strong>{boon.name}</strong><small>{boon.description}</small>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </main>

            <AnimatePresence>
                {phase === 'confirm' && (
                    <motion.div className="vocab-journey__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="vocab-journey__dialog">
                            <span className="vocab-journey__dialog-icon">🚪</span>
                            <h2>탐험을 마칠까요?</h2>
                            <p>{isV2 ? '지금까지 푼 문제를 이 층의 개인 연습 기록으로 저장할게요.' : '지금까지 푼 문제와 배운 낱말은 서버에 저장되어 있어요. 지금까지 얻은 보상도 계산해드려요.'}</p>
                            <div className="vocab-journey__dialog-actions">
                                <button type="button" onClick={() => setPhase(returnPhase)}>계속 탐험하기</button>
                                <button type="button" className="is-quiet" onClick={() => finishRun('exited')} disabled={submitting}>탐험 마치기</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VocabularyTowerGame;
