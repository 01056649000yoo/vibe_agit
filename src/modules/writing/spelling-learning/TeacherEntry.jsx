import { useCallback, useEffect, useMemo, useState } from 'react';
import { getElementarySpellingEntries } from '../tools/spelling-lookup/elementarySpellingEntries';
import {
    ELEMENTARY_SPELLING_CATEGORY_COUNTS,
    SPELLING_CATEGORY_DEFINITIONS
} from '../tools/spelling-lookup/catalog';
import { spellingLearningApi } from './api';
import './TeacherEntry.css';

const EMPTY = { wrong_expression: '', correct_expression: '', label: '미분류', explanation: '', examples: [] };
const BUILT_IN_ENTRIES = getElementarySpellingEntries().map((entry) => ({
    ...entry,
    id: `built-in:${entry.id}`,
    kind: 'built-in'
}));
const DATA_FILTERS = [
    { id: 'all', label: '전체' },
    { id: 'built-in', label: '기본 자료' },
    { id: 'class', label: '우리 반 자료' }
];
const PAGE_SIZE = 20;

const normalizeSearchValue = (value) => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, ' ')
    .trim();

const getEntrySearchText = (entry) => normalizeSearchValue([
    entry.question,
    entry.answer,
    entry.wrong_expression,
    entry.correct_expression,
    entry.category,
    entry.subcategory,
    entry.detectionModeLabel,
    entry.learningLabel,
    entry.label,
    entry.explanation,
    ...(entry.searchable || []),
    ...(entry.examples || [])
].filter(Boolean).join(' '));

