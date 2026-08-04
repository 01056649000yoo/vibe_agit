import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { classKey, dataCache } from '../../../lib/cache';
import {
    buildCumulativePoints, fillSchoolYearMonths, MonthlyBars, num,
    PointTypeBars, StatTile, TrendLine, WritingCalendar
} from './FootprintVisuals';
import StudentFootprintDetailModal from './StudentFootprintDetailModal';

const EMPTY_CLASS_FOOTPRINT = {
    school_year: null,
    totals: {
        total_students: 0, active_students: 0, total_posts: 0, total_chars: 0,
        avg_posts_per_student: 0, avg_chars_per_post: 0, active_days: 0,
        comments: 0, reactions: 0, points_earned: 0, points_used: 0
    },
    daily: [], monthly: [], points_monthly: [], points_by_type: [], spending_by_type: [], students: []
};

const Panel = ({ title, hint, compact = false, children, style }) => <section style={{
    background: 'white', border: '1px solid #E2E8F0', borderRadius: compact ? '13px' : '20px',
    padding: compact ? '9px 11px' : '20px', minWidth: 0, minHeight: 0,
    boxShadow: compact ? '0 3px 12px rgba(15,23,42,.04)' : '0 8px 24px rgba(15,23,42,.04)',
    overflow: compact ? 'hidden' : undefined,
    display: compact ? 'flex' : undefined, flexDirection: compact ? 'column' : undefined,
    ...style
}}>
    <h3 style={{ margin: compact ? '0 0 3px' : 0, color: '#1E293B', fontSize: compact ? 'var(--footprint-fs-md, .78rem)' : '1rem', fontWeight: 900, flexShrink: 0, whiteSpace: compact ? 'nowrap' : undefined, overflow: compact ? 'hidden' : undefined, textOverflow: compact ? 'ellipsis' : undefined }}>{title}</h3>
    {hint && !compact && <p style={{ margin: '4px 0 16px', color: '#64748B', fontSize: '.8rem', lineHeight: 1.5 }}>{hint}</p>}
    {!hint && !compact && <div style={{ height: '14px' }} />}
    {children}
</section>;

const formatDate = (value) => value
    ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(value))
    : '아직 없음';

const SummaryTiles = ({ totals, participation, compact = false, isMobile = false }) => <div style={{
    display: 'grid',
    gridTemplateColumns: isMobile && !compact ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))',
    gap: compact ? '6px' : '10px'
}}>
    <StatTile compact={compact} icon="👥" label="참여 학생" value={`${num(totals.active_students)}/${num(totals.total_students)}`} unit={`명 · ${participation}%`} accent="#1D4ED8" />
    <StatTile compact={compact} icon="📝" label="완료 글" value={num(totals.total_posts)} unit="편" />
    <StatTile compact={compact} icon="✍️" label="쓴 글자" value={num(totals.total_chars)} unit="자" />
    <StatTile compact={compact} icon="📊" label="학생당 평균" value={num(totals.avg_posts_per_student)} unit="편" />
    <StatTile compact={compact} icon="📏" label="한 편 평균" value={num(totals.avg_chars_per_post)} unit="자" />
    <StatTile compact={compact} icon="💬" label="친구 교류" value={num(Number(totals.comments) + Number(totals.reactions))} unit="회" />
</div>;

