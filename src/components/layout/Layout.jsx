import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

    const MODAL_DATA = {
        terms: {
            title: '이용약관 (초안)',
            content: `끄적끄적 아지트 이용약관입니다. 

1. 본 서비스는 학생들의 글쓰기 교육을 돕기 위해 제공되는 교육용 플랫폼입니다.
2. 사용자는 타인을 존중하며, 비방이나 욕설 등 부적절한 내용을 작성하지 않습니다.
3. 선생님은 학생들의 글을 원격으로 확인하고 지도를 할 수 있습니다. 
4. 서비스의 안정적인 운영을 위해 시스템 점검 등이 발생할 수 있습니다.

본 내용은 서비스 정식 오픈 전까지 지속적으로 업데이트될 예정입니다.`
        },
        privacy: {
            title: '개인정보 처리방침 (초안)',
            content: `개인정보 처리방침입니다. 

1. 끄적끄적 아지트는 서비스 제공을 위한 최소한의 개인정보(구글 이메일, 이름 등)만을 수집합니다.
2. 수집된 정보는 서비스 가입 확인 및 학생 관리 목적으로만 활용됩니다.
3. 서비스 이용 중 작성한 글 데이터는 교육적 성장을 위해 활용될 수 있습니다.
4. 사용자가 요청할 경우 즉시 데이터를 파기할 수 있도록 지원합니다.

본 방침은 사용자 보호를 위해 정기적으로 검토됩니다.`
        }
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
                padding: '30px 20px',
                textAlign: 'center',
                background: full ? '#F8F9FA' : 'white',
                borderTop: '1px solid #EEE',
                marginTop: 'auto'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '8px' }}>
                        <button
                            onClick={() => setModalContent('terms')}
                            style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: '#95A5A6', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            이용약관
                        </button>
                        <button
                            onClick={() => setModalContent('privacy')}
                            style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: '#95A5A6', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            개인정보 처리방침
                        </button>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#BDC3C7', lineHeight: '1.6' }}>
                        <p style={{ margin: 0 }}>
                            <strong style={{ color: '#ADB5BD' }}>상호명:</strong> 끄적끄적 아지트 |
                            <strong style={{ color: '#ADB5BD', marginLeft: '6px' }}>운영책임자:</strong> 유쌤 |
                            <strong style={{ color: '#ADB5BD', marginLeft: '6px' }}>문의:</strong> yshgg@naver.com
                        </p>
                        <p style={{ margin: '4px 0 0 0' }}>© 2026 끄적끄적 아지트. All rights reserved.</p>
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
                                width: '90%',
                                maxWidth: '500px',
                                maxHeight: '80vh',
                                overflowY: 'auto',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>
                                {MODAL_DATA[modalContent].title}
                            </h3>
                            <div style={{
                                fontSize: '0.9rem',
                                color: '#5D6D7E',
                                lineHeight: '1.8',
                                whiteSpace: 'pre-wrap',
                                marginBottom: '24px'
                            }}>
                                {MODAL_DATA[modalContent].content}
                            </div>
                            <button
                                onClick={() => setModalContent(null)}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: '#F1F3F5',
                                    color: '#7F8C8D',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
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
