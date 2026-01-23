import React from 'react';
import { motion } from 'framer-motion';
import Button from '../common/Button';

const StudentHeader = ({ studentSession, hasActivity, openFeedback, setIsGuideOpen, onLogout }) => {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{
                    background: '#FFE082',
                    color: '#795548',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    whiteSpace: 'nowrap'
                }}>
                    🎒 {studentSession.className || '우리 반'} 친구
                </div>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => openFeedback(0)}
                    style={{
                        background: 'white',
                        color: '#5D4037',
                        border: '2px solid #FFECB3',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        position: 'relative',
                        whiteSpace: 'nowrap'
                    }}
                >
                    🔔 내 글 소식
                    {hasActivity && (
                        <span style={{
                            width: '8px',
                            height: '8px',
                            background: '#FF5252',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '0px',
                            right: '0px',
                            border: '2px solid white'
                        }}></span>
                    )}
                </motion.button>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <motion.button
                    whileHover={{ scale: 1.1, rotate: 10 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsGuideOpen(true)}
                    style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: '#FFF9C4',
                        border: '3px solid #FBC02D',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 0 #F9A825',
                        transition: 'all 0.2s'
                    }}
                    title="사용법 가이드"
                >
                    ❓
                </motion.button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onLogout}
                    style={{
                        color: '#8D6E63',
                        fontWeight: 'bold',
                        background: '#EFEBE9',
                        borderRadius: '15px',
                        padding: '6px 12px',
                        whiteSpace: 'nowrap'
                    }}
                >
                    로그아웃 🚪
                </Button>
            </div>
        </div>
    );
};

export default StudentHeader;
