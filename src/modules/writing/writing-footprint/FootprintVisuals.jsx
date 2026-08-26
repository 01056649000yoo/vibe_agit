import React, { useMemo } from 'react';

// 학생·교사 발자국 화면이 같은 색, 축, 숫자 표기를 쓰도록 모은 순수 시각화 모듈.
export const HEAT = ['#EFEADF', '#b7d3f6', '#6da7ec', '#2a78d6', '#184f95'];
export const INK = '#3E2E23';
export const INK_SOFT = '#8D7B6C';
const SERIES = '#2a78d6';
export const GRID = 'rgba(62,46,35,.10)';

const POINT_LABELS = {
    writing_reward: '글쓰기',
    vocab_tower: '어휘의 탑',
    dragon_care: '드래곤 돌보기',
    hideout_purchase: '아지트 꾸미기',
    meeting_activity: '회의 활동',
    starting_bonus: '시작 보너스',
    comment_reward: '친구 댓글(이전 기록)',
    private_adjustment: '선생님 조정',
    etc: '기타'
};

const CHART_W = 510;
const AXIS_L = 20;

export const num = (value) => Number(value || 0).toLocaleString('ko-KR');

/** 3월~다음 해 1월(11칸) 축을 만들고, 값이 없는 달은 0으로 채운다. */
export const fillSchoolYearMonths = (rows, schoolYear) => {
    const startYear = schoolYear?.start ? Number(String(schoolYear.start).slice(0, 4)) : new Date().getFullYear();
    const byMonth = new Map((rows || []).map((row) => [row.m, row]));
    return Array.from({ length: 11 }, (unused, index) => {
        const month = 3 + index;
        const year = month > 12 ? startYear + 1 : startYear;
        const monthNumber = String(month > 12 ? month - 12 : month).padStart(2, '0');
        const key = `${year}-${monthNumber}`;
        return { m: key, monthNo: Number(monthNumber), ...(byMonth.get(key) || {}) };
    });
};

export const buildCumulativePoints = (rows, schoolYear) => {
    const today = new Date();
    return fillSchoolYearMonths(rows, schoolYear).reduce((result, row) => {
        const previous = result.length ? result[result.length - 1].total : 0;
        const hasActivity = Number(row.earned || 0) + Number(row.spent || 0) > 0;
        const future = new Date(`${row.m}-01T00:00:00`) > today;
        const total = future ? 0 : previous + Number(row.earned || 0) - Number(row.spent || 0);
        result.push({ ...row, total: hasActivity || previous > 0 ? total : 0 });
        return result;
    }, []);
};

export const Section = ({ title, hint, children }) => (
    <section style={{ marginTop: '26px' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 900, color: INK }}>{title}</h3>
        {hint && <p style={{ margin: '0 0 12px', fontSize: '.8rem', color: INK_SOFT }}>{hint}</p>}
        {children}
    </section>
);

