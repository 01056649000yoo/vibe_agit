import React, { useMemo, useState } from 'react';

/**
 * 관리자 `서비스 현황`의 트래픽 경향.
 *
 * 예전에는 12px 막대만 나란히 세워 두어 **언제인지도, 얼마인지도** 알 수 없었다.
 * 마우스를 올려야 날짜가 보였고, 기록이 없는 날은 아예 빠져서 막대 사이가 하루인지
 * 닷새인지 구분되지 않았다. 그래서 이 화면이 답해야 할 세 가지를 정해 다시 그렸다.
 *
 *   1. 늘고 있나  → 최근 7일 하루 평균과 그 이전 7일을 견준 한 줄
 *   2. 언제인가   → 날짜 축과 기록이 빠진 날 자리
 *   3. 얼마인가   → 최댓값 기준선, 그리고 고른 날의 정확한 값
 *
 * 색은 받은 양(파랑)·보낸 양(주황) 두 가지뿐이고, 색만으로 뜻을 나르지 않도록
 * 범례와 직접 라벨을 함께 둔다.
 */

const SERIES = Object.freeze({
    rx: { key: 'rx', label: '받은 양', color: '#2a78d6' },
    tx: { key: 'tx', label: '보낸 양', color: '#eb6834' },
});

const EMPTY_COLOR = '#E2E8F0';

/**
 * 바이트 표기의 원본. `docker stats` 가 kB·MB·GB 를 1000 단위로 주므로 여기서도 1000으로 센다.
 * 예전에는 이 화면과 위쪽 요약이 각각 1000·1024로 세어 같은 값이 다르게 보였다.
 */
export const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const step = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
    const scaled = bytes / 1000 ** step;
    return `${scaled >= 100 || step === 0 ? Math.round(scaled) : scaled.toFixed(1)}${Reflect.get(units, step)}`;
};

const toDayKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const shortDay = (dayKey) => dayKey.slice(5).replace('-', '/');

const formatWindowTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const trafficWindowLabel = (row) => {
    const start = formatWindowTime(row?.periodStartedAt);
    const end = formatWindowTime(row?.measuredAt);
    if (start && end) return `${start}~${end}`;
    if (end) return `${end}까지`;
    return '측정 구간 정보 없음';
};

/** 기록이 있는 날만 평균을 낸다. 못 잰 날을 0으로 세면 경향이 아래로 꺾인다. */
const averageOf = (rows) => {
    const recorded = rows.filter((row) => row.hasRecord);
    if (recorded.length === 0) return null;
    return recorded.reduce((sum, row) => sum + row.total, 0) / recorded.length;
};

