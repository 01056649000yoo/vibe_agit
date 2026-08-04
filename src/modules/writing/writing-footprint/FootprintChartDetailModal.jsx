import React from 'react';
import CenteredDialog from '../../../components/common/CenteredDialog';
import FootprintCardContent from './FootprintCardContent';

const FootprintChartDetailModal = ({ card, onClose, container, context }) => {
    if (!card) return null;
    const modalHint = card.modalHint || card.hint;

    return <CenteredDialog
        onClose={onClose}
        container={container}
        eyebrow="학급 글쓰기 발자국 크게 보기"
        title={card.title}
        description={modalHint}
        maxWidth="980px"
        closeLabel={`${card.title} 크게 보기 닫기`}
    >
        <FootprintCardContent card={card} context={context} expanded />
    </CenteredDialog>;
};

export default FootprintChartDetailModal;
