import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { getElementarySpellingEntries } from '../../modules/writing/tools/spelling-lookup/elementarySpellingEntries';
import { spellingLearningApi } from '../../modules/writing/spelling-learning/api';
import './AdminSpellingPromotionPanel.css';

const EMPTY_DATA = { ai_findings: [], searched: [], common_entries: [], reviewed_recent: [] };
const EMPTY_DRAFT = {
    wrong_expression: '', correct_expression: '', label: '미분류', explanation: '', examples: []
};
const DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });

const normalize = (value) => String(value || '').normalize('NFC').replace(/\s+/g, '');
const candidateKey = (sourceKind, row) => `${sourceKind}:${row.expression}:${row.correction || ''}`;
const formatDate = (value) => value ? DATE_FORMATTER.format(new Date(value)) : '기록 없음';

/** AI 검사·학생 검색 후보를 검토해 모든 학급의 동적 맞춤법 자료로 게시한다. */
const AdminSpellingPromotionPanel = () => {
    const [minClasses, setMinClasses] = useState(2);
    const [minHits, setMinHits] = useState(3);
    const [filterDraft, setFilterDraft] = useState({ minClasses: 2, minHits: 3 });
    const [activeView, setActiveView] = useState('candidates');
    const [activeSource, setActiveSource] = useState('ai');
    const [commonFilter, setCommonFilter] = useState('enabled');
    const [data, setData] = useState(EMPTY_DATA);
    const [reviewTarget, setReviewTarget] = useState(null);
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState(null);
    const editorRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        setNotice(null);
        try {
            const { data: result, error } = await supabase.rpc('admin_get_spelling_promotion_workspace_v2', {
                p_min_classes: minClasses, p_min_hits: minHits, p_limit: 200
            });
            if (error) throw error;
            setData(result || EMPTY_DATA);
        } catch (error) {
            setNotice({ tone: 'error', text: error.message || '맞춤법 승격 데이터를 불러오지 못했습니다.' });
        } finally {
            setLoading(false);
        }
    }, [minClasses, minHits]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!reviewTarget) return;
        window.requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }, [reviewTarget]);

    const builtInIndex = useMemo(() => {
        const index = new Set();
        for (const entry of getElementarySpellingEntries()) {
            for (const value of [entry.question, entry.answer, ...(entry.searchable || [])]) {
                if (value) index.add(normalize(value));
            }
        }
        return index;
    }, []);

    const aiFindings = useMemo(() => (data.ai_findings || []).filter(
        (row) => !builtInIndex.has(normalize(row.expression))
    ), [builtInIndex, data.ai_findings]);
    const searched = useMemo(() => (data.searched || []).filter(
        (row) => !builtInIndex.has(normalize(row.expression))
    ), [builtInIndex, data.searched]);
    const commonEntries = data.common_entries || [];
    const enabledCommonCount = commonEntries.filter((entry) => entry.status === 'approved').length;
    const disabledCommonCount = commonEntries.length - enabledCommonCount;
    const pendingCount = aiFindings.length + searched.length;
    const activeCandidates = activeSource === 'ai' ? aiFindings : searched;
    const visibleCommonEntries = commonEntries.filter((entry) => (
        commonFilter === 'all'
        || (commonFilter === 'enabled' && entry.status === 'approved')
        || (commonFilter === 'disabled' && entry.status !== 'approved')
    ));
    const hiddenKnownCount = (data.ai_findings || []).length - aiFindings.length
        + (data.searched || []).length - searched.length;

    const startCandidateReview = (sourceKind, row) => {
        setActiveView('candidates');
        setActiveSource(sourceKind);
        setReviewTarget({
            key: candidateKey(sourceKind, row), sourceKind, expression: row.expression,
            sourceCorrection: row.correction || '', classCount: row.class_count || 0,
            hitCount: row.hit_count ?? row.search_count ?? 0, entryId: null
        });
        setDraft({
            ...EMPTY_DRAFT,
            wrong_expression: row.expression || '',
            correct_expression: row.correction || '',
            label: row.label && row.label !== '미등록 표현' ? row.label : '미분류'
        });
        setNotice({ tone: 'info', text: '바른 표현과 설명을 확인한 뒤 전체 학급에 적용하세요.' });
    };

    const startCommonEdit = (entry) => {
        setReviewTarget({
            key: `common:${entry.id}`,
            sourceKind: ['ai', 'search', 'manual'].includes(entry.source_kind) ? entry.source_kind : 'manual',
            expression: entry.wrong_expression, sourceCorrection: entry.correct_expression,
            classCount: 0, hitCount: 0, entryId: entry.id
        });
        setDraft({
            wrong_expression: entry.wrong_expression || '', correct_expression: entry.correct_expression || '',
            label: entry.label || '미분류', explanation: entry.explanation || '',
            examples: Array.isArray(entry.examples) ? entry.examples : []
        });
        setNotice({ tone: 'info', text: '전체 학급에 적용 중인 공통 자료를 수정합니다.' });
    };

    const cancelReview = () => {
        setReviewTarget(null);
        setDraft(EMPTY_DRAFT);
        setNotice(null);
    };

    const selectView = (nextView) => {
        if (nextView !== activeView) cancelReview();
        setActiveView(nextView);
    };

    const selectSource = (nextSource) => {
        if (nextSource !== activeSource && reviewTarget && !reviewTarget.entryId) cancelReview();
        setActiveSource(nextSource);
    };

    const applyFilters = (event) => {
        event.preventDefault();
        const nextClasses = Math.min(Math.max(filterDraft.minClasses, 1), 20);
        const nextHits = Math.min(Math.max(filterDraft.minHits, 1), 100);
        setFilterDraft({ minClasses: nextClasses, minHits: nextHits });
        if (nextClasses === minClasses && nextHits === minHits) load();
        else {
            setMinClasses(nextClasses);
            setMinHits(nextHits);
        }
    };

    const generateDraft = async () => {
        if (!draft.wrong_expression.trim()) return;
        setLoading(true);
        setNotice(null);
        try {
            const generated = await spellingLearningApi.generateDraft(draft.wrong_expression.trim());
            setDraft((current) => ({
                ...current, ...generated,
                wrong_expression: current.wrong_expression.trim(),
                correct_expression: current.correct_expression.trim() || generated.correct_expression || ''
            }));
            setNotice({ tone: 'success', text: 'AI 초안을 만들었습니다. 오탐이 없는지 직접 확인해 주세요.' });
        } catch (error) {
            setNotice({ tone: 'error', text: error.message || 'AI 초안을 만들지 못했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    const publish = async () => {
        if (!reviewTarget) return;
        setLoading(true);
        setNotice(null);
        try {
            const { error } = await supabase.rpc('admin_publish_common_spelling_entry_v1', {
                p_source_kind: reviewTarget.sourceKind,
                p_expression: reviewTarget.expression,
                p_source_correction: reviewTarget.sourceCorrection,
                p_entry: draft,
                p_entry_id: reviewTarget.entryId
            });
            if (error) throw error;
            setReviewTarget(null);
            setDraft(EMPTY_DRAFT);
            await load();
            setNotice({ tone: 'success', text: '게시했습니다. 모든 학급이 다음 자료 갱신부터 사용합니다.' });
        } catch (error) {
            setNotice({ tone: 'error', text: error.message || '공통 맞춤법 자료를 게시하지 못했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    const rejectCandidate = async (sourceKind, row) => {
        setLoading(true);
        setNotice(null);
        try {
            const { error } = await supabase.rpc('admin_reject_spelling_candidate_v1', {
                p_source_kind: sourceKind,
                p_expression: row.expression,
                p_source_correction: row.correction || ''
            });
            if (error) throw error;
            if (reviewTarget?.key === candidateKey(sourceKind, row)) {
                setReviewTarget(null);
                setDraft(EMPTY_DRAFT);
            }
            await load();
            setNotice({ tone: 'success', text: '후보를 보류했습니다. 같은 근거로는 다시 추천하지 않습니다.' });
        } catch (error) {
            setNotice({ tone: 'error', text: error.message || '후보를 보류하지 못했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    const setCommonEnabled = async (entry, enabled) => {
        if (!enabled && !window.confirm(`‘${entry.wrong_expression}’ 공통 자료를 모든 학급에서 중지할까요?`)) return;
        setLoading(true);
        setNotice(null);
        try {
            const { error } = await supabase.rpc('admin_set_common_spelling_entry_status_v1', {
                p_entry_id: entry.id, p_enabled: enabled
            });
            if (error) throw error;
            await load();
            setNotice({ tone: 'success', text: enabled ? '공통 자료를 다시 적용했습니다.' : '공통 자료 적용을 중지했습니다.' });
        } catch (error) {
            setNotice({ tone: 'error', text: error.message || '공통 자료 상태를 바꾸지 못했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    const canPublish = reviewTarget
        && draft.wrong_expression.trim()
        && draft.correct_expression.trim()
        && draft.explanation.trim()
        && normalize(draft.wrong_expression) !== normalize(draft.correct_expression);

    return <section className="admin-spelling">
        <header className="admin-spelling__header">
            <div className="admin-spelling__intro">
                <span className="admin-spelling__eyebrow">전체 학급 기준 자료</span>
                <h2>맞춤법 공통 자료 관리</h2>
                <p>반복해서 발견된 표현을 검토해 게시하면 모든 학급에 적용됩니다. 교사는 자기 학급 자료를 별도로 추가할 수 있습니다.</p>
            </div>
            <div className="admin-spelling__metrics" aria-label="맞춤법 공통 자료 현황">
                <Metric label="검토 대기" value={pendingCount} detail={`AI ${aiFindings.length} · 검색 ${searched.length}`} tone={pendingCount ? 'warning' : 'neutral'} />
                <Metric label="전체 적용 중" value={enabledCommonCount} detail="모든 학급" tone="active" />
                <Metric label="적용 중지" value={disabledCommonCount} detail="되돌릴 수 있음" tone="neutral" />
            </div>
        </header>

        {notice && <p className={`admin-spelling__notice is-${notice.tone}`} role="status">{notice.text}</p>}

        <div className="admin-spelling__view-tabs" role="tablist" aria-label="맞춤법 공통 자료 관리 화면">
            <button type="button" role="tab" aria-selected={activeView === 'candidates'} aria-controls="spelling-candidate-panel" className={activeView === 'candidates' ? 'is-active' : ''} onClick={() => selectView('candidates')}>
                검토할 후보 <b>{pendingCount}</b>
            </button>
            <button type="button" role="tab" aria-selected={activeView === 'common'} aria-controls="spelling-common-panel" className={activeView === 'common' ? 'is-active' : ''} onClick={() => selectView('common')}>
                전체 공통 자료 <b>{commonEntries.length}</b>
            </button>
        </div>

        {reviewTarget && <div ref={editorRef} className="admin-spelling__editor-anchor">
            <ReviewEditor
                target={reviewTarget} draft={draft} setDraft={setDraft} loading={loading}
                onCancel={cancelReview} onGenerate={generateDraft} onPublish={publish} canPublish={canPublish}
            />
        </div>}

        {activeView === 'candidates' && <section id="spelling-candidate-panel" className="admin-spelling__panel" role="tabpanel">
            <div className="admin-spelling__panel-heading">
                <div>
                    <span>관리자 확인 후에만 게시됩니다</span>
                    <h3>검토할 후보</h3>
                </div>
                <form className="admin-spelling__thresholds" onSubmit={applyFilters}>
                    <NumberFilter label="학급" value={filterDraft.minClasses} max={20} onChange={(minClassesValue) => setFilterDraft((current) => ({ ...current, minClasses: minClassesValue }))} />
                    <NumberFilter label="횟수" value={filterDraft.minHits} max={100} onChange={(minHitsValue) => setFilterDraft((current) => ({ ...current, minHits: minHitsValue }))} />
                    <Button type="submit" size="sm" variant="outline" disabled={loading}>기준 적용</Button>
                </form>
            </div>

            <div className="admin-spelling__source-toolbar">
                <div className="admin-spelling__source-tabs" role="tablist" aria-label="후보 출처">
                    <button type="button" role="tab" aria-selected={activeSource === 'ai'} aria-controls="spelling-candidate-results" className={activeSource === 'ai' ? 'is-active' : ''} onClick={() => selectSource('ai')}>
                        AI 검사 <b>{aiFindings.length}</b>
                    </button>
                    <button type="button" role="tab" aria-selected={activeSource === 'search'} aria-controls="spelling-candidate-results" className={activeSource === 'search' ? 'is-active' : ''} onClick={() => selectSource('search')}>
                        학생 검색 <b>{searched.length}</b>
                    </button>
                </div>
                <button type="button" className="admin-spelling__refresh" onClick={load} disabled={loading}>{loading ? '갱신 중…' : '새로고침'}</button>
            </div>

            <div id="spelling-candidate-results" className="admin-spelling__results" role="tabpanel">
                <p className="admin-spelling__source-guide">
                    {activeSource === 'ai'
                        ? 'AI가 학생 글에서 제안한 틀린 표현과 바른 표현입니다. 학급·횟수는 검토 우선순위이며 자동 게시 기준이 아닙니다.'
                        : '학생이 궁금해한 표현이라 틀렸다고 단정할 수 없습니다. 바른 표현과 설명을 직접 확인해 주세요.'}
                </p>
                {hiddenKnownCount > 0 && <p className="admin-spelling__known">기본 500개 자료와 겹치는 후보 {hiddenKnownCount}개는 숨겼습니다.</p>}
                <CandidateList rows={activeCandidates} sourceKind={activeSource} loading={loading} onReview={startCandidateReview} onReject={rejectCandidate} />
            </div>
        </section>}

        {activeView === 'common' && <section id="spelling-common-panel" className="admin-spelling__panel" role="tabpanel">
            <div className="admin-spelling__panel-heading">
                <div>
                    <span>재배포 없이 모든 학급에 적용</span>
                    <h3>전체 공통 자료</h3>
                </div>
                <div className="admin-spelling__common-filters" role="group" aria-label="공통 자료 상태 필터">
                    <FilterButton active={commonFilter === 'enabled'} onClick={() => setCommonFilter('enabled')}>적용 중 {enabledCommonCount}</FilterButton>
                    <FilterButton active={commonFilter === 'disabled'} onClick={() => setCommonFilter('disabled')}>중지 {disabledCommonCount}</FilterButton>
                    <FilterButton active={commonFilter === 'all'} onClick={() => setCommonFilter('all')}>전체 {commonEntries.length}</FilterButton>
                </div>
            </div>
            <p className="admin-spelling__source-guide">문제가 있으면 삭제하지 않고 적용을 중지할 수 있으며, 나중에 다시 적용할 수 있습니다.</p>
            <CommonEntriesList entries={visibleCommonEntries} loading={loading} onEdit={startCommonEdit} onSetEnabled={setCommonEnabled} />
        </section>}
    </section>;
};

const Metric = ({ label, value, detail, tone }) => <div className={`admin-spelling__metric is-${tone}`}>
    <span>{label}</span><strong>{value}</strong><small>{detail}</small>
</div>;

const NumberFilter = ({ label, value, max, onChange }) => <label className="admin-spelling__number-filter">
    {label}
    <input type="number" min={1} max={max} value={value} aria-label={`최소 ${label}`}
        onChange={(event) => onChange(Number(event.target.value) || 1)} />
    <span>이상</span>
</label>;

const FilterButton = ({ active, children, onClick }) => <button type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={onClick}>{children}</button>;

const ReviewEditor = ({ target, draft, setDraft, loading, onCancel, onGenerate, onPublish, canPublish }) => <section className="admin-spelling__editor" aria-label="공통 맞춤법 자료 검토">
    <div className="admin-spelling__editor-heading">
        <div>
            <span>{target.entryId ? '공통 자료 수정' : target.sourceKind === 'ai' ? 'AI 검사 후보 검토' : '학생 검색 후보 검토'}</span>
            <h3>{target.entryId ? `${target.expression} 자료 수정` : `${target.expression} 승격 내용 확인`}</h3>
            {!target.entryId && <small>{target.classCount}학급 · {target.hitCount}회 근거</small>}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>검토 닫기</Button>
    </div>
    <div className="admin-spelling__editor-grid">
        <DraftInput label="틀린 표현" value={draft.wrong_expression} onChange={(wrong_expression) => setDraft({ ...draft, wrong_expression })} />
        <DraftInput label="바른 표현" value={draft.correct_expression} onChange={(correct_expression) => setDraft({ ...draft, correct_expression })} />
        <DraftInput label="배움 라벨" value={draft.label} onChange={(label) => setDraft({ ...draft, label })} />
    </div>
    <label className="admin-spelling__field">
        학생용 설명
        <textarea value={draft.explanation} maxLength={600} rows={3}
            onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} />
    </label>
    <label className="admin-spelling__field">
        바른 예문 <small>한 줄에 하나, 최대 4개</small>
        <textarea value={(draft.examples || []).join('\n')} maxLength={600} rows={3}
            onChange={(event) => setDraft({ ...draft, examples: event.target.value.split('\n').filter(Boolean).slice(0, 4) })} />
    </label>
    <p className="admin-spelling__warning">문맥에 따라 맞을 수도 있는 표현·사람 이름·지명은 게시하지 마세요. 게시 자료는 모든 학생 글에서 같은 표현을 찾습니다.</p>
    <div className="admin-spelling__editor-actions">
        <Button type="button" variant="outline" onClick={onGenerate} disabled={loading || !draft.wrong_expression.trim()}>AI로 설명 초안</Button>
        <Button type="button" onClick={onPublish} disabled={loading || !canPublish}>{target.entryId ? '수정 내용 전체 적용' : '공통 자료로 전체 적용'}</Button>
    </div>
</section>;

const DraftInput = ({ label, value, onChange }) => <label className="admin-spelling__field">
    {label}<input value={value} maxLength={40} onChange={(event) => onChange(event.target.value)} />
</label>;

const CandidateList = ({ rows, sourceKind, loading, onReview, onReject }) => rows.length === 0
    ? <EmptyState title="새 후보가 없습니다" description="현재 기준을 넘는 후보가 생기면 이곳에 표시됩니다." />
    : <div className="admin-spelling__list">
        {rows.map((row) => <article className="admin-spelling__candidate" key={candidateKey(sourceKind, row)}>
            <div className="admin-spelling__expression">
                <strong>{row.expression}</strong>
                {row.correction && <><span aria-hidden="true">→</span><b>{row.correction}</b></>}
            </div>
            <div className="admin-spelling__evidence">
                <b>{row.class_count}학급</b><span>{row.hit_count ?? row.search_count ?? 0}회</span><small>최근 {formatDate(row.last_seen_at)}</small>
            </div>
            <div className="admin-spelling__row-actions">
                <Button type="button" variant="ghost" size="sm" onClick={() => onReject(sourceKind, row)} disabled={loading}>보류</Button>
                <Button type="button" size="sm" onClick={() => onReview(sourceKind, row)} disabled={loading}>내용 검토</Button>
            </div>
        </article>)}
    </div>;

const CommonEntriesList = ({ entries, loading, onEdit, onSetEnabled }) => entries.length === 0
    ? <EmptyState title="해당 자료가 없습니다" description="다른 상태를 선택하거나 후보를 공통 자료로 게시해 주세요." />
    : <div className="admin-spelling__list">
        {entries.map((entry) => {
            const enabled = entry.status === 'approved';
            return <article className={`admin-spelling__common-entry${enabled ? ' is-enabled' : ''}`} key={entry.id}>
                <div className="admin-spelling__expression">
                    <strong>{entry.wrong_expression}</strong><span aria-hidden="true">→</span><b>{entry.correct_expression}</b>
                </div>
                <div className="admin-spelling__common-meta">
                    <span className={enabled ? 'is-enabled' : 'is-disabled'}>{enabled ? '전체 적용 중' : '적용 중지'}</span>
                    <small>{entry.label} · {entry.source_kind === 'ai' ? 'AI 검사' : entry.source_kind === 'search' ? '학생 검색' : '관리자 등록'}</small>
                </div>
                <div className="admin-spelling__row-actions">
                    <Button type="button" variant="outline" size="sm" onClick={() => onEdit(entry)} disabled={loading}>수정</Button>
                    <Button type="button" variant={enabled ? 'ghost' : 'primary'} size="sm" onClick={() => onSetEnabled(entry, !enabled)} disabled={loading}>{enabled ? '적용 중지' : '다시 적용'}</Button>
                </div>
            </article>;
        })}
    </div>;

const EmptyState = ({ title, description }) => <div className="admin-spelling__empty">
    <strong>{title}</strong><p>{description}</p>
</div>;

export default AdminSpellingPromotionPanel;
