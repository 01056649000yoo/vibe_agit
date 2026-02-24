import React from 'react';
import { motion } from 'framer-motion';

const PointLevelCard = ({ points, levelInfo, stats, isLoading, agitSettings, temperature }) => {
    const isAgitEnabled = agitSettings?.isEnabled !== false;
    const targetScore = agitSettings?.targetScore || 100;

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
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}
        >
            {/* 로딩 오버레이 제거 - framer-motion으로 인해 0점 -> 실제 점수로 다이나믹하게 올라가는 형태로 변경됨 (체감 성능 극대화) */}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ borderTop: isAgitEnabled ? '1px solid #FFF9C4' : 'none', paddingTop: isAgitEnabled ? '16px' : '0' }}>
                {/* 1. 드래곤 성장 바 */}
                <div style={{ marginBottom: isAgitEnabled ? '16px' : '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#8D6E63', fontWeight: '800' }}>나의 성장 🐉</span>
                        {levelInfo.next && (
                            <span style={{ fontSize: '0.7rem', color: '#ADB5BD', fontWeight: 'bold' }}>
                                목표까지 {Math.max(0, levelInfo.next - stats.totalChars).toLocaleString()}자
                            </span>
                        )}
                    </div>
                    <div style={{ height: '8px', background: '#F1F3F5', borderRadius: '4px', overflow: 'hidden' }}>
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
                </div>

                {/* 2. 아지트 온도계 바 (활성화 시에만 노출) */}
                {isAgitEnabled && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#4F46E5', fontWeight: '800' }}>우리 반 온도 🌡️</span>
                            <span style={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: '900' }}>
                                {temperature} / {targetScore}°C
                            </span>
                        </div>
                        <div style={{ height: '8px', background: '#EEF2FF', borderRadius: '4px', overflow: 'hidden' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (temperature / targetScore) * 100)}%` }}
                                transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                                style={{
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                                    borderRadius: '4px'
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default PointLevelCard;
