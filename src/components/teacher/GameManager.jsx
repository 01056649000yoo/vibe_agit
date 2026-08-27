import React from 'react';
import RegisteredGameModuleCards from '../../modules/game/teacher/RegisteredGameModuleCards';
import TeacherGuideButton from './TeacherGuideButton';

/**
 * 아지트 놀이터 교사 관리 셸.
 *
 * manifest.teacherEntry를 등록한 게임은 같은 카드 그리드에 자동으로 추가된다.
 */
const GameManager = ({ activeClass, isMobile, navigationTarget, onNavigationHandled }) => {
    if (!activeClass) return <div style={{ padding: '60px', textAlign: 'center', color: '#7F8C8D' }}>학급을 먼저 선택해주세요.</div>;

    return (
        <div style={{ width: '100%', padding: isMobile ? '10px' : '0', boxSizing: 'border-box' }}>
            {/* 이 화면은 메뉴가 하나뿐이라 공용 탭 머리말이 그려지지 않는다. 도움말은 여기서 연다. */}
            <div className="teacher-tab-heading">
                <h2>🎡 아지트 놀이터</h2>
                <TeacherGuideButton tabId="playground" variant="help" />
            </div>
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
