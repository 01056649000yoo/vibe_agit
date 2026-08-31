import React, { useMemo } from 'react';
import {
    buildCumulativePoints, fillSchoolYearMonths, MonthlyBars, num,
    PointTypeBars, Section, signedPoints, StatTile, TrendLine, WritingCalendar
} from './FootprintVisuals';

export const EMPTY_FOOTPRINT_DETAIL = {
    totals: {
        total_chars: 0, completed_posts: 0, completed_missions: 0, monthly_posts: 0,
        longest_post_chars: 0, active_days: 0, best_streak: 0, current_streak: 0,
        total_points: 0, points_earned: 0, points_spent: 0,
        activity_points_earned: 0, teacher_adjustment_points: 0, starting_bonus_points: 0
    },
    writing_types: { assignment_posts: 0, reading_logs: 0, diaries: 0, other_self_posts: 0 },
    learning: { rewrite_requests: 0, revision_submissions: 0, feedbacks_received: 0 },
    recent: { posts: 0, avg_chars: 0, avg_chars_change: null },
    sharing: { comments_received: 0, comments_given: 0, reactions_received: 0, reactions_given: 0 },
    school_year: null,
    daily: [], monthly: [], points_monthly: [], points_by_type: [],
    spending: { total_used: 0, total_adjusted: 0, by_type: [] }
};

