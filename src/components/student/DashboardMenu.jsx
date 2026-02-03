import React from 'react';
import { motion } from 'framer-motion';

const DashboardMenu = ({ onNavigate, setIsDragonModalOpen, setIsAgitOpen, isMobile }) => {
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
                        overflow: 'hidden',
                        minHeight: '220px', // 세로 높이 고정
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🐉</div>
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
                        overflow: 'hidden',
                        minHeight: '220px', // 세로 높이 고정
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🏰</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#1565C0', marginBottom: '6px' }}>어휘력 챌린지</div>
                    <div style={{ fontSize: '0.9rem', color: '#2196F3', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '10px', display: 'inline-block' }}>어휘의 탑 도전하기</div>
                    <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#FF7043', color: 'white', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold' }}>COMING SOON</div>
                </motion.div>

                {/* [신규] 두근두근 우리반 아지트 배너 */}
                <motion.div
                    whileHover={{ scale: 1.01, y: -5 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsAgitOpen(true)}
                    style={{
                        background: 'linear-gradient(135deg, #FFE4E6 0%, #FFF1F2 100%)',
                        borderRadius: '24px',
                        padding: '30px 24px', // 상단 배너들과 동일한 패딩
                        cursor: 'pointer',
                        border: '2px solid #FDA4AF',
                        boxShadow: '0 8px 24px rgba(251, 113, 133, 0.15)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        gridColumn: isMobile ? 'span 1' : 'span 2',
                        minHeight: '220px', // 세로 높이 고정
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div style={{
                        position: 'absolute', top: -15, left: -15, fontSize: '4rem', opacity: 0.1, transform: 'rotate(-15deg)'
                    }}>🎈</div>
                    <div style={{
                        position: 'absolute', bottom: -15, right: -15, fontSize: '4rem', opacity: 0.1, transform: 'rotate(15deg)'
                    }}>✨</div>

                    <div style={{ fontSize: '3.2rem', marginBottom: '10px' }}>🎈</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#9F1239', marginBottom: '4px' }}>
                        두근두근 우리반 아지트
                    </div>
                    <p style={{ margin: '0 0 12px 0', color: '#E11D48', fontSize: '0.9rem', fontWeight: '500' }}>
                        학급 친구들과 함께 에너지를 모으는 신나는 공간!
                    </p>
                    <div style={{
                        fontSize: '0.9rem', color: '#FB7185', fontWeight: 'bold',
                        background: 'white', padding: '5px 18px', borderRadius: '12px',
                        display: 'inline-block', boxShadow: '0 2px 4px rgba(225, 29, 72, 0.1)'
                    }}>
                        아지트 입장하기 🚀
                    </div>
                </motion.div>
            </div>
        </>
    );
};

export default DashboardMenu;
