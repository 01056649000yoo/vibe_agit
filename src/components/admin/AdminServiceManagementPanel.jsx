import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import { PanelHeader, SectionCard } from './adminUsageUi';

const STATUS_META = {
    PENDING: { label: '미확인', color: '#64748B', background: '#F1F5F9' },
    PASS: { label: '정상', color: '#166534', background: '#DCFCE7' },
    ATTENTION: { label: '보완 필요', color: '#B91C1C', background: '#FEE2E2' },
    NA: { label: '해당 없음', color: '#475569', background: '#E2E8F0' }
};

const getStatusMeta = (status) => {
    switch (status) {
        case 'PASS': return STATUS_META.PASS;
        case 'ATTENTION': return STATUS_META.ATTENTION;
        case 'NA': return STATUS_META.NA;
        default: return STATUS_META.PENDING;
    }
};

const getExposureLabel = (exposure) => {
    switch (exposure) {
        case 'public': return '공개 요청 경로';
        case 'lan': return 'LAN 노출';
        case 'internal': return '내부 전용';
        default: return '노출 확인 필요';
    }
};

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul'
});

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : dateTimeFormatter.format(date);
};

const SummaryCard = ({ label, value, detail, tone = 'neutral' }) => {
    const colors = tone === 'danger'
        ? { border: '#FCA5A5', background: '#FFF1F2', value: '#B91C1C' }
        : tone === 'good'
            ? { border: '#86EFAC', background: '#F0FDF4', value: '#166534' }
            : { border: '#CBD5E1', background: '#F8FAFC', value: '#334155' };
    return (
        <div style={{ minWidth: 0, padding: '18px', borderRadius: '14px', border: `1px solid ${colors.border}`, background: colors.background }}>
            <div style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: 800 }}>{label}</div>
            <div style={{ color: colors.value, fontSize: '1.35rem', fontWeight: 900, marginTop: '4px' }}>{value}</div>
            <div style={{ color: '#64748B', fontSize: '0.76rem', lineHeight: 1.5, marginTop: '5px' }}>{detail}</div>
        </div>
    );
};

const ReviewItem = ({ reviewId, catalog, item, onSaved }) => {
    const [status, setStatus] = useState(item?.status || 'PENDING');
    const [note, setNote] = useState(item?.note || '');
    const [saving, setSaving] = useState(false);

    const changed = status !== (item?.status || 'PENDING') || note !== (item?.note || '');
    const meta = getStatusMeta(status);

    const save = async () => {
        setSaving(true);
        const { error } = await supabase.rpc('admin_set_service_review_item_v1', {
            p_review_id: reviewId,
            p_item_key: catalog.item_key,
            p_status: status,
            p_note: note.trim()
        });
        setSaving(false);
        if (error) {
            window.alert(`점검 항목 저장 실패: ${error.message}`);
            return;
        }
        setNote(note.trim());
        await onSaved();
    };

    return (
        <div style={{ padding: '16px', border: '1px solid #E2E8F0', borderRadius: '12px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 360px' }}>
                    <strong style={{ color: '#1E293B' }}>{catalog.sort_order / 10}. {catalog.title}</strong>
                    <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '0.82rem', lineHeight: 1.55 }}>{catalog.description}</p>
                </div>
                <span style={{ padding: '4px 9px', borderRadius: '999px', background: meta.background, color: meta.color, fontSize: '0.75rem', fontWeight: 800 }}>
                    {meta.label}
                </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                    aria-label={`${catalog.title} 점검 결과`}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    style={{ flex: '1 1 150px', padding: '9px 10px', border: '1px solid #CBD5E1', borderRadius: '8px', background: 'white' }}
                >
                    {Object.entries(STATUS_META).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
                <input
                    aria-label={`${catalog.title} 점검 메모`}
                    value={note}
                    maxLength={240}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="확인 근거나 다음 조치만 기록 · 비밀 값 입력 금지"
                    style={{ flex: '4 1 240px', minWidth: 0, padding: '9px 10px', border: '1px solid #CBD5E1', borderRadius: '8px' }}
                />
                <Button size="sm" onClick={save} disabled={saving || !changed}>{saving ? '저장 중' : '저장'}</Button>
            </div>
        </div>
    );
};

