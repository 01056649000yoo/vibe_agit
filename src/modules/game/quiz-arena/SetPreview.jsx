import { useState } from 'react';

const letters = ['①', '②', '③', '④'];
const KIND_LABELS = { ox: 'O/X', c2: '2지선다', c4: '4지선다' };
const navButton = { padding: 'var(--ui-space-2) var(--ui-space-4)', borderRadius: 'var(--ui-radius-sm)', border: '1px solid var(--ui-border-strong)', background: 'var(--ui-surface)', color: 'var(--ui-ink)', fontSize: 'var(--ui-text-md)', cursor: 'pointer' };

/** 문제를 한 장씩 넘겨 보는 미리보기 카드(정답·해설 포함). 줄줄이 늘어놓지 않는다. */
export default function SetPreview({ set, onClose }) {
    const [index, setIndex] = useState(0);
    const questions = set.questions ?? [];
    const question = questions.at(index);
    if (!question) return null;
    const answerText = question.kind === 'ox' ? (question.answer === 0 ? 'O' : 'X') : `${letters.at(question.answer)} ${question.choices.at(question.answer)}`;
    return (
        <div role="dialog" aria-label={`${set.title} 미리보기`} style={{ display: 'grid', gap: 'var(--ui-space-3)', padding: 'var(--ui-space-4)', border: '1px solid var(--ui-primary-border)', borderRadius: 'var(--ui-radius-lg)', background: 'var(--ui-primary-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--ui-space-3)', alignItems: 'center' }}>
                <strong>{set.title}</strong>
                <button type="button" onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)', cursor: 'pointer' }}>닫기 ✕</button>
            </div>
            <div style={{ display: 'grid', gap: 'var(--ui-space-2)', padding: 'var(--ui-space-4)', borderRadius: 'var(--ui-radius-md)', background: 'var(--ui-surface)', minHeight: 140 }}>
                <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>{index + 1} / {questions.length} · {KIND_LABELS[question.kind] ?? question.kind}</span>
                <div style={{ fontSize: 'var(--ui-text-lg)', color: 'var(--ui-ink-strong)', lineHeight: 'var(--ui-line-body)' }}>{question.text}</div>
                {question.kind === 'c4' && (
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--ui-space-2)' }}>
                        {question.choices.map((choice, choiceIndex) => (
                            <li key={choice} style={{ padding: 'var(--ui-space-2) var(--ui-space-3)', borderRadius: 'var(--ui-radius-sm)', border: '1px solid var(--ui-border)', background: choiceIndex === question.answer ? 'var(--ui-success-soft)' : 'var(--ui-surface-muted)', color: choiceIndex === question.answer ? 'var(--ui-success)' : 'var(--ui-ink)', fontWeight: choiceIndex === question.answer ? 800 : 500 }}>
                                {letters.at(choiceIndex)} {choice}
                            </li>
                        ))}
                    </ul>
                )}
                <div style={{ color: 'var(--ui-success)', fontWeight: 800, fontSize: 'var(--ui-text-sm)' }}>정답: {answerText}</div>
                {question.explanation && <div style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>{question.explanation}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} style={navButton}>← 이전</button>
                <button type="button" disabled={index >= questions.length - 1} onClick={() => setIndex(index + 1)} style={navButton}>다음 →</button>
            </div>
        </div>
    );
}
