import { useEffect, useMemo, useState } from 'react';
import { arenaOpenUrl } from './quizSetBuilder.js';

const KINDS = [{ id: 'vocab', label: '어휘' }, { id: 'spelling', label: '맞춤법' }];
const GRADES = [3, 4, 5, 6];
const LEVELS = [{ id: 0, label: '전체' }, { id: 1, label: '쉬움' }, { id: 2, label: '보통' }, { id: 3, label: '어려움' }];
const FORMAT_LABELS = { ox: 'O/X', c2: '2지선다', c4: '4지선다' };
const letters = ['①', '②', '③', '④'];

const chip = (active) => ({
    padding: 'var(--ui-space-2) var(--ui-space-3)', borderRadius: 'var(--ui-radius-sm)', cursor: 'pointer', fontSize: 'var(--ui-text-sm)', fontWeight: 800,
    border: `1px solid ${active ? 'var(--ui-primary)' : 'var(--ui-border-strong)'}`, background: active ? 'var(--ui-primary-soft)' : 'var(--ui-surface)', color: active ? 'var(--ui-primary)' : 'var(--ui-ink)'
});

const answerLabel = (question) => (question.kind === 'ox' ? (question.answer === 0 ? 'O' : 'X') : `${letters.at(question.answer)} ${question.choices.at(question.answer)}`);

/** 한 문제를 한 줄 카드로: 번호·형식·문제·보기(정답 강조)·해설. 세트 전체를 스크롤 없이 훑어 점검한다. */
function QuestionRow({ question, index }) {
    return (
        <li style={{ display: 'grid', gap: 4, padding: 'var(--ui-space-2) var(--ui-space-3)', borderBottom: '1px solid var(--ui-border)' }}>
            <div style={{ display: 'flex', gap: 'var(--ui-space-2)', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)', minWidth: '2.2em' }}>{index + 1}.</span>
                <span style={{ color: 'var(--ui-ink-strong)' }}>{question.text}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)', whiteSpace: 'nowrap' }}>{FORMAT_LABELS[question.kind]}</span>
            </div>
            <div style={{ paddingLeft: '2.2em', display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)', fontSize: 'var(--ui-text-sm)' }}>
                {question.kind === 'ox'
                    ? <span style={{ color: 'var(--ui-success)', fontWeight: 800 }}>정답 {answerLabel(question)}</span>
                    : question.choices.map((choice, choiceIndex) => (
                        <span key={choice} style={{ color: choiceIndex === question.answer ? 'var(--ui-success)' : 'var(--ui-ink)', fontWeight: choiceIndex === question.answer ? 800 : 500 }}>{letters.at(choiceIndex)} {choice}</span>
                    ))}
            </div>
            {question.explanation && <div style={{ paddingLeft: '2.2em', color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>{question.explanation}</div>}
        </li>
    );
}

/**
 * 기본(공식) 세트 작업대: 종류·학년(·수준)을 고르면 그 세트들이 왼쪽에 나열되고,
 * 고른 세트의 모든 문제를 오른쪽에서 한 화면으로 점검한 뒤 바로 아레나를 연다.
 */
export default function OfficialSetsTab({ api, hostUrl }) {
    const [state, setState] = useState({ status: 'loading', sets: [], message: '' });
    const [kind, setKind] = useState('vocab');
    const [grade, setGrade] = useState(3);
    const [level, setLevel] = useState(0);
    const [pickedId, setPickedId] = useState(null);

    useEffect(() => {
        let alive = true;
        api.loadOfficialSets()
            .then((sets) => { if (alive) setState({ status: 'ready', sets, message: '' }); })
            .catch((error) => { if (alive) setState({ status: 'error', sets: [], message: error.message }); });
        return () => { alive = false; };
    }, [api]);

    const visible = useMemo(
        () => state.sets.filter((set) => set.kind === kind && set.grade === grade && (kind !== 'vocab' || !level || set.level === level)),
        [state.sets, kind, grade, level]
    );
    const current = visible.find((set) => set.id === pickedId) ?? visible.at(0) ?? null;

    const pick = (change) => { change(); setPickedId(null); };

    if (state.status === 'loading') return <p role="status" style={{ color: 'var(--ui-ink-muted)' }}>기본 세트를 불러오는 중이에요…</p>;
    if (state.status === 'error') return <p role="alert" style={{ color: 'var(--ui-danger)' }}>{state.message}</p>;

    return (
        <div style={{ display: 'grid', gap: 'var(--ui-space-3)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)', alignItems: 'center' }} role="tablist" aria-label="종류">
                {KINDS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === kind} onClick={() => pick(() => { setKind(item.id); setLevel(0); })} style={chip(item.id === kind)}>{item.label}</button>)}
                <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--ui-border)' }} />
                {GRADES.map((item) => <button key={item} type="button" role="tab" aria-selected={item === grade} onClick={() => pick(() => setGrade(item))} style={chip(item === grade)}>{item}학년</button>)}
            </div>
            {kind === 'vocab' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)', alignItems: 'center' }} role="tablist" aria-label="낱말 수준">
                    <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>낱말 수준</span>
                    {LEVELS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === level} onClick={() => pick(() => setLevel(item.id))} style={chip(item.id === level)}>{item.label}</button>)}
                </div>
            )}
            {!current ? <p style={{ color: 'var(--ui-ink-muted)' }}>이 조건의 세트가 없어요.</p> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-3)', alignItems: 'flex-start' }}>
                    <ul aria-label={`${grade}학년 세트 ${visible.length}개`} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--ui-space-1)', maxHeight: '70vh', overflowY: 'auto', flex: '0 0 260px', maxWidth: '100%' }}>
                        {visible.map((set) => (
                            <li key={set.id}>
                                <button type="button" aria-pressed={set.id === current.id} onClick={() => setPickedId(set.id)}
                                    style={{ ...chip(set.id === current.id), width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 'var(--ui-space-2)' }}>
                                    <span>{set.title}</span><span style={{ fontWeight: 500 }}>{set.questions.length}문제</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <section aria-label={`${current.title} 문제`} style={{ flex: '1 1 360px', minWidth: 0, display: 'grid', gap: 'var(--ui-space-2)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)', alignItems: 'center', justifyContent: 'space-between' }}>
                            <strong style={{ color: 'var(--ui-ink-strong)' }}>{current.title} · {current.questions.length}문제</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }}>
                                <a href={arenaOpenUrl(hostUrl, current)} target="_blank" rel="noopener noreferrer" style={{ ...chip(true), background: 'var(--ui-primary)', color: 'var(--ui-on-primary, #fff)', textDecoration: 'none' }}>이 세트로 아레나 열기 ↗</a>
                            </div>
                        </div>
                        <ol style={{ margin: 0, padding: 0, listStyle: 'none', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-md)', background: 'var(--ui-surface)', maxHeight: '70vh', overflowY: 'auto' }}>
                            {current.questions.map((question, index) => <QuestionRow key={`${index}-${question.text}`} question={question} index={index} />)}
                        </ol>
                    </section>
                </div>
            )}
        </div>
    );
}
