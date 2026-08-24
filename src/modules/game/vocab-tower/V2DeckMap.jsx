import React from 'react';
import GuideInfoButton from '../../../components/common/GuideInfoButton';

const V2DeckMap = ({
    grade,
    decks,
    activeRun,
    submitting,
    notice,
    onStart,
    onOpenCardBox,
    onOpenDeckMaster,
    onOpenSummit,
    summit,
    masterSettings,
    summitSettings,
    onBack
}) => {
    // 잠긴 도전은 버튼을 감추지 않고 늘 보여 준다. 무엇을 하면 열리는지 눌러서 확인한다.
    // 값 하나로 층 번호 또는 'summit' 을 담는다(한 번에 하나만 펼친다).
    const [openedCondition, setOpenedCondition] = React.useState(null);
    /*
     * ⚠️ 여기서는 공용 `Modal`/`StudentModuleGuide` 를 쓸 수 없다. 게임 실행 화면이 `zIndex: 20000`
     *    이고 공용 `Modal` 은 9999라 창이 화면 뒤에 숨고 몸통 스크롤만 잠겨 학생이 닫지도 못한다
     *    (2026-08-17 바로 이 지도에서 겪어 제거한 적이 있다).
     *    그래서 이 모듈이 이미 쓰는 `vocab-journey__overlay`(게임 화면 안쪽 오버레이)로 띄운다.
     */
    const [statesHelpOpen, setStatesHelpOpen] = React.useState(false);
    const activeDeckNumber = Number(activeRun?.deck_number || 0);
    const totalItems = decks.reduce((sum, deck) => sum + Number(deck.item_count || 0), 0);
    const totalSeen = decks.reduce((sum, deck) => sum + Number(deck.seen_count || 0), 0);
    const totalMastered = decks.reduce((sum, deck) => sum + Number(deck.mastered_count || 0), 0);
    const earnedRewardPoints = decks.reduce((sum, deck) => sum + Number(deck.earned_reward_points || 0), 0);
    const totalRewardPoints = decks.reduce((sum, deck) => sum + Number(deck.deck_reward_points || 0), 0);
    const conqueredDecks = decks.filter((deck) => Number(deck.best_accuracy || 0) >= 100).length;
    const deckCount = decks.length || 10;
    const ascendingDecks = [...decks].sort((a, b) => Number(a.deck_number) - Number(b.deck_number));
    const explorationDecks = [...ascendingDecks].reverse();
    const suggestedDeckNumber = activeDeckNumber
        || Number(ascendingDecks.find((deck) => deck.unlocked !== false && Number(deck.best_accuracy || 0) < 100)?.deck_number)
        || Number(explorationDecks[0]?.deck_number || 0);
    const hasAnyActive = activeDeckNumber > 0;
    const summitRetry = summit?.retry || null;
    const summitRetryBlocked = Boolean(summitRetry?.blocked);
    // 정상 관문의 오답은 여러 층에 흩어진다. 어느 층에 가야 하는지 서버가 세어 준다.
    const summitRetryDecks = Array.isArray(summitRetry?.by_deck) ? summitRetry.by_deck : [];
    const summitQualified = Boolean(summit?.eligible);
    const summitEligible = summitQualified && !summitRetryBlocked;
    const summitPassed = Number(summit?.passed_count || 0);
    const summitRequired = Number(summit?.required_count || deckCount);
    const summitMissing = Number(summit?.missing_count ?? Math.max(summitRequired - summitPassed, 0));
    const summitQuestionCount = Number(summitSettings?.question_count || 20);
    // 정상은 1·2·3단계 순차 관문이다. 앞 단계를 통과해야 다음이 열린다.
    const summitLevel = Number(summit?.level || 0);
    const summitLevelCount = Number(summit?.level_count || 3);
    const summitNextStage = summit?.next_stage ? Number(summit.next_stage) : null;
    const summitStages = Array.isArray(summit?.stages) ? summit.stages : [];
    const summitNextInputCount = Number(
        summitStages.find((stage) => Number(stage.stage) === summitNextStage)?.input_count || 0
    );
    const summitStars = '⭐'.repeat(summitLevel) + '☆'.repeat(Math.max(summitLevelCount - summitLevel, 0));
    // 마지막 단계까지 통과하면 더 칠 것이 없다.
    const summitCompleted = summitLevel >= summitLevelCount;
    const masterRequiredPercent = Math.round(Number(masterSettings?.required_mastered_ratio || 0.8) * 100);
    const initialMapTargetRef = React.useRef(null);
    const didPositionMapRef = React.useRef(false);

    React.useEffect(() => {
        if (didPositionMapRef.current || !initialMapTargetRef.current) return undefined;
        const frame = window.requestAnimationFrame(() => {
            initialMapTargetRef.current?.scrollIntoView({ block: 'center' });
            didPositionMapRef.current = true;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [suggestedDeckNumber]);

    // 창은 Esc 로도 닫는다. 게임 화면 안 오버레이라 공용 Modal 의 Esc 처리를 못 쓴다.
    React.useEffect(() => {
        if (!statesHelpOpen) return undefined;
        const closeOnEscape = (event) => { if (event.key === 'Escape') setStatesHelpOpen(false); };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [statesHelpOpen]);

    return (
        <div className="vocab-journey vocab-journey--deck-map">
            <main className="vocab-deck-map">
                <button type="button" className="vocab-journey__back" onClick={onBack}>← 놀이터</button>
                <p className="vocab-intro-card__eyebrow">{grade}학년 개인 어휘 수련</p>
                <h1>어휘의 탑 지도</h1>
                <p className="vocab-intro-card__lead">1층부터 시작해 층마다 12개 낱말을 익혀요. 덱마스터를 통과하면 바로 다음 층이 열려요.</p>

                <div className="vocab-deck-map__summary" aria-label="개인 연습 요약">
                    <div className="is-conquest"><span>100%로 정복한 층</span><strong>{conqueredDecks}/{deckCount}</strong></div>
                    <div><span>한 번 이상 학습한 낱말</span><strong>{totalSeen}/{totalItems}</strong></div>
                    <div><span>완전히 익힌 낱말</span><strong>{totalMastered}/{totalItems}</strong></div>
                    <div><span>모은 포인트</span><strong>{earnedRewardPoints}/{totalRewardPoints}P</strong></div>
                </div>

                <div className="vocab-tower-route" aria-label="어휘의 탑 탐험 경로">
                    <div className={`vocab-tower-route__summit${summitCompleted ? ' is-conquered' : ''}${summitEligible && !summitCompleted ? ' is-open' : ''}`}>
                        <span className="vocab-tower-route__summit-icon" aria-hidden="true">👑</span>
                        <div>
                            <strong>
                                <GuideInfoButton
                                    className="vocab-summit-help-toggle"
                                    onClick={() => setOpenedCondition((current) => (current === 'summit-help' ? null : 'summit-help'))}
                                    label="어휘 마스터 도전이 어떤 시험인지 보기"
                                />
                                {summitCompleted
                                    ? '어휘 마스터 완성!'
                                    : summitLevel > 0
                                        ? `어휘 마스터 ${summitLevel}단계`
                                        : summitEligible ? '어휘의 정상이 열렸어요' : '어휘의 정상'}
                            </strong>
                            <small>
                                {summitRetryBlocked
                                    ? `지난 시험에서 틀린 낱말 ${summitRetry.remaining_count}개를 다시 익히면 이어서 도전할 수 있어요.`
                                    : summitCompleted
                                    ? '세 단계를 모두 넘었어요. 나의 아지트에서 휘장을 볼 수 있어요.'
                                    : summitLevel > 0
                                        ? `다음은 ${summitNextStage}단계 — ${summitNextInputCount >= summitQuestionCount
                                        ? `${summitQuestionCount}문항을 모두`
                                        : `${summitQuestionCount}문항 중 ${summitNextInputCount}문항을`} 직접 써야 해요.`
                                        : summitEligible
                                            ? `1단계부터 시작해요. ${summitQuestionCount}문항 중 ${summitNextInputCount}문항이 직접 쓰기예요.`
                                            : `덱마스터 ${summitMissing}개를 더 통과하면 정상 관문이 열려요.`}
                            </small>
                        </div>
                        {/* 별은 완성된 성취라 잠긴 상태에서도 몇 개까지 있는지 보여 준다 — 목표가 보여야 향해 간다. */}
                        <em aria-label={`어휘 마스터 ${summitLevel}단계 / ${summitLevelCount}단계`}>
                            {summitEligible || summitLevel > 0 ? summitStars : `덱마스터 ${summitPassed}/${summitRequired}`}
                        </em>
                        {summitStages.length > 0 && (
                            <div className="vocab-summit-stages" aria-label="어휘 마스터 단계별 상태">
                                {summitStages.map((stage) => {
                                    const stageNumber = Number(stage.stage);
                                    const isPassed = Boolean(stage.passed) || stageNumber <= summitLevel;
                                    const isNext = stageNumber === summitNextStage;
                                    const isUnlocked = summitQualified
                                        && Boolean(stage.unlocked ?? (isPassed || isNext));
                                    return isPassed ? (
                                        <button
                                            key={stageNumber}
                                            type="button"
                                            className="is-passed"
                                            onClick={() => onOpenSummit?.(stageNumber)}
                                            disabled={submitting || hasAnyActive || !isUnlocked}
                                            aria-label={`어휘 마스터 ${stageNumber}단계 다시 도전`}
                                        >
                                            <b>{stageNumber}단계</b><span>통과 · 다시 도전</span>
                                        </button>
                                    ) : (
                                        <span key={stageNumber} className={isNext && isUnlocked ? 'is-next' : 'is-locked'}>
                                            <b>{stageNumber}단계</b><small>{isNext && isUnlocked ? '도전 가능' : '잠김'}</small>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        {!summitCompleted && (
                            <button
                                type="button"
                                className={`vocab-tower-route__summit-action${summitEligible ? '' : ' is-locked'}`}
                                onClick={() => (summitEligible
                                    ? onOpenSummit?.(summitNextStage)
                                    : setOpenedCondition((current) => (current === 'summit' ? null : 'summit')))}
                                disabled={submitting || (summitEligible && hasAnyActive)}
                                aria-expanded={summitEligible ? undefined : openedCondition === 'summit'}
                            >
                                {summitEligible
                                    ? `👑 어휘 마스터 ${summitNextStage}단계 도전`
                                    : summitRetryBlocked
                                        ? `📚 낱말 ${summitRetry.remaining_count}개 더 익히기`
                                        : '🔒 어휘 마스터 도전'}
                            </button>
                        )}
                        {openedCondition === 'summit-help' && (
                            <div className="vocab-deck-card__condition vocab-summit-help" role="note">
                                <strong>어휘 마스터는 이런 시험이에요</strong>
                                <ul>
                                    <li>
                                        열 층의 <b>덱마스터를 모두 통과</b>하면 열려요.
                                        문제는 <b>열 층 전체</b>에서 골고루 나와요.
                                    </li>
                                    <li>
                                        <b>1 → 2 → 3단계</b> 순서로 올라가요. 앞 단계를 통과해야 다음이 열려요.
                                        {summitStages.length > 0 && (
                                            <> 단계가 오를수록 직접 쓰는 문제가 늘어나요
                                            ({summitStages.map((stage) => `${stage.stage}단계 ${stage.input_count}개`).join(' · ')}).</>
                                        )}
                                    </li>
                                    <li>
                                        {summitQuestionCount}문항 중 {summitStages[0]?.pass_correct ?? 17}개를 맞히면 통과예요.
                                        통과할 때마다 별이 하나씩 늘어요.
                                    </li>
                                </ul>
                                <strong className="vocab-summit-help__warn">틀린 낱말은 다시 익혀야 해요</strong>
                                <ul>
                                    <li>
                                        시험에서 틀린 낱말은 <b>다시 볼 낱말</b>이 돼요.{' '}
                                        <b>통과했더라도</b> 틀린 낱말은 똑같이 돌아가요.
                                    </li>
                                    <li>
                                        그 낱말을 <b>모두 다시 익혀야</b> 이 시험에 또 도전할 수 있어요.
                                        어느 층에 있는지는 그때 알려 줄게요.
                                    </li>
                                    <li>
                                        시험 도중에 나가면 <b>처음부터 다시 칠 수 있어요.</b>{' '}
                                        대신 통과로는 치지 않고, 그때까지 푼 것도 남지 않아요.
                                    </li>
                                </ul>
                                <small>한 번 받은 별은 사라지지 않아요. 마음 편히 도전해 보세요.</small>
                            </div>
                        )}
                        {openedCondition === 'summit' && summitRetryBlocked && (
                            <div className="vocab-deck-card__condition" role="note">
                                <strong>지난 시험에서 틀린 낱말을 다시 익혀요</strong>
                                <ul>
                                    <li>
                                        <b>{summitRetry.done_count}/{summitRetry.required_count}개</b> 다시 익혔어요
                                        {summitRetry.remaining_count > 0 && ` (앞으로 ${summitRetry.remaining_count}개)`}
                                    </li>
                                </ul>
                                {summitRetryDecks.length > 0 && (
                                    <p className="vocab-summit-retry-decks">
                                        <b>어느 층에 있냐면</b>
                                        {summitRetryDecks.map((entry) => (
                                            <span key={entry.deck_number}>
                                                {entry.deck_number}층 {entry.count}개
                                            </span>
                                        ))}
                                    </p>
                                )}
                                <small>
                                    그 층을 연습하면 이 낱말들이 먼저 나와요.
                                </small>
                            </div>
                        )}
                        {openedCondition === 'summit' && !summitEligible && !summitRetryBlocked && (
                            <div className="vocab-deck-card__condition" role="note">
                                <strong>이렇게 하면 열려요</strong>
                                <ul>
                                    <li>열 개 층의 <b>덱마스터</b>를 모두 통과하기 — 지금 {summitPassed}/{summitRequired} (앞으로 {summitMissing}개)</li>
                                </ul>
                                <small>
                                    정상은 {summitLevelCount}단계예요. 단계가 오를수록 고르는 문제가 줄고 <b>직접 쓰는 문제</b>가 늘어나요
                                    ({summitStages.map((stage) => `${stage.stage}단계 ${stage.input_count}개`).join(' · ')}).
                                </small>
                            </div>
                        )}
                    </div>

                    {explorationDecks.map((deck) => {
                        const deckNumber = Number(deck.deck_number);
                        const isActive = activeDeckNumber === deckNumber;
                        // 잠금 판정은 서버 값을 사용한다. 마이그레이션 전 응답은 기존처럼 열림으로 읽는다.
                        const floorUnlocked = deck.unlocked !== false || isActive;
                        const unlockRequiredDeck = Number(deck.unlock_required_deck || Math.max(1, deckNumber - 1));
                        const floorConditionKey = `floor-${deckNumber}`;
                        const hasOtherActive = activeDeckNumber > 0 && !isActive;
                        const practiceRuns = Number(deck.practice_runs || 0);
                        const completedRuns = Number(deck.completed_runs || 0);
                        const bestAccuracy = Number(deck.best_accuracy || 0);
                        const rewardCompleted = Boolean(deck.reward_completed);
                        const earnedPoints = Number(deck.earned_reward_points || 0);
                        const deckPoints = Number(deck.deck_reward_points || 0);
                        const nextMilestonePercent = Number(deck.next_milestone_percent || 0);
                        const nextMilestonePoints = Number(deck.next_milestone_points || 0);
                        const nextMilestoneRemaining = Number(deck.next_milestone_remaining || 0);
                        const itemCount = Number(deck.item_count || 0);
                        const masteredCount = Number(deck.mastered_count || 0);
                        const needsReviewCount = Number(deck.needs_review_count || 0);
                        const learningCount = Number(deck.learning_count || 0)
                            + Number(deck.familiar_count || 0);
                        const seenCount = Number(deck.seen_count || 0);
                        const unseenCount = Number(deck.unseen_count ?? itemCount);
                        const hasPractice = practiceRuns > 0 || seenCount > 0;
                        const learningPercent = itemCount > 0
                            ? Math.min(100, Math.round(seenCount / itemCount * 100))
                            : 0;
                        const isConquered = bestAccuracy >= 100;
                        // 지난 시험에서 틀린 낱말을 다시 익혀야 또 칠 수 있다(서버가 판단한 값을 그대로 쓴다).
                        const masterRetry = deck.master_retry || null;
                        const retryBlocked = Boolean(masterRetry?.blocked);
                        const masterEligible = Boolean(deck.master_eligible) && !retryBlocked;
                        const canOpenMaster = floorUnlocked && masterEligible;
                        const masterPassed = Boolean(deck.master_passed);
                        const masterRequired = Number(deck.master_required_mastered || 0);
                        const masterMissing = Number(deck.master_missing_mastered || 0);
                        const cardStatus = !floorUnlocked
                            ? `${unlockRequiredDeck}층 덱마스터 필요`
                            : isActive
                            ? `연습 진행 중 ${activeRun.answer_count}/${activeRun.target_question_count}`
                            : isConquered ? '정복 완료' : hasPractice ? `학습 ${seenCount}/${itemCount}` : '미탐험';
                        // 포인트는 익힌 낱말 수가 25·50·75·100% 구간을 넘을 때마다 나눠 받는다.
                        const rewardTitle = deckPoints <= 0
                            ? '포인트 목표 없음'
                            : rewardCompleted
                                ? `이 층 포인트 모두 받음 ${earnedPoints}P`
                                : `포인트 ${earnedPoints}/${deckPoints}P`;
                        const rewardDescription = deckPoints <= 0
                            ? '포인트 없이 낱말 학습 기록만 쌓여요.'
                            : rewardCompleted
                                ? '이 층 낱말을 모두 익혀 포인트를 다 모았어요.'
                                : `${nextMilestonePercent}% 목표까지 ${nextMilestoneRemaining}개 더 익히면 +${nextMilestonePoints}P`;
                        return (
                            <div
                                key={deck.deck_id || deckNumber}
                                ref={deckNumber === suggestedDeckNumber ? initialMapTargetRef : undefined}
                                className={`vocab-tower-route__stop ${deckNumber % 2 === 0 ? 'is-right' : 'is-left'}${floorUnlocked ? '' : ' is-locked'}${isActive ? ' is-active' : ''}${isConquered ? ' is-conquered' : hasPractice ? ' is-explored' : ''}`}
                            >
                                <span className="vocab-tower-route__marker" aria-hidden="true">
                                    {!floorUnlocked ? '🔒' : isConquered ? '★' : isActive ? '●' : deckNumber}
                                </span>
                                <article
                                    className={`vocab-deck-card${floorUnlocked ? '' : ' is-floor-locked'}${isActive ? ' is-active' : hasPractice ? ' is-practiced' : ''}${rewardCompleted ? ' is-reward-complete' : ''}${isConquered ? ' is-conquered' : ''}`}
                                    aria-current={isActive ? 'step' : undefined}
                                    aria-label={`${deckNumber}층, ${floorUnlocked ? '' : `잠김, ${unlockRequiredDeck}층 덱마스터 필요, `}${isConquered ? '정복 완료, ' : ''}전체 ${itemCount}개, 학습 ${seenCount}개, 연습 중 ${learningCount}개, 다시 볼 낱말 ${needsReviewCount}개, 완전히 익힘 ${masteredCount}개, ${rewardTitle}`}
                                >
                                    <div className="vocab-deck-card__floor">
                                        {isConquered && <i aria-hidden="true">🚩</i>}
                                        <span>{deckNumber}</span><small>층</small>
                                    </div>
                                    <div className="vocab-deck-card__copy">
                                        <div className="vocab-deck-card__heading">
                                            <strong>전체 {itemCount}개 낱말</strong>
                                            <span className={isActive ? 'is-active' : isConquered ? 'is-conquered' : hasPractice ? 'is-started' : ''}>{cardStatus}</span>
                                        </div>
                                        <div className="vocab-deck-card__progress">
                                            <div><span>한 번 이상 학습한 낱말</span><strong>{seenCount}/{itemCount}</strong></div>
                                            <span className="vocab-deck-card__progress-track" aria-hidden="true">
                                                <span style={{ width: `${learningPercent}%` }} />
                                            </span>
                                        </div>
                                        <div className="vocab-deck-card__states-head">
                                            <span>낱말 상태</span>
                                            {/* 교사·학생 화면의 도움말은 `💡 도움말` 알약으로 통일한다.
                                                ⓘ 아이콘은 다른 뜻(짧은 덧붙임)이라 여기서는 쓰지 않는다. */}
                                            <GuideInfoButton
                                                variant="help"
                                                onClick={(event) => { event.stopPropagation(); setStatesHelpOpen(true); }}
                                                label="낱말 상태가 무슨 뜻인지 보기"
                                            />
                                        </div>
                                        <div className="vocab-deck-card__states" aria-label={`${deckNumber}층 낱말 학습 상태`}>
                                            <div className="is-new"><span>처음 볼 낱말</span><strong>{unseenCount}</strong></div>
                                            <div className="is-learning"><span>연습 중</span><strong>{learningCount}</strong></div>
                                            <div className="is-review"><span>다시 볼 낱말</span><strong>{needsReviewCount}</strong></div>
                                            <div className="is-mastered"><span>완전히 익힘</span><strong>{masteredCount}</strong></div>
                                        </div>

                                        <p className="vocab-deck-card__record">12문항 완료 {completedRuns}회{completedRuns > 0 ? ` · 최고 정답률 ${bestAccuracy}%` : ''}</p>
                                        <div className={`vocab-deck-card__reward${rewardCompleted ? ' is-complete' : deckPoints > 0 ? ' is-pending' : ' is-off'}`}>
                                            <span aria-hidden="true">{rewardCompleted ? '✅' : deckPoints > 0 ? '🎁' : '📘'}</span>
                                            <div>
                                                <strong>{rewardTitle}</strong>
                                                <small>{rewardDescription}</small>
                                                {deckPoints > 0 && (
                                                    <span className="vocab-deck-card__reward-track" aria-hidden="true">
                                                        <span style={{ width: `${Math.min(100, Math.round(earnedPoints / deckPoints * 100))}%` }} />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="vocab-deck-card__actions">
                                        <button
                                            type="button"
                                            className={floorUnlocked ? undefined : 'is-floor-locked'}
                                            onClick={() => (floorUnlocked
                                                ? onStart(deckNumber)
                                                : setOpenedCondition((current) => (current === floorConditionKey ? null : floorConditionKey)))}
                                            disabled={submitting || (floorUnlocked && hasOtherActive)}
                                            aria-expanded={floorUnlocked ? undefined : openedCondition === floorConditionKey}
                                        >
                                            {!floorUnlocked
                                                ? `🔒 ${deckNumber}층 잠김`
                                                : hasOtherActive
                                                ? `${activeDeckNumber}층 연습을 먼저 완료하세요`
                                                : isActive ? '연습 이어하기' : isConquered ? '정복한 층 다시 탐험' : hasPractice ? '이 층 다시 연습' : '이 층 탐험 시작'}
                                        </button>
                                        {/* 도전 버튼은 자격이 없어도 보여 준다 — 목표가 보여야 향해 간다.
                                            잠겨 있으면 누를 때 시험이 아니라 조건이 열린다.
                                            자격 판단은 서버가 한 값(master_eligible)을 그대로 쓴다. */}
                                        <button
                                            type="button"
                                            className={`vocab-deck-card__master${canOpenMaster ? '' : ' is-locked'}${masterPassed ? ' is-passed' : ''}`}
                                            onClick={() => (floorUnlocked
                                                ? (masterEligible
                                                    ? onOpenDeckMaster(deckNumber)
                                                    : setOpenedCondition((current) => (current === deckNumber ? null : deckNumber)))
                                                : setOpenedCondition((current) => (current === floorConditionKey ? null : floorConditionKey)))}
                                            disabled={submitting || (canOpenMaster && hasOtherActive)}
                                            aria-expanded={canOpenMaster ? undefined : openedCondition === (floorUnlocked ? deckNumber : floorConditionKey)}
                                        >
                                            {!floorUnlocked
                                                ? '🔒 층 잠김'
                                                : masterEligible
                                                ? (masterPassed ? '🏆 덱마스터 다시 도전' : '🏆 덱마스터 도전')
                                                : retryBlocked
                                                    ? `📚 낱말 ${masterRetry.remaining_count}개 더 익히기`
                                                    : '🔒 덱마스터 도전'}
                                        </button>
                                        {/* 만난 낱말이 있어야 볼 것이 있다. 아직 없으면 버튼을 만들지 않는다. */}
                                        {seenCount > 0 && (
                                            <button
                                                type="button"
                                                className="is-quiet"
                                                onClick={() => onOpenCardBox(deckNumber)}
                                                disabled={submitting}
                                            >
                                                낱말 카드함 {seenCount}개
                                            </button>
                                        )}
                                    </div>
                                    {openedCondition === floorConditionKey && !floorUnlocked && (
                                        <div className="vocab-deck-card__condition is-floor-lock" role="note">
                                            <strong>{deckNumber}층을 열려면</strong>
                                            <ul>
                                                <li><b>{unlockRequiredDeck}층 덱마스터</b>를 먼저 통과하세요.</li>
                                            </ul>
                                            <small>막힌 층을 통과하면 바로 다음 층이 열립니다. 아래층은 열린 뒤에도 언제든 다시 연습할 수 있어요.</small>
                                        </div>
                                    )}
                                    {floorUnlocked && openedCondition === deckNumber && retryBlocked && (
                                        <div className="vocab-deck-card__condition" role="note">
                                            <strong>지난 시험에서 틀린 낱말을 다시 익혀요</strong>
                                            <ul>
                                                <li>
                                                    <b>{masterRetry.done_count}/{masterRetry.required_count}개</b> 다시 익혔어요
                                                    {masterRetry.remaining_count > 0 && ` (앞으로 ${masterRetry.remaining_count}개)`}
                                                </li>
                                            </ul>
                                            <small>
                                                틀린 낱말은 <b>다시 볼 낱말</b>이 되어 이 층을 연습하면 먼저 나와요.
                                                서로 다른 두 가지 문제를 연달아 맞히면 다시 익힘이 돼요.
                                            </small>
                                        </div>
                                    )}
                                    {floorUnlocked && openedCondition === deckNumber && !masterEligible && !retryBlocked && (
                                        <div className="vocab-deck-card__condition" role="note">
                                            <strong>이렇게 하면 열려요</strong>
                                            <ul>
                                                <li>
                                                    이 층 낱말을 <b>완전히 익히기</b> {masterRequiredPercent}% 이상
                                                    {' — '}지금 {masteredCount}/{masterRequired}개
                                                    {masterMissing > 0 ? ` (앞으로 ${masterMissing}개)` : ' ✓'}
                                                </li>
                                                <li>
                                                    이 층 낱말을 <b>모두 한 번씩 만나기</b>
                                                    {' — '}지금 {seenCount}/{itemCount}개
                                                    {unseenCount > 0 ? ` (앞으로 ${unseenCount}개)` : ' ✓'}
                                                </li>
                                            </ul>
                                            <small>
                                                낱말은 <b>서로 다른 두 가지 문제 형태를 힌트 없이 연속으로</b> 맞혀야 완전히 익힘이 돼요.
                                                이 층을 연습하면 채워져요.
                                            </small>
                                        </div>
                                    )}
                                </article>
                            </div>
                        );
                    })}

                    <div className="vocab-tower-route__entrance">
                        <span aria-hidden="true">🚪</span>
                        <div><strong>탑 입구</strong><small>1층부터 시작해 덱마스터를 통과하며 한 층씩 올라가요.</small></div>
                    </div>
                </div>

                {activeDeckNumber > 0 && <p className="vocab-deck-map__active-note">{activeDeckNumber}층 연습을 어서 이어서 끝내보세요.</p>}
                {notice && <p className="vocab-journey__notice" role="alert">{notice}</p>}
            </main>

            {statesHelpOpen && (
                <div
                    className="vocab-journey__overlay"
                    role="presentation"
                    onMouseDown={(event) => { if (event.target === event.currentTarget) setStatesHelpOpen(false); }}
                >
                    <div
                        className="vocab-journey__dialog vocab-states-help"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="vocab-states-help-title"
                    >
                        <span className="vocab-journey__dialog-icon" aria-hidden="true">🧩</span>
                        <h2 id="vocab-states-help-title">낱말 상태는 이런 뜻이에요</h2>
                        <ul className="vocab-states-help__list">
                            <li className="is-new">
                                <strong>처음 볼 낱말</strong>
                                <span>아직 한 번도 만나지 않았어요. 연습하면 여기부터 줄어들어요.</span>
                            </li>
                            <li className="is-learning">
                                <strong>연습 중</strong>
                                <span>만나 봤지만 아직 익히는 중이에요. 조금 더 연습하면 돼요.</span>
                            </li>
                            <li className="is-review">
                                <strong>다시 볼 낱말</strong>
                                <span>틀렸던 낱말이에요. 이 층을 연습하면 <b>먼저 나와요</b>.</span>
                            </li>
                            <li className="is-mastered">
                                <strong>완전히 익힘</strong>
                                <span><b>서로 다른 두 가지 문제 형태를 힌트 없이 연속으로</b> 맞힌 낱말이에요.</span>
                            </li>
                        </ul>
                        <p className="vocab-states-help__note">
                            포인트는 <b>완전히 익힘</b>이 늘어날 때 4분의 1, 반, 4분의 3, 전부에서 <b>네 번 나눠 받아요</b>.
                        </p>
                        <div className="vocab-journey__dialog-actions">
                            <button type="button" onClick={() => setStatesHelpOpen(false)}>알겠어요</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default V2DeckMap;