const TeacherEntry = ({ activeClass }) => {
    const classId = activeClass?.id;
    const [workspace, setWorkspace] = useState({ entries: [], top_searches: [] });
    const [draft, setDraft] = useState(EMPTY);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('insight');
    const [dataFilter, setDataFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [expandedEntryId, setExpandedEntryId] = useState(null);

    const load = useCallback(async () => {
        if (!classId) return;
        try {
            const nextWorkspace = await spellingLearningApi.getTeacherWorkspace(classId);
            setWorkspace(nextWorkspace || { entries: [], top_searches: [] });
        } catch (error) {
            setMessage(error.message || '맞춤법 데이터를 불러오지 못했습니다.');
        }
    }, [classId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
        setExpandedEntryId(null);
    }, [categoryFilter, dataFilter, searchQuery]);

    const classEntries = useMemo(
        () => (workspace.entries || []).map((entry) => ({ ...entry, kind: 'class' })),
        [workspace.entries]
    );

    // 검색 기록은 내부 키(`common:myeochil`)로 저장된다. 화면에서 실제 표현으로 되돌려 보여 준다.
    const builtInById = useMemo(
        () => new Map(BUILT_IN_ENTRIES.map((entry) => [entry.id.replace('built-in:', ''), entry])),
        []
    );
    const classById = useMemo(() => new Map(classEntries.map((entry) => [entry.id, entry])), [classEntries]);

    const searchRows = useMemo(() => (workspace.top_searches || []).map((row) => {
        const key = String(row.entry_key || '');
        if (key.startsWith('class:')) {
            const entry = classById.get(key.slice('class:'.length));
            return {
                ...row,
                text: entry ? `${entry.wrong_expression} → ${entry.correct_expression}` : (row.display || key),
                note: entry?.label || row.label,
                source: 'class'
            };
        }
        if (key.startsWith('common:')) {
            const entry = builtInById.get(key.slice('common:'.length));
            return {
                ...row,
                text: entry ? entry.question : (row.display || key),
                note: entry ? `${entry.category} › ${entry.subcategory}` : row.label,
                source: 'built-in'
            };
        }
        return {
            ...row,
            text: row.display || key.replace(/^unmatched:/, ''),
            note: '아직 우리 반 자료에 없는 표현이에요',
            source: 'missing'
        };
    }), [builtInById, classById, workspace.top_searches]);

    const searchSummary = useMemo(() => ({
        total: searchRows.reduce((sum, row) => sum + (row.total || 0), 0),
        expressions: searchRows.length,
        missing: searchRows.filter((row) => row.source === 'missing').length
    }), [searchRows]);

    const startFromSearch = (row) => {
        setDraft({ ...EMPTY, wrong_expression: String(row.text || '').slice(0, 80) });
        setMessage('학생이 찾아본 표현을 가져왔어요. `AI로 내용 만들기`를 눌러 보세요.');
        setActiveTab('create');
    };
    const entries = useMemo(() => [...classEntries, ...BUILT_IN_ENTRIES], [classEntries]);
    const filteredEntries = useMemo(() => {
        const normalizedQuery = normalizeSearchValue(searchQuery);
        const terms = normalizedQuery ? normalizedQuery.split(' ') : [];
        return entries.filter((entry) => {
            if (dataFilter !== 'all' && entry.kind !== dataFilter) return false;
            if (categoryFilter !== 'all' && entry.categoryId !== categoryFilter) return false;
            if (!terms.length) return true;
            const searchText = getEntrySearchText(entry);
            return terms.every((term) => searchText.includes(term));
        });
    }, [categoryFilter, dataFilter, entries, searchQuery]);
    const visibleEntries = filteredEntries.slice(0, visibleCount);

    const duplicateEntry = useMemo(() => {
        const wrongExpression = normalizeSearchValue(draft.wrong_expression);
        if (!wrongExpression) return null;
        return entries.find((entry) => {
            if (entry.id === draft.id) return false;
            const candidates = entry.kind === 'built-in'
                ? [entry.question, ...(entry.searchable || [])]
                : [entry.wrong_expression];
            return candidates.some((candidate) => normalizeSearchValue(candidate) === wrongExpression);
        }) || null;
    }, [draft.id, draft.wrong_expression, entries]);

    const generate = async () => {
        if (!draft.wrong_expression.trim()) return;
        setLoading(true);
        setMessage('');
        try {
            const generated = await spellingLearningApi.generateDraft(draft.wrong_expression.trim());
            setDraft({ ...EMPTY, ...generated, id: draft.id, wrong_expression: draft.wrong_expression.trim() });
            setMessage('AI가 내용을 만들었습니다. 바른 표현과 설명을 확인해 주세요.');
        } catch (error) {
            setMessage(error.message || 'AI 내용을 만들지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const save = async () => {
        setLoading(true);
        setMessage('');
        try {
            await spellingLearningApi.saveEntry(classId, draft, true);
            setDraft(EMPTY);
            setMessage('우리 반 맞춤법 자료로 등록했습니다.');
            await load();
            setActiveTab('data');
            setDataFilter('class');
        } catch (error) {
            setMessage(error.message || '항목을 등록하지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const editEntry = (entry) => {
        setDraft({
            id: entry.id,
            wrong_expression: entry.wrong_expression || '',
            correct_expression: entry.correct_expression || '',
            label: entry.label || '미분류',
            explanation: entry.explanation || '',
            examples: Array.isArray(entry.examples) ? entry.examples : []
        });
        setMessage('우리 반 자료를 수정하고 있습니다.');
        setActiveTab('create');
    };

    const resetDraft = () => {
        setDraft(EMPTY);
        setMessage('');
    };

    return <section className="spelling-learning-manager">
        {!classId && <p className="spelling-learning-message">먼저 학급을 선택해 주세요.</p>}
        {classId && <>
            <div className="spelling-learning-tabs is-three" role="tablist" aria-label="맞춤법 배움 데이터 관리">
                <button type="button" role="tab" aria-selected={activeTab === 'insight'} className={activeTab === 'insight' ? 'is-active' : ''} onClick={() => setActiveTab('insight')}>
                    <strong>🔎 우리 반 배움 현황</strong><small>학생이 찾아본 표현 {searchSummary.expressions}개</small>
                </button>
                <button type="button" role="tab" aria-selected={activeTab === 'create'} className={activeTab === 'create' ? 'is-active' : ''} onClick={() => setActiveTab('create')}>
                    <strong>✨ 항목 만들기</strong><small>우리 반 맞춤법 자료 등록</small>
                </button>
                <button type="button" role="tab" aria-selected={activeTab === 'data'} className={activeTab === 'data' ? 'is-active' : ''} onClick={() => setActiveTab('data')}>
                    <strong>📚 등록 데이터</strong><small>기본 {BUILT_IN_ENTRIES.length}개 · 우리 반 {classEntries.length}개</small>
                </button>
            </div>

            {activeTab === 'insight' && <section className="spelling-learning-card" role="tabpanel">
                <div className="spelling-learning-form-heading">
                    <div>
                        <span>최근 30일</span>
                        <h3>학생이 맞춤법 수첩에서 찾아본 표현</h3>
                    </div>
                </div>
                <div className="spelling-learning-summary">
                    <span><b>{searchSummary.total}</b>번 찾아봤어요</span>
                    <span><b>{searchSummary.expressions}</b>가지 표현</span>
                    <span className={searchSummary.missing ? 'is-warning' : ''}><b>{searchSummary.missing}</b>개는 아직 자료 없음</span>
                </div>

                {/* 학급 등록 → 학기말 공통 승격 흐름을 여기서 한 줄로 알려 준다(자세한 내용은 도움말). */}
                <p className="spelling-learning-notice">
                    자료가 없는 표현은 <b>우리 반 자료로 바로 등록</b>할 수 있어요. 학급 자료는 <b>학기말에 모아 검토한 뒤
                    여러 학급에서 함께 필요한 표현만 기본 자료로 옮깁니다.</b>
                </p>

                {searchRows.length === 0 && <p className="spelling-learning-empty">아직 모인 검색 기록이 없어요. 학생이 글을 쓰며 수첩에서 표현을 찾아보면 여기에 쌓입니다.</p>}

                <ol className="spelling-learning-search-list">
                    {searchRows.map((row, index) => <li key={row.entry_key} className={`spelling-learning-search-row is-${row.source}`}>
                        <span className="spelling-learning-search-rank">{index + 1}</span>
                        <span className="spelling-learning-search-body">
                            <strong>{row.text}</strong>
                            <small>{row.note}</small>
                        </span>
                        <span className="spelling-learning-search-count">
                            <b>{row.total}회</b>
                            <small>학생 {row.students}명</small>
                        </span>
                        <span className="spelling-learning-search-action">
                            {row.source === 'missing'
                                ? <button type="button" className="secondary" onClick={() => startFromSearch(row)}>자료 만들기</button>
                                : <em className={`spelling-learning-source is-${row.source}`}>{row.source === 'class' ? '우리 반 자료' : '기본 자료'}</em>}
                        </span>
                    </li>)}
                </ol>
            </section>}

            {activeTab === 'create' && <section className="spelling-learning-card" role="tabpanel">
                <div className="spelling-learning-form-heading">
                    <div><span>{draft.id ? '우리 반 자료 수정' : '새 자료 등록'}</span><h3>{draft.id ? '등록한 맞춤법 자료 고치기' : '문제 표현으로 항목 만들기'}</h3></div>
                    {draft.id && <button type="button" className="text-button" onClick={resetDraft}>수정 취소</button>}
                </div>

                <div className="spelling-learning-step">
                    <p className="spelling-learning-step-title"><b>1</b> 아이들이 헷갈리는 표현을 적습니다</p>
                    <label>틀리기 쉬운 표현<input value={draft.wrong_expression} maxLength={80} onChange={(event) => setDraft({ ...draft, wrong_expression: event.target.value })} placeholder="예: 안되요" /></label>
                    {duplicateEntry && <p className="spelling-learning-duplicate">이미 비슷한 자료가 있습니다: <b>{duplicateEntry.kind === 'built-in' ? duplicateEntry.question : duplicateEntry.wrong_expression}</b></p>}
                    <button type="button" onClick={generate} disabled={loading || !draft.wrong_expression.trim()}>🤖 AI로 내용 만들기</button>
                </div>

                <div className="spelling-learning-step">
                    <p className="spelling-learning-step-title"><b>2</b> 내용을 확인하고 고칩니다</p>
                    <div className="spelling-learning-field-row">
                        <label>바른 표현<input value={draft.correct_expression} maxLength={80} onChange={(event) => setDraft({ ...draft, correct_expression: event.target.value })} placeholder="예: 안 돼요" /></label>
                        <label>배움 라벨<input value={draft.label} maxLength={40} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="예: 되·돼" /></label>
                    </div>
                    <label>학생용 설명<textarea value={draft.explanation} maxLength={600} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} placeholder="학생이 읽고 바로 이해할 수 있게 한두 문장으로 적어 주세요." /></label>
                    <label>바른 예문 <small className="spelling-learning-hint">한 줄에 하나씩, 최대 4개</small><textarea value={(draft.examples || []).join('\n')} maxLength={600} onChange={(event) => setDraft({ ...draft, examples: event.target.value.split('\n').filter(Boolean).slice(0, 4) })} /></label>
                </div>

                <div className="spelling-learning-step">
                    <p className="spelling-learning-step-title"><b>3</b> 우리 반 수첩에 등록합니다</p>
                    <p className="spelling-learning-hint">등록하면 학생 글에서 이 표현에 밑줄이 그어지고, 수첩 검색에도 나옵니다.</p>
                    <div className="spelling-learning-actions">
                        {draft.id && <button type="button" className="secondary" onClick={resetDraft} disabled={loading}>취소</button>}
                        <button type="button" onClick={save} disabled={loading || !draft.wrong_expression.trim() || !draft.correct_expression.trim() || !draft.explanation.trim()}>{draft.id ? '수정 내용 등록' : '우리 반에 등록'}</button>
                    </div>
                </div>
            </section>}

            {activeTab === 'data' && <section className="spelling-learning-card spelling-learning-data" role="tabpanel">
                <div className="spelling-learning-data-heading">
                    <div><span>맞춤법 수첩 현황</span><h3>등록된 맞춤법 자료 찾기</h3><p>기본 자료는 읽기 전용이며, 우리 반에서 추가한 자료는 펼쳐서 수정할 수 있습니다.</p></div>
                    <div className="spelling-learning-counts"><span><b>{entries.length}</b>전체</span><span><b>{BUILT_IN_ENTRIES.length}</b>기본</span><span><b>{classEntries.length}</b>우리 반</span></div>
                </div>
                <label className="spelling-learning-search">
                    <span>등록 데이터 검색</span>
                    <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="틀린 표현, 바른 표현, 라벨, 분류 검색" />
                </label>
                <div className="spelling-learning-filter-row">
                    <div className="spelling-learning-filters" role="group" aria-label="등록 데이터 종류 필터">
                        {DATA_FILTERS.map((filter) => {
                            const count = filter.id === 'all' ? entries.length : filter.id === 'built-in' ? BUILT_IN_ENTRIES.length : classEntries.length;
                            return <button key={filter.id} type="button" className={dataFilter === filter.id ? 'is-active' : ''} onClick={() => {
                                setDataFilter(filter.id);
                                if (filter.id !== 'built-in') setCategoryFilter('all');
                            }}>{filter.label} <b>{count}</b></button>;
                        })}
                    </div>
                    <span className="spelling-learning-result-count">{filteredEntries.length}개 찾음</span>
                </div>
                {dataFilter !== 'class' && <div className="spelling-learning-category-filters" role="group" aria-label="기본 맞춤법 분류 필터">
                    <span>기본 자료 분류</span>
                    <div className="spelling-learning-filters">
                        <button type="button" className={categoryFilter === 'all' ? 'is-active' : ''} onClick={() => setCategoryFilter('all')}>전체 <b>{BUILT_IN_ENTRIES.length}</b></button>
                        {SPELLING_CATEGORY_DEFINITIONS.map((category) => {
                            const count = ELEMENTARY_SPELLING_CATEGORY_COUNTS[category.id] || 0;
                            return <button key={category.id} type="button" className={categoryFilter === category.id ? 'is-active' : ''} title={category.description} onClick={() => {
                                setCategoryFilter(category.id);
                                setDataFilter('built-in');
                            }}>{category.label} <b>{count}</b></button>;
                        })}
                    </div>
                </div>}
                <div className="spelling-learning-entry-list">
                    {visibleEntries.map((entry) => {
                        const isBuiltIn = entry.kind === 'built-in';
                        const isExpanded = expandedEntryId === entry.id;
                        const leftText = isBuiltIn ? entry.question : entry.wrong_expression;
                        const rightText = isBuiltIn ? entry.answer : entry.correct_expression;
                        return <article className={`spelling-learning-entry${isBuiltIn ? ' is-built-in' : ''}`} key={entry.id}>
                            <button type="button" className="spelling-learning-entry-summary" aria-expanded={isExpanded} onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}>
                                <span className="spelling-learning-entry-expression"><b>{leftText}</b><span aria-hidden="true">→</span><strong>{rightText}</strong></span>
                                <span className="spelling-learning-entry-meta"><span className={`spelling-learning-source is-${entry.kind}`}>{isBuiltIn ? '기본 자료' : '우리 반 자료'}</span><span className="spelling-learning-expand" aria-hidden="true">{isExpanded ? '−' : '+'}</span></span>
                            </button>
                            {isExpanded && <div className="spelling-learning-entry-detail">
                                <div className="spelling-learning-entry-labels">
                                    {(isBuiltIn ? entry.learningLabel : entry.label) && <span className="spelling-learning-entry-label">라벨 · {isBuiltIn ? entry.learningLabel : entry.label}</span>}
                                    {isBuiltIn && entry.category && <span className="spelling-learning-entry-label is-category">분류 · {entry.category} › {entry.subcategory}</span>}
                                    {isBuiltIn && entry.detectionModeLabel && <span className="spelling-learning-entry-label is-detection">검사 · {entry.detectionModeLabel}</span>}
                                </div>
                                {entry.explanation && <p>{entry.explanation}</p>}
                                {Array.isArray(entry.examples) && entry.examples.length > 0 && <div className="spelling-learning-examples"><b>바른 예문</b>{entry.examples.map((example, index) => <span key={`${entry.id}-${index}`}>{example}</span>)}</div>}
                                {!isBuiltIn && <div className="spelling-learning-entry-actions"><button type="button" className="secondary" onClick={() => editEntry(entry)}>수정</button></div>}
                            </div>}
                        </article>;
                    })}
                    {visibleCount < filteredEntries.length && <button type="button" className="spelling-learning-load-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>다음 {Math.min(PAGE_SIZE, filteredEntries.length - visibleCount)}개 더 보기</button>}
                    {!filteredEntries.length && <div className="spelling-learning-empty">{searchQuery.trim() ? '검색 결과가 없습니다. 다른 표현이나 설명으로 찾아보세요.' : '이 종류의 등록 자료가 없습니다.'}</div>}
                </div>
            </section>}
        </>}
        {message && <p className="spelling-learning-message" role="status">{message}</p>}
    </section>;
};

export default TeacherEntry;
