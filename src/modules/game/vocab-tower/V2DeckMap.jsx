import React from 'react';

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
        || Number(ascendingDecks.find((deck) => Number(deck.best_accuracy || 0) < 100)?.deck_number)
        || Number(explorationDecks[0]?.deck_number || 0);
    const hasAnyActive = activeDeckNumber > 0;
    const summitEligible = Boolean(summit?.eligible);
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

    return (
        <div className="vocab-journey vocab-journey--deck-map">
            <main className="vocab-deck-map">
                <button type="button" className="vocab-journey__back" onClick={onBack}>← 놀이터</button>
                <p className="vocab-intro-card__eyebrow">{grade}학년 개인 어휘 수련</p>
                <h1>어휘의 탑 지도</h1>
                <p className="vocab-intro-card__lead">탑의 길을 따라 오르며 층마다 12개 낱말에 도전해요. 어느 층이든 골라 탐험할 수 있어요.</p>

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
                                {summitCompleted
                                    ? '어휘 마스터 완성!'
                                    : summitLevel > 0
                                        ? `어휘 마스터 ${summitLevel}단계`
                                        : summitEligible ? '어휘의 정상이 열렸어요' : '어휘의 정상'}
                            </strong>
                            <small>
                                {summitCompleted
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
                                    : '🔒 어휘 마스터 도전'}
                            </button>
                        )}
                        {openedCondition === 'summit' && !summitEligible && (
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
                        const masterEligible = Boolean(deck.master_eligible);
                        const masterPassed = Boolean(deck.master_passed);
                        const masterRequired = Number(deck.master_required_mastered || 0);
                        const masterMissing = Number(deck.master_missing_mastered || 0);
                        const cardStatus = isActive
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
                                className={`vocab-tower-route__stop ${deckNumber % 2 === 0 ? 'is-right' : 'is-left'}${isActive ? ' is-active' : ''}${isConquered ? ' is-conquered' : hasPractice ? ' is-explored' : ''}`}
                            >
                                <span className="vocab-tower-route__marker" aria-hidden="true">
                                    {isConquered ? '★' : isActive ? '●' : deckNumber}
                                </span>
                                <article
                                    className={`vocab-deck-card${isActive ? ' is-active' : hasPractice ? ' is-practiced' : ''}${rewardCompleted ? ' is-reward-complete' : ''}${isConquered ? ' is-conquered' : ''}`}
                                    aria-current={isActive ? 'step' : undefined}
                                    aria-label={`${deckNumber}층, ${isConquered ? '정복 완료, ' : ''}전체 ${itemCount}개, 학습 ${seenCount}개, 연습 중 ${learningCount}개, 다시 볼 낱말 ${needsReviewCount}개, 완전히 익힘 ${masteredCount}개, ${rewardTitle}`}
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
                                            onClick={() => onStart(deckNumber)}
                                            disabled={submitting || hasOtherActive}
                                        >
                                            {hasOtherActive
                                                ? `${activeDeckNumber}층 연습을 먼저 완료하세요`
                                                : isActive ? '연습 이어하기' : isConquered ? '정복한 층 다시 탐험' : hasPractice ? '이 층 다시 연습' : '이 층 탐험 시작'}
                                        </button>
                                        {/* 도전 버튼은 자격이 없어도 보여 준다 — 목표가 보여야 향해 간다.
                                            잠겨 있으면 누를 때 시험이 아니라 조건이 열린다.
                                            자격 판단은 서버가 한 값(master_eligible)을 그대로 쓴다. */}
                                        <button
                                            type="button"
                                            className={`vocab-deck-card__master${masterEligible ? '' : ' is-locked'}${masterPassed ? ' is-passed' : ''}`}
                                            onClick={() => (masterEligible
                                                ? onOpenDeckMaster(deckNumber)
                                                : setOpenedCondition((current) => (current === deckNumber ? null : deckNumber)))}
                                            disabled={submitting || (masterEligible && hasOtherActive)}
                                            aria-expanded={masterEligible ? undefined : openedCondition === deckNumber}
                                        >
                                            {masterPassed
                                                ? '🏆 덱마스터 다시 도전'
                                                : masterEligible ? '🏆 덱마스터 도전' : '🔒 덱마스터 도전'}
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
                                    {openedCondition === deckNumber && !masterEligible && (
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
                        <div><strong>탑 입구</strong><small>층을 골라 나만의 탐험을 시작해요.</small></div>
                    </div>
                </div>

                {activeDeckNumber > 0 && <p className="vocab-deck-map__active-note">{activeDeckNumber}층 연습을 어서 이어서 끝내보세요.</p>}
                {notice && <p className="vocab-journey__notice" role="alert">{notice}</p>}
            </main>
        </div>
    );
};

export default V2DeckMap;
