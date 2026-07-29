import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import { supabase } from '../../../lib/supabaseClient';
import { getWriterLevel } from '../../../constants/writerLevels';

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
    sharing: { comments_received: 0, comments_given: 0, reactions_received: 0, reactions_given: 0 },
    school_year: null,
    daily: [], monthly: [], points_monthly: [], points_by_type: []
};

// 달력·막대·꺾은선이 모두 같은 폭을 쓰면 위아래로 눈이 자연스럽게 이어진다.
// 학년도 49주 × 10 + 요일 20 = 510px 에 맞춘다.
const CHART_W = 510;
const AXIS_L = 20;   // 달력 요일 칸과 왼쪽을 맞춘다

const num = (v) => Number(v || 0).toLocaleString('ko-KR');

/** 3월~다음 해 1월(11칸) 축을 만들고, 값이 없는 달은 0으로 채운다. */
const fillSchoolYearMonths = (rows, schoolYear) => {
    const startYear = schoolYear?.start ? Number(String(schoolYear.start).slice(0, 4)) : new Date().getFullYear();
    const byMonth = new Map((rows || []).map((r) => [r.m, r]));
    return Array.from({ length: 11 }, (unused, i) => {
        const month = 3 + i;                       // 3월 → 13월(= 다음 해 1월)
        const y = month > 12 ? startYear + 1 : startYear;
        const mm = String(month > 12 ? month - 12 : month).padStart(2, '0');
        const key = `${y}-${mm}`;
        return { m: key, monthNo: Number(mm), ...(byMonth.get(key) || {}) };
    });
};

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

/** 글쓰기 달력 — 한 학년도(3월 ~ 다음 해 1월)를 한 판에 놓는다.
 *  아직 오지 않은 날도 빈칸으로 남겨 둔다 — 채워 갈 자리가 보이는 편이 낫다. */
const WritingCalendar = ({ daily, schoolYear }) => {
    const { weeks, maxCount, monthMarks } = useMemo(() => {
        const byDay = new Map(daily.map((row) => [row.d, row.posts]));
        const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const first = schoolYear?.start ? new Date(`${schoolYear.start}T00:00:00`) : new Date();
        const last = schoolYear?.end ? new Date(`${schoolYear.end}T00:00:00`) : new Date();
        const today = new Date();

        // 격자는 학년도 첫날이 든 주의 일요일부터 시작한다.
        const cursor = new Date(first);
        cursor.setDate(cursor.getDate() - cursor.getDay());

        const cols = [];
        let col = [];
        let max = 0;
        while (cursor <= last) {
            const inRange = cursor >= first && cursor <= last;
            const future = cursor > today;
            const count = inRange && !future ? (byDay.get(toKey(cursor)) || 0) : 0;
            if (count > max) max = count;
            col.push({
                key: toKey(cursor), count, inRange, future,
                month: cursor.getMonth(),
                label: `${cursor.getMonth() + 1}월 ${cursor.getDate()}일`
            });
            if (col.length === 7) { cols.push(col); col = []; }
            cursor.setDate(cursor.getDate() + 1);
        }
        if (col.length) {
            while (col.length < 7) col.push({ key: `pad-${col.length}`, count: 0, inRange: false, future: true, month: -1, label: '' });
            cols.push(col);
        }

        // 달이 바뀌는 첫 열에만 달 이름을 적는다.
        const marks = [];
        let seen = -1;
        cols.forEach((weekCol, x) => {
            const day = weekCol.find((c) => c.inRange);
            if (!day) return;
            if (day.month !== seen) { marks.push({ x, text: `${day.month + 1}월` }); seen = day.month; }
        });
        return { weeks: cols, maxCount: max, monthMarks: marks };
    }, [daily, schoolYear]);

    // 학년도 49주 × (8+2) + 왼쪽 요일 20 = 510px. 모달 안(≈512px)에 딱 들어가
    // 가로 스크롤 없이 한 판이 보인다.
    const cell = 8, gap = 2, padTop = 16, padLeft = 20;
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
        <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
            <svg width={width} height={padTop + 7 * step} role="img" aria-label="학년도 글쓰기 기록">
                {monthMarks.map((mk) => (
                    <text key={`${mk.x}-${mk.text}`} x={padLeft + mk.x * step} y={11}
                        fontSize="10" fontWeight="800" fill={INK_SOFT}>{mk.text}</text>
                ))}
                {['월', '수', '금'].map((d, idx) => (
                    <text key={d} x={0} y={padTop + (idx * 2 + 1) * step + 8}
                        fontSize="9" fontWeight="800" fill={INK_SOFT}>{d}</text>
                ))}
                {weeks.map((weekCol, x) => weekCol.map((day, y) => (
                    <rect
                        key={day.key}
                        x={padLeft + x * step} y={padTop + y * step}
                        width={cell} height={cell} rx="2.5"
                        fill={shade(day)}
                    >
                        {day.inRange && (
                            <title>{day.label} · {day.future ? '아직 오지 않은 날' : (day.count ? `${day.count}편` : '쉬어 간 날')}</title>
                        )}
                    </rect>
                )))}
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '.72rem', color: INK_SOFT, fontWeight: 800 }}>
                <span>적게</span>
                {HEAT.map((c) => (
                    <span key={c} style={{ width: '9px', height: '9px', borderRadius: '2.5px', background: c, display: 'inline-block' }} />
                ))}
                <span>많이</span>
            </div>
        </div>
    );
};

