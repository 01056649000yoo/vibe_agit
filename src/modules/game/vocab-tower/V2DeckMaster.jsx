import React, { useEffect, useRef, useState } from 'react';

/**
 * 덱마스터 — 한 층을 다 익힌 학생이 치는 공식 도전 화면.
 *
 * 개인 연습과 다른 점이 셋이다.
 *   1) **정답을 즉시 알려 주지 않는다.** 연습은 한 문제마다 맞았는지 보여 주지만, 시험은 끝나고 한 번에
 *      본다. 중간에 알려 주면 남은 문제를 푸는 태도가 달라진다.
 *   2) **되돌아갈 수 없다.** 한 문제를 답하면 다음으로 간다. 서버도 같은 문항 재제출을 막는다.
 *   3) **문항마다 시간을 잰다.** 전체 시간이 아니라 문항당이다. 전체로 재면 앞에서 막힌 학생이
 *      뒤 문제를 못 보고, 무엇보다 이 저장소는 "빠른 시간에 점수를 주지 않는다"를 규칙으로 두고 있다.
 *      시간은 답을 찾아볼 여유만 막고 생각할 여유는 남기는 장치다.
 *
 * **모달이 아니라 화면 단계다.** 게임 실행 화면이 `zIndex: 20000` 이라 그 안에서 공용 `Modal` 을 열면
 * 뒤에 숨는다(2026-08-17 지도 도움말에서 실제로 겪음). 낱말 카드함과 같은 이유로 같은 방식을 쓴다.
 */
