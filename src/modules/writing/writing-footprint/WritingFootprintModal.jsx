import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import { supabase } from '../../../lib/supabaseClient';
import WritingFootprintSummary, { EMPTY_FOOTPRINT, formatSnapshotDate } from './WritingFootprintSummary';

/**
 * 나의 글쓰기 발자국 — 학생이 자기 활동을 한 자리에서 돌아보는 화면.
 *
 * 홈 상단에 흩어져 있던 숫자(쓴 글자 수·완료 미션·이달의 활동)를 여기로 모으고,
 * 숫자만으로는 안 보이는 "얼마나 오래·꾸준히·많이" 를 그림으로 보여 준다.
 *
 * 색은 한 계열(파랑)만 쓴다. 계열이 하나뿐인 그래프에는 범례를 두지 않고 제목이 대신한다.
 * 학급 평균·등수는 넣지 않는다 — 초등에서 또래 비교는 잘 쓰는 아이만 더 쓰게 만든다.
 * 비교 대상은 언제나 **자기 과거**다.
 */

// 검증된 순차 램프(파랑). 0건은 표면 쪽으로 물러나는 중립색.
const HEAT = ['#EFEADF', '#b7d3f6', '#6da7ec', '#2a78d6', '#184f95'];
const INK = '#3E2E23';
const INK_SOFT = '#8D7B6C';
const SERIES = '#2a78d6';
const GRID = 'rgba(62,46,35,.10)';

const POINT_LABELS = {
    writing_reward: '글쓰기',
    vocab_tower: '어휘의 탑',
    dragon_care: '드래곤 돌보기',
    hideout_purchase: '아지트 꾸미기',
    meeting_activity: '회의 활동',
    starting_bonus: '시작 보너스',
    private_adjustment: '선생님 조정',
    etc: '기타'
};

const EMPTY_DETAIL = {
    totals: {
        total_chars: 0, completed_missions: 0, monthly_posts: 0, longest_post_chars: 0,
        active_days: 0, best_streak: 0, current_streak: 0,
        total_points: 0, points_earned: 0, points_spent: 0
    },
    daily: [], monthly: [], points_monthly: [], points_by_type: []
};

const num = (v) => Number(v || 0).toLocaleString('ko-KR');
const monthLabel = (m) => `${Number(String(m).slice(5, 7))}월`;

const Section = ({ title, hint, children }) => (
    <section style={{ marginTop: '26px' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 900, color: INK }}>{title}</h3>
        {hint && <p style={{ margin: '0 0 12px', fontSize: '.8rem', color: INK_SOFT }}>{hint}</p>}
        {children}
    </section>
);

const StatTile = ({ icon, label, value, unit }) => (
    <div style={{
        padding: '13px 14px', borderRadius: '16px', background: '#FFFFFF',
        border: '1px solid rgba(62,46,35,.10)', minWidth: 0
    }}>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: INK_SOFT, whiteSpace: 'nowrap' }}>
            {icon} {label}
        </div>
        <div style={{ marginTop: '3px', fontSize: '1.2rem', fontWeight: 900, color: INK, lineHeight: 1.15 }}>
            {value}<span style={{ fontSize: '.8rem', fontWeight: 800, color: INK_SOFT }}>{unit}</span>
        </div>
    </div>
);

/** 글쓰기 달력 — 날짜마다 칸 하나, 많이 쓴 날일수록 진하게. */
const WritingCalendar = ({ daily }) => {
    const { weeks, maxCount } = useMemo(() => {
        const byDay = new Map(daily.map((row) => [row.d, row.posts]));
        const today = new Date();
        const start = new Date(today);
        start.setDate(start.getDate() - 181);
        start.setDate(start.getDate() - start.getDay()); // 일요일에 맞춤

        const cols = [];
        let col = [];
        const cursor = new Date(start);
        let max = 0;
        while (cursor <= today) {
            const key = cursor.toISOString().slice(0, 10);
            const count = byDay.get(key) || 0;
            if (count > max) max = count;
            col.push({ key, count, label: `${cursor.getMonth() + 1}월 ${cursor.getDate()}일` });
            if (col.length === 7) { cols.push(col); col = []; }
            cursor.setDate(cursor.getDate() + 1);
        }
        if (col.length) cols.push(col);
        return { weeks: cols, maxCount: max };
    }, [daily]);

    const cell = 11, gap = 2;
    const width = weeks.length * (cell + gap);
    const shade = (count) => {
        if (!count) return HEAT[0];
        if (maxCount <= 1) return HEAT[3];
        const ratio = count / maxCount;
        if (ratio <= 0.34) return HEAT[1];
        if (ratio <= 0.67) return HEAT[2];
        if (ratio < 1) return HEAT[3];
        return HEAT[4];
    };

    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={width} height={7 * (cell + gap)} role="img" aria-label="날짜별 글쓰기 기록">
                {weeks.map((weekCol, x) => weekCol.map((day, y) => (
                    <rect
                        key={day.key}
                        x={x * (cell + gap)} y={y * (cell + gap)}
                        width={cell} height={cell} rx="3"
                        fill={shade(day.count)}
                    >
                        <title>{day.label} · {day.count ? `${day.count}편` : '쉬어 간 날'}</title>
                    </rect>
                )))}
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '.72rem', color: INK_SOFT, fontWeight: 800 }}>
                <span>적게</span>
                {HEAT.map((c) => (
                    <span key={c} style={{ width: '11px', height: '11px', borderRadius: '3px', background: c, display: 'inline-block' }} />
                ))}
                <span>많이</span>
            </div>
        </div>
    );
};

