import React from 'react';
import { motion } from 'framer-motion';

const DashboardMenu = ({ onNavigate, setIsDragonModalOpen, setIsAgitOpen, isMobile, agitSettings }) => {
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
                    whileHover={agitSettings?.isEnabled !== false ? { scale: 1.01, y: -5 } : {}}
                    whileTap={agitSettings?.isEnabled !== false ? { scale: 0.99 } : {}}
                    onClick={() => {
                        if (agitSettings?.isEnabled === false) {
                            alert('🔒 현재 아지트 온 클래스 서비스 준비 중입니다. 선생님께 문의해 주세요!');
                            return;
                        }
                        setIsAgitOpen(true);
                    }}
                    style={{
                        background: agitSettings?.isEnabled === false
                            ? 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)'
                            : 'linear-gradient(135deg, #FFE4E6 0%, #FFF1F2 100%)',
                        borderRadius: '24px',
                        padding: '30px 24px',
                        cursor: agitSettings?.isEnabled === false ? 'default' : 'pointer',
                        border: agitSettings?.isEnabled === false ? '2px solid #CBD5E1' : '2px solid #FDA4AF',
                        boxShadow: agitSettings?.isEnabled === false ? 'none' : '0 8px 24px rgba(251, 113, 133, 0.15)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        gridColumn: isMobile ? 'span 1' : 'span 2',
                        minHeight: '220px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: agitSettings?.isEnabled === false ? 0.8 : 1
                    }}
                >
                    <div style={{
                        position: 'absolute', top: -15, left: -15, fontSize: '4rem', opacity: 0.05, transform: 'rotate(-15deg)'
                    }}>{agitSettings?.isEnabled === false ? '🔒' : '🎈'}</div>
                    <div style={{
                        position: 'absolute', bottom: -15, right: -15, fontSize: '4rem', opacity: 0.05, transform: 'rotate(15deg)'
                    }}>{agitSettings?.isEnabled === false ? '🔒' : '✨'}</div>

                    <div style={{ fontSize: '3.2rem', marginBottom: '10px' }}>
                        {agitSettings?.isEnabled === false ? '🔒' : '🎈'}
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: agitSettings?.isEnabled === false ? '#64748B' : '#9F1239', marginBottom: '4px' }}>
                        두근두근 우리반 아지트 {agitSettings?.isEnabled === false && <span style={{ fontSize: '0.8rem', color: '#EF4444' }}>[준비중]</span>}
                    </div>
                    <p style={{ margin: '0 0 12px 0', color: agitSettings?.isEnabled === false ? '#94A3B8' : '#E11D48', fontSize: '0.9rem', fontWeight: '500' }}>
                        {agitSettings?.isEnabled === false
                            ? '지금은 준비 중이에요. 선생님이 열어주실 때까지 기다려주세요!'
                            : '학급 친구들과 함께 에너지를 모으는 신나는 공간!'}
                    </p>
                    <div style={{
                        fontSize: '0.9rem', color: agitSettings?.isEnabled === false ? '#94A3B8' : '#FB7185', fontWeight: 'bold',
                        background: 'white', padding: '5px 18px', borderRadius: '12px',
                        display: 'inline-block', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                    }}>
                        {agitSettings?.isEnabled === false ? '입장 불가 🔒' : '아지트 입장하기 🚀'}
                    </div>
                </motion.div>
            </div>
        </>
    );
};

export default DashboardMenu;
