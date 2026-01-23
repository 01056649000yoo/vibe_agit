import React from 'react';
import { motion } from 'framer-motion';
import Button from '../common/Button';

const BackgroundShopModal = ({ isOpen, onClose, points, petData, buyItem, equipItem, HIDEOUT_BACKGROUNDS }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 3000,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '20px'
        }} onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                style={{
                    background: 'white',
                    width: '100%',
                    maxWidth: '450px',
                    maxHeight: '85vh',
                    borderRadius: '32px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '24px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8F9FA' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#2C3E50', fontWeight: '900' }}>🏡 아지트 배경 상점</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#7F8C8D' }}>남은 포인트: <b>{points.toLocaleString()}P</b></p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    {Object.values(HIDEOUT_BACKGROUNDS).map(item => {
                        const isOwned = item.id === 'default' || (petData.ownedItems && petData.ownedItems.includes(item.id));
                        const isEquipped = petData.background === item.id;
                        const isLegendary = item.requiresMaxLevel;
                        const hasFullyMastered = petData.level >= 5 && petData.exp >= 100;

                        return (
                            <div key={item.id} style={{
                                gridColumn: isLegendary ? '1 / -1' : 'auto',
                                border: `2px solid ${isEquipped ? item.border : (isLegendary ? '#FFD700' : '#F1F3F5')}`,
                                borderRadius: '24px',
                                padding: isLegendary ? '24px' : '16px',
                                textAlign: 'center',
                                background: isEquipped ? item.color : (isLegendary ? 'linear-gradient(to bottom, #FFF, #FFF9C4)' : 'white'),
                                transition: 'all 0.2s',
                                opacity: isEquipped ? 1 : 0.9,
                                boxShadow: isLegendary ? '0 8px 20px rgba(255, 215, 0, 0.15)' : 'none',
                                position: 'relative'
                            }}>
                                {isLegendary && (
                                    <div style={{ position: 'absolute', top: '12px', left: '12px', fontSize: '0.75rem', fontWeight: 'bold', color: '#FBC02D', background: 'white', padding: '2px 8px', borderRadius: '10px', border: '1px solid #FFD700' }}>ULTIMATE REWARD</div>
                                )}
                                <div style={{
                                    width: '100%', height: isLegendary ? '100px' : '60px', borderRadius: '12px',
                                    background: item.color, marginBottom: '10px',
                                    border: `1px solid ${item.border}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                                }}>
                                    {isLegendary && '🌈'}
                                </div>
                                <div style={{ fontWeight: 'bold', fontSize: isLegendary ? '1.2rem' : '1rem', color: isEquipped ? (item.textColor || '#2C3E50') : '#2C3E50', marginBottom: '6px' }}>{item.name}</div>

                                <div style={{
                                    display: 'inline-block',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    fontWeight: '900',
                                    marginBottom: '14px',
                                    background: isOwned ? (isEquipped ? 'rgba(255,255,255,0.2)' : '#F1F3F5') : (isLegendary && !hasFullyMastered ? '#F8F9FA' : '#FFF9C4'),
                                    color: isOwned ? (isEquipped ? 'white' : '#95A5A6') : (isLegendary && !hasFullyMastered ? '#ADB5BD' : '#FBC02D'),
                                    border: isOwned ? 'none' : '1px solid #FFE082'
                                }}>
                                    {isOwned ? (
                                        <span>{isEquipped ? '✨ 사용 중' : '✅ 보유 중'}</span>
                                    ) : (
                                        isLegendary ? (
                                            !hasFullyMastered ? <span>🔒 5레벨 만렙(100%) 달성 시 무료!</span> : <span>🎁 드래곤 마스터 완료 기념 선물!</span>
                                        ) : (
                                            <span>💰 {item.price?.toLocaleString()}P</span>
                                        )
                                    )}
                                </div>

                                {!isOwned ? (
                                    <Button
                                        size={isLegendary ? 'md' : 'sm'}
                                        style={{
                                            width: isLegendary ? '80%' : '100%',
                                            margin: '0 auto',
                                            background: (isLegendary && !hasFullyMastered) ? '#EEE' : '#FBC02D',
                                            color: (isLegendary && !hasFullyMastered) ? '#999' : '#795548',
                                            fontWeight: 'bold',
                                            cursor: (isLegendary && !hasFullyMastered) ? 'not-allowed' : 'pointer'
                                        }}
                                        onClick={() => !(isLegendary && !hasFullyMastered) && buyItem(item)}
                                        disabled={isLegendary && !hasFullyMastered}
                                    >
                                        {isLegendary && !hasFullyMastered ? '잠겨있음' : '지금 받기'}
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant={isEquipped ? 'primary' : 'ghost'}
                                        style={{
                                            width: isLegendary ? '80%' : '100%',
                                            margin: '0 auto',
                                            background: isEquipped ? item.accent : '#F8F9FA',
                                            color: isEquipped ? 'white' : '#7F8C8D',
                                            border: isEquipped ? 'none' : '1px solid #DEE2E6'
                                        }}
                                        onClick={() => equipItem(item.id)}
                                    >
                                        {isEquipped ? '사용 중' : '적용하기'}
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div style={{ padding: '20px', textAlign: 'center', background: '#FDFCF0' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#9E9E9E' }}>멋진 배경으로 나만의 드래곤 아지트를 꾸며보세요! 🌈</p>
                </div>
            </motion.div>
        </div>
    );
};

export default BackgroundShopModal;
