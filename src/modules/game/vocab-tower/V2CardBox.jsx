import React from 'react';

/**
 * 낱말 카드함 — 학생이 낱말마다 "왜 아직 익힘이 아닌지"와 "언제 다시 만나는지"를 확인하는 화면.
 *
 * 층 카드에는 상태별 개수만 보여 그다음에 뭘 해야 할지 알 수 없었다. 여기서는 낱말별로
 * 시도·정답·오답 횟수, 힌트 없이 성공한 문제 형태 수, 다음 복습 시점을 근거로 함께 보여 준다.
 *
 * **모달이 아니라 화면 단계다.** 게임 실행 화면은 `zIndex: 20000` 이고 공용 `Modal` 은 9999라
 * 이 안에서 창을 띄우면 뒤에 숨는다(2026-08-17 지도 도움말에서 실제로 겪음).
 *
 * 아직 만나지 않은 낱말은 서버가 목록에 넣지 않는다. 카드함으로 앞으로 나올 낱말과 뜻을 미리 보면
 * 직접 입력형에서 정답을 감추는 장치가 무의미해지기 때문이며, 여기서는 개수만 안내한다.
 */
const CARD_STATES = Object.freeze({
    confusing: { label: '자주 헷갈려요', icon: '🌀', tone: 'is-confusing' },
    review_now: { label: '다시 볼 낱말', icon: '🔁', tone: 'is-review' },
    review_due: { label: '복습할 때가 됐어요', icon: '⏰', tone: 'is-due' },
    learning: { label: '연습 중', icon: '🌱', tone: 'is-learning' },
    almost: { label: '거의 익혔어요', icon: '🌿', tone: 'is-almost' },
    mastered: { label: '완전히 익힘', icon: '🌳', tone: 'is-mastered' }
});

const formatReviewDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    const days = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    if (days <= 0) return '지금 복습할 때예요';
    if (days === 1) return '내일 다시 만나요';
    return `${days}일 뒤 다시 만나요`;
};

const buildEvidence = (card) => {
    const attempts = Number(card.attempt_count || 0);
    const correct = Number(card.correct_count || 0);
    const wrong = Number(card.wrong_count || 0);
    const typeCount = Number(card.correct_type_count || 0);
    const lines = [`${attempts}번 만나서 ${correct}번 맞고 ${wrong}번 틀렸어요.`];

    // 익힘 조건은 서로 다른 두 형태를 힌트 없이 연속 성공하는 것이다. 남은 조건을 그대로 알려 준다.
    if (card.card_state === 'mastered' || card.card_state === 'review_due') {
        lines.push(`서로 다른 ${typeCount}가지 문제로 맞혀서 익힘이 됐어요.`);
    } else if (typeCount >= 1) {
        lines.push(`${typeCount}가지 문제로 맞혔어요. 다른 형태로 한 번 더 맞히면 익힘이에요.`);
    } else {
        lines.push('아직 힌트 없이 맞힌 적이 없어요. 뜻을 먼저 익혀 봐요.');
    }
    return lines;
};

const V2CardBox = ({ cardBox, notice, onBack }) => {
    const cards = Array.isArray(cardBox?.cards) ? cardBox.cards : [];
    const deckNumber = Number(cardBox?.deck_number || 0);
    const itemCount = Number(cardBox?.item_count || 0);
    const seenCount = Number(cardBox?.seen_count || 0);
    const unseenCount = Number(cardBox?.unseen_count || 0);
    const masteredCount = cards.filter((card) => card.card_state === 'mastered').length;

    return (
        <div className="vocab-journey vocab-journey--card-box">
            <main className="vocab-card-box">
                <button type="button" className="vocab-journey__back" onClick={onBack}>← 탑 지도</button>
                <p className="vocab-intro-card__eyebrow">{deckNumber}층 낱말 카드함</p>
                <h1>내가 만난 낱말</h1>
                <p className="vocab-intro-card__lead">
                    낱말마다 지금까지의 기록과 다음에 다시 만날 때를 확인할 수 있어요.
                </p>

                <div className="vocab-card-box__summary" aria-label="카드함 요약">
                    <div><span>만난 낱말</span><strong>{seenCount}/{itemCount}</strong></div>
                    <div><span>완전히 익힘</span><strong>{masteredCount}</strong></div>
                    <div><span>아직 만나지 않음</span><strong>{unseenCount}</strong></div>
                </div>

                {notice && <p className="vocab-journey__notice" role="alert">{notice}</p>}

                {cards.length === 0 ? (
                    <div className="vocab-card-box__empty">
                        <span aria-hidden="true">📭</span>
                        <strong>아직 만난 낱말이 없어요.</strong>
                        <p>이 층을 한 번 연습하면 만난 낱말이 여기에 차곡차곡 쌓여요.</p>
                    </div>
                ) : (
                    <ul className="vocab-card-box__list">
                        {cards.map((card) => {
                            const state = Reflect.get(CARD_STATES, card.card_state) || CARD_STATES.learning;
                            const reviewLabel = formatReviewDate(card.next_review_at);
                            return (
                                <li key={card.item_key} className={`vocab-word-card ${state.tone}`}>
                                    <div className="vocab-word-card__head">
                                        <strong>{card.word}</strong>
                                        <em><span aria-hidden="true">{state.icon}</span>{state.label}</em>
                                    </div>
                                    <p className="vocab-word-card__definition">{card.definition}</p>
                                    {card.example && <p className="vocab-word-card__example">예: {card.example}</p>}
                                    <ul className="vocab-word-card__evidence">
                                        {buildEvidence(card).map((line) => <li key={line}>{line}</li>)}
                                    </ul>
                                    {reviewLabel && <p className="vocab-word-card__review">⏳ {reviewLabel}</p>}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <button type="button" className="vocab-journey__primary" onClick={onBack}>탑 지도로 돌아가기</button>
            </main>
        </div>
    );
};

export default V2CardBox;