/** 세로 막대 — 3월~1월 축 고정. 값은 있는 달에만 적는다(모든 점에 숫자를 달지 않는다). */
const MonthlyBars = ({ rows, valueKey, unit }) => {
    const h = 118;
    const slot = (CHART_W - AXIS_L) / rows.length;
    const barW = Math.min(26, slot - 12);
    const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
    const hasAny = rows.some((r) => (r[valueKey] || 0) > 0);

    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={CHART_W} height={h + 38} role="img" aria-label="달마다 쓴 글">
                <line x1={AXIS_L} y1={h} x2={CHART_W} y2={h} stroke={GRID} strokeWidth="1" />
                {rows.map((r, i) => {
                    const v = r[valueKey] || 0;
                    const barH = v > 0 ? Math.max((v / max) * (h - 24), 4) : 0;
                    const cx = AXIS_L + i * slot + slot / 2;
                    return (
                        <g key={r.m}>
                            {v > 0 && (
                                <>
                                    <rect x={cx - barW / 2} y={h - barH} width={barW} height={barH} rx="4" fill={SERIES}>
                                        <title>{r.monthNo}월 · {num(v)}{unit}</title>
                                    </rect>
                                    <text x={cx} y={h - barH - 6} textAnchor="middle"
                                        fontSize="10.5" fontWeight="800" fill={INK}>{num(v)}</text>
                                </>
                            )}
                            <text x={cx} y={h + 16} textAnchor="middle"
                                fontSize="10" fontWeight="800" fill={INK_SOFT}>{r.monthNo}</text>
                        </g>
                    );
                })}
                <text x={AXIS_L} y={h + 32} fontSize="9.5" fontWeight="800" fill={INK_SOFT}>월</text>
            </svg>
            {!hasAny && <p style={{ margin: '4px 0 0', color: INK_SOFT, fontSize: '.82rem' }}>아직 기록이 없어요.</p>}
        </div>
    );
};

