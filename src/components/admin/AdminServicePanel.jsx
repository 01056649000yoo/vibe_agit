import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import AdminTrafficTrend from './AdminTrafficTrend';
import AdminResourceStatus from './AdminResourceStatus';

const AI_SCOPE_LABELS = {
    teacher_ai: '교사 AI',
    comment_safety: '댓글 검사',
    student_spell_check: '맞춤법 검사'
};

const ALERT_LABELS = {
    app_down: '앱이 응답하지 않음',
    disk_low: '디스크 여유 부족',
    memory_low: '메모리 여유 부족',
    backup_failed: '백업 실패',
    container_down: '컨테이너 꺼짐',
    db_down: 'DB 응답 없음',
    docker_memory_pressure: '도커 메모리 압박',
    host_memory_pressure: '맥 메모리 압박'
};

const formatWhen = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatWait = (seconds) => {
    const value = Math.max(0, Number(seconds || 0));
    if (value < 60) return `${Math.floor(value)}초`;
    return `${Math.floor(value / 60)}분 ${Math.floor(value % 60)}초`;
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
    const commentQueue = data?.comment_ai_queue || {};
    const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
    const openAlerts = alerts.filter((a) => a.status === 'open');
    const dockerMemoryAlertOpen = openAlerts.some((alert) => alert.alert_key === 'docker_memory_pressure');
    const hostMemoryAlertOpen = openAlerts.some((alert) => alert.alert_key === 'host_memory_pressure');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: '#718096' }}>
                    {latest ? `마지막 현재 상태 확인: ${formatWhen(latest.resource_sampled_at || latest.recorded_at)}` : '서버 기록이 아직 없습니다'}
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
                    <Stat label="제출된 글" value={`${today.posts ?? 0}편`} />
                </div>
            </div>

            <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>최근 7일</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Stat label="접속 선생님" value={`${week.teachers ?? 0}명`} />
                    <Stat label="접속 학생" value={`${week.students ?? 0}명`} />
                    <Stat label="AI 호출" value={`${week.ai_calls ?? 0}회`} />
                    <Stat label="제출된 글" value={`${week.posts ?? 0}편`} />
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
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#2D3748' }}>댓글 AI 검사 대기열</h3>
                <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: '#A0AEC0' }}>
                    댓글은 먼저 확인 중으로 저장하고 최대 3건씩 검사합니다. 두 번 실패한 댓글은 자동 공개하지 않고 교사 확인으로 남깁니다.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Stat label="검사 대기" value={`${commentQueue.queued ?? 0}건`} sub={`가장 오래 ${formatWait(commentQueue.oldest_wait_seconds)}`} />
                    <Stat label="현재 처리" value={`${commentQueue.processing ?? 0}/${commentQueue.limit ?? 3}건`} sub="댓글 검사만 별도 제한" />
                    <Stat label="오늘 완료" value={`${commentQueue.completed_today ?? 0}건`} />
                    <Stat
                        label="교사 확인 필요"
                        value={`${commentQueue.needs_teacher ?? 0}건`}
                        sub={Number(commentQueue.needs_teacher || 0) > 0 ? '학생 댓글 메뉴에서 확인' : '재시도 실패 없음'}
                    />
                </div>
            </div>

            {/* 값만 늘어놓으면 "그래서 괜찮은가"를 운영자가 매번 판단해야 한다. 기준을 함께 적는다. */}
            <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#2D3748' }}>서버 자원</h3>
                <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: '#A0AEC0' }}>
                    맥·도커 메모리와 스왑, 디스크, 컨테이너, 게이트웨이는 5분마다 현재값을 갱신합니다.
                    잔여 스왑량만으로 경고하지 않고 메모리 여유·새 스왑 아웃·지연을 함께 판단합니다.
                    도커 자원은 오늘의 가장 나쁜 순간도 함께 남기고, DB 크기와 트래픽은 04:50에 기록합니다.
                </p>
                <AdminResourceStatus
                    latest={latest}
                    dockerMemoryAlertOpen={dockerMemoryAlertOpen}
                    hostMemoryAlertOpen={hostMemoryAlertOpen}
                />
            </div>

            {/* 트래픽은 정확한 수치가 아니라 경향을 본다. 그리기는 전용 컴포넌트가 맡는다. */}
            <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2D3748' }}>트래픽 경향</h3>
                <AdminTrafficTrend trend={trend} alerts={alerts} days={30} />
            </div>

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