/** 세로 막대 — 달마다 쓴 글 수. 값은 막대 위에 직접 적는다. */
const MonthlyBars = ({ rows, valueKey, unit }) => {
    if (!rows.length) return <p style={{ color: INK_SOFT, fontSize: '.85rem' }}>아직 기록이 없어요.</p>;
    const max = Math.max(...rows.map((r) => r[valueKey]), 1);
    const h = 118, barW = 30, gap = 14;
    const width = rows.length * (barW + gap);
    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={Math.max(width, 120)} height={h + 40} role="img" aria-label="달마다 쓴 글">
                <line x1="0" y1={h} x2={Math.max(width, 120)} y2={h} stroke={GRID} strokeWidth="1" />
                {rows.map((r, i) => {
                    const v = r[valueKey];
                    const barH = Math.max((v / max) * (h - 22), v > 0 ? 4 : 0);
                    const x = i * (barW + gap);
                    return (
                        <g key={r.m}>
                            <rect x={x} y={h - barH} width={barW} height={barH} rx="4" fill={SERIES}>
                                <title>{monthLabel(r.m)} · {num(v)}{unit}</title>
                            </rect>
                            <text x={x + barW / 2} y={h - barH - 7} textAnchor="middle"
                                fontSize="11" fontWeight="800" fill={INK}>{num(v)}</text>
                            <text x={x + barW / 2} y={h + 17} textAnchor="middle"
                                fontSize="11" fontWeight="800" fill={INK_SOFT}>{monthLabel(r.m)}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

/** 꺾은선 — 추이용. 점은 8px 이상, 선은 2px. */
const TrendLine = ({ rows, valueKey, unit, formatValue = num }) => {
    if (rows.length < 2) {
        return <p style={{ color: INK_SOFT, fontSize: '.85rem' }}>두 달 이상 쌓이면 그래프로 보여 줄게요.</p>;
    }
    const max = Math.max(...rows.map((r) => r[valueKey]), 1);
    const h = 118, stepX = 62, padL = 6;
    const width = padL + (rows.length - 1) * stepX + 30;
    const pt = (r, i) => [padL + i * stepX, h - 16 - (r[valueKey] / max) * (h - 40)];
    const path = rows.map((r, i) => `${i ? 'L' : 'M'}${pt(r, i).join(' ')}`).join(' ');
    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={Math.max(width, 140)} height={h + 26} role="img" aria-label="추이">
                <line x1="0" y1={h} x2={Math.max(width, 140)} y2={h} stroke={GRID} strokeWidth="1" />
                <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {rows.map((r, i) => {
                    const [x, y] = pt(r, i);
                    return (
                        <g key={r.m}>
                            <circle cx={x} cy={y} r="4.5" fill={SERIES} stroke="#FFFDF7" strokeWidth="2">
                                <title>{monthLabel(r.m)} · {formatValue(r[valueKey])}{unit}</title>
                            </circle>
                            <text x={x} y={y - 11} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={INK}>
                                {formatValue(r[valueKey])}
                            </text>
                            <text x={x} y={h + 17} textAnchor="middle" fontSize="11" fontWeight="800" fill={INK_SOFT}>
                                {monthLabel(r.m)}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

/** 가로 막대 — 항목 이름이 축에 있으므로 색은 한 가지로 충분하다. */
const SourceBars = ({ rows }) => {
    if (!rows.length) return <p style={{ color: INK_SOFT, fontSize: '.85rem' }}>아직 모은 포인트가 없어요.</p>;
    const max = Math.max(...rows.map((r) => r.total), 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {rows.map((r) => (
                <div key={r.type} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0,1fr) 62px', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '.8rem', fontWeight: 800, color: INK_SOFT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {POINT_LABELS[r.type] || r.type}
                    </span>
                    <span style={{ height: '13px', background: 'rgba(62,46,35,.06)', borderRadius: '5px', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${Math.max((r.total / max) * 100, 3)}%`, background: SERIES, borderRadius: '5px' }} />
                    </span>
                    <span style={{ fontSize: '.82rem', fontWeight: 900, color: INK, textAlign: 'right' }}>{num(r.total)}P</span>
                </div>
            ))}
        </div>
    );
};

const WritingFootprintModal = ({ isOpen, onClose }) => {
    const [detail, setDetail] = useState(EMPTY_DETAIL);
    const [footprint, setFootprint] = useState(EMPTY_FOOTPRINT);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        const [detailResult, snapshotResult] = await Promise.all([
            supabase.rpc('get_my_writing_footprint_detail'),
            supabase.rpc('get_my_writing_footprint')
        ]);
        if (detailResult.error) {
            console.error('글쓰기 발자국 로드 실패:', detailResult.error.message);
            setErrorMessage('발자국을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
        } else {
            setDetail({ ...EMPTY_DETAIL, ...(detailResult.data || {}) });
        }
        if (!snapshotResult.error) {
            setFootprint({ ...EMPTY_FOOTPRINT, ...(snapshotResult.data || {}) });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!isOpen) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [isOpen, load]);

    // 화면을 덮는 판이라 뒤로가기로 닫히게 한다.
    useEffect(() => {
        if (!isOpen) return undefined;
        window.history.pushState({ studentPage: 'main', overlay: 'footprint' }, '');
        const closeOnBack = () => onClose();
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [isOpen, onClose]);

    const cumulative = useMemo(() => (
        (detail.points_monthly || []).reduce((acc, r) => {
            const prev = acc.length ? acc[acc.length - 1].total : 0;
            return [...acc, { m: r.m, total: prev + (r.earned || 0) - (r.spent || 0) }];
        }, [])
    ), [detail.points_monthly]);

    if (!isOpen) return null;
    const t = detail.totals || EMPTY_DETAIL.totals;

    return (
        <ModalPortal>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 3200, background: 'rgba(45,32,24,.55)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto',
                        background: '#FFFDF7', borderRadius: '28px', boxShadow: '0 24px 60px rgba(45,32,24,.28)'
                    }}
                >
                    <header style={{
                        position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: '12px', padding: '20px 22px 14px',
                        background: '#FFFDF7', borderBottom: `1px solid ${GRID}`
                    }}>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: INK }}>👣 나의 글쓰기 발자국</h2>
                        <button type="button" onClick={onClose} aria-label="닫기"
                            style={{ border: 'none', background: 'none', fontSize: '1.4rem', color: INK_SOFT, cursor: 'pointer' }}>✕</button>
                    </header>

                    <div style={{ padding: '4px 22px 26px' }}>
                        {loading ? (
                            <p style={{ padding: '70px 0', textAlign: 'center', color: INK_SOFT, fontWeight: 800 }}>발자국을 모아보는 중... 👣</p>
                        ) : errorMessage ? (
                            <p style={{ padding: '60px 0', textAlign: 'center', color: '#C62828', fontWeight: 800 }}>{errorMessage}</p>
                        ) : (
                            <>
                                <Section title="지금까지" hint="글을 쓰면 바로 반영돼요.">
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '9px' }}>
                                        <StatTile icon="📝" label="쓴 글자 수" value={num(t.total_chars)} unit="자" />
                                        <StatTile icon="✅" label="완료 미션" value={num(t.completed_missions)} unit="개" />
                                        <StatTile icon="📅" label="이달의 활동" value={num(t.monthly_posts)} unit="편" />
                                        <StatTile icon="🔥" label="가장 길게" value={num(t.best_streak)} unit="일 연속" />
                                        <StatTile icon="🗓️" label="글 쓴 날" value={num(t.active_days)} unit="일" />
                                        <StatTile icon="🏆" label="가장 긴 글" value={num(t.longest_post_chars)} unit="자" />
                                    </div>
                                </Section>

                                <Section title="🔥 글쓰기 달력" hint="최근 6개월 · 많이 쓴 날일수록 진해져요.">
                                    <WritingCalendar daily={detail.daily || []} />
                                </Section>

                                <Section title="📈 달마다 쓴 글">
                                    <MonthlyBars rows={detail.monthly || []} valueKey="posts" unit="편" />
                                </Section>

                                <Section title="✍️ 글이 길어지고 있어요" hint="달마다 글 한 편의 평균 글자 수예요.">
                                    <TrendLine rows={detail.monthly || []} valueKey="avg_chars" unit="자" />
                                </Section>

                                <Section title="💰 포인트가 쌓인 길" hint="쓴 포인트를 뺀 나머지가 지금 내 포인트예요.">
                                    <TrendLine rows={cumulative} valueKey="total" unit="P" />
                                    <div style={{ display: 'flex', gap: '9px', marginTop: '12px' }}>
                                        <StatTile icon="➕" label="모은 포인트" value={num(t.points_earned)} unit="P" />
                                        <StatTile icon="➖" label="쓴 포인트" value={num(t.points_spent)} unit="P" />
                                    </div>
                                </Section>

                                <Section title="🎁 포인트를 어디서 모았나">
                                    <SourceBars rows={detail.points_by_type || []} />
                                </Section>

                                <Section title="💬 친구와 나눈 기록" hint={`${formatSnapshotDate(footprint.snapshot_date)} 기준 · 매일 한 번 갱신돼요.`}>
                                    <WritingFootprintSummary data={footprint} />
                                </Section>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};

export default WritingFootprintModal;
