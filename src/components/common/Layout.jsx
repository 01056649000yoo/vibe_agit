import React from 'react';

/**
 * Layout 공통 컴포넌트 (따뜻한 파스텔 배경)
 */
const Layout = ({ children, fullHeight = true }) => {
    const layoutStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: fullHeight ? 'center' : 'flex-start',
        minHeight: '100vh',
        padding: '2rem',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)', // 부드러운 그라데이션
    };

    return (
        <div className="layout-overlay" style={{ background: 'var(--bg-primary)', width: '100%' }}>
            <div className="layout-container" style={layoutStyle}>
                {children}
            </div>
        </div>
    );
};

export default Layout;
