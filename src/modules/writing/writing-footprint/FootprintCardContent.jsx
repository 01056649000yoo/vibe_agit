import React from 'react';
import { getDashboardValue } from '../../dashboard/cardRegistry';
import {
    HEAT, INK_SOFT, MonthlyBars, num, PointTypeBars, StatTile, TrendLine, WritingCalendar
} from './FootprintVisuals';

const ExpandedChartFrame = ({ children }) => <div style={{
    width: '100%', height: 'clamp(260px,48dvh,460px)', minHeight: 0, display: 'flex',
    padding: '16px', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: '18px', background: '#FFFFFF'
}}>{children}</div>;

const HeatLegend = () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '14px', color: INK_SOFT, fontSize: '.82rem', fontWeight: 800 }}>
    <span>적게</span>
    {HEAT.map((color) => <span key={color} style={{ width: '13px', height: '13px', borderRadius: '3px', background: color }} />)}
    <span>많이</span>
</div>;

const maybeFrame = (content, expanded) => expanded
    ? <ExpandedChartFrame>{content}</ExpandedChartFrame>
    : content;

const PointFlowStats = ({ earned, used, compact, expanded }) => {
    if (compact && !expanded) return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '-8px', fontSize: 'var(--footprint-fs-xs, .58rem)', fontWeight: 900, color: '#64748B' }}>
        <span>+ {num(earned)}P</span><span>- {num(used)}P</span>
    </div>;

    return <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: expanded ? '10px' : '9px',
        marginTop: expanded ? 0 : '8px', marginBottom: expanded ? '12px' : 0
    }}>
        <StatTile icon="➕" label="모은 포인트" value={num(earned)} unit="P" accent={expanded ? '#047857' : undefined} />
        <StatTile icon="➖" label="직접 사용" value={num(used)} unit="P" accent={expanded ? '#B45309' : undefined} />
    </div>;
};

/** 기본 카드와 확대 모달이 공유하는 단일 시각화 렌더러. */
const FootprintCardContent = ({ card, context, compact = false, expanded = false }) => {
    const rows = getDashboardValue(context, card.rowsPath, []);

    if (card.renderer === 'calendar') {
        const calendar = <WritingCalendar
            compact={compact || expanded}
            fluid={compact || expanded}
            daily={rows}
            schoolYear={getDashboardValue(context, card.schoolYearPath)}
        />;
        return <>
            {maybeFrame(calendar, expanded)}
            {expanded && <HeatLegend />}
        </>;
    }

    if (card.renderer === 'monthly-bars') {
        return maybeFrame(<MonthlyBars
            compact={compact || expanded}
            fluid={compact || expanded}
            rows={rows}
            valueKey={card.valueKey}
            unit={card.unit}
        />, expanded);
    }

    if (card.renderer === 'trend-line') {
        return maybeFrame(<TrendLine
            compact={compact || expanded}
            fluid={compact || expanded}
            rows={rows}
            valueKey={card.valueKey}
            unit={card.unit}
        />, expanded);
    }

    if (card.renderer === 'point-flow') {
        const earned = getDashboardValue(context, card.earnedPath, 0);
        const used = getDashboardValue(context, card.usedPath, 0);
        const chart = <TrendLine
            compact={compact || expanded}
            fluid={compact || expanded}
            rows={rows}
            valueKey={card.valueKey}
            unit={card.unit}
        />;
        return expanded ? <>
            <PointFlowStats earned={earned} used={used} compact={compact} expanded />
            {maybeFrame(chart, true)}
        </> : <>
            {chart}
            <PointFlowStats earned={earned} used={used} compact={compact} />
        </>;
    }

    if (card.renderer === 'point-types') {
        const content = <PointTypeBars
            compact={compact && !expanded}
            rows={rows}
            emptyMessage={card.emptyMessage}
            color={card.color}
        />;
        return expanded
            ? <div style={{ padding: '20px', border: '1px solid #E2E8F0', borderRadius: '18px', background: '#FFFFFF' }}>{content}</div>
            : content;
    }

    return null;
};

export default FootprintCardContent;

