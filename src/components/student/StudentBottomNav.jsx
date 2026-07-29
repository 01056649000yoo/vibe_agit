import React from 'react';
import { motion } from 'framer-motion';

/**
 * 역할: 모바일 환경에서 학생들의 빠른 메뉴 이동을 돕는 하단 탭바 📱
 * 특징: 768px 미만에서만 표시됨
 */
const StudentBottomNav = ({ activeTab, onNavigate, onOpenPlayground }) => {
    // 이름·아이콘은 홈 카드(DashboardMenu)와 **똑같이** 맞춘다.
    // 같은 곳인데 아래는 "과제", 홈에서는 "선생님 과제"로 부르면 학생이 다른 곳으로 안다.
    const tabs = [
        { id: 'main', label: '홈', icon: '🏠', target: 'main' },
        { id: 'mission_list', label: '과제', icon: '📝', target: 'mission_list' },
        { id: 'reading_logs', label: '독서록', icon: '📚', target: 'reading_logs' },
        { id: 'friends_hideout', label: '친구들', icon: '👀', target: 'friends_hideout' },
        // 놀이터는 홈에서 펼쳐지는 구역이라 페이지 이동이 아니다. 눌리면 홈으로 간 뒤 펼친다.
        { id: 'playground', label: '놀이터', icon: '🎮', target: 'playground' }
    ];

    return (
        <>
            {/* Nav Bar UI */}
            <div className="bottom-nav-container">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id || (activeTab === 'writing' && tab.id === 'mission_list'); // writing 상태일 때도 글쓰기 탭 활성

                    return (
                        <motion.button
                            key={tab.id}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                if (tab.target === 'playground') {
                                    onNavigate('main');
                                    onOpenPlayground?.();
                                    return;
                                }
                                onNavigate(tab.target);
                            }}
                            className={`nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{tab.icon}</span>
                            <span className="nav-label">{tab.label}</span>
                            {isActive && (
                                <motion.div
                                    layoutId="nav-indicator"
                                    className="nav-indicator"
                                />
                            )}
                        </motion.button>
                    );
                })}
            </div>

            {/* CSS 스타일 (Scoped) */}
            <style>{`
                .bottom-nav-container {
                    display: none; /* 기본 숨김 (PC) */
                }

                @media (max-width: 1024px) {
                    .bottom-nav-container {
                        display: flex;
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        /* height: 65px; fixed height removed for safety */
                        background: rgba(255, 255, 255, 0.95);
                        backdrop-filter: blur(10px);
                        border-top: 1px solid rgba(0,0,0,0.05);
                        box-shadow: 0 -5px 20px rgba(0,0,0,0.03);
                        z-index: 9999;
                        justify-content: space-around;
                        align-items: center;
                        
                        /* Dynamic height handling */
                        padding-top: 12px;
                        padding-bottom: calc(12px + env(safe-area-inset-bottom));
                        box-sizing: border-box; 
                    }

                    .nav-item {
                        flex: 1;
                        height: 100%;
                        background: none;
                        border: none;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 4px;
                        cursor: pointer;
                        position: relative;
                        color: #90A4AE;
                        transition: color 0.3s;
                    }

                    .nav-item.active {
                        color: #2980B9;
                    }

                    .nav-icon {
                        font-size: 1.5rem;
                        line-height: 1;
                    }

                    .nav-label {
                        font-size: 0.7rem;
                        font-weight: 700;
                    }

                    .nav-indicator {
                        position: absolute;
                        top: 0;
                        width: 40px;
                        height: 4px;
                        background: #3498DB;
                        border-radius: 0 0 4px 4px;
                    }
                }
            `}</style>
        </>
    );
};

export default StudentBottomNav;
