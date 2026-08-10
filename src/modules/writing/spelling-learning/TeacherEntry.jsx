import { useCallback, useEffect, useMemo, useState } from 'react';
import GuideInfoButton from '../../../components/common/GuideInfoButton';
import { spellingLearningApi } from './api';
import './TeacherEntry.css';

const EMPTY = { wrong_expression: '', correct_expression: '', label: '미분류', explanation: '', examples: [] };
const DATA_FILTERS = [
    { id: 'all', label: '전체' },
    { id: 'approved', label: '적용 중' },
    { id: 'draft', label: '초안' }
];

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

    const entries = useMemo(() => workspace.entries || [], [workspace.entries]);
    const filteredEntries = useMemo(
        () => dataFilter === 'all' ? entries : entries.filter((entry) => entry.status === dataFilter),
        [dataFilter, entries]
    );
    const approvedCount = entries.filter((entry) => entry.status === 'approved').length;
    const draftCount = entries.length - approvedCount;

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
        <header>
            <div><span>맞춤법 학습 모듈</span><h2>우리 반 맞춤법 배움 데이터</h2></div>
            <GuideInfoButton label="맞춤법 배움 데이터 사용법" title="맞춤법 배움 데이터 사용법" onClick={() => setMessage('문제 표현만 입력하면 AI가 초안을 만듭니다. 교사가 확인해 승인하기 전에는 학생에게 보이지 않습니다.')} />
        </header>
        {!classId && <p className="spelling-learning-message">먼저 학급을 선택해 주세요.</p>}
        {classId && <>
            <div className="spelling-learning-tabs" role="tablist" aria-label="맞춤법 배움 데이터 관리">
                <button type="button" role="tab" aria-selected={activeTab === 'create'} className={activeTab === 'create' ? 'is-active' : ''} onClick={() => setActiveTab('create')}>
                    <strong>✨ 항목 만들기</strong><small>AI 초안을 확인하고 승인합니다.</small>
                </button>
                <button type="button" role="tab" aria-selected={activeTab === 'data'} className={activeTab === 'data' ? 'is-active' : ''} onClick={() => setActiveTab('data')}>
                    <strong>📚 등록 데이터</strong><small>현재 등록된 {entries.length}개 항목을 확인합니다.</small>
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
                    <div><span>우리 반 수첩 현황</span><h3>현재 등록된 맞춤법 데이터</h3><p>승인된 항목만 학생 글쓰기의 밑줄과 맞춤법 수첩에 적용됩니다.</p></div>
                    <div className="spelling-learning-counts"><span><b>{entries.length}</b>전체</span><span><b>{approvedCount}</b>적용 중</span><span><b>{draftCount}</b>초안</span></div>
                </div>
                <div className="spelling-learning-filters" role="group" aria-label="등록 데이터 상태 필터">
                    {DATA_FILTERS.map((filter) => <button key={filter.id} type="button" className={dataFilter === filter.id ? 'is-active' : ''} onClick={() => setDataFilter(filter.id)}>{filter.label}</button>)}
                </div>
                <div className="spelling-learning-entry-list">
                    {filteredEntries.map((entry) => <article className="spelling-learning-entry" key={entry.id}>
                        <div className="spelling-learning-entry-title">
                            <div><strong><del>{entry.wrong_expression}</del><span aria-hidden="true">→</span>{entry.correct_expression}</strong><small>{entry.label || '미분류'}</small></div>
                            <span className={`spelling-learning-status is-${entry.status}`}>{entry.status === 'approved' ? '적용 중' : '초안'}</span>
                        </div>
                        {entry.explanation && <p>{entry.explanation}</p>}
                        {Array.isArray(entry.examples) && entry.examples.length > 0 && <div className="spelling-learning-examples"><b>바른 예문</b>{entry.examples.map((example, index) => <span key={`${entry.id}-${index}`}>{example}</span>)}</div>}
                    </article>)}
                    {!filteredEntries.length && <div className="spelling-learning-empty">{entries.length ? '이 상태의 항목이 없습니다.' : '아직 등록된 맞춤법 항목이 없습니다.'}</div>}
                </div>
            </section>}
        </>}
        {message && <p className="spelling-learning-message" role="status">{message}</p>}
    </section>;
};

export default TeacherEntry;
