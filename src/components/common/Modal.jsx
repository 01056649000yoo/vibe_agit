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
const Modal = ({ isOpen, onClose, title, children, maxWidth = '500px' }) => {
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
                        style={{ width: '100%', maxWidth: maxWidth, maxHeight: '90vh', display: 'flex' }}
                    >
                        <Card style={{
                            width: '100%',
                            padding: '24px',
                            borderRadius: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px',
                                borderBottom: '1px solid #F1F3F5',
                                paddingBottom: '15px'
                            }}>
                                <h3 style={{ margin: 0, color: '#2C3E50', fontWeight: '900', fontSize: '1.2rem' }}>{title}</h3>
                                <button
                                    onClick={onClose}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '1.5rem',
                                        cursor: 'pointer',
                                        color: '#ADB5BD',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '5px'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>

                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                paddingRight: '5px',
                                marginBottom: '20px'
                            }}>
                                {children}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Button
                                    onClick={onClose}
                                    style={{
                                        width: '100px',
                                        background: 'var(--primary-color)',
                                        color: 'white'
                                    }}
                                >
                                    닫기
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default Modal;
