import React from 'react';
import RegisteredGameModuleCards from '../../modules/game/teacher/RegisteredGameModuleCards';

/**
 * 아지트 놀이터 교사 관리 셸.
 *
 * manifest.teacherEntry를 등록한 게임은 같은 카드 그리드에 자동으로 추가된다.
 */
const GameManager = ({ activeClass, isMobile, navigationTarget, onNavigationHandled }) => {
    if (!activeClass) return <div style={{ padding: '60px', textAlign: 'center', color: '#7F8C8D' }}>학급을 먼저 선택해주세요.</div>;

    return (
        <div style={{ width: '100%', padding: isMobile ? '10px' : '0', boxSizing: 'border-box' }}>
            <RegisteredGameModuleCards
                activeClass={activeClass}
                isMobile={isMobile}
                navigationTarget={navigationTarget}
                onNavigationHandled={onNavigationHandled}
            />
        </div>
    );
};

export default GameManager;
