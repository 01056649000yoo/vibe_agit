import React, { useEffect } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import {
    HEAT, INK_SOFT, MonthlyBars, num, PointTypeBars, StatTile, TrendLine, WritingCalendar
} from './FootprintVisuals';

const VIEW_META = {
    calendar: {
        title: '🔥 학급 글쓰기 달력',
        hint: '학급 전체가 글을 쓴 날을 합쳐 활동이 많았던 날을 진하게 표시합니다.'
    },
    monthly_posts: {
        title: '📈 달마다 완료한 글',
        hint: '승인된 과제와 제출 완료한 독서록을 기준으로 월별 학급 활동량을 봅니다.'
    },
    average_chars: {
        title: '✍️ 글 길이 변화',
        hint: '월별로 글 한 편의 평균 글자 수가 어떻게 달라졌는지 봅니다.'
    },
    point_flow: {
        title: '💰 학급 포인트 흐름',
        hint: '학급에서 모은 포인트에서 사용·조정된 포인트를 뺀 누적 흐름입니다.'
    },
    point_sources: {
        title: '🎁 포인트 획득처',
        hint: '이번 학년도에 학급이 어떤 활동으로 포인트를 모았는지 보여줍니다.'
    },
    point_spending: {
        title: '🛍️ 포인트 사용처',
        hint: '학생이 직접 선택해 사용한 포인트를 활동 종류별로 보여줍니다.'
    }
};

const ExpandedChartFrame = ({ children }) => <div style={{
    width: '100%', height: 'clamp(260px,48dvh,460px)', minHeight: 0, display: 'flex',
    padding: '16px', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: '18px', background: '#FFFFFF'
}}>{children}</div>;

const HeatLegend = () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '14px', color: INK_SOFT, fontSize: '.82rem', fontWeight: 800 }}>
    <span>적게</span>
    {HEAT.map((color) => <span key={color} style={{ width: '13px', height: '13px', borderRadius: '3px', background: color }} />)}
    <span>많이</span>
</div>;

const ChartContent = ({ view, detail, totals, months, cumulativePoints }) => {
    if (view === 'calendar') return <>
        <ExpandedChartFrame><WritingCalendar compact fluid daily={detail.daily || []} schoolYear={detail.school_year} /></ExpandedChartFrame>
        <HeatLegend />
    </>;
    if (view === 'monthly_posts') return <ExpandedChartFrame><MonthlyBars compact fluid rows={months} valueKey="posts" unit="편" /></ExpandedChartFrame>;
    if (view === 'average_chars') return <ExpandedChartFrame><TrendLine compact fluid rows={months} valueKey="avg_chars" unit="자" /></ExpandedChartFrame>;
    if (view === 'point_flow') return <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px', marginBottom: '12px' }}>
            <StatTile icon="➕" label="모은 포인트" value={num(totals.points_earned)} unit="P" accent="#047857" />
            <StatTile icon="➖" label="직접 사용" value={num(totals.points_used)} unit="P" accent="#B45309" />
        </div>
        <ExpandedChartFrame><TrendLine compact fluid rows={cumulativePoints} valueKey="total" unit="P" /></ExpandedChartFrame>
    </>;
    if (view === 'point_sources') return <div style={{ padding: '20px', border: '1px solid #E2E8F0', borderRadius: '18px', background: '#FFFFFF' }}>
        <PointTypeBars rows={detail.points_by_type || []} emptyMessage="아직 모은 포인트가 없습니다." />
    </div>;
    if (view === 'point_spending') return <div style={{ padding: '20px', border: '1px solid #E2E8F0', borderRadius: '18px', background: '#FFFFFF' }}>
        <PointTypeBars rows={detail.spending_by_type || []} emptyMessage="아직 사용한 포인트가 없습니다." color="#F59E0B" />
    </div>;
    return null;
};

const FootprintChartDetailModal = ({ view, onClose, container, detail, totals, months, cumulativePoints }) => {
    useEffect(() => {
        if (!view) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [view, onClose]);

    const meta = Reflect.get(VIEW_META, view);
    if (!meta) return null;

    return <ModalPortal container={container}>
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 26000, display: 'grid', placeItems: 'center', padding: '18px',
            background: 'rgba(15,23,42,.62)', backdropFilter: 'blur(7px)'
        }}>
            <section role="dialog" aria-modal="true" aria-labelledby="footprint-chart-modal-title" onClick={(event) => event.stopPropagation()} style={{
                width: 'min(980px,100%)', maxHeight: '90dvh', overflowY: 'auto', borderRadius: '24px',
                background: '#F8FAFC', boxShadow: '0 28px 80px rgba(15,23,42,.34)'
            }}>
                <header style={{
                    position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                    padding: '20px 22px', color: 'white', background: 'linear-gradient(135deg,#1D4ED8,#0EA5E9)', boxShadow: '0 4px 14px rgba(15,23,42,.12)'
                }}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ margin: '0 0 3px', fontSize: '.76rem', fontWeight: 800, opacity: .82 }}>학급 글쓰기 발자국 크게 보기</p>
                        <h2 id="footprint-chart-modal-title" style={{ margin: 0, fontSize: 'clamp(1.2rem,2.4vw,1.65rem)', fontWeight: 950 }}>{meta.title}</h2>
                        <p style={{ margin: '5px 0 0', fontSize: '.8rem', fontWeight: 750, lineHeight: 1.45, opacity: .9 }}>{meta.hint}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label={`${meta.title} 크게 보기 닫기`} style={{
                        flexShrink: 0, width: '40px', height: '40px', border: '1px solid rgba(255,255,255,.55)', borderRadius: '50%',
                        display: 'grid', placeItems: 'center', padding: 0, lineHeight: 1,
                        color: 'white', background: 'rgba(255,255,255,.16)', cursor: 'pointer'
                    }}>
                        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M5 5L19 19M19 5L5 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                    </button>
                </header>
                <div style={{ padding: '20px 22px 24px' }}>
                    <ChartContent view={view} detail={detail} totals={totals} months={months} cumulativePoints={cumulativePoints} />
                </div>
            </section>
        </div>
    </ModalPortal>;
};

export default FootprintChartDetailModal;
