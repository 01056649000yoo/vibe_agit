import React from 'react';
import { motion } from 'framer-motion';

/**
 * 아지트 놀이터 (Stage 3b)
 *
 * 학생이 모은 포인트로 즐기는 콘텐츠를 한곳에 모은 공간.
 * 대시보드 메뉴에는 "놀이터" 한 칸만 고정되고, 실제 놀거리는 이 안에서 늘어난다.
 * (메뉴가 계속 길어지는 것을 막고, 앞으로 추가될 포인트 활동도 여기 등록만 하면 된다)
 *
 * 표시할 항목은 학급에서 켜진 모듈(part === 'game')에서 온다.
 */
const PlaygroundPanel = ({ items, points, isMobile, onClose }) => {
    return (
        <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#8D6E63', padding: 0 }}
                    aria-label="닫기"
                >←</button>
                <h2 style={{ margin: 0, fontSize: isMobile ? '1.4rem' : '1.7rem', color: '#5D4037', fontWeight: '900' }}>
                    🎡 아지트 놀이터
                </h2>
            </div>
            <p style={{ margin: '0 0 20px 34px', color: '#8D6E63', fontSize: '0.95rem' }}>
                모은 포인트로 즐기는 공간이에요. 지금 내 포인트 <b style={{ color: '#F57C00' }}>{points ?? 0}점</b>
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '16px',
            }}>
                {items.map((item) => (
                    <motion.div
                        key={item.id}
                        whileHover={{ scale: 1.02, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={item.onOpen}
                        style={{
                            background: item.background ?? 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)',
                            border: `2px solid ${item.borderColor ?? '#FFE082'}`,
                            borderRadius: '20px',
                            padding: '26px 20px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 6px 18px rgba(255, 224, 130, 0.25)',
                        }}
                    >
                        <div style={{ fontSize: '3rem', marginBottom: '8px' }}>{item.icon}</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#5D4037', marginBottom: '4px' }}>{item.name}</div>
                        {item.description && (
                            <div style={{ fontSize: '0.85rem', color: '#8D6E63' }}>{item.description}</div>
                        )}
                        {item.badge && (
                            <div style={{
                                marginTop: '10px', display: 'inline-block', background: 'white',
                                color: '#F57C00', fontWeight: 'bold', fontSize: '0.8rem',
                                padding: '4px 12px', borderRadius: '10px',
                            }}>{item.badge}</div>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default PlaygroundPanel;
