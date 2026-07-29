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
            <div style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '1.8rem', color: '#2C3E50', margin: '0 0 8px 0', fontWeight: '900' }}>🎢 아지트 놀이터 관리</h1>
                <p style={{ color: '#7F8C8D', margin: 0 }}>각 카드에서 학생 화면 노출과 세부 설정을 함께 관리합니다.</p>
            </div>
            <RegisteredGameModuleCards activeClass={activeClass} isMobile={isMobile} />
        </div>
    );
};

export default GameManager;
