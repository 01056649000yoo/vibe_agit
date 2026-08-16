import React, { useState } from 'react';

/**
 * 낱말 카드함 — 학생이 낱말마다 "왜 아직 익힘이 아닌지"와 "언제 다시 만나는지"를 확인하는 화면.
 *
 * 한 층이 40개라 전부 같은 크기로 늘어놓으면 훑기도 어렵고 읽고 지나가 기억에도 남지 않는다.
 * 그래서 세 가지를 적용한다.
 *   1) **밀도 조절**: 상태별로 묶고 **처음에는 모두 접어 둔다**. 먼저 어디에 몇 개가 있는지 보고
 *      필요한 묶음만 연다. 다 익힌 낱말은 펼쳐도 칩으로 압축한다.
 *   2) **떠올리기**: 한쪽을 가려 두고 학생이 먼저 떠올린 뒤 확인하게 한다. 읽기만 하면 남지 않지만
 *      스스로 꺼내 본 뒤 확인하면 남는다. 이 모듈이 `한 번 맞힌 것으로 익힘 처리하지 않는` 이유와 같다.
 *   3) **두 방향**: `뜻 가리기`(낱말→뜻)와 `낱말 가리기`(뜻→낱말)를 학생이 고른다. 뒤쪽이 더 어렵고
 *      글을 쓸 때 낱말을 꺼내 쓰는 힘에 가깝다. 실제 시험의 `meaningChoice`·`definitionInput`과 같은 두 방향이다.
 *
 * **모달이 아니라 화면 단계다.** 게임 실행 화면은 `zIndex: 20000` 이고 공용 `Modal` 은 9999라
 * 이 안에서 창을 띄우면 뒤에 숨는다(2026-08-17 지도 도움말에서 실제로 겪음).
 *
 * 아직 만나지 않은 낱말은 서버가 목록에 넣지 않는다. 카드함으로 앞으로 나올 낱말과 뜻을 미리 보면
 * 직접 입력형에서 정답을 감추는 장치가 무의미해지기 때문이며, 여기서는 개수만 안내한다.
 */
const MODES = Object.freeze([
    { id: 'meaning', label: '뜻 가리기', hint: '낱말을 보고 뜻을 떠올려요' },
    { id: 'word', label: '낱말 가리기', hint: '뜻을 보고 낱말을 떠올려요' }
]);

// 묶음은 모두 접은 채로 시작한다. 먼저 어디에 몇 개가 있는지 보고 필요한 것만 연다.
const SECTIONS = Object.freeze([
    { id: 'confusing', label: '자주 헷갈려요', icon: '🌀', tone: 'is-confusing' },
    { id: 'review_now', label: '다시 볼 낱말', icon: '🔁', tone: 'is-review' },
    { id: 'review_due', label: '복습할 때가 됐어요', icon: '⏰', tone: 'is-due' },
    { id: 'learning', label: '연습 중', icon: '🌱', tone: 'is-learning' },
    { id: 'almost', label: '거의 익혔어요', icon: '🌿', tone: 'is-almost' },
    { id: 'mastered', label: '완전히 익힘', icon: '🌳', tone: 'is-mastered', chips: true }
]);

/**
 * 낱말을 가리는 방향에서는 예문에 정답이 그대로 들어 있어 빈칸으로 바꿔 보여 준다.
 * 예문에 낱말이 없으면 힌트로 쓸 수 없으므로 아예 내보내지 않는다.
 */
