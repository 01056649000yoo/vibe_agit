import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import { BACKUP_APPS } from './backupApps';
import { PanelHeader, SectionCard } from './adminUsageUi';

const STATUS_META = {
    PASS: { label: '정상', color: '#166534', background: '#DCFCE7', border: '#86EFAC' },
    RUNNING: { label: '진행 중', color: '#92400E', background: '#FEF3C7', border: '#FCD34D' },
    FAIL: { label: '실패', color: '#B91C1C', background: '#FEE2E2', border: '#FCA5A5' },
    STALE: { label: '확인 필요', color: '#B91C1C', background: '#FFF1F2', border: '#FDA4AF' },
    EMPTY: { label: '기록 없음', color: '#475569', background: '#F1F5F9', border: '#CBD5E1' }
};

const DETAIL_LABELS = {
    all_good: '필수 파일과 세 위치 사본 완료',
    backup_failed: '백업 단계 일부 실패',
    restore_verified: '실제 복원 검증 완료',
    restore_failed: '복구 리허설 일부 실패',
    backup_verified: 'DB와 필수 파일 확인',
    restore_verified_app: 'DB와 필수 파일 실제 복원 확인',
    database_failed: 'DB 확인 실패',
    files_failed: '필수 파일 확인 실패',
    database_and_files_failed: 'DB와 필수 파일 확인 실패'
};

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
});

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : dateTimeFormatter.format(date);
};

const formatBackupDay = (value) => {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
};

const isOlderThan = (run, serverTime, amount, unit) => {
    if (!run || !serverTime) return false;
    const base = new Date(run.finished_at || run.started_at).getTime();
    const server = new Date(serverTime).getTime();
    if (!Number.isFinite(base) || !Number.isFinite(server)) return false;
    const milliseconds = unit === 'days'
        ? amount * 86400000
        : unit === 'minutes'
            ? amount * 60000
            : amount * 3600000;
    return server - base > milliseconds;
};

const getRunPresentation = (run, serverTime, staleAmount, staleUnit) => {
    if (!run) return { ...STATUS_META.EMPTY, reason: '아직 기록된 실행이 없습니다.' };
    if (run.status === 'RUNNING' && isOlderThan(run, serverTime, 15, 'minutes')) {
        return { ...STATUS_META.STALE, reason: '15분 이상 실행 중으로 남아 있습니다.' };
    }
    if (isOlderThan(run, serverTime, staleAmount, staleUnit)) {
        return {
            ...STATUS_META.STALE,
            reason: staleUnit === 'days'
                ? `${staleAmount}일 넘게 새 복구 검사가 없습니다.`
                : `${staleAmount}시간 넘게 새 백업이 없습니다.`
        };
    }
    const meta = STATUS_META[run.status] || STATUS_META.EMPTY;
    return {
        ...meta,
        reason: DETAIL_LABELS[run.detail_code] || (run.status === 'RUNNING' ? '백업 작업이 진행 중입니다.' : '세부 상태를 확인하세요.')
    };
};

const StatusBadge = ({ presentation }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '5px 10px', borderRadius: '999px',
        color: presentation.color, background: presentation.background,
        border: `1px solid ${presentation.border}`, fontSize: '0.78rem', fontWeight: 800,
        whiteSpace: 'nowrap'
    }}>
        {presentation.label}
    </span>
);

const CopyStatus = ({ label, value }) => {
    const known = value === true || value === false;
    return (
        <div style={{
            padding: '12px', borderRadius: '12px', minWidth: 0,
            border: `1px solid ${value === false ? '#FCA5A5' : '#E2E8F0'}`,
            background: value === false ? '#FFF1F2' : '#F8FAFC'
        }}>
            <div style={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 700 }}>{label}</div>
            <div style={{ marginTop: '5px', color: value === false ? '#B91C1C' : '#1E293B', fontWeight: 900 }}>
                {known ? (value ? '정상' : '실패') : '기록 전'}
            </div>
        </div>
    );
};

const SummaryCard = ({ title, run, presentation, children, schedule }) => (
    <SectionCard style={{ minWidth: 0 }}>
        <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ color: '#334155', fontWeight: 900 }}>{title}</div>
                    <div style={{ marginTop: '5px', color: '#64748B', fontSize: '0.8rem' }}>{schedule}</div>
                </div>
                <StatusBadge presentation={presentation} />
            </div>
            <p style={{ margin: '14px 0 0', color: presentation.color, fontSize: '0.86rem', fontWeight: 700 }}>
                {presentation.reason}
            </p>
            <div style={{ marginTop: '10px', color: '#64748B', fontSize: '0.8rem', lineHeight: 1.55 }}>
                대상 백업: {formatBackupDay(run?.backup_day)}<br />
                완료 시각: {formatDateTime(run?.finished_at || run?.started_at)}
            </div>
            {children}
        </div>
    </SectionCard>
);