/** 꺾은선 — 3월~1월 축 고정. 값이 있는 구간만 잇고, 숫자는 최고점과 마지막에만 적는다. */
const TrendLine = ({ rows, valueKey, unit }) => {
    const h = 118;
    const slot = (CHART_W - AXIS_L) / rows.length;
    const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
    const points = rows
        .map((r, i) => ({ ...r, i, v: r[valueKey] || 0 }))
        .filter((r) => r.v > 0);

    const cx = (i) => AXIS_L + i * slot + slot / 2;
    const cy = (v) => h - 14 - (v / max) * (h - 40);
    const path = points.map((r, k) => `${k ? 'L' : 'M'}${cx(r.i)} ${cy(r.v)}`).join(' ');

    const peak = points.reduce((a, b) => (b.v > (a?.v ?? -1) ? b : a), null);
    const lastPoint = points.length ? points[points.length - 1] : null;
    const labelled = new Set([peak?.i, lastPoint?.i].filter((v) => v !== undefined));

    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={CHART_W} height={h + 38} role="img" aria-label="달마다 추이">
                <line x1={AXIS_L} y1={h} x2={CHART_W} y2={h} stroke={GRID} strokeWidth="1" />
                {points.length > 1 && (
                    <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {rows.map((r, i) => (
                    <text key={`x-${r.m}`} x={cx(i)} y={h + 16} textAnchor="middle"
                        fontSize="10" fontWeight="800" fill={INK_SOFT}>{r.monthNo}</text>
                ))}
                {points.map((r) => (
                    <g key={r.m}>
                        <circle cx={cx(r.i)} cy={cy(r.v)} r="4.5" fill={SERIES} stroke="#FFFDF7" strokeWidth="2">
                            <title>{r.monthNo}월 · {num(r.v)}{unit}</title>
                        </circle>
                        {labelled.has(r.i) && (
                            <text x={cx(r.i)} y={cy(r.v) - 10} textAnchor="middle"
                                fontSize="10.5" fontWeight="800" fill={INK}>{num(r.v)}</text>
                        )}
                    </g>
                ))}
                <text x={AXIS_L} y={h + 32} fontSize="9.5" fontWeight="800" fill={INK_SOFT}>월</text>
            </svg>
            {!points.length && <p style={{ margin: '4px 0 0', color: INK_SOFT, fontSize: '.82rem' }}>아직 기록이 없어요.</p>}
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
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        const detailResult = await supabase.rpc('get_my_writing_footprint_detail');
        if (detailResult.error) {
            console.error('글쓰기 발자국 로드 실패:', detailResult.error.message);
            setErrorMessage('발자국을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
        } else {
            setDetail({ ...EMPTY_DETAIL, ...(detailResult.data || {}) });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!isOpen) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [isOpen, load]);

    // 화면을 덮는 판이라 뒤로가기로 닫히게 한다.
    // onClose 는 부모에서 인라인 화살표로 넘어와 **매 렌더 새 함수**다.
    // 이걸 의존성에 두면 부모가 리렌더될 때마다 effect 가 다시 돌아 pushState 가 쌓이고,
    // 뒤로가기를 여러 번 눌러야 닫히게 된다. ref 에 담아 두고 isOpen 에만 반응시킨다.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        window.history.pushState({ studentPage: 'main', overlay: 'footprint' }, '');
        const closeOnBack = () => onCloseRef.current?.();
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [isOpen]);

    const monthsAxis = useMemo(
        () => fillSchoolYearMonths(detail.monthly, detail.school_year),
        [detail.monthly, detail.school_year]
    );

    // 포인트 누적: 학년도 11칸 위에서 달마다 더해 나간다. 활동이 없는 달은 직전 값을 잇는다.
    const cumulative = useMemo(() => {
        const filled = fillSchoolYearMonths(detail.points_monthly, detail.school_year);
        const today = new Date();
        return filled.reduce((acc, r) => {
            const prev = acc.length ? acc[acc.length - 1].total : 0;
            const started = (r.earned || 0) + (r.spent || 0) > 0;
            const future = new Date(`${r.m}-01T00:00:00`) > today;
            const total = future ? 0 : prev + (r.earned || 0) - (r.spent || 0);
            return [...acc, { ...r, total: started || prev > 0 ? total : 0 }];
        }, []);
    }, [detail.points_monthly, detail.school_year]);

    if (!isOpen) return null;
    const t = detail.totals || EMPTY_DETAIL.totals;
    const sh = detail.sharing || EMPTY_DETAIL.sharing;
    const level = getWriterLevel(t.total_chars);
    const toNext = level.next ? Math.max(0, level.next - (t.total_chars || 0)) : 0;
    const levelPercent = level.next
        ? Math.min(100, Math.round(((t.total_chars || 0) / level.next) * 100))
        : 100;

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
                                {/* 홈에 있던 보유 포인트·작가 레벨·나의 성장을 여기로 모았다. */}
                                <section aria-label="작가 레벨" style={{
                                    marginTop: '18px', padding: '18px 20px', borderRadius: '22px',
                                    background: 'linear-gradient(135deg,#FFF8E1,#FFFFFF)', border: '1px solid #FFE082'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '.8rem', fontWeight: 800, color: INK_SOFT }}>보유 포인트 ✨</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#FBC02D', lineHeight: 1.1 }}>
                                                {num(t.total_points)}<span style={{ fontSize: '.95rem', color: INK_SOFT, fontWeight: 800 }}>점</span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '.9rem', fontWeight: 900, color: INK }}>{level.emoji} {level.name}</div>
                                            <div style={{
                                                display: 'inline-block', marginTop: '4px', padding: '3px 10px', borderRadius: '10px',
                                                background: '#FDFCF0', border: '1px solid #FFF9C4',
                                                fontSize: '.74rem', fontWeight: 900, color: '#F9A825'
                                            }}>LV. {level.level}</div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '.75rem', fontWeight: 800, color: INK_SOFT }}>나의 성장 🌱</span>
                                            <span style={{ fontSize: '.72rem', fontWeight: 800, color: INK_SOFT }}>
                                                {level.next ? `다음 레벨까지 ${num(toNext)}자` : '가장 높은 단계예요!'}
                                            </span>
                                        </div>
                                        <div style={{ height: '8px', background: '#F1F3F5', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${levelPercent}%`, background: 'linear-gradient(90deg,#FBC02D,#FFD54F)', borderRadius: '4px' }} />
                                        </div>
                                    </div>
                                </section>

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

                                <Section title="🔥 글쓰기 달력" hint="이번 학년도(3월~1월) · 많이 쓴 날일수록 진해져요.">
                                    <WritingCalendar daily={detail.daily || []} schoolYear={detail.school_year} />
                                </Section>

                                <Section title="📈 달마다 쓴 글">
                                    <MonthlyBars rows={monthsAxis} valueKey="posts" unit="편" />
                                </Section>

                                <Section title="✍️ 글이 길어지고 있어요" hint="달마다 글 한 편의 평균 글자 수예요.">
                                    <TrendLine rows={monthsAxis} valueKey="avg_chars" unit="자" />
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

                                <Section title="💬 친구와 나눈 기록" hint="친구 아지트에서 주고받은 댓글과 반응이에요.">
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px' }}>
                                        <StatTile icon="💬" label="남긴 댓글" value={num(sh.comments_given)} unit="개" />
                                        <StatTile icon="🗨️" label="받은 댓글" value={num(sh.comments_received)} unit="개" />
                                        <StatTile icon="🙌" label="보낸 반응" value={num(sh.reactions_given)} unit="개" />
                                        <StatTile icon="💖" label="받은 반응" value={num(sh.reactions_received)} unit="개" />
                                    </div>
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