const MetricCell = ({ primary, secondary, muted = false }) => <td style={{ padding: '11px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
    <strong style={{ display: 'block', color: muted ? '#94A3B8' : '#334155', fontSize: '.83rem' }}>{primary}</strong>
    <span style={{ display: 'block', marginTop: '3px', color: '#94A3B8', fontSize: '.7rem', whiteSpace: 'nowrap' }}>{secondary}</span>
</td>;

const DetailValue = ({ label, value }) => <div style={{ minWidth: '120px' }}>
    <span style={{ display: 'block', color: '#64748B', fontSize: '.7rem', fontWeight: 700 }}>{label}</span>
    <strong style={{ display: 'block', marginTop: '3px', color: '#1E293B', fontSize: '.82rem' }}>{value}</strong>
</div>;

const StudentTable = ({ students }) => {
    const [expandedStudentId, setExpandedStudentId] = useState(null);

    return <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '1060px', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead><tr style={{ color: '#64748B', borderBottom: '1px solid #E2E8F0', textAlign: 'right' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>학생</th>
                <th style={{ padding: '10px' }}>글 활동</th>
                <th style={{ padding: '10px' }}>꾸준함</th>
                <th style={{ padding: '10px' }}>다듬기</th>
                <th style={{ padding: '10px' }}>친구 교류</th>
                <th style={{ padding: '10px' }}>포인트</th>
                <th style={{ padding: '10px' }}>최근 변화</th>
            </tr></thead>
            <tbody>{students.map((student) => {
                const isOpen = expandedStudentId === student.student_id;
                const interactionsGiven = Number(student.comments_given || 0) + Number(student.reactions_given || 0);
                const interactionsReceived = Number(student.comments_received || 0) + Number(student.reactions_received || 0);
                const change = student.avg_chars_change;
                const changeLabel = change == null
                    ? '비교 자료 없음'
                    : `이전 30일보다 ${Number(change) > 0 ? '+' : ''}${num(change)}자`;
                const changeColor = change == null || Number(change) === 0
                    ? '#94A3B8'
                    : (Number(change) > 0 ? '#047857' : '#B45309');
                const detailId = `footprint-student-${student.student_id}`;

                return <React.Fragment key={student.student_id}>
                    <tr style={{ borderBottom: isOpen ? 0 : '1px solid #F1F5F9', background: isOpen ? '#F8FAFC' : 'white' }}>
                        <td style={{ padding: '11px 12px', textAlign: 'left', verticalAlign: 'middle' }}>
                            <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={detailId}
                                onClick={() => setExpandedStudentId(isOpen ? null : student.student_id)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', border: 0, padding: 0, background: 'transparent', color: '#1E293B', fontWeight: 900, cursor: 'pointer' }}
                            >
                                <span aria-hidden="true" style={{ color: '#2563EB', fontSize: '.68rem' }}>{isOpen ? '▼' : '▶'}</span>
                                {student.name}
                            </button>
                        </td>
                        <MetricCell primary={`${num(student.posts)}편`} secondary={`과제 ${num(student.assignment_posts)} · 독서록 ${num(student.reading_logs)}`} />
                        <MetricCell primary={`${num(student.active_days)}일 활동`} secondary={`현재 ${num(student.current_streak)}일 · 최고 ${num(student.best_streak)}일`} />
                        <MetricCell primary={`고쳐쓰기 ${num(student.revisions)}회`} secondary={`피드백 ${num(student.feedbacks_received)}회 · 기록 이후`} />
                        <MetricCell primary={`남김 ${num(interactionsGiven)}회`} secondary={`받음 ${num(interactionsReceived)}회`} />
                        <MetricCell primary={`+${num(student.points_earned)}P`} secondary={`사용 ${num(student.points_used)}P`} />
                        <td style={{ padding: '11px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                            <strong style={{ display: 'block', color: student.last_post_at ? '#334155' : '#94A3B8', fontSize: '.83rem' }}>{formatDate(student.last_post_at)}</strong>
                            <span style={{ display: 'block', marginTop: '3px', color: changeColor, fontSize: '.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>30일 {num(student.recent_30_posts)}편 · {changeLabel}</span>
                        </td>
                    </tr>
                    {isOpen && <tr id={detailId} style={{ borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                        <td colSpan={7} style={{ padding: '2px 12px 14px 35px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 26px', padding: '12px 14px', border: '1px solid #DBEAFE', borderRadius: '12px', background: '#EFF6FF' }}>
                                <DetailValue label="학년도 전체 글자" value={`${num(student.total_chars)}자`} />
                                <DetailValue label="한 편 평균" value={`${num(student.avg_chars)}자`} />
                                <DetailValue label="최근 30일 평균" value={student.recent_30_posts ? `${num(student.recent_30_avg_chars)}자` : '아직 없음'} />
                                <DetailValue label="댓글" value={`남김 ${num(student.comments_given)} · 받음 ${num(student.comments_received)}`} />
                                <DetailValue label="반응" value={`남김 ${num(student.reactions_given)} · 받음 ${num(student.reactions_received)}`} />
                            </div>
                        </td>
                    </tr>}
                </React.Fragment>;
            })}</tbody>
        </table>
        {!students.length && <p style={{ padding: '28px', textAlign: 'center', color: '#64748B' }}>등록된 학생이 없습니다.</p>}
    </div>;
};

/** 전체화면에서는 학생 1명을 한 줄짜리 미니 카드로 줄이고 여러 열에 나눠 모든 학생을 함께 본다. */
const CompactStudentGrid = ({ students, onSelectStudent }) => {
    // 전체 폭을 사용하므로 한 줄에 더 많은 카드를 두고, 카드 한 장은 3줄 높이를 확보한다.
    const columns = Math.min(8, Math.max(3, Math.ceil(students.length / 4)));
    const rows = Math.ceil(students.length / columns);
    if (!students.length) return <p style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: 'var(--footprint-fs-sm, .72rem)' }}>등록된 학생이 없습니다.</p>;
    return <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: '6px',
        gridTemplateRows: `repeat(${rows}, minmax(68px,1fr))`,
        flex: 1, minHeight: 0, marginTop: '4px', paddingRight: '2px',
        overflowX: 'hidden', overflowY: 'auto', overscrollBehavior: 'contain'
    }}>
        {students.map((student) => {
            const interactionsGiven = Number(student.comments_given || 0) + Number(student.reactions_given || 0);
            const interactionsReceived = Number(student.comments_received || 0) + Number(student.reactions_received || 0);
            const change = student.avg_chars_change;
            const changeLabel = change == null
                ? '비교 없음'
                : `${Number(change) > 0 ? '+' : ''}${num(change)}자`;
            const fullSummary = [
                `글 ${num(student.posts)}편(과제 ${num(student.assignment_posts)}·독서록 ${num(student.reading_logs)})`,
                `활동 ${num(student.active_days)}일(연속 ${num(student.current_streak)}·최고 ${num(student.best_streak)})`,
                `고쳐쓰기 ${num(student.revisions)}·피드백 ${num(student.feedbacks_received)}`,
                `교류 남김 ${num(interactionsGiven)}·받음 ${num(interactionsReceived)}`,
                `30일 ${num(student.recent_30_posts)}편·${changeLabel}`,
                `포인트 +${num(student.points_earned)}·사용 ${num(student.points_used)}`
            ].join(' · ');
            return <button type="button" key={student.student_id} onClick={() => onSelectStudent(student)} aria-haspopup="dialog" aria-label={`${student.name} 발자국 크게 보기`} title={`${student.name} · ${fullSummary} · 최근 글 ${formatDate(student.last_post_at)}`} style={{
                border: '1px solid #DCE6F2', borderRadius: '10px', padding: '5px 8px', background: '#F8FAFC',
                minWidth: 0, minHeight: '68px', boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden',
                color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '5px', alignItems: 'baseline', minWidth: 0, lineHeight: 1.05 }}>
                    <strong style={{ flex: 1, minWidth: 0, color: '#172554', fontSize: 'var(--footprint-student-name, .84rem)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{student.name}</strong>
                    <span title={`최근 글 ${formatDate(student.last_post_at)}`} style={{ flexShrink: 1, minWidth: 0, maxWidth: '52%', color: '#1D4ED8', fontSize: 'var(--footprint-student-meta, .64rem)', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>+{num(student.points_earned)} · -{num(student.points_used)}P</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '3px', marginTop: '3px', color: '#334155', fontSize: 'var(--footprint-student-text, .68rem)', fontWeight: 800, lineHeight: 1.12 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>과 {num(student.assignment_posts)} · 독 {num(student.reading_logs)}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>활동 {num(student.active_days)}일</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '3px', marginTop: '2px', color: '#64748B', fontSize: 'var(--footprint-student-meta, .64rem)', fontWeight: 700, lineHeight: 1.12 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>연속 {num(student.current_streak)}/{num(student.best_streak)}일</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>다듬 {num(student.revisions)} · 도움 {num(student.feedbacks_received)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '3px', marginTop: '2px', color: '#64748B', fontSize: 'var(--footprint-student-meta, .64rem)', fontWeight: 700, lineHeight: 1.12 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>교류 {num(interactionsGiven)}↗ {num(interactionsReceived)}↙</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: change == null ? '#94A3B8' : (Number(change) >= 0 ? '#047857' : '#B45309') }}>30일 {num(student.recent_30_posts)} · {changeLabel}</span>
                </div>
            </button>;
        })}
    </div>;
};

const ChartPanels = ({ detail, totals, months, cumulativePoints, compact = false, isMobile = false }) => <div style={{
    display: 'grid',
    gridTemplateColumns: isMobile && !compact ? 'minmax(0,1fr)' : `repeat(${compact ? 3 : 2}, minmax(0,1fr))`,
    gridTemplateRows: compact ? 'repeat(2, minmax(0,1fr))' : undefined,
    gap: compact ? '7px' : '18px', minWidth: 0, minHeight: 0
}}>
    <Panel compact={compact} title="🔥 학급 글쓰기 달력" hint="학급 전체가 쓴 날을 합쳐, 활동이 많았던 날을 진하게 표시합니다.">
        <WritingCalendar compact={compact} fluid={compact} daily={detail.daily || []} schoolYear={detail.school_year} />
    </Panel>
    <Panel compact={compact} title="📈 달마다 완료한 글" hint="승인된 글을 기준으로 월별 학급 활동량을 봅니다.">
        <MonthlyBars compact={compact} fluid={compact} rows={months} valueKey="posts" unit="편" />
    </Panel>
    <Panel compact={compact} title="✍️ 글 길이 변화" hint="월별로 글 한 편의 평균 글자 수가 어떻게 달라졌는지 봅니다.">
        <TrendLine compact={compact} fluid={compact} rows={months} valueKey="avg_chars" unit="자" />
    </Panel>
    <Panel compact={compact} title="💰 학급 포인트 흐름" hint="학급에서 모은 포인트에서 사용·조정된 포인트를 뺀 누적 흐름입니다.">
        <TrendLine compact={compact} fluid={compact} rows={cumulativePoints} valueKey="total" unit="P" />
        {compact ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '-8px', fontSize: 'var(--footprint-fs-xs, .58rem)', fontWeight: 900, color: '#64748B' }}>
            <span>+ {num(totals.points_earned)}P</span><span>- {num(totals.points_used)}P</span>
        </div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '9px', marginTop: '8px' }}>
            <StatTile icon="➕" label="모은 포인트" value={num(totals.points_earned)} unit="P" />
            <StatTile icon="➖" label="직접 사용" value={num(totals.points_used)} unit="P" />
        </div>}
    </Panel>
    <Panel compact={compact} title="🎁 포인트 획득처" hint="이번 학년도에 학급이 포인트를 모은 활동입니다.">
        <PointTypeBars compact={compact} rows={detail.points_by_type || []} emptyMessage="아직 모은 포인트가 없습니다." />
    </Panel>
    <Panel compact={compact} title="🛍️ 포인트 사용처" hint="학생이 직접 선택해 사용한 포인트만 표시합니다.">
        <PointTypeBars compact={compact} rows={detail.spending_by_type || []} emptyMessage="아직 사용한 포인트가 없습니다." color="#F59E0B" />
    </Panel>
</div>;

const TeacherWritingFootprintDashboard = ({ activeClass, isMobile }) => {
    const [detail, setDetail] = useState(EMPTY_CLASS_FOOTPRINT);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [modalContainer, setModalContainer] = useState(null);
    const rootRef = useRef(null);

    const classId = activeClass?.id;
    const load = useCallback(async (forceRefresh = false) => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');
        const cacheKey = classKey(classId, 'writing-footprint-dashboard');
        if (forceRefresh) dataCache.invalidate(cacheKey);
        try {
            const data = await dataCache.get(cacheKey, async () => {
                const result = await supabase.rpc('get_class_writing_footprint_dashboard', { p_class_id: classId });
                if (result.error) throw result.error;
                return result.data;
            }, 30000);
            setDetail({ ...EMPTY_CLASS_FOOTPRINT, ...(data || {}), totals: { ...EMPTY_CLASS_FOOTPRINT.totals, ...(data?.totals || {}) } });
        } catch (error) {
            console.error('학급 글쓰기 발자국 로드 실패:', error.message);
            setErrorMessage('학급 발자국을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        setLoading(false);
    }, [classId]);

    useEffect(() => {
        const timerId = window.setTimeout(() => load(), 0);
        return () => window.clearTimeout(timerId);
    }, [load]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setModalContainer(document.fullscreenElement || null);
            if (!document.fullscreenElement) {
                setIsExpanded(false);
                setSelectedStudent(null);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !document.fullscreenElement) setIsExpanded(false);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
        if (!isExpanded) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
    }, [isExpanded]);

    const toggleExpanded = useCallback(async () => {
        if (isExpanded) {
            setSelectedStudent(null);
            if (document.fullscreenElement === rootRef.current) await document.exitFullscreen().catch(() => {});
            setIsExpanded(false);
            return;
        }
        setIsExpanded(true);
        if (rootRef.current?.requestFullscreen) await rootRef.current.requestFullscreen().catch(() => {});
    }, [isExpanded]);
    const closeStudentDetail = useCallback(() => setSelectedStudent(null), []);

    const months = useMemo(() => fillSchoolYearMonths(detail.monthly, detail.school_year), [detail.monthly, detail.school_year]);
    const cumulativePoints = useMemo(() => buildCumulativePoints(detail.points_monthly, detail.school_year), [detail.points_monthly, detail.school_year]);
    const totals = detail.totals || EMPTY_CLASS_FOOTPRINT.totals;
    const students = detail.students || [];
    const participation = totals.total_students
        ? Math.round((Number(totals.active_students) / Number(totals.total_students)) * 100)
        : 0;
    const schoolYearLabel = detail.school_year?.start
        ? `${String(detail.school_year.start).slice(0, 4)}학년도 (3월~1월)`
        : '이번 학년도 (3월~1월)';

    if (loading) return <div style={{ padding: '80px 0', textAlign: 'center', color: '#64748B', fontWeight: 800 }}>학급 발자국을 모으는 중입니다… 👣</div>;
    if (errorMessage) return <div style={{ maxWidth: '560px', margin: '48px auto', padding: '28px', textAlign: 'center', background: 'white', borderRadius: '20px', border: '1px solid #FECACA' }}>
        <p style={{ margin: '0 0 14px', color: '#B91C1C', fontWeight: 800 }}>{errorMessage}</p>
        <button type="button" onClick={() => load(true)} style={{ border: 0, borderRadius: '10px', padding: '9px 14px', background: '#2563EB', color: 'white', fontWeight: 800, cursor: 'pointer' }}>다시 불러오기</button>
    </div>;

    return <div ref={rootRef} style={{
        display: 'flex', flexDirection: 'column', gap: isExpanded ? '7px' : '18px', minWidth: 0,
        ...(isExpanded ? {
            position: 'fixed', inset: 0, zIndex: 20000, width: '100vw', height: '100dvh',
            padding: isMobile ? '8px' : '10px', boxSizing: 'border-box', background: '#F1F5F9', overflow: isMobile ? 'auto' : 'hidden',
            // vmin은 화면의 짧은 변을 따르므로 와이드·4:3·낮은 노트북에서도 글자가 한쪽으로 과도하게 커지지 않는다.
            '--footprint-fs-xs': 'clamp(.5rem, .82vmin, .68rem)',
            '--footprint-fs-sm': 'clamp(.56rem, .96vmin, .76rem)',
            '--footprint-fs-md': 'clamp(.68rem, 1.16vmin, .9rem)',
            '--footprint-fs-lg': 'clamp(.82rem, 1.42vmin, 1.08rem)',
            '--footprint-student-name': 'clamp(.78rem, 1.2vmin, .98rem)',
            '--footprint-student-text': 'clamp(.64rem, .94vmin, .78rem)',
            '--footprint-student-meta': 'clamp(.6rem, .84vmin, .72rem)'
        } : {})
    }}>
        <div style={{
            display: 'flex', flexDirection: isMobile && !isExpanded ? 'column' : 'row', justifyContent: 'space-between', alignItems: isExpanded ? 'center' : undefined,
            gap: isExpanded ? '8px' : '12px', padding: isExpanded ? '9px 13px' : (isMobile ? '20px' : '24px 28px'),
            borderRadius: isExpanded ? '14px' : '22px', color: 'white', flexShrink: 0,
            background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 52%, #0EA5E9 100%)',
            boxShadow: '0 14px 34px rgba(37,99,235,.20)'
        }}>
            <div style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 3px', fontSize: isExpanded ? 'var(--footprint-fs-sm, .6rem)' : '.78rem', fontWeight: 800, opacity: .82 }}>{schoolYearLabel}</p>
                <h2 style={{ margin: 0, fontSize: isExpanded ? 'var(--footprint-fs-lg, 1rem)' : (isMobile ? '1.35rem' : '1.6rem'), fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>👣 {activeClass?.name} 글쓰기 발자국</h2>
                {!isExpanded && <p style={{ margin: '8px 0 0', fontSize: '.86rem', opacity: .9 }}>칭호를 제외한 글쓰기 성장과 포인트·교류 기록을 학급 단위로 모았습니다.</p>}
            </div>
            <div style={{ display: 'flex', gap: '7px', flexShrink: 0 }}>
                <button type="button" onClick={() => load(true)} style={{ border: '1px solid rgba(255,255,255,.45)', borderRadius: '10px', padding: isExpanded ? '6px 9px' : '9px 13px', color: 'white', background: 'rgba(255,255,255,.14)', fontSize: isExpanded ? 'var(--footprint-fs-sm, .7rem)' : undefined, fontWeight: 800, cursor: 'pointer' }}>↻ 새로고침</button>
                <button type="button" onClick={toggleExpanded} aria-pressed={isExpanded} style={{ border: '1px solid rgba(255,255,255,.65)', borderRadius: '10px', padding: isExpanded ? '6px 9px' : '9px 13px', color: '#1D4ED8', background: 'white', fontSize: isExpanded ? 'var(--footprint-fs-sm, .7rem)' : undefined, fontWeight: 900, cursor: 'pointer' }}>
                    {isExpanded ? '🗗 기본화면' : '⛶ 전체화면'}
                </button>
            </div>
        </div>

        <SummaryTiles totals={totals} participation={participation} compact={isExpanded} isMobile={isMobile} />

        {isExpanded && !isMobile ? <div style={{
            display: 'grid', gridTemplateRows: 'minmax(0,3fr) minmax(320px,2fr)',
            gap: '7px', flex: 1, minHeight: 0, overflow: 'hidden'
        }}>
            <ChartPanels compact detail={detail} totals={totals} months={months} cumulativePoints={cumulativePoints} />
            <Panel compact title={`👥 학생별 현황 · ${students.length}명 · 카드를 눌러 크게 보기`} style={{ height: '100%', boxSizing: 'border-box' }}>
                <CompactStudentGrid students={students} onSelectStudent={setSelectedStudent} />
            </Panel>
        </div> : <>
            <ChartPanels detail={detail} totals={totals} months={months} cumulativePoints={cumulativePoints} isMobile={isMobile} />
            <Panel title="👥 학생별 현황" hint="등수가 아니라 개별 학생의 참여와 최근 기록을 빠르게 확인하는 표입니다.">
                <StudentTable students={students} />
            </Panel>
        </>}
        <StudentFootprintDetailModal student={selectedStudent} onClose={closeStudentDetail} container={modalContainer} />
    </div>;
};

export default TeacherWritingFootprintDashboard;
