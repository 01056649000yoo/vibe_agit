import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';

const AI_SCOPE_LABELS = {
    teacher_ai: '교사 AI',
    comment_safety: '댓글 검사',
    student_spell_check: '맞춤법 검사'
};

const ALERT_LABELS = {
    app_down: '앱이 응답하지 않음',
    disk_low: '디스크 여유 부족',
    backup_failed: '백업 실패',
    container_down: '컨테이너 꺼짐',
    db_down: 'DB 응답 없음'
};

const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '-';
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
};

const formatWhen = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const Stat = ({ label, value, sub }) => (
    <div style={{
        flex: 1, minWidth: '120px', padding: '16px',
        background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF'
    }}>
        <div style={{ fontSize: '0.8rem', color: '#7F8C8D', fontWeight: 'bold' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#2C3E50' }}>{value}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: '#A0AEC0', marginTop: '2px' }}>{sub}</div>}
    </div>
);

/*
 * 관리자 `서비스 현황`.
 *
 * 접속·AI 호출·글 수는 이미 다른 표에 쌓이고 있어 **그때그때 센다**. 트래픽·디스크처럼
 * 지금 값을 재야만 아는 것만 호스트 스크립트가 하루 한 줄로 적는다.
 *
 * 부하 계약: 탭을 열 때 **RPC 한 번**. 폴링·Realtime 없음. 다시 보려면 새로고침을 누른다.
 */
const AdminServicePanel = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const { data: result, error: rpcError } = await supabase.rpc('admin_get_service_overview_v1', {
            p_trend_days: 30
        });
        if (rpcError) {
            console.error('서비스 현황 불러오기 실패:', rpcError.message);
            setError(rpcError.message);
        } else {
            setError('');
            setData(result);
        }
        setLoading(false);
    }, []);

    // 렌더 도중 연쇄 갱신이 나지 않도록 한 틱 미뤄 부른다(다른 화면 훅과 같은 방식).
    useEffect(() => {
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load]);

    const trend = useMemo(() => (Array.isArray(data?.trend) ? data.trend : []), [data]);

    // 트래픽 경향은 막대 하나로 본다. 정확한 수치보다 "늘고 있나" 가 알고 싶은 것이다.
    const maxTraffic = useMemo(
        () => trend.reduce((max, row) => Math.max(max, Number(row.rx_bytes || 0) + Number(row.tx_bytes || 0)), 0),
        [trend]
    );

    if (loading && !data) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#6C757D' }}>불러오는 중...</div>;
    }
    if (error) {
        return (
            <div style={{ padding: '30px', background: '#FFF5F5', borderRadius: '12px', border: '1px solid #FEB2B2', color: '#C53030' }}>
                서비스 현황을 불러오지 못했습니다: {error}
                <div style={{ marginTop: '12px' }}><Button size="sm" onClick={load}>다시 시도</Button></div>
            </div>
        );
    }

    const today = data?.today || {};
    const week = data?.week || {};
    const latest = data?.latest || null;
    const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
    const openAlerts = alerts.filter((a) => a.status === 'open');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: '#718096' }}>
                    {latest ? `마지막 서버 기록: ${latest.metric_day} (${formatWhen(latest.recorded_at)})` : '서버 기록이 아직 없습니다'}
                </span>
                <Button size="sm" onClick={load} disabled={loading}>
                    {loading ? '새로고침 중...' : '새로고침'}
                </Button>
            </div>

            {/* 장애가 열려 있으면 맨 위에서 먼저 보여 준다. */}
            {openAlerts.length > 0 && (
                <div style={{
                    padding: '16px 18px', borderRadius: '12px',
                    background: '#FFF5F5', border: '1px solid #FEB2B2'
                }}>
                    <div style={{ fontWeight: 900, color: '#C53030', marginBottom: '8px' }}>
                        ⚠️ 지금 열려 있는 문제 {openAlerts.length}건
                    </div>
                    {openAlerts.map((alert) => (
                        <div key={alert.alert_key} style={{ fontSize: '0.85rem', color: '#742A2A', lineHeight: 1.7 }}>
                            <strong>{Reflect.get(ALERT_LABELS, alert.alert_key) || alert.alert_key}</strong>
                            {alert.detail && ` — ${alert.detail}`}
                            <span style={{ color: '#A0AEC0' }}> ({formatWhen(alert.first_seen_at)}부터)</span>
                        </div>
                    ))}
                </div>
            )}

            <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>오늘</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Stat label="접속 선생님" value={`${today.teachers ?? 0}명`} />
                    <Stat label="접속 학생" value={`${today.students ?? 0}명`} />
                    <Stat label="AI 호출" value={`${today.ai_calls ?? 0}회`} />
                    <Stat label="올라온 글" value={`${today.posts ?? 0}편`} />
                </div>
            </div>

            <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>최근 7일</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Stat label="접속 선생님" value={`${week.teachers ?? 0}명`} />
                    <Stat label="접속 학생" value={`${week.students ?? 0}명`} />
                    <Stat label="AI 호출" value={`${week.ai_calls ?? 0}회`} />
                    <Stat label="올라온 글" value={`${week.posts ?? 0}편`} />
                </div>
            </div>

            <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>
                    AI 호출 — 최근 {data?.trend_days ?? 30}일
                </h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {Object.keys(AI_SCOPE_LABELS).map((scope) => (
                        <Stat
                            key={scope}
                            label={Reflect.get(AI_SCOPE_LABELS, scope)}
                            value={`${Reflect.get(data?.ai_scopes || {}, scope) ?? 0}회`}
                        />
                    ))}
                </div>
            </div>

            <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>서버</h3>
                {latest ? (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <Stat label="디스크 여유" value={`${latest.disk_free_gb ?? '-'} GB`} />
                        <Stat label="DB 크기" value={`${latest.db_size_mb ?? '-'} MB`} />
                        <Stat
                            label="컨테이너"
                            value={`${latest.container_healthy ?? '-'} / ${latest.container_total ?? '-'}`}
                            sub="정상 / 전체"
                        />
                        <Stat
                            label="어제 트래픽"
                            value={formatBytes(Number(latest.rx_bytes || 0) + Number(latest.tx_bytes || 0))}
                            sub="받기+보내기"
                        />
                    </div>
                ) : (
                    <div style={{
                        padding: '20px', background: '#F7FAFC', borderRadius: '12px',
                        border: '1px dashed #CBD5E0', color: '#718096', fontSize: '0.85rem', lineHeight: 1.7
                    }}>
                        아직 서버 기록이 없습니다. 맥미니에서 <strong>기록 스크립트</strong>를 걸어 두면
                        하루 한 번 여기에 쌓입니다.
                    </div>
                )}
            </div>

            {/* 트래픽은 정확한 수치가 아니라 경향을 본다. */}
            {trend.length > 0 && (
                <div>
                    <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>
                        트래픽 경향 <span style={{ fontSize: '0.75rem', color: '#A0AEC0', fontWeight: 'normal' }}>
                            (컨테이너가 주고받은 양 · 정확한 회선 사용량은 아닙니다)
                        </span>
                    </h3>
                    <div style={{
                        display: 'flex', alignItems: 'flex-end', gap: '3px', height: '90px',
                        padding: '12px', background: 'white', borderRadius: '12px',
                        border: '1px solid #E9ECEF', overflowX: 'auto'
                    }}>
                        {trend.map((row) => {
                            const total = Number(row.rx_bytes || 0) + Number(row.tx_bytes || 0);
                            const height = maxTraffic > 0 ? Math.max(3, Math.round((total / maxTraffic) * 66)) : 3;
                            return (
                                <div
                                    key={row.metric_day}
                                    title={`${row.metric_day} · ${formatBytes(total)}`}
                                    style={{
                                        width: '12px', flex: '0 0 12px', height: `${height}px`,
                                        background: '#3182CE', borderRadius: '3px 3px 0 0'
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {alerts.length > 0 && (
                <div>
                    <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>최근 장애 이력</h3>
                    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF', overflow: 'hidden' }}>
                        {alerts.map((alert, index) => (
                            <div
                                key={`${alert.alert_key}-${alert.first_seen_at}`}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', gap: '12px',
                                    padding: '12px 16px', fontSize: '0.85rem', flexWrap: 'wrap',
                                    borderTop: index === 0 ? 'none' : '1px solid #F1F3F5'
                                }}
                            >
                                <span style={{ color: '#2D3748' }}>
                                    <strong>{Reflect.get(ALERT_LABELS, alert.alert_key) || alert.alert_key}</strong>
                                    {alert.detail && <span style={{ color: '#718096' }}> — {alert.detail}</span>}
                                </span>
                                <span style={{ color: alert.status === 'open' ? '#C53030' : '#38A169', fontWeight: 'bold' }}>
                                    {alert.status === 'open'
                                        ? `진행 중 (${formatWhen(alert.first_seen_at)}~)`
                                        : `복구됨 (${formatWhen(alert.resolved_at)})`}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminServicePanel;
