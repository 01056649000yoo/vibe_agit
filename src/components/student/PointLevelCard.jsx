import React from 'react';
import { motion } from 'framer-motion';

const PointLevelCard = ({ points, levelInfo, stats, isLoading }) => {
    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
                background: 'linear-gradient(135deg, #FFFDF7 0%, #FFFFFF 100%)',
                padding: '20px 24px',
                borderRadius: '24px',
                border: '1px solid #FFE082',
                marginBottom: '1.5rem',
                boxShadow: '0 4px 15px rgba(255, 213, 79, 0.1)',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            {isLoading && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255,255,255,0.8)', zIndex: 10,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    fontSize: '0.85rem', color: '#FBC02D', fontWeight: 'bold'
                }}>
                    로딩 중... ✨
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.85rem', color: '#8D6E63', fontWeight: 'bold' }}>보유 포인트 ✨</div>
                    <motion.div
                        key={points}
                        initial={{ y: 5, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        style={{
                            fontSize: '2.2rem',
                            fontWeight: '900',
                            color: '#FBC02D',
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '4px'
                        }}
                    >
                        {points.toLocaleString()}
                        <span style={{ fontSize: '1rem', color: '#8D6E63', fontWeight: 'bold' }}>점</span>
                    </motion.div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: '#8D6E63', fontWeight: 'bold', marginBottom: '4px' }}>
                        {levelInfo.emoji} {levelInfo.name}
                    </div>
                    <div style={{
                        background: '#FDFCF0',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        color: '#FBC02D',
                        fontWeight: 'bold',
                        border: '1px solid #FFF9C4',
                        display: 'inline-block'
                    }}>
                        LV. {levelInfo.level}
                    </div>
                </div>
            </div>

            {/* 프로그레스 바 영역 */}
            <div style={{ padding: '0 2px' }}>
                <div style={{ height: '8px', background: '#F1F3F5', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${levelInfo.next ? Math.min(100, (stats.totalChars / levelInfo.next) * 100) : 100}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #FBC02D, #FFD54F)',
                            borderRadius: '4px'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    {levelInfo.next && (
                        <span style={{ fontSize: '0.7rem', color: '#ADB5BD', fontWeight: 'bold' }}>
                            다음 목표까지 {Math.max(0, levelInfo.next - stats.totalChars).toLocaleString()}자 남음
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default PointLevelCard;