const blankOutWord = (example, word) => {
    if (!example || !word || !example.includes(word)) return null;
    return example.replaceAll(word, '＿＿＿＿');
};

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
    const [openSections, setOpenSections] = useState(() => new Set());
    const [revealed, setRevealed] = useState(() => new Set());
    const [mode, setMode] = useState('meaning');

    const hideWord = mode === 'word';
    const deckNumber = Number(cardBox?.deck_number || 0);
    const itemCount = Number(cardBox?.item_count || 0);
    const seenCount = Number(cardBox?.seen_count || 0);
    const unseenCount = Number(cardBox?.unseen_count || 0);
    const masteredCount = cards.filter((card) => card.card_state === 'mastered').length;
    const allRevealed = cards.length > 0 && revealed.size >= cards.length;

    const toggleSection = (id) => setOpenSections((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const toggleReveal = (itemKey) => setRevealed((current) => {
        const next = new Set(current);
        if (next.has(itemKey)) next.delete(itemKey); else next.add(itemKey);
        return next;
    });

    // 방향을 바꾸면 이미 열어 둔 답은 닫는다. 안 그러면 새 방향의 정답이 그대로 보인다.
    const changeMode = (nextMode) => {
        setMode(nextMode);
        setRevealed(new Set());
    };

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
                    가려진 쪽을 먼저 <strong>떠올려 본 뒤</strong> 확인해 보세요. 그냥 읽을 때보다 훨씬 잘 기억나요.
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
                        <div className="vocab-card-box__modes" role="group" aria-label="카드 가리는 방향">
                            {MODES.map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    className={mode === item.id ? 'is-active' : ''}
                                    onClick={() => changeMode(item.id)}
                                    aria-pressed={mode === item.id}
                                >
                                    <strong>{item.label}</strong>
                                    <small>{item.hint}</small>
                                </button>
                            ))}
                        </div>

                        <div className="vocab-card-box__tools">
                            <button type="button" onClick={toggleAll}>
                                {allRevealed
                                    ? hideWord ? '낱말 모두 가리기' : '뜻 모두 가리기'
                                    : hideWord ? '낱말 모두 보기' : '뜻 모두 보기'}
                            </button>
                        </div>

                        {SECTIONS.map((section) => {
                            const sectionCards = cards.filter((card) => card.card_state === section.id);
                            if (sectionCards.length === 0) return null;
                            const isOpen = openSections.has(section.id);
                            const panelId = `vocab-card-section-${section.id}`;

                            return (
                                <section className={`vocab-card-group ${section.tone}`} key={section.id}>
                                    <button
                                        type="button"
                                        className="vocab-card-group__header"
                                        onClick={() => toggleSection(section.id)}
                                        aria-expanded={isOpen}
                                        aria-controls={panelId}
                                    >
                                        <span aria-hidden="true">{section.icon}</span>
                                        <strong>{section.label}</strong>
                                        <em>{sectionCards.length}개</em>
                                        <i aria-hidden="true">{isOpen ? '▴' : '▾'}</i>
                                    </button>

                                    {isOpen && (section.chips ? (
                                        <div className="vocab-card-group__chips" id={panelId}>
                                            {sectionCards.map((card) => {
                                                const shown = revealed.has(card.item_key);
                                                const front = hideWord ? card.definition : card.word;
                                                const back = hideWord ? card.word : card.definition;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={card.item_key}
                                                        className={`vocab-word-chip${shown ? ' is-open' : ''}${hideWord ? ' is-reverse' : ''}`}
                                                        onClick={() => toggleReveal(card.item_key)}
                                                        aria-pressed={shown}
                                                    >
                                                        <strong>{front}</strong>
                                                        {shown && <small>{back}</small>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <ul className="vocab-card-group__list" id={panelId}>
                                            {sectionCards.map((card) => {
                                                const shown = revealed.has(card.item_key);
                                                const reviewLabel = formatReviewDate(card.next_review_at);
                                                const blanked = blankOutWord(card.example, card.word);
                                                return (
                                                    <li key={card.item_key} className={`vocab-word-card ${section.tone}`}>
                                                        {hideWord ? (
                                                            <>
                                                                <p className="vocab-word-card__prompt">{card.definition}</p>
                                                                {blanked && <p className="vocab-word-card__example">예: {blanked}</p>}
                                                                {shown && <div className="vocab-word-card__head"><strong>{card.word}</strong></div>}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="vocab-word-card__head"><strong>{card.word}</strong></div>
                                                                {shown && (
                                                                    <>
                                                                        <p className="vocab-word-card__definition">{card.definition}</p>
                                                                        {card.example && (
                                                                            <p className="vocab-word-card__example">예: {card.example}</p>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className={`vocab-word-card__reveal${shown ? ' is-open' : ''}`}
                                                            onClick={() => toggleReveal(card.item_key)}
                                                        >
                                                            {shown
                                                                ? hideWord ? '낱말 다시 가리기' : '뜻 다시 가리기'
                                                                : hideWord
                                                                    ? '낱말을 떠올려 보세요 · 눌러서 확인'
                                                                    : '뜻을 떠올려 보세요 · 눌러서 확인'}
                                                        </button>
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
