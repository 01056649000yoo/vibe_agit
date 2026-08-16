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
    const completedDecks = decks.filter((deck) => Number(deck.completed_runs) > 0).length;
    const totalItems = decks.reduce((sum, deck) => sum + Number(deck.item_count || 0), 0);
    const totalMastered = decks.reduce((sum, deck) => sum + Number(deck.mastered_count || 0), 0);

    return (
        <div className="vocab-journey vocab-journey--deck-map">
            <main className="vocab-deck-map">
                <button type="button" className="vocab-journey__back" onClick={onBack}>← 놀이터</button>
                <p className="vocab-intro-card__eyebrow">{grade}학년 개인 어휘 수련</p>
                <h1>어휘의 탑 지도</h1>
                <p className="vocab-intro-card__lead">층을 하나 골라 12개 낱말을 연습해요. 연습 결과는 층별로 쌓입니다.</p>

                <div className="vocab-deck-map__summary" aria-label="개인 연습 요약">
                    <div><span>연습한 층</span><strong>{completedDecks}/10</strong></div>
                    <div><span>익힌 낱말</span><strong>{totalMastered}/{totalItems}</strong></div>
                    <div><span>한 번의 연습</span><strong>12문항</strong></div>
                    <div><span>최초 12/12</span><strong>{perfectRewardPoints}P</strong></div>
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
                        const masteredCount = Number(deck.mastered_count || 0);
                        const needsReviewCount = Number(deck.needs_review_count || 0);
                        const seenCount = Number(deck.seen_count || 0);
                        const unseenCount = Number(deck.unseen_count ?? deck.item_count ?? 0);
                        const hasPractice = practiceRuns > 0 || seenCount > 0;
                        return (
                            <article key={deck.deck_id || deckNumber} className={`vocab-deck-card${isActive ? ' is-active' : hasPractice ? ' is-practiced' : ''}`}>
                                <div className="vocab-deck-card__floor"><span>{deckNumber}</span><small>층</small></div>
                                <div className="vocab-deck-card__copy">
                                    <strong>{Number(deck.item_count || 0)}개 낱말 덱</strong>
                                    <span>{isActive
                                        ? `${activeRun.answer_count}/${activeRun.target_question_count} 진행 중`
                                        : hasPractice
                                            ? `익힘 ${masteredCount} · 복습 ${needsReviewCount} · 새 낱말 ${unseenCount}`
                                            : '아직 연습 전'}</span>
                                    <small>{perfectRewardEarned
                                        ? '완벽 연습 보상 받음'
                                        : perfectRewardPoints > 0
                                            ? `첫 12/12 달성 +${perfectRewardPoints}P`
                                            : hasPractice ? `최고 정답률 ${bestAccuracy}% · 완료 ${completedRuns}회` : '뜻·빈칸·쓰임 선택'}</small>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onStart(deckNumber)}
                                    disabled={submitting || hasOtherActive}
                                >
                                    {isActive ? '이어하기' : hasPractice ? '다시 연습' : '연습 시작'}
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
