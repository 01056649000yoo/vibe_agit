import React from 'react';
import CenteredDialog from '../../../components/common/CenteredDialog';
import { num } from './FootprintVisuals';

const formatDate = (value) => value
    ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
    : '아직 작성한 글이 없습니다.';

const DetailCard = ({ icon, title, value, description, accent = 'var(--ui-primary-hover)', children }) => <section style={{
    minWidth: 0, padding: 'var(--ui-space-4)', border: '1px solid var(--ui-border)',
    borderRadius: 'var(--ui-radius-lg)', background: 'var(--ui-surface)'
}}>
    <div style={{ color: 'var(--ui-ink-muted)', fontSize: '.78rem', fontWeight: 850 }}>{icon} {title}</div>
    <strong style={{ display: 'block', marginTop: '6px', color: accent, fontSize: '1.35rem', lineHeight: 1.15 }}>{value}</strong>
    {description && <p style={{ margin: '5px 0 0', color: 'var(--ui-ink-muted)', fontSize: '.78rem', fontWeight: 700, lineHeight: 1.45 }}>{description}</p>}
    {children}
</section>;

const Breakdown = ({ children }) => <div style={{
    display: 'grid', gap: '5px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--ui-surface-muted)',
    color: 'var(--ui-ink-muted)', fontSize: '.76rem', fontWeight: 750
}}>
    {children}
</div>;

const StudentFootprintDetailModal = ({ student, onClose, container }) => {
    if (!student) return null;

    const interactionsGiven = Number(student.comments_given || 0) + Number(student.reactions_given || 0);
    const interactionsReceived = Number(student.comments_received || 0) + Number(student.reactions_received || 0);
    const change = student.avg_chars_change;
    const changeLabel = change == null
        ? '비교할 이전 기간 자료가 없습니다.'
        : `직전 30일보다 평균 ${Number(change) > 0 ? '+' : ''}${num(change)}자`;
    return <CenteredDialog
        onClose={onClose}
        container={container}
        eyebrow="학생 글쓰기 발자국"
        title={`👣 ${student.name}`}
        description={`최근 글 · ${formatDate(student.last_post_at)}`}
        maxWidth="880px"
        maxHeight="88dvh"
        closeLabel="학생 발자국 상세 닫기"
    >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '12px' }}>
            <DetailCard icon="📝" title="글 활동" value={`${num(student.posts)}편`} description={`전체 ${num(student.total_chars)}자 · 한 편 평균 ${num(student.avg_chars)}자`}>
                <Breakdown>
                    <span>선생님 과제 <strong>{num(student.assignment_posts)}편</strong></span>
                    <span>독서록 <strong>{num(student.reading_logs)}편</strong></span>
                    <span>일기 <strong>{num(student.diaries)}편</strong></span>
                </Breakdown>
            </DetailCard>

            <DetailCard icon="🔥" title="꾸준함" value={`${num(student.active_days)}일 활동`} description={`현재 ${num(student.current_streak)}일 연속 · 최고 ${num(student.best_streak)}일 연속`} accent="var(--ui-warning)" />

            <DetailCard icon="✍️" title="학습 횟수" value={`다시쓰기 요청 ${num(student.rewrite_requests)}회`} description={`수정 제출 ${num(student.revision_submissions)}회 · 활동 기록 기능 적용 이후`} accent="#7C3AED" />

            <DetailCard icon="💬" title="친구 교류" value={`남김 ${num(interactionsGiven)} · 받음 ${num(interactionsReceived)}`} accent="#047857">
                <Breakdown>
                    <span>댓글 · 남김 <strong>{num(student.comments_given)}</strong> / 받음 <strong>{num(student.comments_received)}</strong></span>
                    <span>반응 · 남김 <strong>{num(student.reactions_given)}</strong> / 받음 <strong>{num(student.reactions_received)}</strong></span>
                </Breakdown>
            </DetailCard>

            <DetailCard icon="💰" title="포인트" value={`+${num(student.points_earned)}P`} description={`직접 사용 ${num(student.points_used)}P`} accent="#C77712" />

            <DetailCard icon="📈" title="최근 30일" value={`${num(student.recent_30_posts)}편`} description={changeLabel} accent={change == null || Number(change) >= 0 ? '#047857' : 'var(--ui-warning)'}>
                <Breakdown>
                    <span>최근 한 편 평균 <strong>{student.recent_30_posts ? `${num(student.recent_30_avg_chars)}자` : '아직 없음'}</strong></span>
                </Breakdown>
            </DetailCard>
        </div>
    </CenteredDialog>;
};

export default StudentFootprintDetailModal;
