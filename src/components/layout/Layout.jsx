import React, { useState } from 'react';
import TermsOfService from './TermsOfService';
import PrivacyPolicy from './PrivacyPolicy';
import Modal from '../common/Modal';

/**
 * Layout 공통 컴포넌트 (따뜻한 파스텔 배경 및 하단 푸터 포함) ✨
 */
const Layout = ({ children, fullHeight = true, full = false }) => {
    const [modalContent, setModalContent] = useState(null); // 'terms' | 'privacy' | null

    const layoutStyle = full ? {
        width: '100%',
        minHeight: 'calc(100vh - 120px)', // 푸터 공간 확보
        boxSizing: 'border-box',
        background: '#F8F9FA',
    } : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: fullHeight ? 'center' : 'flex-start',
        minHeight: 'calc(100vh - 120px)',
        padding: '2rem',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
    };



    return (
        <div className="layout-overlay" style={{
            background: full ? '#F8F9FA' : 'var(--bg-primary)',
            width: '100%',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div className="layout-container" style={layoutStyle}>
                {children}
            </div>

            {/* 푸터 섹션 */}
            <footer style={{
                padding: '40px 24px',
                textAlign: 'center',
                background: full ? '#F8F9FA' : 'white',
                borderTop: '1px solid #ECEFF1',
                marginTop: 'auto'
            }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* 1열: 서비스 주요 링크 및 상호명 */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '24px',
                        flexWrap: 'wrap'
                    }}>
                        <button
                            onClick={() => setModalContent('terms')}
                            style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'none', fontSize: '1rem', color: '#37474F', cursor: 'pointer', fontWeight: '900' }}
                        >
                            이용약관
                        </button>
                        <span style={{ color: '#CFD8DC' }}>|</span>
                        <button
                            onClick={() => setModalContent('privacy')}
                            style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'none', fontSize: '1rem', color: '#37474F', cursor: 'pointer', fontWeight: '900' }}
                        >
                            개인정보 처리방침
                        </button>
                        <span style={{ color: '#CFD8DC' }}>|</span>
                        <span style={{ fontSize: '1rem', color: '#37474F', fontWeight: '900' }}>
                            상호명: 끄적끄적 아지트
                        </span>
                    </div>

                    {/* 2열: 운영자 정보 및 고객 문의 */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '20px',
                        flexWrap: 'wrap',
                        fontSize: '0.95rem',
                        color: '#607D8B'
                    }}>
                        <span><strong style={{ color: '#455A64' }}>운영책임자:</strong> 유쌤</span>
                        <span style={{ color: '#ECEFF1' }}>•</span>
                        <span><strong style={{ color: '#455A64' }}>문의:</strong> yshgg@naver.com</span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#B0BEC5', marginTop: '4px' }}>
                        © 2026 끄적끄적 아지트. All rights reserved.
                    </div>
                </div>
            </footer>

            {/* 약관/개인정보 모달 */}
            <Modal
                isOpen={!!modalContent}
                onClose={() => setModalContent(null)}
                title={modalContent === 'terms' ? '서비스 이용약관 📜' : '개인정보 처리방침 🛡️'}
                maxWidth="1200px"
            >
                {modalContent === 'terms' ? <TermsOfService /> : <PrivacyPolicy />}
            </Modal>
        </div>
    );
};

export default Layout;
