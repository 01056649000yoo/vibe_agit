import React from 'react';

/**
 * Layout 공통 컴포넌트 (따뜻한 파스텔 배경)
 */
const Layout = ({ children, fullHeight = true, full = false }) => {
    const layoutStyle = full ? {
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        background: '#F8F9FA',
        overflowY: 'auto'
    } : {
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
        background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
    };

    return (
        <div className="layout-overlay" style={{ background: full ? '#F8F9FA' : 'var(--bg-primary)', width: '100%' }}>
            <div className="layout-container" style={layoutStyle}>
                {children}
            </div>
        </div>
    );
};

export default Layout;
