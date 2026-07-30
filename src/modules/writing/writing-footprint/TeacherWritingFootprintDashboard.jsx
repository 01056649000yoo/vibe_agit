import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { classKey, dataCache } from '../../../lib/cache';
import {
    buildCumulativePoints, fillSchoolYearMonths, MonthlyBars, num,
    PointTypeBars, StatTile, TrendLine, WritingCalendar
} from './FootprintVisuals';

const EMPTY_CLASS_FOOTPRINT = {
    school_year: null,
    totals: {
        total_students: 0, active_students: 0, total_posts: 0, total_chars: 0,
        avg_posts_per_student: 0, avg_chars_per_post: 0, active_days: 0,
        comments: 0, reactions: 0, points_earned: 0, points_used: 0
    },
    daily: [], monthly: [], points_monthly: [], points_by_type: [], spending_by_type: [], students: []
};

const Panel = ({ title, hint, children }) => <section style={{
    background: 'white', border: '1px solid #E2E8F0', borderRadius: '20px', padding: '20px', minWidth: 0,
    boxShadow: '0 8px 24px rgba(15,23,42,.04)'
}}>
    <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1rem', fontWeight: 900 }}>{title}</h3>
    {hint && <p style={{ margin: '4px 0 16px', color: '#64748B', fontSize: '.8rem', lineHeight: 1.5 }}>{hint}</p>}
    {!hint && <div style={{ height: '14px' }} />}
    {children}
</section>;

const formatDate = (value) => value
    ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(value))
    : '아직 없음';

