import React, { useEffect } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import { num } from './FootprintVisuals';

const formatDate = (value) => value
    ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
    : '아직 작성한 글이 없습니다.';

const DetailCard = ({ icon, title, value, description, accent = '#1D4ED8', children }) => <section style={{
    minWidth: 0, padding: '16px', border: '1px solid #E2E8F0', borderRadius: '16px', background: '#FFFFFF'
}}>
    <div style={{ color: '#64748B', fontSize: '.78rem', fontWeight: 850 }}>{icon} {title}</div>
    <strong style={{ display: 'block', marginTop: '6px', color: accent, fontSize: '1.35rem', lineHeight: 1.15 }}>{value}</strong>
    {description && <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '.78rem', fontWeight: 700, lineHeight: 1.45 }}>{description}</p>}
    {children}
</section>;

const Breakdown = ({ children }) => <div style={{ display: 'grid', gap: '5px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #F1F5F9', color: '#475569', fontSize: '.76rem', fontWeight: 750 }}>
    {children}
</div>;

const StudentFootprintDetailModal = ({ student, onClose, container }) => {
    useEffect(() => {
        if (!student) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [student, onClose]);

    if (!student) return null;

    const interactionsGiven = Number(student.comments_given || 0) + Number(student.reactions_given || 0);
    const interactionsReceived = Number(student.comments_received || 0) + Number(student.reactions_received || 0);
    const change = student.avg_chars_change;
    const changeLabel = change == null
        ? '비교할 이전 기간 자료가 없습니다.'
        : `직전 30일보다 평균 ${Number(change) > 0 ? '+' : ''}${num(change)}자`;
    const titleId = `student-footprint-title-${student.student_id}`;

    return <ModalPortal container={container}>
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 26000, display: 'grid', placeItems: 'center', padding: '18px',
            background: 'rgba(15,23,42,.62)', backdropFilter: 'blur(7px)'
        }}>
            <section role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()} style={{
                width: 'min(880px,100%)', maxHeight: '88dvh', overflowY: 'auto', borderRadius: '24px',
                background: '#F8FAFC', boxShadow: '0 28px 80px rgba(15,23,42,.34)'
            }}>
                <header style={{
                    position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                    padding: '20px 22px', color: 'white', background: 'linear-gradient(135deg,#1D4ED8,#0EA5E9)', boxShadow: '0 4px 14px rgba(15,23,42,.12)'
                }}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ margin: '0 0 3px', fontSize: '.76rem', fontWeight: 800, opacity: .82 }}>학생 글쓰기 발자국</p>
                        <h2 id={titleId} style={{ margin: 0, fontSize: 'clamp(1.25rem,2.4vw,1.75rem)', fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👣 {student.name}</h2>
                        <p style={{ margin: '5px 0 0', fontSize: '.78rem', fontWeight: 750, opacity: .88 }}>최근 글 · {formatDate(student.last_post_at)}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="학생 발자국 상세 닫기" style={{
                        flexShrink: 0, width: '40px', height: '40px', border: '1px solid rgba(255,255,255,.55)', borderRadius: '50%',
                        color: 'white', background: 'rgba(255,255,255,.16)', fontSize: '1.25rem', fontWeight: 900, cursor: 'pointer'
                    }}>✕</button>
                </header>

                <div style={{ padding: '20px 22px 24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '12px' }}>
                        <DetailCard icon="📝" title="글 활동" value={`${num(student.posts)}편`} description={`전체 ${num(student.total_chars)}자 · 한 편 평균 ${num(student.avg_chars)}자`}>
                            <Breakdown>
                                <span>선생님 과제 <strong>{num(student.assignment_posts)}편</strong></span>
                                <span>독서록 <strong>{num(student.reading_logs)}편</strong></span>
                            </Breakdown>
                        </DetailCard>

                        <DetailCard icon="🔥" title="꾸준함" value={`${num(student.active_days)}일 활동`} description={`현재 ${num(student.current_streak)}일 연속 · 최고 ${num(student.best_streak)}일 연속`} accent="#B45309" />

                        <DetailCard icon="✍️" title="다듬기" value={`${num(student.revisions)}회`} description={`받은 피드백 ${num(student.feedbacks_received)}회 · 활동 기록 기능 적용 이후`} accent="#7C3AED" />

                        <DetailCard icon="💬" title="친구 교류" value={`남김 ${num(interactionsGiven)} · 받음 ${num(interactionsReceived)}`} accent="#047857">
                            <Breakdown>
                                <span>댓글 · 남김 <strong>{num(student.comments_given)}</strong> / 받음 <strong>{num(student.comments_received)}</strong></span>
                                <span>반응 · 남김 <strong>{num(student.reactions_given)}</strong> / 받음 <strong>{num(student.reactions_received)}</strong></span>
                            </Breakdown>
                        </DetailCard>

                        <DetailCard icon="💰" title="포인트" value={`+${num(student.points_earned)}P`} description={`직접 사용 ${num(student.points_used)}P`} accent="#C77712" />

                        <DetailCard icon="📈" title="최근 30일" value={`${num(student.recent_30_posts)}편`} description={changeLabel} accent={change == null || Number(change) >= 0 ? '#047857' : '#B45309'}>
                            <Breakdown>
                                <span>최근 한 편 평균 <strong>{student.recent_30_posts ? `${num(student.recent_30_avg_chars)}자` : '아직 없음'}</strong></span>
                            </Breakdown>
                        </DetailCard>
                    </div>
                </div>
            </section>
        </div>
    </ModalPortal>;
};

export default StudentFootprintDetailModal;
