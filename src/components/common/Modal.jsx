import React from 'react';
import Card from './Card';
import Button from './Button';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 범용 모달 컴포넌트
 * @param {boolean} isOpen 모달 표시 여부
 * @param {function} onClose 모달 닫기 함수
 * @param {string} title 모달 제목
 * @param {React.ReactNode} children 모달 내용
 * @param {string} maxWidth 최대 너비 (기본값: 500px)
 */
const Modal = ({ isOpen, onClose, title, children, maxWidth = '600px' }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 9999, backdropFilter: 'blur(3px)',
                    padding: '20px'
                }} onClick={onClose}>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: maxWidth,
                            maxHeight: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: 'white',
                            borderRadius: '24px',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                            overflow: 'hidden'
                        }}
                    >
                        {/* 헤더 섹션 (고정) */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '24px 24px 20px 24px',
                            borderBottom: '1px solid #F1F3F5',
                            backgroundColor: 'white',
                            zIndex: 10
                        }}>
                            <h3 style={{ margin: 0, color: '#2C3E50', fontWeight: '900', fontSize: '1.25rem' }}>{title}</h3>
                            <button
                                onClick={onClose}
                                style={{
                                    background: '#F8F9FA',
                                    border: 'none',
                                    fontSize: '1.2rem',
                                    cursor: 'pointer',
                                    color: '#ADB5BD',
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E9ECEF'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8F9FA'}
                            >
                                ✕
                            </button>
                        </div>

                        {/* 콘텐츠 섹션 (스크롤 가능) */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '24px',
                            backgroundColor: 'white',
                            /* 스크롤바 커스텀 */
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#D1D5DB transparent'
                        }}>
                            {children}
                        </div>

                        {/* 푸터 섹션 (고정) */}
                        <div style={{
                            padding: '20px 24px 24px 24px',
                            display: 'flex',
                            justifyContent: 'center',
                            borderTop: '1px solid #F1F3F5',
                            backgroundColor: '#F9FAFB'
                        }}>
                            <Button
                                onClick={onClose}
                                style={{
                                    width: '100%',
                                    maxWidth: '120px',
                                    background: 'var(--primary-color)',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    height: '48px'
                                }}
                            >
                                확인
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default Modal;
