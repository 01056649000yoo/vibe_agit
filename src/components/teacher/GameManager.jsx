import React from 'react';
import RegisteredGameModuleCards from '../../modules/game/teacher/RegisteredGameModuleCards';

/**
 * 포인트·놀이 교사 관리 셸.
 *
 * manifest.teacherEntry를 등록한 게임은 같은 카드 그리드에 자동으로 추가된다.
 */
const GameManager = ({ activeClass, isMobile }) => {
    if (!activeClass) return <div style={{ padding: '60px', textAlign: 'center', color: '#7F8C8D' }}>학급을 먼저 선택해주세요.</div>;

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '10px' : '0' }}>
            <RegisteredGameModuleCards activeClass={activeClass} isMobile={isMobile} />
        </div>
    );
};

export default GameManager;
