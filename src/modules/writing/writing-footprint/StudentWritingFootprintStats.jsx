import React, { useMemo } from 'react';
import {
    buildCumulativePoints, fillSchoolYearMonths, MonthlyBars, num,
    PointTypeBars, Section, StatTile, TrendLine, WritingCalendar
} from './FootprintVisuals';

export const EMPTY_FOOTPRINT_DETAIL = {
    totals: {
        total_chars: 0, completed_posts: 0, completed_missions: 0, monthly_posts: 0,
        longest_post_chars: 0, active_days: 0, best_streak: 0, current_streak: 0,
        total_points: 0, points_earned: 0, points_spent: 0
    },
    sharing: { comments_received: 0, comments_given: 0, reactions_received: 0, reactions_given: 0 },
    school_year: null,
    daily: [], monthly: [], points_monthly: [], points_by_type: [],
    spending: { total_used: 0, total_adjusted: 0, by_type: [] }
};

/** 칭호와 무관한 학생 글쓰기 발자국 전체. 모달·다른 학생 화면에서 그대로 재사용한다. */
const StudentWritingFootprintStats = ({ detail = EMPTY_FOOTPRINT_DETAIL }) => {
    const totals = detail.totals || EMPTY_FOOTPRINT_DETAIL.totals;
    const sharing = detail.sharing || EMPTY_FOOTPRINT_DETAIL.sharing;
    const spending = detail.spending || EMPTY_FOOTPRINT_DETAIL.spending;
    const months = useMemo(() => fillSchoolYearMonths(detail.monthly, detail.school_year), [detail.monthly, detail.school_year]);
    const cumulativePoints = useMemo(() => buildCumulativePoints(detail.points_monthly, detail.school_year), [detail.points_monthly, detail.school_year]);

    return <>
        <Section title="지금까지" hint="글을 쓰면 바로 반영돼요.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '9px' }}>
                <StatTile icon="📝" label="쓴 글자 수" value={num(totals.total_chars)} unit="자" />
                <StatTile icon="✅" label="완료 미션" value={num(totals.completed_missions)} unit="개" />
                <StatTile icon="📅" label="이달의 활동" value={num(totals.monthly_posts)} unit="편" />
                <StatTile icon="🔥" label="가장 길게" value={num(totals.best_streak)} unit="일 연속" />
                <StatTile icon="🗓️" label="글 쓴 날" value={num(totals.active_days)} unit="일" />
                <StatTile icon="🏆" label="가장 긴 글" value={num(totals.longest_post_chars)} unit="자" />
            </div>
        </Section>
        <Section title="🔥 글쓰기 달력" hint="이번 학년도(3월~1월) · 많이 쓴 날일수록 진해져요.">
            <WritingCalendar daily={detail.daily || []} schoolYear={detail.school_year} />
        </Section>
        <Section title="📈 달마다 쓴 글"><MonthlyBars rows={months} valueKey="posts" unit="편" /></Section>
        <Section title="✍️ 글이 길어지고 있어요" hint="달마다 글 한 편의 평균 글자 수예요.">
            <TrendLine rows={months} valueKey="avg_chars" unit="자" />
        </Section>
        <Section title="💰 포인트가 쌓인 길" hint="사용하거나 회수·조정된 포인트를 뺀 나머지가 지금 내 포인트예요.">
            <TrendLine rows={cumulativePoints} valueKey="total" unit="P" />
            <div style={{ display: 'flex', gap: '9px', marginTop: '12px' }}>
                <StatTile icon="➕" label="모은 포인트" value={num(totals.points_earned)} unit="P" />
                <StatTile icon="➖" label="직접 쓴 포인트" value={num(spending.total_used)} unit="P" />
            </div>
            {spending.total_adjusted > 0 && <p style={{ margin: '9px 2px 0', fontSize: '.74rem', color: '#8D7B6C' }}>
                승인 취소·선생님 조정으로 빠진 {num(spending.total_adjusted)}P는 사용처에서 제외했어요.
            </p>}
        </Section>
        <Section title="🎁 포인트를 어디서 모았나">
            <PointTypeBars rows={detail.points_by_type || []} emptyMessage="아직 모은 포인트가 없어요." />
        </Section>
        <Section title="🛍️ 포인트를 어디에 썼나" hint="내가 직접 선택해 사용한 포인트만 보여 줘요.">
            <PointTypeBars rows={spending.by_type || []} emptyMessage="아직 사용한 포인트가 없어요." color="#F59E0B" />
        </Section>
        <Section title="💬 친구와 나눈 기록" hint="친구 아지트에서 주고받은 댓글과 반응이에요.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px' }}>
                <StatTile icon="💬" label="남긴 댓글" value={num(sharing.comments_given)} unit="개" />
                <StatTile icon="🗨️" label="받은 댓글" value={num(sharing.comments_received)} unit="개" />
                <StatTile icon="🙌" label="보낸 반응" value={num(sharing.reactions_given)} unit="개" />
                <StatTile icon="💖" label="받은 반응" value={num(sharing.reactions_received)} unit="개" />
            </div>
        </Section>
    </>;
};

export default StudentWritingFootprintStats;