const TeacherWritingFootprintDashboard = ({ activeClass, isMobile }) => {
    const [detail, setDetail] = useState(EMPTY_CLASS_FOOTPRINT);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

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

    const months = useMemo(() => fillSchoolYearMonths(detail.monthly, detail.school_year), [detail.monthly, detail.school_year]);
    const cumulativePoints = useMemo(() => buildCumulativePoints(detail.points_monthly, detail.school_year), [detail.points_monthly, detail.school_year]);
    const totals = detail.totals || EMPTY_CLASS_FOOTPRINT.totals;
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

    return <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
        <div style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: '12px',
            padding: isMobile ? '20px' : '24px 28px', borderRadius: '22px', color: 'white',
            background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 52%, #0EA5E9 100%)',
            boxShadow: '0 14px 34px rgba(37,99,235,.20)'
        }}>
            <div>
                <p style={{ margin: '0 0 5px', fontSize: '.78rem', fontWeight: 800, opacity: .82 }}>{schoolYearLabel}</p>
                <h2 style={{ margin: 0, fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 900 }}>👣 {activeClass?.name} 글쓰기 발자국</h2>
                <p style={{ margin: '8px 0 0', fontSize: '.86rem', opacity: .9 }}>칭호를 제외한 글쓰기 성장과 포인트·교류 기록을 학급 단위로 모았습니다.</p>
            </div>
            <button type="button" onClick={() => load(true)} style={{ alignSelf: isMobile ? 'flex-start' : 'center', border: '1px solid rgba(255,255,255,.45)', borderRadius: '11px', padding: '9px 13px', color: 'white', background: 'rgba(255,255,255,.14)', fontWeight: 800, cursor: 'pointer' }}>↻ 새로고침</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))', gap: '10px' }}>
            <StatTile icon="👥" label="참여 학생" value={`${num(totals.active_students)}/${num(totals.total_students)}`} unit={`명 · ${participation}%`} accent="#1D4ED8" />
            <StatTile icon="📝" label="완료 글" value={num(totals.total_posts)} unit="편" />
            <StatTile icon="✍️" label="쓴 글자" value={num(totals.total_chars)} unit="자" />
            <StatTile icon="📊" label="학생당 평균" value={num(totals.avg_posts_per_student)} unit="편" />
            <StatTile icon="📏" label="한 편 평균" value={num(totals.avg_chars_per_post)} unit="자" />
            <StatTile icon="💬" label="친구 교류" value={num(Number(totals.comments) + Number(totals.reactions))} unit="회" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: '18px' }}>
            <Panel title="🔥 학급 글쓰기 달력" hint="학급 전체가 쓴 날을 합쳐, 활동이 많았던 날을 진하게 표시합니다.">
                <WritingCalendar daily={detail.daily || []} schoolYear={detail.school_year} />
            </Panel>
            <Panel title="📈 달마다 완료한 글" hint="승인된 글을 기준으로 월별 학급 활동량을 봅니다.">
                <MonthlyBars rows={months} valueKey="posts" unit="편" />
            </Panel>
            <Panel title="✍️ 글 길이 변화" hint="월별로 글 한 편의 평균 글자 수가 어떻게 달라졌는지 봅니다.">
                <TrendLine rows={months} valueKey="avg_chars" unit="자" />
            </Panel>
            <Panel title="💰 학급 포인트 흐름" hint="학급에서 모은 포인트에서 사용·조정된 포인트를 뺀 누적 흐름입니다.">
                <TrendLine rows={cumulativePoints} valueKey="total" unit="P" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '9px', marginTop: '8px' }}>
                    <StatTile icon="➕" label="모은 포인트" value={num(totals.points_earned)} unit="P" />
                    <StatTile icon="➖" label="직접 사용" value={num(totals.points_used)} unit="P" />
                </div>
            </Panel>
            <Panel title="🎁 포인트 획득처" hint="이번 학년도에 학급이 포인트를 모은 활동입니다.">
                <PointTypeBars rows={detail.points_by_type || []} emptyMessage="아직 모은 포인트가 없습니다." />
            </Panel>
            <Panel title="🛍️ 포인트 사용처" hint="학생이 직접 선택해 사용한 포인트만 표시합니다.">
                <PointTypeBars rows={detail.spending_by_type || []} emptyMessage="아직 사용한 포인트가 없습니다." color="#F59E0B" />
            </Panel>
        </div>

        <Panel title="👥 학생별 현황" hint="등수가 아니라 개별 학생의 참여와 최근 기록을 빠르게 확인하는 표입니다.">
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                    <thead><tr style={{ color: '#64748B', borderBottom: '1px solid #E2E8F0', textAlign: 'right' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>학생</th>
                        <th style={{ padding: '10px 12px' }}>완료 글</th>
                        <th style={{ padding: '10px 12px' }}>쓴 글자</th>
                        <th style={{ padding: '10px 12px' }}>글 쓴 날</th>
                        <th style={{ padding: '10px 12px' }}>한 편 평균</th>
                        <th style={{ padding: '10px 12px' }}>친구 교류</th>
                        <th style={{ padding: '10px 12px' }}>최근 글</th>
                    </tr></thead>
                    <tbody>{(detail.students || []).map((student) => <tr key={student.student_id} style={{ borderBottom: '1px solid #F1F5F9', color: '#334155', textAlign: 'right' }}>
                        <td style={{ padding: '11px 12px', textAlign: 'left', fontWeight: 900 }}>{student.name}</td>
                        <td style={{ padding: '11px 12px', fontWeight: 800 }}>{num(student.posts)}편</td>
                        <td style={{ padding: '11px 12px' }}>{num(student.total_chars)}자</td>
                        <td style={{ padding: '11px 12px' }}>{num(student.active_days)}일</td>
                        <td style={{ padding: '11px 12px' }}>{num(student.avg_chars)}자</td>
                        <td style={{ padding: '11px 12px' }}>{num(Number(student.comments_given) + Number(student.reactions_given))}회</td>
                        <td style={{ padding: '11px 12px', color: student.last_post_at ? '#475569' : '#94A3B8' }}>{formatDate(student.last_post_at)}</td>
                    </tr>)}</tbody>
                </table>
                {!detail.students?.length && <p style={{ padding: '28px', textAlign: 'center', color: '#64748B' }}>등록된 학생이 없습니다.</p>}
            </div>
        </Panel>
    </div>;
};

export default TeacherWritingFootprintDashboard;
