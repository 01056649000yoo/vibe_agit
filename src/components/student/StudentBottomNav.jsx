import React from 'react';
import { motion } from 'framer-motion';
import { STUDENT_BOTTOM_NAV_TABS } from './studentNavigation';

/**
 * 역할: 모바일 환경에서 학생들의 빠른 메뉴 이동을 돕는 하단 탭바 📱
 * 특징: 태블릿을 포함한 1024px 이하에서만 표시됨
 */
const StudentBottomNav = ({ activeTab, onNavigate }) => {
    return (
        <>
            {/* Nav Bar UI */}
            <div className="bottom-nav-container">
                {STUDENT_BOTTOM_NAV_TABS.map((tab) => {
                    const isActive = activeTab === tab.id;

                    return (
                        <motion.button
                            key={tab.id}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onNavigate(tab.id)}
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
                        /* 6칸이라 라벨이 좁다. 줄바꿈 없이 한 줄에 들어가도록 줄인다. */
                        font-size: 0.62rem;
                        font-weight: 700;
                        white-space: nowrap;
                    }

                    .nav-icon { font-size: 1.35rem; }

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
