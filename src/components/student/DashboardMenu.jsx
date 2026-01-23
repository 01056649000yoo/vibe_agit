import React from 'react';
import { motion } from 'framer-motion';

const DashboardMenu = ({ onNavigate, setIsDragonModalOpen, isMobile }) => {
    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                        textAlign: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s', position: 'relative',
                        boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
                    }}
                    onClick={() => onNavigate('mission_list')}
                >
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📝</div>
                    <h3 style={{ margin: 0, color: '#5D4037' }}>글쓰기 미션</h3>
                    <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>선생님의 주제 확인</p>
                </motion.div>

                <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                        textAlign: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s', position: 'relative',
                        boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
                    }}
                    onClick={() => onNavigate('friends_hideout')}
                >
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>👀</div>
                    <h3 style={{ margin: 0, color: '#5D4037' }}>친구 아지트</h3>
                    <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>친구들의 글 읽기</p>
                </motion.div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginTop: '24px' }}>
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsDragonModalOpen(true)}
                    style={{
                        background: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)',
                        borderRadius: '24px',
                        padding: '30px 24px',
                        cursor: 'pointer',
                        border: '2px solid #FFF176',
                        boxShadow: '0 8px 24px rgba(255, 241, 118, 0.2)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>🐉</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#5D4037', marginBottom: '6px' }}>나의 드래곤 파트너</div>
                    <div style={{ fontSize: '0.9rem', color: '#FBC02D', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '10px', display: 'inline-block' }}>나의 드래곤 아지트 가기</div>
                </motion.div>

                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => alert('🏰 어휘의 탑은 준비 중입니다! 조금만 기다려주세요! ✨')}
                    style={{
                        background: 'linear-gradient(135deg, #E3F2FD 0%, #F0F4F8 100%)',
                        borderRadius: '24px',
                        padding: '30px 24px',
                        cursor: 'pointer',
                        border: '2px solid #90CAF9',
                        boxShadow: '0 8px 24px rgba(144, 202, 249, 0.2)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>🏰</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#1565C0', marginBottom: '6px' }}>어휘력 챌린지</div>
                    <div style={{ fontSize: '0.9rem', color: '#2196F3', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '10px', display: 'inline-block' }}>어휘의 탑 도전하기</div>
                    <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#FF7043', color: 'white', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold' }}>COMING SOON</div>
                </motion.div>
            </div>
        </>
    );
};

export default DashboardMenu;