export const StatTile = ({ icon, label, value, unit, accent = INK, compact = false }) => (
    <div style={{
        padding: compact ? '7px 9px' : '13px 14px', borderRadius: compact ? '11px' : '16px', background: '#FFFFFF',
        border: '1px solid rgba(62,46,35,.10)', minWidth: 0
    }}>
        <div style={{ fontSize: compact ? 'var(--footprint-fs-sm, .62rem)' : '.72rem', fontWeight: 800, color: INK_SOFT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {icon} {label}
        </div>
        <div style={{ marginTop: compact ? '1px' : '3px', fontSize: compact ? 'var(--footprint-fs-lg, .94rem)' : '1.2rem', fontWeight: 900, color: accent, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value}<span style={{ fontSize: compact ? 'var(--footprint-fs-sm, .62rem)' : '.8rem', fontWeight: 800, color: INK_SOFT }}>{unit}</span>
        </div>
    </div>
);

/** 한 학년도(3월~다음 해 1월)의 글쓰기 밀도 달력. */
export const WritingCalendar = ({ daily = [], schoolYear, fluid = false, compact = false }) => {
    const { weeks, maxCount, monthMarks } = useMemo(() => {
        const byDay = new Map(daily.map((row) => [row.d, Number(row.posts || 0)]));
        const toKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const first = schoolYear?.start ? new Date(`${schoolYear.start}T00:00:00`) : new Date();
        const last = schoolYear?.end ? new Date(`${schoolYear.end}T00:00:00`) : new Date();
        const today = new Date();
        const cursor = new Date(first);
        cursor.setDate(cursor.getDate() - cursor.getDay());
        const columns = [];
        let column = [];
        let maximum = 0;
        while (cursor <= last) {
            const inRange = cursor >= first && cursor <= last;
            const future = cursor > today;
            const count = inRange && !future ? (byDay.get(toKey(cursor)) || 0) : 0;
            maximum = Math.max(maximum, count);
            column.push({
                key: toKey(cursor), count, inRange, future, month: cursor.getMonth(),
                label: `${cursor.getMonth() + 1}월 ${cursor.getDate()}일`
            });
            if (column.length === 7) { columns.push(column); column = []; }
            cursor.setDate(cursor.getDate() + 1);
        }
        if (column.length) {
            while (column.length < 7) column.push({ key: `pad-${column.length}`, count: 0, inRange: false, future: true, month: -1, label: '' });
            columns.push(column);
        }
        const marks = [];
        let seenMonth = -1;
        columns.forEach((week, x) => {
            const day = week.find((item) => item.inRange);
            if (day && day.month !== seenMonth) {
                marks.push({ x, text: `${day.month + 1}월` });
                seenMonth = day.month;
            }
        });
        return { weeks: columns, maxCount: maximum, monthMarks: marks };
    }, [daily, schoolYear]);

    const cell = 8;
    const gap = 2;
    const padTop = 16;
    const padLeft = 20;
    const step = cell + gap;
    const width = padLeft + weeks.length * step;
    const shade = (day) => {
        if (!day.inRange) return 'transparent';
        if (!day.count) return day.future ? 'rgba(62,46,35,.045)' : HEAT[0];
        if (maxCount <= 1) return HEAT[3];
        const ratio = day.count / maxCount;
        if (ratio <= 0.34) return HEAT[1];
        if (ratio <= 0.67) return HEAT[2];
        if (ratio < 1) return HEAT[3];
        return HEAT[4];
    };

    return (
        <div style={{
            overflowX: fluid ? 'hidden' : 'auto', paddingBottom: compact ? 0 : '4px', minWidth: 0,
            flex: compact ? 1 : undefined, minHeight: compact ? 0 : undefined, display: compact ? 'flex' : 'block'
        }}>
            <svg
                width={fluid ? '100%' : width}
                height={compact ? '100%' : padTop + 7 * step}
                viewBox={`0 0 ${width} ${padTop + 7 * step}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="학년도 글쓰기 기록"
            >
                {monthMarks.map((mark) => (
                    <text key={`${mark.x}-${mark.text}`} x={padLeft + mark.x * step} y={11} fontSize="10" fontWeight="800" fill={INK_SOFT}>{mark.text}</text>
                ))}
                {['월', '수', '금'].map((day, index) => (
                    <text key={day} x={0} y={padTop + (index * 2 + 1) * step + 8} fontSize="9" fontWeight="800" fill={INK_SOFT}>{day}</text>
                ))}
                {weeks.map((week, x) => week.map((day, y) => (
                    <rect key={day.key} x={padLeft + x * step} y={padTop + y * step} width={cell} height={cell} rx="2.5" fill={shade(day)}>
                        {day.inRange && <title>{day.label} · {day.future ? '아직 오지 않은 날' : (day.count ? `${day.count}편` : '기록 없음')}</title>}
                    </rect>
                )))}
            </svg>
            <div style={{ display: compact ? 'none' : 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '.72rem', color: INK_SOFT, fontWeight: 800 }}>
                <span>적게</span>
                {HEAT.map((color) => <span key={color} style={{ width: '9px', height: '9px', borderRadius: '2.5px', background: color, display: 'inline-block' }} />)}
                <span>많이</span>
            </div>
        </div>
    );
};

export const MonthlyBars = ({ rows, valueKey, unit, fluid = false, compact = false }) => {
    const height = compact ? 72 : 118;
    const slot = (CHART_W - AXIS_L) / rows.length;
    const barWidth = Math.min(26, slot - 12);
    const maximum = Math.max(...rows.map((row) => Number(Reflect.get(row, valueKey) || 0)), 1);
    const hasAny = rows.some((row) => Number(Reflect.get(row, valueKey) || 0) > 0);
    return (
        <div style={{
            overflowX: fluid ? 'hidden' : 'auto', minWidth: 0, position: 'relative',
            flex: compact ? 1 : undefined, minHeight: compact ? 0 : undefined, display: compact ? 'flex' : 'block'
        }}>
            <svg width={fluid ? '100%' : CHART_W} height={compact ? '100%' : height + 38} viewBox={`0 0 ${CHART_W} ${height + 38}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="달마다 쓴 글">
                <line x1={AXIS_L} y1={height} x2={CHART_W} y2={height} stroke={GRID} strokeWidth="1" />
                {rows.map((row, index) => {
                    const value = Number(Reflect.get(row, valueKey) || 0);
                    const barHeight = value > 0 ? Math.max((value / maximum) * (height - 24), 4) : 0;
                    const center = AXIS_L + index * slot + slot / 2;
                    return <g key={row.m}>
                        {value > 0 && <>
                            <rect x={center - barWidth / 2} y={height - barHeight} width={barWidth} height={barHeight} rx="4" fill={SERIES}>
                                <title>{row.monthNo}월 · {num(value)}{unit}</title>
                            </rect>
                            <text x={center} y={height - barHeight - 6} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={INK}>{num(value)}</text>
                        </>}
                        <text x={center} y={height + 16} textAnchor="middle" fontSize="10" fontWeight="800" fill={INK_SOFT}>{row.monthNo}</text>
                    </g>;
                })}
                <text x={AXIS_L} y={height + 32} fontSize="9.5" fontWeight="800" fill={INK_SOFT}>월</text>
            </svg>
            {!hasAny && <p style={compact ? {
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0,
                color: INK_SOFT, fontSize: 'var(--footprint-fs-sm, .7rem)', background: 'rgba(255,255,255,.72)'
            } : { margin: '4px 0 0', color: INK_SOFT, fontSize: '.82rem' }}>아직 기록이 없어요.</p>}
        </div>
    );
};

export const TrendLine = ({ rows, valueKey, unit, fluid = false, compact = false }) => {
    const height = compact ? 72 : 118;
    const slot = (CHART_W - AXIS_L) / rows.length;
    const maximum = Math.max(...rows.map((row) => Number(Reflect.get(row, valueKey) || 0)), 1);
    const points = rows.map((row, index) => ({ ...row, index, value: Number(Reflect.get(row, valueKey) || 0) })).filter((row) => row.value > 0);
    const centerX = (index) => AXIS_L + index * slot + slot / 2;
    const centerY = (value) => height - 14 - (value / maximum) * (height - 40);
    const path = points.map((row, index) => `${index ? 'L' : 'M'}${centerX(row.index)} ${centerY(row.value)}`).join(' ');
    const peak = points.reduce((best, row) => (row.value > (best?.value ?? -1) ? row : best), null);
    const last = points.length ? points[points.length - 1] : null;
    const labelled = new Set([peak?.index, last?.index].filter((value) => value !== undefined));
    return (
        <div style={{
            overflowX: fluid ? 'hidden' : 'auto', minWidth: 0, position: 'relative',
            flex: compact ? 1 : undefined, minHeight: compact ? 0 : undefined, display: compact ? 'flex' : 'block'
        }}>
            <svg width={fluid ? '100%' : CHART_W} height={compact ? '100%' : height + 38} viewBox={`0 0 ${CHART_W} ${height + 38}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="달마다 추이">
                <line x1={AXIS_L} y1={height} x2={CHART_W} y2={height} stroke={GRID} strokeWidth="1" />
                {points.length > 1 && <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                {rows.map((row, index) => <text key={`x-${row.m}`} x={centerX(index)} y={height + 16} textAnchor="middle" fontSize="10" fontWeight="800" fill={INK_SOFT}>{row.monthNo}</text>)}
                {points.map((row) => <g key={row.m}>
                    <circle cx={centerX(row.index)} cy={centerY(row.value)} r="4.5" fill={SERIES} stroke="#FFFDF7" strokeWidth="2">
                        <title>{row.monthNo}월 · {num(row.value)}{unit}</title>
                    </circle>
                    {labelled.has(row.index) && <text x={centerX(row.index)} y={centerY(row.value) - 10} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={INK}>{num(row.value)}</text>}
                </g>)}
                <text x={AXIS_L} y={height + 32} fontSize="9.5" fontWeight="800" fill={INK_SOFT}>월</text>
            </svg>
            {!points.length && <p style={compact ? {
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0,
                color: INK_SOFT, fontSize: 'var(--footprint-fs-sm, .7rem)', background: 'rgba(255,255,255,.72)'
            } : { margin: '4px 0 0', color: INK_SOFT, fontSize: '.82rem' }}>아직 기록이 없어요.</p>}
        </div>
    );
};

export const PointTypeBars = ({ rows = [], emptyMessage, color = SERIES, compact = false, unit = 'P' }) => {
    if (!rows.length) return <p style={{
        color: INK_SOFT, fontSize: compact ? 'var(--footprint-fs-sm, .7rem)' : '.85rem',
        ...(compact ? { flex: 1, display: 'grid', placeItems: 'center', margin: 0 } : {})
    }}>{emptyMessage}</p>;
    const maximum = Math.max(...rows.map((row) => Number(row.total || 0)), 1);
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: compact ? '4px' : '9px',
            flex: compact ? 1 : undefined, justifyContent: compact ? 'space-evenly' : undefined, minHeight: 0
        }}>
            {rows.map((row) => <div key={row.type} style={{ display: 'grid', gridTemplateColumns: compact ? '68px minmax(0,1fr) 48px' : '86px minmax(0,1fr) 62px', alignItems: 'center', gap: compact ? '6px' : '10px' }}>
                <span title={POINT_LABELS[row.type] || row.type} style={{ fontSize: compact ? 'var(--footprint-fs-sm, .64rem)' : '.8rem', fontWeight: 800, color: INK_SOFT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {POINT_LABELS[row.type] || row.type}
                </span>
                <span style={{ height: compact ? '8px' : '13px', background: 'rgba(62,46,35,.06)', borderRadius: '5px', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max((Number(row.total || 0) / maximum) * 100, 3)}%`, background: color, borderRadius: '5px' }} />
                </span>
                <span style={{ fontSize: compact ? 'var(--footprint-fs-sm, .64rem)' : '.82rem', fontWeight: 900, color: INK, textAlign: 'right' }}>{num(row.total)}{unit}</span>
            </div>)}
        </div>
    );
};
