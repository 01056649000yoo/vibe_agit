import React from 'react';
import LegacyGameManager from '../../modules/game/legacy/LegacyGameManager';
import RegisteredGameModuleCards from '../../modules/game/teacher/RegisteredGameModuleCards';

/**
 * 포인트·놀이 교사 관리 셸.
 *
 * 드래곤·어휘의 탑은 기존 DB 계약을 보존하는 legacy 어댑터 안에서 동작한다.
 * 새 게임은 manifest.teacherEntry만 등록하면 같은 카드 그리드에 자동으로 추가된다.
 */
const GameManager = ({ activeClass, isMobile }) => (
    <LegacyGameManager
        activeClass={activeClass}
        isMobile={isMobile}
        renderAdditionalModules={(controls) => (
            <RegisteredGameModuleCards
                activeClass={activeClass}
                isMobile={isMobile}
                {...controls}
            />
        )}
    />
);

export default GameManager;
