import React from 'react';

const V2DeckMap = ({
    grade,
    decks,
    activeRun,
    perfectRewardPoints,
    submitting,
    notice,
    onStart,
    onBack
}) => {
    const activeDeckNumber = Number(activeRun?.deck_number || 0);
    const startedDecks = decks.filter((deck) => Number(deck.seen_count || 0) > 0).length;
    const totalItems = decks.reduce((sum, deck) => sum + Number(deck.item_count || 0), 0);
    const totalSeen = decks.reduce((sum, deck) => sum + Number(deck.seen_count || 0), 0);
    const totalMastered = decks.reduce((sum, deck) => sum + Number(deck.mastered_count || 0), 0);
    const rewardedDecks = decks.filter((deck) => Boolean(deck.perfect_reward_earned)).length;

    return (
        <div className="vocab-journey vocab-journey--deck-map">
            <main className="vocab-deck-map">
                <button type="button" className="vocab-journey__back" onClick={onBack}>← 놀이터</button>
                <p className="vocab-intro-card__eyebrow">{grade}학년 개인 어휘 수련</p>
                <h1>어휘의 탑 지도</h1>
                <p className="vocab-intro-card__lead">층을 하나 골라 12개 낱말을 연습해요. 연습 결과는 층별로 쌓입니다.</p>

                <div className="vocab-deck-map__summary" aria-label="개인 연습 요약">
                    <div><span>학습 시작한 층</span><strong>{startedDecks}/10</strong></div>
                    <div><span>한 번 이상 학습한 낱말</span><strong>{totalSeen}/{totalItems}</strong></div>
                    <div><span>완전히 익힌 낱말</span><strong>{totalMastered}/{totalItems}</strong></div>
                    <div><span>포인트 목표 완료</span><strong>{rewardedDecks}/10층</strong></div>
                </div>

                <div className="vocab-deck-map__grid" aria-label="어휘 덱 10개">
                    {decks.map((deck) => {
                        const deckNumber = Number(deck.deck_number);
                        const isActive = activeDeckNumber === deckNumber;
                        const hasOtherActive = activeDeckNumber > 0 && !isActive;
                        const practiceRuns = Number(deck.practice_runs || 0);
                        const completedRuns = Number(deck.completed_runs || 0);
                        const bestAccuracy = Number(deck.best_accuracy || 0);
                        const perfectRewardEarned = Boolean(deck.perfect_reward_earned);
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
                        const cardStatus = isActive
                            ? `연습 진행 중 ${activeRun.answer_count}/${activeRun.target_question_count}`
                            : hasPractice ? `학습 ${seenCount}/${itemCount}` : '아직 학습 전';
                        const rewardTitle = perfectRewardEarned
                            ? '포인트 목표 완료'
                            : perfectRewardPoints > 0 ? '포인트 목표 도전 중' : '포인트 목표 없음';
                        const rewardDescription = perfectRewardEarned
                            ? '포인트를 이미 받았어요.'
                            : perfectRewardPoints > 0
                                ? `한 번의 연습에서 12문항을 모두 맞히면 +${perfectRewardPoints}P`
                                : '포인트 없이 낱말 학습 기록만 쌓여요.';
                        return (
                            <article
                                key={deck.deck_id || deckNumber}
                                className={`vocab-deck-card${isActive ? ' is-active' : hasPractice ? ' is-practiced' : ''}${perfectRewardEarned ? ' is-reward-complete' : ''}`}
                                aria-label={`${deckNumber}층, 전체 ${itemCount}개, 학습 ${seenCount}개, 연습 중 ${learningCount}개, 다시 볼 낱말 ${needsReviewCount}개, 완전히 익힘 ${masteredCount}개, ${rewardTitle}`}
                            >
                                <div className="vocab-deck-card__floor"><span>{deckNumber}</span><small>층</small></div>
                                <div className="vocab-deck-card__copy">
                                    <div className="vocab-deck-card__heading">
                                        <strong>전체 {itemCount}개 낱말</strong>
                                        <span className={isActive ? 'is-active' : hasPractice ? 'is-started' : ''}>{cardStatus}</span>
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
                                    <div className={`vocab-deck-card__reward${perfectRewardEarned ? ' is-complete' : perfectRewardPoints > 0 ? ' is-pending' : ' is-off'}`}>
                                        <span aria-hidden="true">{perfectRewardEarned ? '✅' : perfectRewardPoints > 0 ? '🎁' : '📘'}</span>
                                        <div><strong>{rewardTitle}</strong><small>{rewardDescription}</small></div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onStart(deckNumber)}
                                    disabled={submitting || hasOtherActive}
                                >
                                    {hasOtherActive
                                        ? `${activeDeckNumber}층 연습을 먼저 완료하세요`
                                        : isActive ? '연습 이어하기' : hasPractice ? '이 층 다시 연습' : '이 층 연습 시작'}
                                </button>
                            </article>
                        );
                    })}
                </div>

                {activeDeckNumber > 0 && <p className="vocab-deck-map__active-note">{activeDeckNumber}층 연습을 어서 이어서 끝내보세요.</p>}
                {notice && <p className="vocab-journey__notice" role="alert">{notice}</p>}
            </main>
        </div>
    );
};

export default V2DeckMap;
