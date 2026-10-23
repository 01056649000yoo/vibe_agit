import { useState } from 'react';
import Button from '../../../components/common/Button';
import SetPreview from './SetPreview.jsx';
import { DEFAULT_SET_KINDS, buildDefaultSet, validateArenaQuestions } from './quizSetBuilder.js';

const GRADES = [3, 4, 5, 6];
const COUNTS = [5, 10, 15, 20];

const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} 를 불러오지 못했어요`);
    return response.json();
};

/** 어휘·맞춤법 자료는 `세트 만들기` 를 눌렀을 때만 받는다(열 때는 요청 없음). 인형뽑기 문제 재료 코드를 그대로 쓴다. */
const loadSources = async (kind, grade) => {
    const needs = DEFAULT_SET_KINDS.find((item) => item.id === kind)?.needs ?? [];
    const sources = { vocab: [], spellingPool: [] };
    if (needs.includes('vocab')) sources.vocab = await fetchJson(`/data/grade${grade}_vocab.json`);
    if (needs.includes('spelling')) {
        const [lookup, detection, builder] = await Promise.all([
            fetchJson('/spelling/elementary-lookup-v1.json'),
            fetchJson('/spelling/elementary-detection-v1.json'),
            import('../spelling-claw/quiz/spellingQuizBuilder.js')
        ]);
        sources.spellingPool = builder.buildSpellingQuizPool(builder.spellingSourcesFromCatalog(lookup, detection));
    }
    return sources;
};

const fieldStyle = { display: 'grid', gap: 'var(--ui-space-1)', fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink-muted)' };
const inputStyle = {
    padding: 'var(--ui-space-2) var(--ui-space-3)', border: '1px solid var(--ui-border-strong)', borderRadius: 'var(--ui-radius-sm)',
    background: 'var(--ui-surface)', color: 'var(--ui-ink)', fontSize: 'var(--ui-text-md)'
};

/** 새로 만들기: 어휘·맞춤법 자료에서 즉석으로 한 세트를 뽑아 미리 보고, 마음에 들면 제목을 붙여 `내 세트` 에 저장한다. */
export default function CreateTab({ api, onSaved }) {
    const [kind, setKind] = useState('mix');
    const [grade, setGrade] = useState(4);
    const [count, setCount] = useState(10);
    const [state, setState] = useState({ status: 'idle', questions: [], message: '' });
    const [title, setTitle] = useState('');
    const [saveState, setSaveState] = useState({ status: 'idle', message: '' });

    const kindLabel = DEFAULT_SET_KINDS.find((item) => item.id === kind)?.label ?? '';

    const makeSet = async () => {
        setState({ status: 'loading', questions: [], message: '' });
        setSaveState({ status: 'idle', message: '' });
        try {
            const sources = await loadSources(kind, grade);
            const questions = buildDefaultSet(kind, { ...sources, count });
            const problems = validateArenaQuestions(questions);
            if (problems.length) throw new Error(problems.at(0));
            setTitle(`${kind === 'spelling' ? '' : `${grade}학년 `}${kindLabel} ${count}문제`);
            setState({ status: 'ready', questions, message: '' });
        } catch (error) {
            setState({ status: 'error', questions: [], message: error.message || '문제를 만들지 못했어요' });
        }
    };

    const save = async () => {
        setSaveState({ status: 'saving', message: '' });
        try {
            await api.saveSet({
                meta: { title: title.trim() || `${kindLabel} 세트`, grade: kind === 'spelling' ? '' : String(grade), subject: '국어', unit: kind === 'spelling' ? '맞춤법' : '어휘', description: '', source: 'default' },
                questions: state.questions.map(({ kind: k, text, choices, answer, explanation }) => ({ kind: k, text, ...(k === 'c4' ? { choices } : {}), answer, ...(explanation ? { explanation } : {}) }))
            });
            setSaveState({ status: 'saved', message: '내 세트에 저장했어요.' });
            onSaved?.();
        } catch (error) {
            setSaveState({ status: 'error', message: error.message || '저장하지 못했어요' });
        }
    };

    return (
        <div style={{ display: 'grid', gap: 'var(--ui-space-3)' }}>
            <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                아지트의 어휘·맞춤법 자료에서 문제를 뽑아요. 누를 때마다 다른 문제가 나오고, 마음에 들면 저장해요.
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-3)' }}>
                <label style={fieldStyle}>종류
                    <select value={kind} onChange={(event) => setKind(event.target.value)} style={inputStyle}>
                        {DEFAULT_SET_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                </label>
                {kind !== 'spelling' && (
                    <label style={fieldStyle}>어휘 학년
                        <select value={grade} onChange={(event) => setGrade(Number(event.target.value))} style={inputStyle}>
                            {GRADES.map((value) => <option key={value} value={value}>{value}학년</option>)}
                        </select>
                    </label>
                )}
                <label style={fieldStyle}>문제 수
                    <select value={count} onChange={(event) => setCount(Number(event.target.value))} style={inputStyle}>
                        {COUNTS.map((value) => <option key={value} value={value}>{value}문제</option>)}
                    </select>
                </label>
            </div>
            <div>
                <Button type="button" onClick={makeSet} loading={state.status === 'loading'}>{state.status === 'ready' ? '다른 문제로 다시 뽑기' : '문제 뽑기'}</Button>
            </div>
            {state.status === 'error' && <p role="alert" style={{ margin: 0, color: 'var(--ui-danger)' }}>{state.message}</p>}
            {state.status === 'ready' && (
                <div style={{ display: 'grid', gap: 'var(--ui-space-3)' }}>
                    <SetPreview key={state.questions.map((q) => q.text).join('|')} set={{ title: '뽑은 문제 미리보기', questions: state.questions }} onClose={() => setState({ status: 'idle', questions: [], message: '' })} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-3)', alignItems: 'end' }}>
                        <label style={{ ...fieldStyle, flex: '1 1 220px' }}>세트 이름
                            <input value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)} style={inputStyle} />
                        </label>
                        <Button type="button" onClick={save} loading={saveState.status === 'saving'}>내 세트로 저장</Button>
                    </div>
                    {saveState.message && <p role="status" style={{ margin: 0, color: saveState.status === 'error' ? 'var(--ui-danger)' : 'var(--ui-success)', fontSize: 'var(--ui-text-sm)' }}>{saveState.message}</p>}
                </div>
            )}
        </div>
    );
}
