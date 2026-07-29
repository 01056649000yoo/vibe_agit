import React from 'react';
import LegacyGameManager from '../legacy/LegacyGameManager';

const DragonTeacherManager = ({ activeClass, isMobile }) => (
    <LegacyGameManager
        activeClass={activeClass}
        isMobile={isMobile}
        moduleFilter="dragon"
        embedded
        detailOnly
    />
);

export default DragonTeacherManager;
