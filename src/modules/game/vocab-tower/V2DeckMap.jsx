import React from 'react';
import StudentModuleGuide from '../../../components/student/StudentModuleGuide';
import { VOCAB_TOWER_STUDENT_GUIDE } from './towerGuide';

const V2DeckMap = ({
    grade,
    decks,
    activeRun,
    submitting,
    notice,
    onStart,
    onBack
}) => {
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
    const summitConquered = conqueredDecks === deckCount && decks.length > 0;
    const suggestedDeckNumber = activeDeckNumber
        || Number(ascendingDecks.find((deck) => Number(deck.best_accuracy || 0) < 100)?.deck_number)
        || Number(explorationDecks[0]?.deck_number || 0);
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
                <div className="vocab-deck-map__guide-bar">
                    <StudentModuleGuide guide={VOCAB_TOWER_STUDENT_GUIDE} />
                </div>
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
                    <div className={`vocab-tower-route__summit${summitConquered ? ' is-conquered' : ''}`}>
                        <span className="vocab-tower-route__summit-icon" aria-hidden="true">👑</span>
                        <div>
                            <strong>{summitConquered ? '어휘의 정상 정복!' : '어휘의 정상'}</strong>
                            <small>{summitConquered ? '열 개 층을 모두 완벽하게 정복했어요.' : `정상까지 ${deckCount - conqueredDecks}개 층이 남았어요.`}</small>
                        </div>
                        <em>{conqueredDecks}/{deckCount}층</em>
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
                                    <button
                                        type="button"
                                        onClick={() => onStart(deckNumber)}
                                        disabled={submitting || hasOtherActive}
                                    >
                                        {hasOtherActive
                                            ? `${activeDeckNumber}층 연습을 먼저 완료하세요`
                                            : isActive ? '연습 이어하기' : isConquered ? '정복한 층 다시 탐험' : hasPractice ? '이 층 다시 연습' : '이 층 탐험 시작'}
                                    </button>
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