const AdminServiceManagementPanel = ({ serviceManagement }) => {
    const { data, loading, error, refresh } = serviceManagement;
    const [mutating, setMutating] = useState(false);
    const catalog = useMemo(() => (Array.isArray(data?.catalog) ? data.catalog : []), [data]);
    const activeItems = useMemo(() => {
        const items = Array.isArray(data?.active_review?.items) ? data.active_review.items : [];
        return new Map(items.map((item) => [item.item_key, item]));
    }, [data]);
    const latestScan = data?.latest_scan || null;
    const latestReview = data?.latest_review || null;
    const activeReview = data?.active_review || null;
    const summary = data?.summary || {};
    const scanRuns = Array.isArray(data?.scan_runs) ? data.scan_runs : [];
    const images = Array.isArray(latestScan?.images) ? latestScan.images : [];
    const pendingCount = [...activeItems.values()].filter((item) => item.status === 'PENDING').length;

    const startReview = async () => {
        if (!window.confirm('서비스 정기점검을 시작하시겠습니까? 완료한 시각을 기준으로 다음 점검일이 3개월 뒤로 정해집니다.')) return;
        setMutating(true);
        const { error: rpcError } = await supabase.rpc('admin_start_service_review_v1');
        setMutating(false);
        if (rpcError) return window.alert(`점검 시작 실패: ${rpcError.message}`);
        await refresh();
    };

    const completeReview = async () => {
        if (pendingCount > 0) return window.alert(`아직 확인하지 않은 항목이 ${pendingCount}개 있습니다.`);
        if (!window.confirm('이번 분기 점검을 완료하고 이 시각부터 다음 3개월 주기를 시작하시겠습니까?')) return;
        setMutating(true);
        const { error: rpcError } = await supabase.rpc('admin_complete_service_review_v1', {
            p_review_id: activeReview.review_id
        });
        setMutating(false);
        if (rpcError) return window.alert(`점검 완료 실패: ${rpcError.message}`);
        await refresh();
    };

    if (loading && !data) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>서비스 관리 원장을 불러오는 중...</div>;
    if (error) {
        return (
            <div style={{ padding: '28px', borderRadius: '12px', border: '1px solid #FCA5A5', background: '#FFF1F2', color: '#B91C1C' }}>
                서비스 관리 원장을 불러오지 못했습니다: {error}
                <div style={{ marginTop: '12px' }}><Button size="sm" onClick={refresh}>다시 시도</Button></div>
            </div>
        );
    }

    const reviewValue = activeReview
        ? `진행 중 · ${pendingCount}개 남음`
        : !latestReview ? '첫 점검 대기'
            : summary.review_due ? '점검 기한 도래' : formatDateTime(latestReview.next_due_at);
    const scanValue = !latestScan ? '첫 검사 대기'
        : latestScan.status === 'FAIL' ? '수집 실패'
            : `긴급 ${latestScan.urgent_count} · 조치 ${latestScan.attention_count}`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <SectionCard>
                <PanelHeader
                    title="서비스 관리"
                    description="분기 운영 점검과 월간 Docker 이미지 취약점 추이를 한곳에서 관리합니다. CVE 원본 로그와 비밀 값은 브라우저에 저장하지 않습니다."
                    right={<Button size="sm" onClick={refresh} disabled={loading}>{loading ? '새로고침 중' : '새로고침'}</Button>}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                    <SummaryCard
                        label="분기 정기점검"
                        value={reviewValue}
                        detail={latestReview ? `최근 완료 ${formatDateTime(latestReview.completed_at)}` : '첫 완료 시각부터 3개월 주기를 시작합니다.'}
                        tone={summary.review_due || activeReview ? 'danger' : latestReview ? 'good' : 'neutral'}
                    />
                    <SummaryCard
                        label="Docker 이미지 CVE"
                        value={scanValue}
                        detail={latestScan
                            ? `최근 검사 ${formatDateTime(latestScan.finished_at)} · 이미지 ${latestScan.image_count}개${Number(latestScan.ignored_count || 0) > 0 ? ` · 이유를 적어 뺀 항목 ${latestScan.ignored_count}건` : ''}`
                            : '첫 점검 때 호스트 검사기로 기준을 만듭니다.'}
                        tone={summary.scan_failed || Number(latestScan?.urgent_count || 0) > 0 ? 'danger' : latestScan ? 'good' : 'neutral'}
                    />
                    <SummaryCard label="CRITICAL / HIGH" value={latestScan ? `${latestScan.critical_count} / ${latestScan.high_count}` : '-'} detail={`수정 가능 ${latestScan?.fixable_count ?? '-'}건`} />
                    <SummaryCard label="지금 확인할 항목" value={`${summary.attention_count || 0}건`} detail="기한 도래·진행 중 점검·긴급 CVE를 합친 수입니다." tone={summary.attention_count > 0 ? 'danger' : 'good'} />
                </div>
            </SectionCard>

            <SectionCard>
                <PanelHeader
                    title="분기 서비스 점검표"
                    description="자동으로 정상 처리하지 않습니다. 각 항목을 직접 확인하고 완료해야 다음 점검일이 정해집니다."
                    right={!activeReview
                        ? <Button size="sm" onClick={startReview} disabled={mutating}>{latestReview ? '새 분기 점검 시작' : '첫 점검 시작'}</Button>
                        : <Button size="sm" onClick={completeReview} disabled={mutating || pendingCount > 0}>점검 완료</Button>}
                />
                {!activeReview ? (
                    <div style={{ padding: '24px', borderRadius: '12px', background: '#F8FAFC', color: '#475569', lineHeight: 1.7 }}>
                        {latestReview
                            ? `최근 점검은 ${formatDateTime(latestReview.completed_at)}에 완료했습니다. 다음 점검 예정은 ${formatDateTime(latestReview.next_due_at)}입니다.`
                            : '아직 기준 점검이 없습니다. Supabase 업데이트 확인 후 첫 점검을 시작하면 그 완료 시각이 분기 일정의 기준이 됩니다.'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {catalog.map((entry) => {
                            const item = activeItems.get(entry.item_key);
                            return (
                                <ReviewItem
                                    key={`${entry.item_key}:${item?.status || 'PENDING'}:${item?.note || ''}:${item?.checked_at || ''}`}
                                    reviewId={activeReview.review_id}
                                    catalog={entry}
                                    item={item}
                                    onSaved={refresh}
                                />
                            );
                        })}
                        <div style={{ color: '#64748B', fontSize: '0.8rem', textAlign: 'right' }}>미확인 {pendingCount}개 · 비밀키·비밀번호는 메모에 입력하지 마세요.</div>
                    </div>
                )}
            </SectionCard>

            <SectionCard>
                <PanelHeader
                    title="최근 이미지 취약점"
                    description="공개 경로의 수정 가능한 CRITICAL은 긴급, 수정 가능한 CRITICAL·HIGH는 조치 대상으로 집계합니다. 컨테이너에서 실행되지 않는 커널 헤더 패키지처럼 이미지를 고쳐 막을 수 없는 것은 이유를 적어 세지 않고 `숨김` 열에 건수만 남깁니다(원본 기록에는 그대로 남습니다)."
                />
                {!latestScan ? (
                    <div style={{ padding: '24px', color: '#64748B', background: '#F8FAFC', borderRadius: '12px' }}>첫 호스트 검사가 실행되면 이미지별 결과가 여기에 표시됩니다.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                <th style={{ padding: '11px', textAlign: 'left' }}>이미지</th><th style={{ padding: '11px', textAlign: 'left' }}>서비스</th>
                                <th style={{ padding: '11px', textAlign: 'left' }}>노출</th><th style={{ padding: '11px', textAlign: 'right' }}>CRITICAL</th>
                                <th style={{ padding: '11px', textAlign: 'right' }}>HIGH</th><th style={{ padding: '11px', textAlign: 'right' }}>수정 가능</th>
                                <th style={{ padding: '11px', textAlign: 'right' }}>긴급</th>
                                <th style={{ padding: '11px', textAlign: 'right' }}>숨김</th>
                            </tr></thead>
                            <tbody>{images.map((image) => (
                                <tr key={image.image_key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '11px', color: '#1E293B', fontWeight: 700 }}>{image.image_ref}</td>
                                    <td style={{ padding: '11px', color: '#64748B' }}>{image.service_group}</td>
                                    <td style={{ padding: '11px', color: image.exposure === 'public' ? '#B45309' : '#64748B' }}>{getExposureLabel(image.exposure)}</td>
                                    <td style={{ padding: '11px', textAlign: 'right' }}>{image.critical_count}</td>
                                    <td style={{ padding: '11px', textAlign: 'right' }}>{image.high_count}</td>
                                    <td style={{ padding: '11px', textAlign: 'right' }}>{image.fixable_count}</td>
                                    <td style={{ padding: '11px', textAlign: 'right', color: image.urgent_count > 0 ? '#B91C1C' : '#166534', fontWeight: 900 }}>{image.urgent_count}</td>
                                    <td style={{ padding: '11px', textAlign: 'right', color: '#94A3B8' }}>{image.ignored_count ?? 0}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {scanRuns.length > 0 && (
                <SectionCard>
                    <PanelHeader title="월간 검사 추이" description="최근 12회만 표시합니다. 이미지가 바뀌면 월간 일정 전에도 추가 검사할 수 있습니다." />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', overflowX: 'auto' }}>
                        {scanRuns.map((run) => (
                            <div key={run.run_key} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) repeat(4, minmax(72px, auto))', gap: '10px', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '9px', color: '#475569', fontSize: '0.8rem' }}>
                                <span>{formatDateTime(run.finished_at)} · 이미지 {run.image_count}</span>
                                <span>CRIT {run.critical_count}</span><span>HIGH {run.high_count}</span>
                                <span>수정 {run.fixable_count}</span><strong style={{ color: run.urgent_count > 0 ? '#B91C1C' : '#166534' }}>긴급 {run.urgent_count}</strong>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            )}
        </div>
    );
};

export default AdminServiceManagementPanel;
