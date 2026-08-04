import React from 'react';

/** 등록된 카드의 섹션·표시 화면·조건을 공통으로 판정한 뒤 렌더러에 넘긴다. */
const DashboardCardHost = ({ cards, context, section, surface = 'default', renderCard }) => {
    const visibleCards = (cards || []).filter((card) => {
        if (section && card.section !== section) return false;
        if (Array.isArray(card.surfaces) && !card.surfaces.includes(surface)) return false;
        return typeof card.isVisible !== 'function' || card.isVisible(context);
    });

    return visibleCards.map((card) => (
        <React.Fragment key={`${card.sourceModuleId || 'core'}:${card.id}`}>
            {renderCard(card, context)}
        </React.Fragment>
    ));
};

export default DashboardCardHost;

