import { useCallback, useEffect, useMemo, useState } from 'react';
import { getElementarySpellingEntries } from '../tools/spelling-lookup/elementarySpellingEntries';
import { spellingLearningApi } from './api';
import './TeacherEntry.css';

const EMPTY = { wrong_expression: '', correct_expression: '', label: '미분류', explanation: '', examples: [] };
const BUILT_IN_ENTRIES = getElementarySpellingEntries().map((entry) => ({
    ...entry,
    id: `built-in:${entry.id}`,
    status: 'built-in'
}));
const DATA_FILTERS = [
    { id: 'all', label: '전체' },
    { id: 'built-in', label: '기본 자료' },
    { id: 'approved', label: '적용 중' },
    { id: 'draft', label: '초안' }
];
const MAX_VISIBLE_ENTRIES = 100;

const TeacherEntry = ({ activeClass }) => {
    const classId = activeClass?.id;
    const [workspace, setWorkspace] = useState({ entries: [], top_searches: [] });
    const [draft, setDraft] = useState(EMPTY);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('create');
    const [dataFilter, setDataFilter] = useState('all');

    const load = useCallback(async () => {
        if (!classId) return;
        try {
            setWorkspace(await spellingLearningApi.getTeacherWorkspace(classId) || workspace);
        } catch (error) {
            setMessage(error.message || '맞춤법 데이터를 불러오지 못했습니다.');
        }
    }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);

    const classEntries = useMemo(() => workspace.entries || [], [workspace.entries]);
    const entries = useMemo(() => [...classEntries, ...BUILT_IN_ENTRIES], [classEntries]);
    const filteredEntries = useMemo(
        () => dataFilter === 'all' ? entries : entries.filter((entry) => entry.status === dataFilter),
        [dataFilter, entries]
    );
    const visibleEntries = filteredEntries.slice(0, MAX_VISIBLE_ENTRIES);
    const approvedCount = classEntries.filter((entry) => entry.status === 'approved').length;
    const draftCount = classEntries.filter((entry) => entry.status === 'draft').length;

    const generate = async () => {
        if (!draft.wrong_expression.trim()) return;
        setLoading(true); setMessage('');
        try {
            const generated = await spellingLearningApi.generateDraft(draft.wrong_expression.trim());
            setDraft({ ...EMPTY, ...generated, wrong_expression: draft.wrong_expression.trim() });
            setMessage('AI가 초안을 만들었습니다. 내용을 확인하고 승인해 주세요.');
        } catch (error) {
            setMessage(error.message || 'AI 초안을 만들지 못했습니다.');
        } finally { setLoading(false); }
    };

    const save = async (approve) => {
        setLoading(true); setMessage('');
        try {
            await spellingLearningApi.saveEntry(classId, draft, approve);
            setDraft(EMPTY);
            setMessage(approve ? '확인한 항목을 우리 반 수첩에 적용했습니다.' : '초안을 저장했습니다.');
            await load();
        } catch (error) {
            setMessage(error.message || '항목을 저장하지 못했습니다.');
        } finally { setLoading(false); }
    };

    return <section className="spelling-learning-manager">
        {!classId && <p className="spelling-learning-message">먼저 학급을 선택해 주세요.</p>}
        {classId && <>
            <div className="spelling-learning-tabs" role="tablist" aria-label="맞춤법 배움 데이터 관리">
                <button type="button" role="tab" aria-selected={activeTab === 'create'} className={activeTab === 'create' ? 'is-active' : ''} onClick={() => setActiveTab('create')}>
                    <strong>✨ 항목 만들기</strong><small>AI 초안을 확인하고 승인합니다.</small>
                </button>
                <button type="button" role="tab" aria-selected={activeTab === 'data'} className={activeTab === 'data' ? 'is-active' : ''} onClick={() => setActiveTab('data')}>
                    <strong>📚 등록 데이터</strong><small>기본 {BUILT_IN_ENTRIES.length}개 · 우리 반 {classEntries.length}개</small>
                </button>
            </div>

            {activeTab === 'create' && <div className="spelling-learning-grid" role="tabpanel">
                <section className="spelling-learning-card">
                    <h3>문제 표현으로 항목 만들기</h3>
                    <label>아이들이 자주 헷갈리는 표현<input value={draft.wrong_expression} maxLength={80} onChange={(e) => setDraft({ ...draft, wrong_expression: e.target.value })} placeholder="예: 안되요" /></label>
                    <button type="button" onClick={generate} disabled={loading || !draft.wrong_expression.trim()}>AI 초안 만들기</button>
                    <label>바른 표현<input value={draft.correct_expression} maxLength={80} onChange={(e) => setDraft({ ...draft, correct_expression: e.target.value })} /></label>
                    <label>배움 라벨<input value={draft.label} maxLength={40} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
                    <label>학생용 설명<textarea value={draft.explanation} maxLength={600} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} /></label>
                    <label>바른 예문<textarea value={(draft.examples || []).join('\n')} maxLength={600} onChange={(e) => setDraft({ ...draft, examples: e.target.value.split('\n').filter(Boolean).slice(0, 4) })} /></label>
                    <div className="spelling-learning-actions"><button type="button" className="secondary" onClick={() => save(false)} disabled={loading}>초안 저장</button><button type="button" onClick={() => save(true)} disabled={loading || !draft.correct_expression.trim() || !draft.explanation.trim()}>확인하고 승인</button></div>
                </section>
                <section className="spelling-learning-card">
                    <h3>자주 찾아본 표현</h3>
                    {(workspace.top_searches || []).map((row) => <div className="spelling-learning-row" key={row.entry_key}><span><strong>{row.display || row.entry_key}</strong><small>{row.label}</small></span><b>{row.total}회 · {row.students}명</b></div>)}
                    {!workspace.top_searches?.length && <p>아직 모인 검색 기록이 없습니다.</p>}
                </section>
            </div>}

            {activeTab === 'data' && <section className="spelling-learning-card spelling-learning-data" role="tabpanel">
                <div className="spelling-learning-data-heading">
                    <div><span>맞춤법 수첩 현황</span><h3>현재 등록된 맞춤법 데이터</h3><p>기본 자료는 모든 학생에게 제공되며, 우리 반 자료는 승인된 항목만 추가로 적용됩니다.</p></div>
                    <div className="spelling-learning-counts"><span><b>{entries.length}</b>전체</span><span><b>{BUILT_IN_ENTRIES.length}</b>기본</span><span><b>{approvedCount}</b>적용 중</span><span><b>{draftCount}</b>초안</span></div>
                </div>
                <div className="spelling-learning-filters" role="group" aria-label="등록 데이터 상태 필터">
                    {DATA_FILTERS.map((filter) => <button key={filter.id} type="button" className={dataFilter === filter.id ? 'is-active' : ''} onClick={() => setDataFilter(filter.id)}>{filter.label}</button>)}
                </div>
                <div className="spelling-learning-entry-list">
                    {visibleEntries.map((entry) => {
                        const isBuiltIn = entry.status === 'built-in';
                        return <article className={`spelling-learning-entry${isBuiltIn ? ' is-built-in' : ''}`} key={entry.id}>
                        <div className="spelling-learning-entry-title">
                            <div><strong>{isBuiltIn ? entry.question : <del>{entry.wrong_expression}</del>}<span aria-hidden="true">→</span>{isBuiltIn ? entry.answer : entry.correct_expression}</strong><small>{isBuiltIn ? '학생 맞춤법 수첩 기본 자료' : (entry.label || '미분류')}</small></div>
                            <span className={`spelling-learning-status is-${entry.status}`}>{isBuiltIn ? '기본 제공' : entry.status === 'approved' ? '적용 중' : '초안'}</span>
                        </div>
                        {entry.explanation && <p>{entry.explanation}</p>}
                        {Array.isArray(entry.examples) && entry.examples.length > 0 && <div className="spelling-learning-examples"><b>바른 예문</b>{entry.examples.map((example, index) => <span key={`${entry.id}-${index}`}>{example}</span>)}</div>}
                    </article>})}
                    {filteredEntries.length > MAX_VISIBLE_ENTRIES && <div className="spelling-learning-entry-limit">처음 {MAX_VISIBLE_ENTRIES}개를 표시했습니다. 상태 필터를 선택하면 나머지 항목도 확인할 수 있습니다.</div>}
                    {!filteredEntries.length && <div className="spelling-learning-empty">{entries.length ? '이 상태의 항목이 없습니다.' : '아직 등록된 맞춤법 항목이 없습니다.'}</div>}
                </div>
            </section>}
        </>}
        {message && <p className="spelling-learning-message" role="status">{message}</p>}
    </section>;
};

export default TeacherEntry;
