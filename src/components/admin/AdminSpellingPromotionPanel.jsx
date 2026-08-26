import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { getElementarySpellingEntries } from '../../modules/writing/tools/spelling-lookup/elementarySpellingEntries';
import { spellingLearningApi } from '../../modules/writing/spelling-learning/api';

const EMPTY_DATA = { ai_findings: [], searched: [], common_entries: [], reviewed_recent: [] };
const EMPTY_DRAFT = {
    wrong_expression: '', correct_expression: '', label: '미분류', explanation: '', examples: []
};

const normalize = (value) => String(value || '').normalize('NFC').replace(/\s+/g, '');
const candidateKey = (sourceKind, row) => `${sourceKind}:${row.expression}:${row.correction || ''}`;

/** AI 검사·학생 검색 후보를 검토해 모든 학급의 동적 맞춤법 자료로 게시한다. */
const AdminSpellingPromotionPanel = () => {
    const [minClasses, setMinClasses] = useState(2);
    const [minHits, setMinHits] = useState(3);
    const [data, setData] = useState(EMPTY_DATA);
    const [reviewTarget, setReviewTarget] = useState(null);
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const { data: result, error } = await supabase.rpc('admin_get_spelling_promotion_workspace_v2', {
                p_min_classes: minClasses, p_min_hits: minHits, p_limit: 200
            });
            if (error) throw error;
            setData(result || EMPTY_DATA);
        } catch (error) {
            setMessage(error.message || '맞춤법 승격 데이터를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [minClasses, minHits]);

    useEffect(() => { load(); }, [load]);

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
    const hiddenKnownCount = (data.ai_findings || []).length - aiFindings.length
        + (data.searched || []).length - searched.length;

    const startCandidateReview = (sourceKind, row) => {
        setReviewTarget({
            key: candidateKey(sourceKind, row), sourceKind, expression: row.expression,
            sourceCorrection: row.correction || '', classCount: row.class_count || 0,
            hitCount: row.hit_count || row.search_count || 0, entryId: null
        });
        setDraft({
            ...EMPTY_DRAFT,
            wrong_expression: row.expression || '',
            correct_expression: row.correction || '',
            label: row.label && row.label !== '미등록 표현' ? row.label : '미분류'
        });
        setMessage('후보의 바른 표현·설명·예문을 확인한 뒤 전체 학급에 적용하세요.');
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
        setMessage('전체 학급에 적용되는 공통 자료를 수정하고 있습니다.');
    };

    const cancelReview = () => {
        setReviewTarget(null);
        setDraft(EMPTY_DRAFT);
        setMessage('');
    };

    const generateDraft = async () => {
        if (!draft.wrong_expression.trim()) return;
        setLoading(true);
        setMessage('');
        try {
            const generated = await spellingLearningApi.generateDraft(draft.wrong_expression.trim());
            setDraft((current) => ({
                ...current, ...generated,
                wrong_expression: current.wrong_expression.trim(),
                correct_expression: current.correct_expression.trim() || generated.correct_expression || ''
            }));
            setMessage('AI 초안을 만들었습니다. 오탐이 없는지 직접 확인해 주세요.');
        } catch (error) {
            setMessage(error.message || 'AI 초안을 만들지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const publish = async () => {
        if (!reviewTarget) return;
        setLoading(true);
        setMessage('');
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
            setMessage('공통 맞춤법 자료로 게시했습니다. 모든 학급이 다음 자료 갱신부터 사용합니다.');
        } catch (error) {
            setMessage(error.message || '공통 맞춤법 자료를 게시하지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const rejectCandidate = async (sourceKind, row) => {
        setLoading(true);
        setMessage('');
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
            setMessage('이 후보를 보류했습니다. 같은 근거로는 다시 추천하지 않습니다.');
        } catch (error) {
            setMessage(error.message || '후보를 보류하지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const setCommonEnabled = async (entry, enabled) => {
        if (!enabled && !window.confirm(`‘${entry.wrong_expression}’ 공통 자료를 모든 학급에서 중지할까요?`)) return;
        setLoading(true);
        setMessage('');
        try {
            const { error } = await supabase.rpc('admin_set_common_spelling_entry_status_v1', {
                p_entry_id: entry.id, p_enabled: enabled
            });
            if (error) throw error;
            await load();
            setMessage(enabled ? '공통 자료를 다시 적용했습니다.' : '공통 자료 적용을 중지했습니다.');
        } catch (error) {
            setMessage(error.message || '공통 자료 상태를 바꾸지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const canPublish = reviewTarget
        && draft.wrong_expression.trim()
        && draft.correct_expression.trim()
        && draft.explanation.trim()
        && normalize(draft.wrong_expression) !== normalize(draft.correct_expression);

    return <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Card style={{ padding: '24px', borderLeft: '5px solid #805AD5' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: '#2D3748' }}>🔤 맞춤법 공통 자료 승격</h3>
            <p style={{ margin: '0 0 16px 0', color: '#718096', fontSize: '0.9rem', lineHeight: 1.7 }}>
                학생 검색과 AI 맞춤법 검사에서 반복된 표현을 모읍니다. 관리자가 내용을 확인해 게시하면
                <strong> 재배포 없이 모든 학급에 적용</strong>되고, 교사는 자기 학급 전용 자료를 따로 추가할 수 있습니다.
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <NumberFilter label="최소 학급 수" value={minClasses} max={20} onChange={setMinClasses} />
                <NumberFilter label="최소 횟수" value={minHits} max={100} onChange={setMinHits} />
                <Button type="button" variant="outline" onClick={load} disabled={loading}>
                    {loading ? '불러오는 중…' : '다시 불러오기'}
                </Button>
            </div>
            {hiddenKnownCount > 0 && <p style={{ margin: '12px 0 0', color: '#718096', fontSize: '0.82rem' }}>
                이미 기본 500개 자료에 있는 후보 {hiddenKnownCount}개는 목록에서 제외했습니다.
            </p>}
            {message && <p style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: '8px', background: '#EBF8FF', color: '#2C5282', fontSize: '0.85rem' }}>{message}</p>}
        </Card>

        {reviewTarget && <ReviewEditor
            target={reviewTarget} draft={draft} setDraft={setDraft} loading={loading}
            onCancel={cancelReview} onGenerate={generateDraft} onPublish={publish} canPublish={canPublish}
        />}

        <CandidateCard
            title="AI 맞춤법 검사가 찾은 표현"
            description="AI가 학생 글에서 제안한 틀린 표현과 바른 표현입니다. 여러 학급·횟수는 검토 우선순위일 뿐 자동 게시 기준은 아닙니다."
            rows={aiFindings} sourceKind="ai" loading={loading}
            onReview={startCandidateReview} onReject={rejectCandidate}
        />
        <CandidateCard
            title="학생이 직접 검색한 표현"
            description="학생이 궁금해한 표현이라 틀렸다고 단정할 수 없습니다. 검토할 때 바른 표현과 설명을 직접 확인하세요."
            rows={searched} sourceKind="search" loading={loading}
            onReview={startCandidateReview} onReject={rejectCandidate}
        />
        <CommonEntriesCard
            entries={data.common_entries || []} loading={loading}
            onEdit={startCommonEdit} onSetEnabled={setCommonEnabled}
        />
    </div>;
};

const NumberFilter = ({ label, value, max, onChange }) => <label style={{ display: 'grid', gap: '4px', fontSize: '0.82rem', fontWeight: 700, color: '#4A5568' }}>
    {label}
    <input type="number" min={1} max={max} value={value}
        onChange={(event) => onChange(Number(event.target.value) || 1)}
        style={{ width: '90px', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '8px' }} />
</label>;

const ReviewEditor = ({ target, draft, setDraft, loading, onCancel, onGenerate, onPublish, canPublish }) => <Card style={{ padding: '24px', borderLeft: '5px solid #3182CE' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
            <span style={{ color: '#805AD5', fontSize: '0.8rem', fontWeight: 800 }}>
                {target.entryId ? '공통 자료 수정' : target.sourceKind === 'ai' ? 'AI 검사 후보' : '학생 검색 후보'}
            </span>
            <h4 style={{ margin: '4px 0 0', color: '#2D3748' }}>전체 학급 적용 내용 확인</h4>
            {!target.entryId && <small style={{ color: '#718096' }}>{target.classCount}학급 · {target.hitCount}회 근거</small>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={loading}>취소</Button>
    </div>
    <div style={{ display: 'grid', gap: '12px', marginTop: '18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <DraftInput label="틀린 표현" value={draft.wrong_expression} onChange={(wrong_expression) => setDraft({ ...draft, wrong_expression })} />
            <DraftInput label="바른 표현" value={draft.correct_expression} onChange={(correct_expression) => setDraft({ ...draft, correct_expression })} />
            <DraftInput label="배움 라벨" value={draft.label} onChange={(label) => setDraft({ ...draft, label })} />
        </div>
        <label style={fieldLabelStyle}>
            학생용 설명
            <textarea value={draft.explanation} maxLength={600} rows={3}
                onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} style={textareaStyle} />
        </label>
        <label style={fieldLabelStyle}>
            바른 예문 <small style={{ fontWeight: 500 }}>한 줄에 하나, 최대 4개</small>
            <textarea value={(draft.examples || []).join('\n')} maxLength={600} rows={3}
                onChange={(event) => setDraft({ ...draft, examples: event.target.value.split('\n').filter(Boolean).slice(0, 4) })}
                style={textareaStyle} />
        </label>
        <p style={{ margin: 0, color: '#C05621', fontSize: '0.82rem', lineHeight: 1.6 }}>
            문맥에 따라 맞을 수도 있는 표현·사람 이름·지명은 게시하지 마세요. 게시 자료는 모든 학생 글에서 같은 표현을 찾습니다.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button type="button" variant="outline" onClick={onGenerate} disabled={loading || !draft.wrong_expression.trim()}>AI로 설명 초안 만들기</Button>
            <Button type="button" onClick={onPublish} disabled={loading || !canPublish}>
                {target.entryId ? '수정 내용 전체 적용' : '공통 자료로 전체 적용'}
            </Button>
        </div>
    </div>
</Card>;

const fieldLabelStyle = { display: 'grid', gap: '5px', fontSize: '0.84rem', fontWeight: 700, color: '#4A5568' };
const inputStyle = { padding: '10px', border: '1px solid #CBD5E0', borderRadius: '8px' };
const textareaStyle = { ...inputStyle, resize: 'vertical' };
const DraftInput = ({ label, value, onChange }) => <label style={fieldLabelStyle}>
    {label}<input value={value} maxLength={40} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
</label>;

const CandidateCard = ({ title, description, rows, sourceKind, loading, onReview, onReject }) => <Card style={{ padding: '24px' }}>
    <h4 style={{ margin: '0 0 6px', color: '#2D3748' }}>{title} <span style={{ color: '#805AD5' }}>{rows.length}개</span></h4>
    <p style={{ margin: '0 0 14px', color: '#718096', fontSize: '0.85rem', lineHeight: 1.6 }}>{description}</p>
    {rows.length === 0 ? <EmptyText>현재 기준을 넘는 새 후보가 없습니다.</EmptyText> : <div style={{ display: 'grid', gap: '8px' }}>
        {rows.map((row) => <div key={candidateKey(sourceKind, row)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                <strong style={{ color: '#C53030' }}>{row.expression}</strong>
                {row.correction && <><span style={{ margin: '0 8px', color: '#A0AEC0' }}>→</span><strong style={{ color: '#2F855A' }}>{row.correction}</strong></>}
                <small style={{ display: 'block', marginTop: '4px', color: '#718096' }}>
                    {row.class_count}학급 · {row.hit_count || row.search_count}회 · 마지막 {new Date(row.last_seen_at).toLocaleDateString('ko-KR')}
                </small>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button type="button" variant="outline" size="sm" onClick={() => onReject(sourceKind, row)} disabled={loading}>보류</Button>
                <Button type="button" size="sm" onClick={() => onReview(sourceKind, row)} disabled={loading}>검토</Button>
            </div>
        </div>)}
    </div>}
</Card>;

const CommonEntriesCard = ({ entries, loading, onEdit, onSetEnabled }) => <Card style={{ padding: '24px' }}>
    <h4 style={{ margin: '0 0 6px', color: '#2D3748' }}>전체 학급 공통 자료 <span style={{ color: '#805AD5' }}>{entries.length}개</span></h4>
    <p style={{ margin: '0 0 14px', color: '#718096', fontSize: '0.85rem', lineHeight: 1.6 }}>
        게시된 자료는 모든 학급에 적용됩니다. 문제가 있으면 삭제하지 않고 중지해 언제든 되돌릴 수 있습니다.
    </p>
    {entries.length === 0 ? <EmptyText>아직 관리자가 게시한 공통 자료가 없습니다.</EmptyText> : <div style={{ display: 'grid', gap: '8px' }}>
        {entries.map((entry) => {
            const enabled = entry.status === 'approved';
            return <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', background: enabled ? '#F0FFF4' : '#F7FAFC', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                    <strong style={{ color: '#C53030' }}>{entry.wrong_expression}</strong><span style={{ margin: '0 8px', color: '#A0AEC0' }}>→</span><strong style={{ color: '#2F855A' }}>{entry.correct_expression}</strong>
                    <small style={{ display: 'block', marginTop: '4px', color: '#718096' }}>
                        {enabled ? '전체 적용 중' : '적용 중지'} · {entry.label} · {entry.source_kind === 'ai' ? 'AI 검사 근거' : entry.source_kind === 'search' ? '학생 검색 근거' : '관리자 등록'}
                    </small>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button type="button" variant="outline" size="sm" onClick={() => onEdit(entry)} disabled={loading}>수정</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onSetEnabled(entry, !enabled)} disabled={loading}>{enabled ? '전체 적용 중지' : '다시 전체 적용'}</Button>
                </div>
            </div>;
        })}
    </div>}
</Card>;

const EmptyText = ({ children }) => <p style={{ margin: 0, padding: '20px', textAlign: 'center', color: '#A0AEC0', fontSize: '0.88rem' }}>{children}</p>;

export default AdminSpellingPromotionPanel;
