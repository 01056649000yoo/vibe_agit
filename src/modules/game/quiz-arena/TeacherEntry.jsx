import { useState } from 'react';
import Button from '../../../components/common/Button';
import TeacherPageTitle from '../../../components/teacher/TeacherPageTitle';
import { quizArenaManifest } from './manifest.js';
import {
    DEFAULT_SET_KINDS, buildDefaultSet, validateArenaQuestions
} from './quizSetBuilder.js';

/** 시험 중인 게임 서버 주소(공개 주소·비밀 아님). 관리자 암호 입구는 그 서버의 `/host` 이다. */
export const QUIZ_ARENA_HOST_URL = 'https://arena.xn--9y2br3k43n.kr/host';

const GRADES = [3, 4, 5, 6];
const COUNTS = [5, 10, 15, 20];

const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} 를 불러오지 못했어요`);
    return response.json();
};

/** 어휘·맞춤법 자료는 이 화면에서 `기본 세트 만들기` 를 눌렀을 때만 받는다(열 때는 요청 없음). 인형뽑기 문제 재료 코드를 그대로 쓴다. */
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
const selectStyle = {
    padding: 'var(--ui-space-2) var(--ui-space-3)', border: '1px solid var(--ui-border-strong)', borderRadius: 'var(--ui-radius-sm)',
    background: 'var(--ui-surface)', color: 'var(--ui-ink)', fontSize: 'var(--ui-text-md)'
};

/**
 * 수호룡 퀴즈 아레나 — 관리자 시험 화면(개발 중).
 * 1) 아지트의 어휘·맞춤법 자료로 **기본 문제 세트**를 만들어 미리 본다(DB 없음).
 * 2) 별도 게임 서버의 선생님 입구로 가서 방을 연다(지금은 관리자 암호).
 * 이어서 붙일 것: 아지트 로그인으로 방 바로 열기, 교사가 직접 낸 문제 저장·공유(`supabase/migration-drafts/quiz_arena.sql`).
 */
export default function QuizArenaTeacherEntry() {
    const [kind, setKind] = useState('mix');
    const [grade, setGrade] = useState(4);
    const [count, setCount] = useState(10);
    const [state, setState] = useState({ status: 'idle', questions: [], message: '' });

    const makeSet = async () => {
        setState({ status: 'loading', questions: [], message: '' });
        try {
            const sources = await loadSources(kind, grade);
            const questions = buildDefaultSet(kind, { ...sources, count });
            const problems = validateArenaQuestions(questions);
            if (problems.length) throw new Error(problems[0]);
            setState({ status: 'ready', questions, message: '' });
        } catch (error) {
            setState({ status: 'error', questions: [], message: error.message || '문제를 만들지 못했어요' });
        }
    };

    return (
        <section style={{ display: 'grid', gap: 'var(--ui-space-4)' }}>
            <TeacherPageTitle title={quizArenaManifest.name} guideTabId="quiz-arena" />
            <p style={{ margin: 0, color: 'var(--ui-ink-muted)' }}>
                <strong>개발 중</strong> · 관리자 계정에만 보이고 학생·다른 선생님에게는 보이지 않아요.
            </p>

            <div style={{ display: 'grid', gap: 'var(--ui-space-3)', padding: 'var(--ui-space-4)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-lg)', background: 'var(--ui-surface)' }}>
                <strong>기본 문제 세트 만들기</strong>
                <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                    아지트에 있는 어휘와 맞춤법 자료로 바로 쓸 수 있는 세트를 만들어요. 누를 때마다 다른 문제가 나와요.
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-3)' }}>
                    <label style={fieldStyle}>종류
                        <select value={kind} onChange={(event) => setKind(event.target.value)} style={selectStyle}>
                            {DEFAULT_SET_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                    </label>
                    {kind !== 'spelling' && (
                        <label style={fieldStyle}>어휘 학년
                            <select value={grade} onChange={(event) => setGrade(Number(event.target.value))} style={selectStyle}>
                                {GRADES.map((value) => <option key={value} value={value}>{value}학년</option>)}
                            </select>
                        </label>
                    )}
                    <label style={fieldStyle}>문제 수
                        <select value={count} onChange={(event) => setCount(Number(event.target.value))} style={selectStyle}>
                            {COUNTS.map((value) => <option key={value} value={value}>{value}문제</option>)}
                        </select>
                    </label>
                </div>
                <div>
                    <Button type="button" onClick={makeSet} loading={state.status === 'loading'}>
                        {state.status === 'ready' ? '다른 문제로 다시 만들기' : '세트 만들기'}
                    </Button>
                </div>
                {state.status === 'error' && <p role="alert" style={{ margin: 0, color: 'var(--ui-danger)' }}>{state.message}</p>}
                {state.status === 'ready' && (
                    <ol style={{ margin: 0, paddingLeft: 'var(--ui-space-6)', display: 'grid', gap: 'var(--ui-space-3)' }} aria-label="만든 문제 미리보기">
                        {state.questions.map((question, index) => (
                            <li key={`${index}-${question.text}`} style={{ color: 'var(--ui-ink-strong)' }}>
                                <div>{question.text}</div>
                                <div style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                                    {question.kind === 'ox'
                                        ? `정답: ${question.answer === 0 ? 'O' : 'X'}`
                                        : question.choices.map((choice, choiceIndex) => (choiceIndex === question.answer ? `✔ ${choice}` : choice)).join(' · ')}
                                    {question.explanation ? ` — ${question.explanation}` : ''}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            <div style={{ display: 'grid', gap: 'var(--ui-space-2)', padding: 'var(--ui-space-4)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-lg)', background: 'var(--ui-surface)' }}>
                <strong>결투장 열기(시험)</strong>
                <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                    지금은 별도 서버의 선생님 입구에서 관리자 암호로 방을 엽니다. 위에서 만든 세트를 바로 보내 방을 여는 기능과 선생님이 직접 낸 문제 저장·공유는 이어서 붙일 예정입니다.
                </span>
                <a href={QUIZ_ARENA_HOST_URL} target="_blank" rel="noopener noreferrer">선생님 입구 열기 ↗</a>
            </div>
        </section>
    );
}
