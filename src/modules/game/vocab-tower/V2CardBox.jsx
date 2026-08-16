import React, { useState } from 'react';

/**
 * 낱말 카드함 — 학생이 낱말마다 "왜 아직 익힘이 아닌지"와 "언제 다시 만나는지"를 확인하는 화면.
 *
 * 한 층이 40개라 전부 같은 크기로 늘어놓으면 훑기도 어렵고 읽고 지나가 기억에도 남지 않는다.
 * 그래서 두 가지를 적용한다.
 *   1) **밀도 조절**: 상태별로 묶어 접고, 다 익힌 낱말은 칩으로 압축한다. 지금 봐야 할 것만 펼쳐 둔다.
 *   2) **떠올리기**: 뜻을 가려 두고 학생이 먼저 떠올린 뒤 확인하게 한다. 읽기만 하면 남지 않지만
 *      스스로 꺼내 본 뒤 확인하면 남는다. 이 모듈이 `한 번 맞힌 것으로 익힘 처리하지 않는` 이유와 같다.
 *
 * **모달이 아니라 화면 단계다.** 게임 실행 화면은 `zIndex: 20000` 이고 공용 `Modal` 은 9999라
 * 이 안에서 창을 띄우면 뒤에 숨는다(2026-08-17 지도 도움말에서 실제로 겪음).
 *
 * 아직 만나지 않은 낱말은 서버가 목록에 넣지 않는다. 카드함으로 앞으로 나올 낱말과 뜻을 미리 보면
 * 직접 입력형에서 정답을 감추는 장치가 무의미해지기 때문이며, 여기서는 개수만 안내한다.
 */
const SECTIONS = Object.freeze([
    { id: 'confusing', label: '자주 헷갈려요', icon: '🌀', tone: 'is-confusing', open: true },
    { id: 'review_now', label: '다시 볼 낱말', icon: '🔁', tone: 'is-review', open: true },
    { id: 'review_due', label: '복습할 때가 됐어요', icon: '⏰', tone: 'is-due', open: true },
    { id: 'learning', label: '연습 중', icon: '🌱', tone: 'is-learning', open: true },
    { id: 'almost', label: '거의 익혔어요', icon: '🌿', tone: 'is-almost', open: false },
    // 다 익힌 낱말은 수가 가장 많고 급하지 않다. 칩으로 압축해 눌러야 뜻이 보이는 뒤집기 카드로 둔다.
    { id: 'mastered', label: '완전히 익힘', icon: '🌳', tone: 'is-mastered', open: false, chips: true }
]);

const formatReviewDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const days = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
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
    const [closedSections, setClosedSections] = useState(
        () => new Set(SECTIONS.filter((section) => !section.open).map((section) => section.id))
    );
    const [revealed, setRevealed] = useState(() => new Set());

    const deckNumber = Number(cardBox?.deck_number || 0);
    const itemCount = Number(cardBox?.item_count || 0);
    const seenCount = Number(cardBox?.seen_count || 0);
    const unseenCount = Number(cardBox?.unseen_count || 0);
    const masteredCount = cards.filter((card) => card.card_state === 'mastered').length;
    const allRevealed = cards.length > 0 && revealed.size >= cards.length;

    const toggleSection = (id) => setClosedSections((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const toggleReveal = (itemKey) => setRevealed((current) => {
        const next = new Set(current);
        if (next.has(itemKey)) next.delete(itemKey); else next.add(itemKey);
        return next;
    });

    const toggleAll = () => setRevealed(
        allRevealed ? new Set() : new Set(cards.map((card) => card.item_key))
    );

    return (
        <div className="vocab-journey vocab-journey--card-box">
            <main className="vocab-card-box">
                <button type="button" className="vocab-journey__back" onClick={onBack}>← 탑 지도</button>
                <p className="vocab-intro-card__eyebrow">{deckNumber}층 낱말 카드함</p>
                <h1>내가 만난 낱말</h1>
                <p className="vocab-intro-card__lead">
                    뜻을 먼저 <strong>떠올려 본 뒤</strong> 확인해 보세요. 그냥 읽을 때보다 훨씬 잘 기억나요.
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
                    <>
                        <div className="vocab-card-box__tools">
                            <button type="button" onClick={toggleAll}>
                                {allRevealed ? '뜻 모두 가리기' : '뜻 모두 보기'}
                            </button>
                        </div>

                        {SECTIONS.map((section) => {
                            const sectionCards = cards.filter((card) => card.card_state === section.id);
                            if (sectionCards.length === 0) return null;
                            const isClosed = closedSections.has(section.id);
                            const panelId = `vocab-card-section-${section.id}`;

                            return (
                                <section className={`vocab-card-group ${section.tone}`} key={section.id}>
                                    <button
                                        type="button"
                                        className="vocab-card-group__header"
                                        onClick={() => toggleSection(section.id)}
                                        aria-expanded={!isClosed}
                                        aria-controls={panelId}
                                    >
                                        <span aria-hidden="true">{section.icon}</span>
                                        <strong>{section.label}</strong>
                                        <em>{sectionCards.length}개</em>
                                        <i aria-hidden="true">{isClosed ? '▾' : '▴'}</i>
                                    </button>

                                    {!isClosed && (section.chips ? (
                                        <div className="vocab-card-group__chips" id={panelId}>
                                            {sectionCards.map((card) => {
                                                const isOpen = revealed.has(card.item_key);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={card.item_key}
                                                        className={`vocab-word-chip${isOpen ? ' is-open' : ''}`}
                                                        onClick={() => toggleReveal(card.item_key)}
                                                        aria-pressed={isOpen}
                                                    >
                                                        <strong>{card.word}</strong>
                                                        {isOpen && <small>{card.definition}</small>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <ul className="vocab-card-group__list" id={panelId}>
                                            {sectionCards.map((card) => {
                                                const isOpen = revealed.has(card.item_key);
                                                const reviewLabel = formatReviewDate(card.next_review_at);
                                                return (
                                                    <li key={card.item_key} className={`vocab-word-card ${section.tone}`}>
                                                        <div className="vocab-word-card__head">
                                                            <strong>{card.word}</strong>
                                                        </div>
                                                        {isOpen ? (
                                                            <>
                                                                <p className="vocab-word-card__definition">{card.definition}</p>
                                                                {card.example && (
                                                                    <p className="vocab-word-card__example">예: {card.example}</p>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    className="vocab-word-card__reveal is-open"
                                                                    onClick={() => toggleReveal(card.item_key)}
                                                                >
                                                                    뜻 다시 가리기
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="vocab-word-card__reveal"
                                                                onClick={() => toggleReveal(card.item_key)}
                                                            >
                                                                뜻을 떠올려 보세요 · 눌러서 확인
                                                            </button>
                                                        )}
                                                        <ul className="vocab-word-card__evidence">
                                                            {buildEvidence(card).map((line) => <li key={line}>{line}</li>)}
                                                        </ul>
                                                        {reviewLabel && <p className="vocab-word-card__review">⏳ {reviewLabel}</p>}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ))}
                                </section>
                            );
                        })}
                    </>
                )}

                <button type="button" className="vocab-journey__primary" onClick={onBack}>탑 지도로 돌아가기</button>
            </main>
        </div>
    );
};

export default V2CardBox;
