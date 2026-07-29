import React from 'react';
import LegacyGameManager from '../legacy/LegacyGameManager';

const VocabularyTowerTeacherManager = ({ activeClass, isMobile }) => (
    <LegacyGameManager
        activeClass={activeClass}
        isMobile={isMobile}
        moduleFilter="vocab-tower"
        embedded
        detailOnly
    />
);

export default VocabularyTowerTeacherManager;