const AdminTrafficTrend = ({ trend = [], alerts = [], days = 30 }) => {
    const [selectedDay, setSelectedDay] = useState('');
    const [showTable, setShowTable] = useState(false);

    // 기록이 없는 날도 자리를 만든다. 빠뜨리면 막대 사이 간격이 거짓말을 한다.
    const rows = useMemo(() => {
        const byDay = new Map(trend.map((row) => [row.metric_day, row]));
        const today = new Date();
        const filled = [];
        for (let offset = days - 1; offset >= 0; offset -= 1) {
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            const dayKey = toDayKey(date);
            const row = byDay.get(dayKey);
            const rx = row?.rx_bytes == null ? null : Number(row.rx_bytes);
            const tx = row?.tx_bytes == null ? null : Number(row.tx_bytes);
            // Number(null)은 0이라서, 명시적으로 비운 과거 오측정치가 0B 기록으로 둔갑하지 않게 한다.
            const hasRecord = row != null && Number.isFinite(rx) && Number.isFinite(tx);
            filled.push({
                dayKey,
                weekday: date.getDay(),
                rx: hasRecord ? rx : 0,
                tx: hasRecord ? tx : 0,
                total: hasRecord ? rx + tx : 0,
                hasRecord,
                periodStartedAt: row?.traffic_period_started_at || null,
                measuredAt: row?.traffic_measured_at || null,
                complete: row?.traffic_complete ?? null,
            });
        }
        return filled;
    }, [trend, days]);

    const maxTotal = useMemo(() => rows.reduce((max, row) => Math.max(max, row.total), 0), [rows]);
    const recordedCount = rows.filter((row) => row.hasRecord).length;

    const change = useMemo(() => {
        const recent = averageOf(rows.slice(-7));
        const previous = averageOf(rows.slice(-14, -7));
        if (recent === null) return null;
        if (previous === null || previous === 0) return { recent, previous, percent: null };
        return { recent, previous, percent: Math.round(((recent - previous) / previous) * 100) };
    }, [rows]);

    // 장애가 시작된 날을 같은 시간축에 얹는다. 트래픽이 튄 날과 겹치는지 보려는 것이다.
    const alertsByDay = useMemo(() => {
        const map = new Map();
        for (const alert of alerts) {
            if (!alert?.first_seen_at) continue;
            const dayKey = toDayKey(new Date(alert.first_seen_at));
            const list = map.get(dayKey) || [];
            list.push(alert);
            map.set(dayKey, list);
        }
        return map;
    }, [alerts]);

    const selected = rows.find((row) => row.dayKey === selectedDay) || null;
    const latestRecorded = [...rows].reverse().find((row) => row.hasRecord) || null;

    if (recordedCount === 0) {
        return (
            <div style={{ padding: '18px', background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF', color: '#718096', fontSize: '0.88rem' }}>
                아직 트래픽 기록이 없습니다. 서버 기록 스크립트가 하루 한 번(04:50) 돌면 다음 날부터 쌓입니다.
            </div>
        );
    }

    return (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF', padding: '16px' }}>
            {/* 1. 늘고 있나 — 숫자 하나로 먼저 답한다. */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#2D3748' }}>
                    {change?.recent != null ? formatBytes(change.recent) : '—'}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#718096' }}>최근 7일 하루 평균</span>
                {change?.percent != null && (
                    <span style={{
                        fontSize: '0.85rem', fontWeight: 800,
                        color: change.percent > 0 ? '#C05621' : change.percent < 0 ? '#2B6CB0' : '#718096'
                    }}>
                        {change.percent > 0 ? '▲' : change.percent < 0 ? '▼' : '＝'} 이전 7일보다 {Math.abs(change.percent)}%
                        {change.percent > 0 ? ' 늘었습니다' : change.percent < 0 ? ' 줄었습니다' : ' 같습니다'}
                    </span>
                )}
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '0.75rem', color: '#A0AEC0' }}>
                컨테이너가 주고받은 양입니다. 정확한 회선 사용량은 아니고 경향을 보는 값입니다.
                막대 날짜는 그날 04:50 무렵에 끝난 직전 측정 이후의 구간이며, 오늘 0시부터의 실시간 누계가 아닙니다.
                {recordedCount < days && ` · ${days}일 가운데 ${recordedCount}일만 기록되었습니다.`}
            </p>

            {/* 범례 — 두 계열이라 색만으로 구분하지 않는다. */}
            <div style={{ display: 'flex', gap: '14px', marginBottom: '10px', fontSize: '0.78rem', color: '#4A5568' }}>
                {Object.values(SERIES).map((series) => (
                    <span key={series.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: series.color }} />
                        {series.label}
                    </span>
                ))}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#A0AEC0' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: EMPTY_COLOR }} />
                    기록 없음
                </span>
            </div>

            {/* 2·3. 언제·얼마 — 최댓값 기준선과 날짜 축을 함께 둔다. */}
            <div style={{ position: 'relative', paddingLeft: '58px' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, fontSize: '0.7rem', color: '#A0AEC0' }}>
                    {formatBytes(maxTotal)}
                </div>
                <div style={{ position: 'absolute', left: 0, bottom: '22px', fontSize: '0.7rem', color: '#A0AEC0' }}>0</div>

                <div
                    role="img"
                    aria-label={`최근 ${days}일 트래픽 경향. 기록된 ${recordedCount}일 가운데 가장 많은 날 ${formatBytes(maxTotal)}.`}
                    style={{
                        display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px',
                        borderTop: '1px dashed #E2E8F0', borderBottom: '1px solid #E2E8F0', paddingTop: '4px'
                    }}
                >
                    {rows.map((row) => {
                        const isSelected = row.dayKey === selectedDay;
                        const scale = maxTotal > 0 ? 110 / maxTotal : 0;
                        const rxHeight = Math.max(row.rx > 0 ? 2 : 0, Math.round(row.rx * scale));
                        const txHeight = Math.max(row.tx > 0 ? 2 : 0, Math.round(row.tx * scale));
                        const dayAlerts = alertsByDay.get(row.dayKey) || [];

                        return (
                            <button
                                key={row.dayKey}
                                type="button"
                                onClick={() => setSelectedDay(isSelected ? '' : row.dayKey)}
                                aria-label={row.hasRecord
                                    ? `${row.dayKey} ${trafficWindowLabel(row)}, 받은 양 ${formatBytes(row.rx)}, 보낸 양 ${formatBytes(row.tx)}${row.complete === false ? ', 일부 누락 가능' : ''}`
                                    : `${row.dayKey} 기록 없음`}
                                title={row.hasRecord
                                    ? `${row.dayKey}\n${trafficWindowLabel(row)}\n받은 양 ${formatBytes(row.rx)} · 보낸 양 ${formatBytes(row.tx)}${row.complete === false ? '\n컨테이너 재시작으로 일부 누락 가능' : ''}`
                                    : `${row.dayKey} · 기록 없음`}
                                style={{
                                    flex: '1 1 0', minWidth: '6px', height: '100%', padding: 0,
                                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '2px',
                                    border: 'none', background: isSelected ? '#EDF2F7' : 'transparent',
                                    borderRadius: '4px 4px 0 0', cursor: 'pointer', position: 'relative'
                                }}
                            >
                                {dayAlerts.length > 0 && (
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                                            width: '6px', height: '6px', borderRadius: '50%',
                                            background: dayAlerts.some((alert) => alert.status === 'open') ? '#d03b3b' : '#0ca30c'
                                        }}
                                    />
                                )}
                                {row.hasRecord ? (
                                    <>
                                        <span style={{ display: 'block', height: `${txHeight}px`, background: SERIES.tx.color, borderRadius: '3px 3px 0 0' }} />
                                        <span style={{ display: 'block', height: `${rxHeight}px`, background: SERIES.rx.color }} />
                                    </>
                                ) : (
                                    <span style={{ display: 'block', height: '3px', background: EMPTY_COLOR, borderRadius: '2px' }} />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* 날짜 축 — 모든 날에 숫자를 붙이면 읽을 수 없어 일주일 간격으로만 둔다. */}
                <div style={{ display: 'flex', gap: '2px', marginTop: '5px', height: '17px' }}>
                    {rows.map((row, index) => {
                        // 오른쪽(오늘)부터 일주일 간격으로만 날짜를 적는다.
                        // 맨 왼쪽에도 무조건 적으면 바로 옆 눈금과 겹쳐 두 날짜가 붙어 나온다.
                        const isTick = (rows.length - 1 - index) % 7 === 0;
                        return (
                            <span key={row.dayKey} style={{ flex: '1 1 0', minWidth: '6px', fontSize: '0.65rem', color: '#A0AEC0', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {isTick ? shortDay(row.dayKey) : ''}
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* 고른 날의 정확한 값. 고르지 않았으면 마지막으로 기록된 날을 보여 준다. */}
            <div style={{ marginTop: '10px', padding: '10px 12px', background: '#F7FAFC', borderRadius: '10px', fontSize: '0.82rem', color: '#2D3748' }}>
                {(() => {
                    const row = selected || latestRecorded;
                    if (!row) return '기록된 날이 없습니다.';
                    const dayAlerts = alertsByDay.get(row.dayKey) || [];
                    return (
                        <>
                            <strong>{row.dayKey}</strong>
                            {!selected && <span style={{ color: '#A0AEC0' }}> (가장 최근 기록)</span>}
                            {row.hasRecord ? (
                                <>
                                    <span style={{ marginLeft: '8px', color: '#4A5568' }}>
                                        받은 양 <strong>{formatBytes(row.rx)}</strong> · 보낸 양 <strong>{formatBytes(row.tx)}</strong> · 합계 <strong>{formatBytes(row.total)}</strong>
                                    </span>
                                    <span style={{ display: 'block', marginTop: '4px', color: row.complete === false ? '#C05621' : '#718096' }}>
                                        측정 구간: {trafficWindowLabel(row)}
                                        {row.complete === false && ' · 컨테이너 재시작으로 구간 일부가 빠질 수 있습니다.'}
                                    </span>
                                </>
                            ) : (
                                <span style={{ marginLeft: '8px', color: '#A0AEC0' }}>기록 없음 (스크립트가 돌지 않았거나 값을 재지 못한 날)</span>
                            )}
                            {dayAlerts.length > 0 && (
                                <span style={{ marginLeft: '8px', color: '#C53030' }}>· 이 날 장애 {dayAlerts.length}건</span>
                            )}
                        </>
                    );
                })()}
            </div>

            {/* 색과 길이 말고 숫자로도 볼 수 있게 둔다. */}
            <button
                type="button"
                onClick={() => setShowTable((current) => !current)}
                style={{ marginTop: '10px', border: 'none', background: 'transparent', color: '#3182CE', fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
            >
                {showTable ? '표 접기' : '표로 보기'}
            </button>
            {showTable && (
                <div style={{ marginTop: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ color: '#718096', textAlign: 'left' }}>
                                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E2E8F0' }}>날짜</th>
                                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E2E8F0' }}>받은 양</th>
                                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E2E8F0' }}>보낸 양</th>
                                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E2E8F0' }}>합계</th>
                                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E2E8F0' }}>측정 구간</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...rows].reverse().map((row) => (
                                <tr key={row.dayKey} style={{ color: row.hasRecord ? '#2D3748' : '#A0AEC0' }}>
                                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #F1F3F5' }}>{row.dayKey}</td>
                                    {row.hasRecord ? (
                                        <>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #F1F3F5' }}>{formatBytes(row.rx)}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #F1F3F5' }}>{formatBytes(row.tx)}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #F1F3F5', fontWeight: 'bold' }}>{formatBytes(row.total)}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #F1F3F5', color: row.complete === false ? '#C05621' : '#718096' }}>
                                                {trafficWindowLabel(row)}{row.complete === false ? ' · 일부 누락 가능' : ''}
                                            </td>
                                        </>
                                    ) : (
                                        <td colSpan={4} style={{ padding: '6px 8px', borderBottom: '1px solid #F1F3F5' }}>기록 없음</td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AdminTrafficTrend;
