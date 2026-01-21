import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TermsOfService from './TermsOfService';
import PrivacyPolicy from './PrivacyPolicy';

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
                        <a
                            href="/terms"
                            style={{ textDecoration: 'none', fontSize: '1rem', color: '#37474F', cursor: 'pointer', fontWeight: '900' }}
                        >
                            이용약관
                        </a>
                        <span style={{ color: '#CFD8DC' }}>|</span>
                        <a
                            href="/privacy"
                            style={{ textDecoration: 'none', fontSize: '1rem', color: '#37474F', cursor: 'pointer', fontWeight: '900' }}
                        >
                            개인정보 처리방침
                        </a>
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
            <AnimatePresence>
                {modalContent && (
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.4)',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            zIndex: 9999, backdropFilter: 'blur(4px)'
                        }}
                        onClick={() => setModalContent(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            style={{
                                background: 'white',
                                padding: '32px',
                                borderRadius: '24px',
                                width: '95%',
                                maxWidth: '600px',
                                maxHeight: '80vh',
                                overflowY: 'auto',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>
                                    {modalContent === 'terms' ? '서비스 이용약관' : '개인정보 처리방침'}
                                </h3>
                                <button
                                    onClick={() => setModalContent(null)}
                                    style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#BDC3C7' }}
                                >
                                    ✕
                                </button>
                            </div>

                            <div style={{ paddingRight: '8px' }}>
                                {modalContent === 'terms' ? <TermsOfService /> : <PrivacyPolicy />}
                            </div>

                            <button
                                onClick={() => setModalContent(null)}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    marginTop: '32px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: '#F1F3F5',
                                    color: '#7F8C8D',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#E9ECEF'}
                                onMouseLeave={e => e.currentTarget.style.background = '#F1F3F5'}
                            >
                                확인
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Layout;
