import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { spellingLearningApi } from '../../modules/writing/spelling-learning/api';
import './AdminSpellingPromotionPanel.css';

const EMPTY_DATA = { latest_run: null, candidate_week: null, weekly_candidates: [], common_entries: [] };
const EMPTY_DRAFT = {
    wrong_expression: '', correct_expression: '', label: '미분류', explanation: '', examples: []
};
const DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
});
const normalize = (value) => String(value || '').normalize('NFC').replace(/\s+/g, '');
const formatDate = (value) => value ? DATE_FORMATTER.format(new Date(value)) : '기록 없음';
const formatDateTime = (value) => value ? DATE_TIME_FORMATTER.format(new Date(value)) : '아직 없음';
const verdictLabel = (value) => value === 'recommend' ? '반영 권장' : value === 'caution' ? '주의 검토' : '제외 권장';
const sourceLabel = (value) => value === 'ai' ? '학생 AI 검사' : value === 'search' ? '학생 검색' : value === 'teacher' ? '교사 학급 자료' : value;

/** 매주 자동 검수된 맞춤법 후보 중 관리자가 고른 것만 모든 학급의 공통 자료로 게시한다. */
const AdminSpellingPromotionPanel = () => {
    const [activeView, setActiveView] = useState('candidates');
    const [verdictFilter, setVerdictFilter] = useState('recommend');
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
            const { data: result, error } = await supabase.rpc('admin_get_spelling_promotion_workspace_v3');
            if (error) throw error;
            setData(result || EMPTY_DATA);
        } catch (error) {
            setNotice({ tone: 'error', text: error.message || '맞춤법 주간 검수 데이터를 불러오지 못했습니다.' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!reviewTarget) return;
        window.requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }, [reviewTarget]);

    const weeklyCandidates = useMemo(() => data.weekly_candidates || [], [data.weekly_candidates]);
    const commonEntries = data.common_entries || [];
    const enabledCommonCount = commonEntries.filter((entry) => entry.status === 'approved').length;
    const disabledCommonCount = commonEntries.length - enabledCommonCount;
    const verdictCounts = useMemo(() => ({
        recommend: weeklyCandidates.filter((item) => item.ai_verdict === 'recommend').length,
        caution: weeklyCandidates.filter((item) => item.ai_verdict === 'caution').length,
        reject: weeklyCandidates.filter((item) => item.ai_verdict === 'reject').length
    }), [weeklyCandidates]);
    const visibleCandidates = weeklyCandidates.filter((item) => (
        verdictFilter === 'all' || item.ai_verdict === verdictFilter
    ));
    const visibleCommonEntries = commonEntries.filter((entry) => (
        commonFilter === 'all'
        || (commonFilter === 'enabled' && entry.status === 'approved')
        || (commonFilter === 'disabled' && entry.status !== 'approved')
    ));
    const latestRun = data.latest_run;

    const startCandidateReview = (row) => {
        setActiveView('candidates');
        setReviewTarget({
            weeklyItemId: row.id,
            expression: row.expression,
            sourceCorrection: row.source_correction || '',
            classCount: row.class_count || 0,
            hitCount: row.hit_count || 0,
            sourceKinds: row.source_kinds || [],
            verdict: row.ai_verdict,
            aiReason: row.ai_reason,
            entryId: null,
            sourceKind: row.primary_source
        });
        setDraft({
            wrong_expression: row.expression || '',
            correct_expression: row.ai_correct_expression || row.source_correction || '',
            label: row.ai_label || '미분류',
            explanation: row.ai_explanation || '',
            examples: Array.isArray(row.ai_examples) ? row.ai_examples : []
        });
        setNotice({ tone: 'info', text: 'AI 검수 결과를 참고하되, 게시 전 표현·설명·예문을 직접 확인해 주세요.' });
    };

    const startCommonEdit = (entry) => {
        setReviewTarget({
            weeklyItemId: null,
            sourceKind: ['ai', 'search', 'manual'].includes(entry.source_kind) ? entry.source_kind : 'manual',
            expression: entry.wrong_expression,
            sourceCorrection: entry.correct_expression,
            classCount: 0,
            hitCount: 0,
            sourceKinds: [],
            entryId: entry.id
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
            setNotice({ tone: 'success', text: 'AI 초안을 다시 만들었습니다. 기존 주간 검수와 함께 직접 확인해 주세요.' });
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
            const request = reviewTarget.weeklyItemId
                ? supabase.rpc('admin_publish_weekly_spelling_entry_v1', {
                    p_item_id: reviewTarget.weeklyItemId, p_entry: draft
                })
                : supabase.rpc('admin_publish_common_spelling_entry_v1', {
                    p_source_kind: reviewTarget.sourceKind,
                    p_expression: reviewTarget.expression,
                    p_source_correction: reviewTarget.sourceCorrection,
                    p_entry: draft,
                    p_entry_id: reviewTarget.entryId
                });
            const { error } = await request;
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

    const rejectCandidate = async (row) => {
        setLoading(true);
        setNotice(null);
        try {
            const { error } = await supabase.rpc('admin_reject_weekly_spelling_entry_v1', { p_item_id: row.id });
            if (error) throw error;
            if (reviewTarget?.weeklyItemId === row.id) {
                setReviewTarget(null);
                setDraft(EMPTY_DRAFT);
            }
            await load();
            setNotice({ tone: 'success', text: '후보를 보류했습니다. 같은 검수 결과는 다시 AI에 보내지 않습니다.' });
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
                <span className="admin-spelling__eyebrow">매주 월요일 자동 정리</span>
                <h2>맞춤법 공통 자료 관리</h2>
                <p>AI 검사·학생 검색·교사 학급 자료를 주 1회 모아 기존 자료와 비교하고 AI 검수를 마친 뒤, 관리자가 고른 것만 모든 학급에 적용합니다.</p>
            </div>
            <div className="admin-spelling__metrics" aria-label="맞춤법 공통 자료 현황">
                <Metric label="검토 대기" value={weeklyCandidates.length} detail={`권장 ${verdictCounts.recommend} · 주의 ${verdictCounts.caution}`} tone={weeklyCandidates.length ? 'warning' : 'neutral'} />
                <Metric label="전체 적용 중" value={enabledCommonCount} detail="모든 학급" tone="active" />
                <Metric label="적용 중지" value={disabledCommonCount} detail="되돌릴 수 있음" tone="neutral" />
            </div>
        </header>

        {notice && <p className={`admin-spelling__notice is-${notice.tone}`} role="status">{notice.text}</p>}
        {latestRun?.status === 'failed' && <p className="admin-spelling__notice is-error" role="status">최근 주간 검수가 완료되지 않았습니다. 오류 코드: {latestRun.error_code || 'unknown'}</p>}

        <div className="admin-spelling__view-tabs" role="tablist" aria-label="맞춤법 공통 자료 관리 화면">
            <button type="button" role="tab" aria-selected={activeView === 'candidates'} aria-controls="spelling-candidate-panel" className={activeView === 'candidates' ? 'is-active' : ''} onClick={() => selectView('candidates')}>
                이번 주 검수 결과 <b>{weeklyCandidates.length}</b>
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
                    <span>기존 500개 전체를 AI에 보내지 않습니다</span>
                    <h3>주간 AI 검수 결과</h3>
                </div>
                <button type="button" className="admin-spelling__refresh" onClick={load} disabled={loading}>{loading ? '갱신 중…' : '새로고침'}</button>
            </div>

            <RunSummary run={latestRun} candidateWeek={data.candidate_week} />
            <div className="admin-spelling__source-toolbar">
                <div className="admin-spelling__source-tabs" role="tablist" aria-label="AI 검수 결과 필터">
                    <FilterButton active={verdictFilter === 'recommend'} onClick={() => setVerdictFilter('recommend')}>반영 권장 {verdictCounts.recommend}</FilterButton>
                    <FilterButton active={verdictFilter === 'caution'} onClick={() => setVerdictFilter('caution')}>주의 검토 {verdictCounts.caution}</FilterButton>
                    <FilterButton active={verdictFilter === 'reject'} onClick={() => setVerdictFilter('reject')}>제외 권장 {verdictCounts.reject}</FilterButton>
                    <FilterButton active={verdictFilter === 'all'} onClick={() => setVerdictFilter('all')}>전체 {weeklyCandidates.length}</FilterButton>
                </div>
            </div>

            <p className="admin-spelling__source-guide">정확히 같은 기본·공통 자료는 코드가 먼저 제외합니다. AI에는 새 후보와 유사 자료 최대 3개만 전달하며, 이전에 검수한 같은 후보는 저장된 결과를 재사용합니다.</p>
            <CandidateList rows={visibleCandidates} loading={loading} onReview={startCandidateReview} onReject={rejectCandidate} />
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

const FilterButton = ({ active, children, onClick }) => <button type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={onClick}>{children}</button>;

const RunSummary = ({ run, candidateWeek }) => {
    if (!run) return <div className="admin-spelling__run-summary is-empty">
        <strong>아직 주간 검수 기록이 없습니다.</strong><span>마이그레이션과 예약 작업 적용 후 매주 월요일 05:10에 첫 결과가 만들어집니다.</span>
    </div>;
    return <div className="admin-spelling__run-summary">
        <div><span>결과 주간</span><strong>{candidateWeek ? formatDate(candidateWeek) : '후보 없음'}</strong></div>
        <div><span>최근 실행</span><strong>{formatDateTime(run.finished_at || run.started_at)}</strong></div>
        <div><span>수집</span><strong>{run.collected_count || 0}개</strong></div>
        <div><span>기존 자료 제외</span><strong>{run.known_filtered_count || 0}개</strong></div>
        <div><span>AI 새 검수</span><strong>{run.ai_reviewed_count || 0}개</strong></div>
        <div><span>이전 결과 재사용</span><strong>{run.cache_hit_count || 0}개</strong></div>
    </div>;
};

const ReviewEditor = ({ target, draft, setDraft, loading, onCancel, onGenerate, onPublish, canPublish }) => <section className="admin-spelling__editor" aria-label="공통 맞춤법 자료 검토">
    <div className="admin-spelling__editor-heading">
        <div>
            <span>{target.entryId ? '공통 자료 수정' : `${verdictLabel(target.verdict)} 후보 확인`}</span>
            <h3>{target.entryId ? `${target.expression} 자료 수정` : `${target.expression} 반영 내용 확인`}</h3>
            {!target.entryId && <small>{target.classCount}학급 · {target.hitCount}회 근거 · {(target.sourceKinds || []).map(sourceLabel).join(' + ')}</small>}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>검토 닫기</Button>
    </div>
    {!target.entryId && target.aiReason && <p className="admin-spelling__ai-reason"><b>AI 검수 의견</b>{target.aiReason}</p>}
    <div className="admin-spelling__editor-grid">
        <DraftInput label="틀린 표현" value={draft.wrong_expression} onChange={(wrong_expression) => setDraft({ ...draft, wrong_expression })} />
        <DraftInput label="바른 표현" value={draft.correct_expression} onChange={(correct_expression) => setDraft({ ...draft, correct_expression })} />
        <DraftInput label="배움 라벨" value={draft.label} onChange={(label) => setDraft({ ...draft, label })} />
    </div>
    <label className="admin-spelling__field">
        학생용 설명
        <textarea value={draft.explanation} maxLength={600} rows={3} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} />
    </label>
    <label className="admin-spelling__field">
        바른 예문 <small>한 줄에 하나, 최대 4개</small>
        <textarea value={(draft.examples || []).join('\n')} maxLength={600} rows={3} onChange={(event) => setDraft({ ...draft, examples: event.target.value.split('\n').filter(Boolean).slice(0, 4) })} />
    </label>
    <p className="admin-spelling__warning">문맥에 따라 맞을 수도 있는 표현·사람 이름·지명은 게시하지 마세요. 게시 자료는 모든 학생 글에서 같은 표현을 찾습니다.</p>
    <div className="admin-spelling__editor-actions">
        <Button type="button" variant="outline" onClick={onGenerate} disabled={loading || !draft.wrong_expression.trim()}>AI 초안 다시 만들기</Button>
        <Button type="button" onClick={onPublish} disabled={loading || !canPublish}>{target.entryId ? '수정 내용 전체 적용' : '공통 자료로 전체 적용'}</Button>
    </div>
</section>;

const DraftInput = ({ label, value, onChange }) => <label className="admin-spelling__field">
    {label}<input value={value} maxLength={40} onChange={(event) => onChange(event.target.value)} />
</label>;

const CandidateList = ({ rows, loading, onReview, onReject }) => rows.length === 0
    ? <EmptyState title="해당 검수 결과가 없습니다" description="다른 검수 결과를 선택하거나 다음 주 자동 정리를 기다려 주세요." />
    : <div className="admin-spelling__list">
        {rows.map((row) => <article className={`admin-spelling__candidate is-${row.ai_verdict}`} key={row.id}>
            <div className="admin-spelling__candidate-main">
                <div className="admin-spelling__expression">
                    <strong>{row.expression}</strong>
                    {(row.ai_correct_expression || row.source_correction) && <><span aria-hidden="true">→</span><b>{row.ai_correct_expression || row.source_correction}</b></>}
                </div>
                <div className="admin-spelling__candidate-badges">
                    <span className={`is-${row.ai_verdict}`}>{verdictLabel(row.ai_verdict)}</span>
                    {(row.source_kinds || []).map((source) => <small key={source}>{sourceLabel(source)}</small>)}
                    {row.cache_hit && <small>이전 검수 재사용</small>}
                </div>
                <p>{row.ai_reason}</p>
            </div>
            <div className="admin-spelling__evidence">
                <b>{row.class_count}학급</b><span>{row.hit_count || 0}회</span>
            </div>
            <div className="admin-spelling__row-actions">
                <Button type="button" variant="ghost" size="sm" onClick={() => onReject(row)} disabled={loading}>보류</Button>
                <Button type="button" size="sm" onClick={() => onReview(row)} disabled={loading}>내용 검토</Button>
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
