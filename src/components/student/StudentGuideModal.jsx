import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

/**
 * 🐉 학생 전용 사용법 가이드 모달
 */
const StudentGuideModal = ({ isOpen, onClose }) => {
    const steps = [
        {
            icon: '📝',
            title: '1단계: 미션 확인하고 글쓰기',
            description: '선생님이 내주신 미션을 확인하고, 멋진 글을 써서 포인트를 받아요!',
            bg: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
            borderColor: '#90CAF9'
        },
        {
            icon: '💰',
            title: '2단계: 포인트로 드래곤 키우기',
            description: '모은 포인트로 상점에서 예쁜 배경을 사고, 우리 드래곤을 멋지게 진화시켜요!',
            bg: 'linear-gradient(135deg, #FFF9C4 0%, #FFF59D 100%)',
            borderColor: '#FFF176'
        },
        {
            icon: '🏠',
            title: '3단계: 친구 아지트 놀러 가기',
            description: '친구들은 드래곤을 어떻게 키웠을까? 친구 아지트도 구경해 봐요!',
            bg: 'linear-gradient(135deg, #F1F8E9 0%, #DCEDC8 100%)',
            borderColor: '#C5E1A5'
        },
        {
            icon: '🐉',
            title: '4단계: 내 드래곤 자랑하기',
            description: '내가 꾸민 멋진 아지트를 친구들에게 보여주세요!',
            bg: 'linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)',
            borderColor: '#CE93D8'
        }
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 3000,
                    padding: '20px'
                }} onClick={onClose}>
                    <motion.div
                        initial={{ scale: 0.7, opacity: 0, rotate: -5 }}
                        animate={{
                            scale: 1,
                            opacity: 1,
                            rotate: 0,
                            transition: {
                                type: "spring",
                                stiffness: 300,
                                damping: 15
                            }
                        }}
                        exit={{ scale: 0.7, opacity: 0, rotate: 5 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#FFF9E1', // 부드러운 노란색 배경
                            borderRadius: '40px',
                            width: '100%',
                            maxWidth: '550px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            padding: '35px',
                            border: '8px solid #FFD54F',
                            boxShadow: '0 30px 60px rgba(0,0,0,0.15)',
                            position: 'relative'
                        }}
                    >
                        {/* 닫기 버튼 */}
                        <button
                            onClick={onClose}
                            style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                background: '#FF8A65',
                                border: 'none',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                color: 'white',
                                fontSize: '1.2rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                boxShadow: '0 4px 0 #E64A19'
                            }}
                        >
                            ✕
                        </button>

                        <header style={{ textAlign: 'center', marginBottom: '35px' }}>
                            <motion.div
                                animate={{ y: [0, -10, 0] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                style={{ fontSize: '4rem', marginBottom: '10px' }}
                            >
                                📖
                            </motion.div>
                            <h1 style={{ margin: 0, color: '#5D4037', fontWeight: '900', fontSize: '2rem', textShadow: '2px 2px 0 white' }}>
                                끄적끄적 아지트 가이드
                            </h1>
                            <p style={{ color: '#8D6E63', fontWeight: '700', fontSize: '1.1rem', marginTop: '5px' }}>
                                친구들과 함께 드래곤을 키워볼까요? ✨
                            </p>
                        </header>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                            {steps.map((step, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ x: -30, opacity: 0 }}
                                    animate={{
                                        x: 0,
                                        opacity: 1,
                                        transition: { delay: index * 0.1 + 0.3 }
                                    }}
                                    whileHover={{ scale: 1.03, rotate: index % 2 === 0 ? 1 : -1 }}
                                    style={{
                                        background: step.bg,
                                        padding: '24px',
                                        borderRadius: '30px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '25px',
                                        border: `3px solid ${step.borderColor}`,
                                        boxShadow: '0 8px 15px rgba(0,0,0,0.05)',
                                        cursor: 'default'
                                    }}
                                >
                                    <div style={{
                                        fontSize: '3.5rem',
                                        filter: 'drop-shadow(3px 3px 0 white)',
                                        minWidth: '70px',
                                        textAlign: 'center'
                                    }}>
                                        {step.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.3rem', color: '#333', fontWeight: '900' }}>
                                            {step.title}
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '1rem', color: '#555', lineHeight: '1.5', fontWeight: '600' }}>
                                            {step.description}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <div style={{ marginTop: '40px', textAlign: 'center' }}>
                            <motion.button
                                onClick={onClose}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                    width: '100%',
                                    padding: '20px',
                                    borderRadius: '25px',
                                    fontSize: '1.4rem',
                                    fontWeight: '900',
                                    background: '#4CAF50',
                                    boxShadow: '0 8px 0 #2E7D32',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    textShadow: '1px 1px 0 rgba(0,0,0,0.2)'
                                }}
                            >
                                다 이해했어요! 드래곤 키우러 가기 🐉
                            </motion.button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default StudentGuideModal;