const getAppResult = (run, appKey) => (
    Array.isArray(run?.app_results)
        ? run.app_results.find((result) => result.app_key === appKey)
        : null
);

const AppResultLine = ({ label, result }) => {
    if (!result) {
        return (
            <div style={{ padding: '12px', borderRadius: '12px', background: '#F8FAFC', color: '#64748B' }}>
                <strong style={{ color: '#475569' }}>{label}</strong>
                <div style={{ marginTop: '6px', fontSize: '0.8rem' }}>앱별 기록 전</div>
            </div>
        );
    }

    const meta = STATUS_META[result.status] || STATUS_META.EMPTY;
    return (
        <div style={{
            padding: '12px', borderRadius: '12px',
            background: result.status === 'PASS' ? '#F0FDF4' : '#FFF1F2',
            border: `1px solid ${result.status === 'PASS' ? '#BBF7D0' : '#FECDD3'}`
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <strong style={{ color: '#334155' }}>{label}</strong>
                <StatusBadge presentation={meta} />
            </div>
            <div style={{ marginTop: '9px', color: '#475569', fontSize: '0.78rem', lineHeight: 1.55 }}>
                DB {result.db_ok === true ? '정상' : result.db_ok === false ? '실패' : '기록 전'} · 파일/설정 {result.files_ok === true ? '정상' : result.files_ok === false ? '실패' : '기록 전'}<br />
                DB 표 {result.object_count ?? '-'}개 · {DETAIL_LABELS[result.detail_code] || '세부 상태 확인'}
            </div>
        </div>
    );
};

const AppCard = ({ app, daily, restore }) => (
    <SectionCard style={{ minWidth: 0 }}>
        <div style={{ padding: '18px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span aria-hidden="true" style={{ fontSize: '1.45rem' }}>{app.icon}</span>
                <div>
                    <div style={{ color: '#1E293B', fontWeight: 900 }}>{app.label}</div>
                    <div style={{ marginTop: '3px', color: '#64748B', fontSize: '0.76rem', lineHeight: 1.45 }}>{app.description}</div>
                </div>
            </div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '15px' }}>
                <AppResultLine label="최근 백업" result={getAppResult(daily, app.key)} />
                <AppResultLine label="최근 복구 검사" result={getAppResult(restore, app.key)} />
            </div>
        </div>
    </SectionCard>
);

const AppRunSummary = ({ title, run, expectedCount, presentation }) => {
    const results = Array.isArray(run?.app_results) ? run.app_results : [];
    const passed = results.filter((result) => result.status === 'PASS').length;
    const hasAppRecords = results.length > 0;
    const healthy = presentation.label === '정상' && hasAppRecords && passed === expectedCount;
    const text = !hasAppRecords ? '앱별 기록 전' : `${passed}/${expectedCount} 정상`;
    const visual = presentation.label !== '정상'
        ? presentation
        : !hasAppRecords
            ? STATUS_META.EMPTY
            : healthy
                ? STATUS_META.PASS
                : STATUS_META.FAIL;
    return (
        <div style={{
            padding: '15px 16px', borderRadius: '14px',
            background: visual.background,
            border: `1px solid ${visual.border}`
        }}>
            <div style={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 800 }}>{title}</div>
            <div style={{ marginTop: '5px', color: visual.color, fontSize: '1.08rem', fontWeight: 900 }}>
                {presentation.label === '정상' ? text : presentation.label}
            </div>
        </div>
    );
};

const AdminBackupPanel = () => {
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const { data, error } = await supabase.rpc('admin_get_backup_runs_v1', { p_limit: 20 });
            if (error) throw error;
            setPayload(data || { runs: [] });
        } catch (error) {
            setErrorMessage(error?.message || '백업 상태를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const runs = useMemo(() => Array.isArray(payload?.runs) ? payload.runs : [], [payload]);
    const daily = runs.find((run) => run.job_type === 'daily');
    const restore = runs.find((run) => run.job_type === 'restore');
    const expectedAppCount = payload?.expected_app_count || BACKUP_APPS.length;
    const dailyPresentation = getRunPresentation(
        daily,
        payload?.server_time,
        payload?.daily_stale_after_hours || 26,
        'hours'
    );
    const restorePresentation = getRunPresentation(
        restore,
        payload?.server_time,
        payload?.restore_stale_after_days || 40,
        'days'
    );

    return (
        <div style={{ display: 'grid', gap: '18px' }}>
            <SectionCard>
                <PanelHeader
                    title="3개 앱 통합 백업·복구 상태"
                    description="아지트·샘링크·자비스의 앱별 결과와 공용 사본을 한 번에 봅니다. 원문 로그·경로·비밀 값은 표시하지 않습니다."
                    right={(
                        <Button onClick={load} disabled={loading} size="sm" variant="secondary">
                            {loading ? '확인 중...' : '새로고침'}
                        </Button>
                    )}
                />
                {errorMessage && (
                    <div role="alert" style={{ margin: '16px 20px', padding: '12px 14px', borderRadius: '10px', background: '#FEE2E2', color: '#B91C1C' }}>
                        {errorMessage}
                    </div>
                )}
                {!errorMessage && loading && !payload && (
                    <div style={{ padding: '36px 20px', textAlign: 'center', color: '#94A3B8' }}>백업 상태를 확인하고 있습니다...</div>
                )}
                {!errorMessage && payload && (
                    <div style={{ padding: '16px 20px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                            <AppRunSummary title="최근 통합 백업" run={daily} expectedCount={expectedAppCount} presentation={dailyPresentation} />
                            <AppRunSummary title="최근 실제 복구 검사" run={restore} expectedCount={expectedAppCount} presentation={restorePresentation} />
                        </div>
                        <div style={{ marginTop: '12px', color: '#64748B', fontSize: '0.78rem' }}>
                            서버 기준 확인 시각: {formatDateTime(payload.server_time)}
                        </div>
                    </div>
                )}
            </SectionCard>

            {!errorMessage && payload && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                    {BACKUP_APPS.map((app) => <AppCard key={app.key} app={app} daily={daily} restore={restore} />)}
                </div>
            )}

            {!errorMessage && payload && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                    <SummaryCard title="공용 사본" run={daily} presentation={dailyPresentation} schedule="매일 오전 4:00 · 26시간 이상 새 기록이 없으면 경고">
                        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                            <CopyStatus label="내장" value={daily?.local_ok} />
                            <CopyStatus label="Drive" value={daily?.drive_ok} />
                            <CopyStatus label="외장 SSD(암호화)" value={daily?.external_ok} />
                        </div>
                        <div style={{ marginTop: '12px', color: '#475569', fontSize: '0.82rem' }}>
                            필수 산출물: {daily?.artifact_count == null ? '-' : `${daily.artifact_count}개 / 7개`}
                        </div>
                    </SummaryCard>

                    <SummaryCard title="실제 복구 리허설" run={restore} presentation={restorePresentation} schedule="매월 1일 오전 4:40 · 40일 이상 새 기록이 없으면 경고">
                        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                            <CopyStatus label="통합 DB" value={restore?.agit_table_count > 0 ? true : restore?.agit_table_count === 0 ? false : null} />
                            <CopyStatus label="앱 스키마" value={restore?.lab_table_count > 0 ? true : restore?.lab_table_count === 0 ? false : null} />
                            <CopyStatus label="Storage" value={restore?.storage_file_count > 0 ? true : restore?.storage_file_count === 0 ? false : null} />
                        </div>
                        <div style={{ marginTop: '12px', color: '#475569', fontSize: '0.82rem' }}>
                            복원 결과: 통합 DB {restore?.agit_table_count ?? '-'}개 · app+samlink {restore?.lab_table_count ?? '-'}개 · 파일 {restore?.storage_file_count ?? '-'}개
                        </div>
                    </SummaryCard>
                </div>
            )}

            {!errorMessage && payload && (
                <SectionCard>
                    <PanelHeader title="최근 실행 내역" description="최근 20건만 표시합니다. 실패하면 맥미니의 백업 로그에서 상세 원인을 확인합니다." />
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>종류</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>대상 날짜</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>완료 시각</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>상태</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>앱 결과</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>요약</th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.length === 0 ? (
                                    <tr><td colSpan={6} style={{ padding: '34px', textAlign: 'center', color: '#94A3B8' }}>기록된 실행이 없습니다.</td></tr>
                                ) : runs.map((run) => {
                                    const meta = STATUS_META[run.status] || STATUS_META.EMPTY;
                                    const appResults = Array.isArray(run.app_results) ? run.app_results : [];
                                    const appPassed = appResults.filter((result) => result.status === 'PASS').length;
                                    return (
                                        <tr key={run.run_key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '12px', color: '#334155', fontWeight: 700 }}>{run.job_type === 'daily' ? '매일 백업' : '복구 리허설'}</td>
                                            <td style={{ padding: '12px', color: '#64748B' }}>{formatBackupDay(run.backup_day)}</td>
                                            <td style={{ padding: '12px', color: '#64748B' }}>{formatDateTime(run.finished_at || run.started_at)}</td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}><StatusBadge presentation={meta} /></td>
                                            <td style={{ padding: '12px', textAlign: 'center', color: '#475569', fontWeight: 800 }}>
                                                {appResults.length > 0 ? `${appPassed}/${expectedAppCount}` : '앱별 기록 전'}
                                            </td>
                                            <td style={{ padding: '12px', color: '#475569' }}>{DETAIL_LABELS[run.detail_code] || '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            )}
        </div>
    );
};

export default AdminBackupPanel;
