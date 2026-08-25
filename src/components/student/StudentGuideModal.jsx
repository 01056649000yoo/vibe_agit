import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import ModalCloseButton from '../common/ModalCloseButton';

/**
 * 🐉 학생 전용 사용법 가이드 모달
 */
const StudentGuideModal = ({ isOpen, onClose }) => {
    const steps = [
        {
            icon: '📝',
            title: '미션 확인하고 글쓰기',
            description: '선생님이 내주신 미션을 확인하고, 멋진 글을 써서 포인트를 받아요!',
            bg: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
            borderColor: '#90CAF9'
        },
        {
            icon: '💰',
            title: '포인트로 드래곤 키우기',
            description: '모은 포인트로 상점에서 예쁜 배경을 사고, 우리 드래곤을 멋지게 진화시켜요!',
            bg: 'linear-gradient(135deg, #FFF9C4 0%, #FFF59D 100%)',
            borderColor: '#FFF176'
        },
        {
            icon: '🏠',
            title: '친구 아지트 놀러 가기',
            description: '친구들은 드래곤을 어떻게 키웠을까? 친구 아지트도 구경해 봐요!',
            bg: 'linear-gradient(135deg, #F1F8E9 0%, #DCEDC8 100%)',
            borderColor: '#C5E1A5'
        },
        {
            icon: '🐉',
            title: '내 드래곤 자랑하기',
            description: '내가 꾸민 멋진 아지트를 친구들에게 보여주세요!',
            bg: 'linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)'
        },
        {
            icon: '🏰',
            title: '어휘의 탑 도전하기',
            description: '퀴즈를 풀어 탑을 올라가세요! 오답이어도 층수는 깎이지 않으니 걱정 마세요. 높은 층에 올라갈수록 보너스 시간도 받는답니다! ⏱️',
            bg: 'linear-gradient(135deg, #E8EAF6 0%, #C5CAE9 100%)',
            borderColor: '#7986CB'
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
                        <ModalCloseButton
                            onClick={onClose}
                            label="이용 안내 닫기"
                            style={{ position: 'absolute', top: '20px', right: '20px' }}
                        />

                        <header style={{ textAlign: 'center', marginBottom: '35px' }}>
                            <motion.div
                                animate={{ y: [0, -10, 0] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                style={{ fontSize: '4rem', marginBottom: '10px' }}
                            >
                                📖
                            </motion.div>
                            <h1 style={{ margin: '10px 0', color: '#3E2723', fontWeight: '900', fontSize: 'var(--ui-text-2xl)', letterSpacing: '-1px' }}>
                                끄적끄적 아지트 가이드
                            </h1>
                            <p style={{ color: '#8D6E63', fontWeight: '700', fontSize: 'var(--ui-text-md)', marginTop: '5px' }}>
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
                                        <h3 style={{ margin: '0 0 6px 0', fontSize: 'var(--ui-text-xl)', color: '#333', fontWeight: '900' }}>
                                            {index + 1}단계: {step.title}
                                        </h3>
                                        <p style={{ margin: 0, fontSize: 'var(--ui-text-lg)', color: '#555', lineHeight: '1.5', fontWeight: '600' }}>
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
                                    fontSize: 'var(--ui-text-lg)',
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