const V2DeckMaster = ({
    session,          // start RPC 응답 (attempt_id, seconds_per_question, pass_correct ...)
    question,         // 현재 문항 (정답은 들어 있지 않다)
    onSubmitAnswer,   // (questionId, answer) => Promise
    onFinish,         // (completed) => Promise
    onExit,
    submitting = false,
    notice = ''
}) => {
    // 문항이 바뀌면 부모가 `key`로 이 컴포넌트를 다시 마운트한다. 그래서 입력과 남은 시간을
    // 효과에서 되돌릴 필요가 없고, 초기값이 곧 새 문항의 시작 상태가 된다.
    const [typed, setTyped] = useState('');
    const [secondsLeft, setSecondsLeft] = useState(session?.seconds_per_question ?? 45);
    // 시간이 다 됐을 때 부를 콜백만 최신으로 들고 있는다. 이걸 타이머 의존성에 직접 넣으면
    // 부모가 다시 그릴 때마다 타이머가 재시작돼 남은 시간이 줄지 않는다.
    const submitRef = useRef(onSubmitAnswer);
    useEffect(() => { submitRef.current = onSubmitAnswer; }, [onSubmitAnswer]);

    const questionId = question?.question_id || null;

    // 시간이 다 되면 빈 답으로 넘긴다. 학생이 아무것도 안 해도 시험이 멈추지 않게 한다.
    useEffect(() => {
        if (!questionId || submitting) return undefined;
        if (secondsLeft <= 0) {
            void submitRef.current?.(questionId, '');
            return undefined;
        }
        const timerId = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
        return () => window.clearTimeout(timerId);
    }, [questionId, secondsLeft, submitting]);

    if (!question) return null;

    const total = question.total ?? session?.question_count ?? 0;
    const answered = question.answered ?? 0;
    const isInput = Boolean(question.is_input);
    const urgent = secondsLeft <= 10;

    const send = (value) => {
        if (submitting || !questionId) return;
        void onSubmitAnswer(questionId, value);
    };

    return (
        <div className="vocab-deck-master">
            <header className="vocab-deck-master__head">
                <div>
                    {/* 같은 시험 화면을 두 관문이 함께 쓴다. 이름만 서버가 알려 준 종류로 가른다. */}
                    <strong>{session?.challenge_kind === 'summit' ? '어휘 마스터' : '덱마스터'}</strong>
                    <small>{answered + 1} / {total}</small>
                </div>
                <div className={`vocab-deck-master__timer${urgent ? ' is-urgent' : ''}`}
                     role="timer" aria-live="off">
                    {secondsLeft}초
                </div>
            </header>

            <div className="vocab-deck-master__bar" aria-hidden="true">
                <span style={{ width: `${total ? (answered / total) * 100 : 0}%` }} />
            </div>

            <p className="vocab-deck-master__prompt">{question.prompt}</p>

            {isInput ? (
                <form
                    className="vocab-deck-master__input"
                    onSubmit={(event) => { event.preventDefault(); send(typed); }}
                >
                    <input
                        type="text"
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        placeholder="답을 적어 주세요"
                        aria-label="답 입력"
                        autoComplete="off"
                        disabled={submitting}
                        autoFocus
                    />
                    <button type="submit" disabled={submitting}>
                        {submitting ? '보내는 중…' : '다음'}
                    </button>
                </form>
            ) : (
                <div className="vocab-deck-master__options">
                    {(question.options || []).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => send(option)}
                            disabled={submitting}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}

            {notice && <p className="vocab-deck-master__notice" role="alert">{notice}</p>}

            <footer className="vocab-deck-master__foot">
                {/* 중도 종료는 합격으로 치지 않고 최고 기록도 되지 않는다는 것을 미리 알린다. */}
                <button type="button" className="is-quiet" onClick={() => onFinish(false)} disabled={submitting}>
                    그만두기 (기록에 남지 않아요)
                </button>
                <button type="button" className="is-quiet" onClick={onExit} disabled={submitting}>
                    ← 지도
                </button>
            </footer>
        </div>
    );
};

/** 덱마스터 결과 — 합격 여부와 틀린 낱말을 함께 보여 준다. */
export const V2DeckMasterSummary = ({ result, onOpenCardBox, onBack }) => {
    if (!result) return null;
    const passed = Boolean(result.passed);
    const isSummit = result.challenge_kind === 'summit';
    const wrong = result.wrong_items || [];

    return (
        <div className="vocab-deck-master vocab-deck-master--summary">
            <div className={`vocab-deck-master__verdict${passed ? ' is-passed' : ''}`}>
                <span aria-hidden="true">{passed ? (isSummit ? '👑' : '🏆') : '💪'}</span>
                <h1>{passed ? (isSummit ? '어휘 마스터 통과!' : '덱마스터 통과!') : '조금만 더!'}</h1>
                <p>
                    {result.correct_count} / {result.question_count}문제
                    {' · '}직접 쓰기 {result.input_correct_count} / {result.input_question_count}문제
                </p>
                {!passed && (
                    <small>
                        {/* 왜 떨어졌는지 숫자로만 두면 막막하다. 무엇이 모자랐는지 말로 알려 준다. */}
                        통과하려면 전체 {result.pass_correct ?? '-'}문제, 직접 쓰기 {result.pass_input ?? '-'}문제를 맞혀야 해요.
                    </small>
                )}
            </div>

            {result.summit_reached && (
                <div className="vocab-deck-master__summit">
                    <span aria-hidden="true">👑</span>
                    <strong>어휘 마스터가 되었어요!</strong>
                    <small>탑의 정상에 올랐어요. 나의 아지트에서 휘장을 확인해 보세요.</small>
                </div>
            )}

            {/* 10층을 다 통과한 순간 — 휘장은 아직이고, 정상 관문이 열렸다는 것을 알린다. */}
            {result.summit_unlocked && (
                <div className="vocab-deck-master__summit is-unlocked">
                    <span aria-hidden="true">👑</span>
                    <strong>탑의 정상이 열렸어요!</strong>
                    <small>열 층의 덱마스터를 모두 통과했어요. 지도 꼭대기에서 어휘 마스터에 도전해 보세요.</small>
                </div>
            )}

            {wrong.length > 0 && (
                <section className="vocab-deck-master__wrong">
                    <h2>다시 볼 낱말 {wrong.length}개</h2>
                    <ul>
                        {wrong.map((item) => (
                            <li key={item.word}>
                                <strong>{item.word}</strong>
                                {item.definition && <span>{item.definition}</span>}
                            </li>
                        ))}
                    </ul>
                    {/* 실패가 "막막함"이 아니라 "할 일"이 되게 카드함으로 이어 준다. */}
                    <button type="button" onClick={onOpenCardBox}>낱말 카드함에서 연습하기</button>
                </section>
            )}

            <button type="button" className="is-quiet" onClick={onBack}>← 지도로 돌아가기</button>
        </div>
    );
};

export default V2DeckMaster;