/** 칭호와 무관한 학생 글쓰기 발자국 전체. 모달·다른 학생 화면에서 그대로 재사용한다. */
const StudentWritingFootprintStats = ({ detail = EMPTY_FOOTPRINT_DETAIL }) => {
    const totals = detail.totals || EMPTY_FOOTPRINT_DETAIL.totals;
    const writingTypes = detail.writing_types || EMPTY_FOOTPRINT_DETAIL.writing_types;
    const learning = detail.learning || EMPTY_FOOTPRINT_DETAIL.learning;
    const recent = detail.recent || EMPTY_FOOTPRINT_DETAIL.recent;
    const sharing = detail.sharing || EMPTY_FOOTPRINT_DETAIL.sharing;
    const spending = detail.spending || EMPTY_FOOTPRINT_DETAIL.spending;
    const months = useMemo(() => fillSchoolYearMonths(detail.monthly, detail.school_year), [detail.monthly, detail.school_year]);
    const cumulativePoints = useMemo(() => buildCumulativePoints(detail.points_monthly, detail.school_year), [detail.points_monthly, detail.school_year]);
    const averageChars = totals.completed_posts
        ? Math.round(Number(totals.total_chars || 0) / Number(totals.completed_posts))
        : 0;
    const recentChange = recent.avg_chars_change;
    const recentChangeText = recentChange == null
        ? '비교할 지난 30일 기록이 아직 없어요.'
        : Number(recentChange) === 0
            ? '지난 30일과 글 한 편의 길이가 같아요.'
            : `지난 30일보다 한 편 평균 ${Number(recentChange) > 0 ? '+' : ''}${num(recentChange)}자예요.`;
    const growthMessage = (() => {
        if (!Number(totals.completed_posts || 0)) return '첫 글을 완성하면 나의 성장 기록이 여기에서 시작돼요.';
        if (Number(totals.current_streak || 0) >= 3) return `${num(totals.current_streak)}일 연속으로 쓰고 있어요. 멋진 습관을 이어 가 보세요!`;
        if (Number(learning.revision_submissions || 0) > 0) return '선생님 의견을 보고 다시 고친 글도 소중한 성장 발자국이에요.';
        if (Number(recent.posts || 0) > 0) return `최근 30일 동안 ${num(recent.posts)}편을 완성했어요. 다음 글도 천천히 이어 가 보세요.`;
        return '지금까지 쓴 글은 그대로 남아 있어요. 새 글 한 편으로 다시 발자국을 이어 가 보세요.';
    })();

    return <>
        <div style={{
            marginTop: '18px', padding: '14px 16px', borderRadius: '18px',
            background: 'linear-gradient(135deg, #EDF6FF 0%, #FFF8E7 100%)',
            border: '1px solid rgba(42,120,214,.15)', color: '#3E2E23',
            fontSize: '.86rem', fontWeight: 800, lineHeight: 1.55
        }}>🌱 {growthMessage}</div>

        <Section title="내 성장 한눈에" hint="완성한 글을 기준으로 모았어요.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px' }}>
                <StatTile icon="📝" label="완성한 글" value={num(totals.completed_posts)} unit="편" />
                <StatTile icon="✍️" label="쓴 글자 수" value={num(totals.total_chars)} unit="자" />
                <StatTile icon="🗓️" label="글 쓴 날" value={num(totals.active_days)} unit="일" />
                <StatTile icon="🔥" label="지금 연속 기록" value={num(totals.current_streak)} unit="일" />
            </div>
        </Section>

        <Section title="📚 어떤 글을 썼나" hint="과제와 내가 골라 쓴 글을 나누어 보여 줘요.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px' }}>
                <StatTile icon="📋" label="선생님 과제" value={num(writingTypes.assignment_posts)} unit="편" />
                <StatTile icon="📖" label="독서록" value={num(writingTypes.reading_logs)} unit="편" />
                <StatTile icon="📔" label="일기" value={num(writingTypes.diaries)} unit="편" />
                <StatTile icon="💡" label="그 밖의 내 글" value={num(writingTypes.other_self_posts)} unit="편" />
            </div>
        </Section>

        <Section title="🌿 배우며 고친 기록" hint="이번 학년도에 선생님과 함께 글을 다듬은 횟수예요.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '9px' }}>
                <StatTile icon="💬" label="받은 의견" value={num(learning.feedbacks_received)} unit="회" />
                <StatTile icon="↩️" label="다시쓰기 요청" value={num(learning.rewrite_requests)} unit="회" />
                <StatTile icon="✨" label="고쳐서 제출" value={num(learning.revision_submissions)} unit="회" />
            </div>
        </Section>

        <Section title="📈 최근 30일" hint={recentChangeText}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px' }}>
                <StatTile icon="✅" label="완성한 글" value={num(recent.posts)} unit="편" />
                <StatTile icon="📏" label="한 편 평균" value={num(recent.avg_chars)} unit="자" />
            </div>
        </Section>

        <Section title="🏅 나의 글쓰기 기록">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px' }}>
                <StatTile icon="📅" label="이번 달 글" value={num(totals.monthly_posts)} unit="편" />
                <StatTile icon="🏆" label="가장 긴 글" value={num(totals.longest_post_chars)} unit="자" />
                <StatTile icon="🔥" label="최고 연속 기록" value={num(totals.best_streak)} unit="일" />
                <StatTile icon="📐" label="한 편 평균" value={num(averageChars)} unit="자" />
            </div>
        </Section>

        <Section title="🔥 글쓰기 달력" hint="이번 학년도(3월~1월) · 많이 쓴 날일수록 진해져요.">
            <WritingCalendar daily={detail.daily || []} schoolYear={detail.school_year} />
        </Section>
        <Section title="📈 달마다 쓴 글"><MonthlyBars rows={months} valueKey="posts" unit="편" /></Section>
        <Section title="✍️ 글이 길어지고 있어요" hint="달마다 글 한 편의 평균 글자 수예요.">
            <TrendLine rows={months} valueKey="avg_chars" unit="자" />
        </Section>
        <Section title="💰 포인트가 쌓인 길" hint="활동으로 모은 포인트와 직접 사용한 포인트를 나누어 봐요.">
            <TrendLine rows={cumulativePoints} valueKey="total" unit="P" />
            <div style={{ display: 'flex', gap: '9px', marginTop: '12px' }}>
                <StatTile icon="➕" label="활동으로 모음" value={num(totals.activity_points_earned)} unit="P" />
                <StatTile icon="➖" label="직접 쓴 포인트" value={num(spending.total_used)} unit="P" />
            </div>
            {(Number(totals.starting_bonus_points || 0) > 0 || Number(totals.teacher_adjustment_points || 0) !== 0) && <p style={{ margin: '9px 2px 0', fontSize: '.74rem', color: '#8D7B6C' }}>
                시작 보너스 +{num(totals.starting_bonus_points)}P · 선생님 조정 {signedPoints(totals.teacher_adjustment_points)}
            </p>}
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
