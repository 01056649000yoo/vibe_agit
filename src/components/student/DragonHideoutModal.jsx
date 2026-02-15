import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DragonHideoutModal = ({
    isOpen, onClose, isMobile, petData, dragonInfo,
    HIDEOUT_BACKGROUNDS, daysSinceLastFed, dragonConfig,
    handleFeed, setIsShopOpen, isEvolving, isFlashing,
    currentPoints = 0
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 2000,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: isMobile ? 'flex-end' : 'center',
                }} onClick={onClose}>
                    <motion.div
                        initial={{ y: isMobile ? '100%' : 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: isMobile ? '100%' : 50, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: isMobile ? '32px 32px 0 0' : '32px',
                            width: '100%', maxWidth: '600px',
                            padding: '32px',
                            border: 'none',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                            position: 'relative',
                            maxHeight: isMobile ? '90vh' : 'auto',
                            overflowY: 'auto',
                            transition: 'all 0.5s ease'
                        }}
                    >
                        <button
                            onClick={onClose}
                            style={{
                                position: 'absolute', top: '24px', right: '24px',
                                background: '#FFFFFF',
                                border: '1px solid #EEEEEE',
                                width: '40px', height: '40px', borderRadius: '50%',
                                fontSize: '1.2rem', cursor: 'pointer', zIndex: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                color: '#7F8C8D',
                                fontWeight: 'bold'
                            }}
                        >
                            ✕
                        </button>

                        <div style={{ textAlign: 'center', marginBottom: '24px', position: 'relative' }}>
                            {/* [수정] 보유 포인트 배지를 왼쪽 상단으로 이동하여 닫기 버튼과 겹치지 않게 함 */}
                            <div style={{
                                position: isMobile ? 'static' : 'absolute',
                                top: '0',
                                left: '0',
                                marginBottom: isMobile ? '12px' : '0',
                                background: '#FFF9C4',
                                padding: '6px 14px',
                                borderRadius: '12px',
                                border: '1px solid #FBC02D',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                            }}>
                                <span style={{ fontSize: '1rem' }}>💰</span>
                                <span style={{ fontWeight: '900', color: '#F57F17', fontSize: '0.95rem' }}>
                                    {currentPoints.toLocaleString()}P
                                </span>
                            </div>

                            <h2 style={{ margin: 0, color: '#5D4037', fontWeight: '900', fontSize: '1.5rem' }}>🐉 드래곤 아지트</h2>
                            <p style={{ margin: '4px 0 0 0', color: '#8D6E63', fontSize: '0.9rem' }}>나의 소중한 드래곤 파트너와 함께하는 공간</p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: '24px', background: '#F9F9F9', padding: '24px', borderRadius: '24px', border: '1px solid #EEE' }}>
                                <div style={{
                                    position: 'relative',
                                    width: '280px',
                                    height: '280px',
                                    background: HIDEOUT_BACKGROUNDS[petData.background]?.color || HIDEOUT_BACKGROUNDS.default.color,
                                    borderRadius: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    border: petData.level >= 5 ? '4px solid #FFD700' : `2px solid ${HIDEOUT_BACKGROUNDS[petData.background]?.border || '#DDD'}`,
                                }}>
                                    {/* 후경 장식 */}
                                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.2) 100%)', pointerEvents: 'none' }} />

                                    {/* 배경별 효과 */}
                                    {petData.background === 'volcano' && (
                                        <AnimatePresence>
                                            {[...Array(8)].map((_, i) => (
                                                <motion.span
                                                    key={`fire-${i}`}
                                                    initial={{ y: 20, opacity: 0, scale: 0.5 }}
                                                    animate={{ y: -80, opacity: [0, 0.8, 0], scale: [0.8, 1.4, 0.6] }}
                                                    transition={{ repeat: Infinity, duration: 1.5 + i * 0.2, delay: i * 0.1 }}
                                                    style={{ position: 'absolute', bottom: '10%', left: `${5 + i * 12}%`, fontSize: '2rem', filter: 'drop-shadow(0 0 8px #FF5722)', pointerEvents: 'none', zIndex: 0 }}
                                                >
                                                    🔥
                                                </motion.span>
                                            ))}
                                        </AnimatePresence>
                                    )}
                                    {petData.background === 'sky' && (
                                        <AnimatePresence>
                                            {[...Array(4)].map((_, i) => (
                                                <motion.span
                                                    key={`cloud-${i}`}
                                                    animate={{ x: i % 2 === 0 ? [0, 20, 0] : [0, -20, 0] }}
                                                    transition={{ repeat: Infinity, duration: 4 + i, ease: "easeInOut" }}
                                                    style={{ position: 'absolute', top: `${10 + i * 20}%`, left: `${10 + i * 25}%`, fontSize: '2.5rem', opacity: 0.6, pointerEvents: 'none' }}
                                                >
                                                    ☁️
                                                </motion.span>
                                            ))}
                                        </AnimatePresence>
                                    )}
                                    {/* crystal, storm, galaxy 효과 등은 원본 로직 유지 */}
                                    {petData.background === 'crystal' && (
                                        <AnimatePresence>
                                            {[...Array(12)].map((_, i) => (
                                                <motion.span
                                                    key={`gem-${i}`}
                                                    animate={{
                                                        scale: [0.5, 1.2, 0.5],
                                                        opacity: [0.3, 1, 0.3],
                                                        filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)']
                                                    }}
                                                    transition={{ repeat: Infinity, duration: 3 + Math.random() * 2, delay: Math.random() * 2 }}
                                                    style={{
                                                        position: 'absolute',
                                                        top: `${Math.random() * 90}%`,
                                                        left: `${Math.random() * 90}%`,
                                                        fontSize: i % 2 === 0 ? '1.5rem' : '1rem',
                                                        color: '#E1BEE7',
                                                        pointerEvents: 'none',
                                                        textShadow: '0 0 10px rgba(255,255,255,0.8)'
                                                    }}
                                                >
                                                    {i % 3 === 0 ? '💎' : '✨'}
                                                </motion.span>
                                            ))}
                                        </AnimatePresence>
                                    )}
                                    {petData.background === 'storm' && (
                                        <>
                                            <motion.div
                                                animate={{ opacity: [0, 0, 0.3, 0, 0.5, 0, 0, 0] }}
                                                transition={{ repeat: Infinity, duration: 5, times: [0, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 1] }}
                                                style={{ position: 'absolute', inset: 0, background: 'white', pointerEvents: 'none', zIndex: 0 }}
                                            />
                                            {[...Array(3)].map((_, i) => (
                                                <motion.span
                                                    key={`bolt-${i}`}
                                                    animate={{ opacity: [0, 1, 0], y: [0, 10, 0] }}
                                                    transition={{ repeat: Infinity, duration: 5, delay: 3.5 + (i * 0.1) }}
                                                    style={{ position: 'absolute', top: '15%', left: `${20 + i * 30}%`, fontSize: '2rem', filter: 'drop-shadow(0 0 15px #7986CB)', pointerEvents: 'none', zIndex: 0 }}
                                                >
                                                    ⚡
                                                </motion.span>
                                            ))}
                                        </>
                                    )}
                                    {petData.background === 'galaxy' && (
                                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                                            {[...Array(20)].map((_, i) => (
                                                <motion.div
                                                    key={`star-${i}`}
                                                    animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }}
                                                    transition={{ repeat: Infinity, duration: 2 + Math.random() * 3, delay: Math.random() * 5 }}
                                                    style={{
                                                        position: 'absolute',
                                                        top: `${Math.random() * 100}%`,
                                                        left: `${Math.random() * 100}%`,
                                                        width: '2px', height: '2px', background: 'white',
                                                        borderRadius: '50%', boxShadow: '0 0 5px white'
                                                    }}
                                                />
                                            ))}
                                            <motion.span
                                                animate={{ y: [0, -5, 0], opacity: [0.6, 0.9, 0.6] }}
                                                transition={{ repeat: Infinity, duration: 4 }}
                                                style={{ position: 'absolute', top: '10%', right: '15%', fontSize: '2.5rem', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.4))' }}
                                            >
                                                🌙
                                            </motion.span>
                                        </div>
                                    )}

                                    {/* 마스터 달성 특수 효과 (회전하는 무지개 광륜) */}
                                    {petData.level >= 5 && petData.exp >= 100 && (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                            style={{
                                                position: 'absolute',
                                                width: '320px',
                                                height: '320px',
                                                background: 'conic-gradient(from 0deg, #FF0000, #FF7F00, #FFFF00, #00FF00, #0000FF, #4B0082, #9400D3, #FF0000)',
                                                borderRadius: '50%',
                                                filter: 'blur(40px) opacity(0.3)',
                                                zIndex: 0
                                            }}
                                        />
                                    )}

                                    {/* 기존 레벨 5 이상 효과 (입자 효과 강화) */}
                                    {petData.level >= 5 && (
                                        <AnimatePresence>
                                            {[...Array(petData.exp >= 100 ? 20 : 10)].map((_, i) => (
                                                <motion.span
                                                    key={`gold-${i}`}
                                                    animate={{
                                                        y: [0, -80, 0],
                                                        x: [0, (i % 2 === 0 ? 30 : -30), 0],
                                                        opacity: [0, 1, 0],
                                                        rotate: [0, 180, 360],
                                                        scale: [1, 1.5, 1]
                                                    }}
                                                    transition={{ repeat: Infinity, duration: 2 + Math.random() * 2, delay: Math.random() * 2 }}
                                                    style={{
                                                        position: 'absolute',
                                                        top: `${Math.random() * 100}%`,
                                                        left: `${Math.random() * 100}%`,
                                                        fontSize: petData.exp >= 100 ? '1.5rem' : '1rem',
                                                        color: petData.exp >= 100 ? '#FFD700' : '#FFF9C4',
                                                        pointerEvents: 'none',
                                                        zIndex: 2,
                                                        filter: 'drop-shadow(0 0 10px gold)'
                                                    }}
                                                >
                                                    {petData.exp >= 100 ? (i % 2 === 0 ? '✨' : '🌈') : '✨'}
                                                </motion.span>
                                            ))}
                                        </AnimatePresence>
                                    )}

                                    <motion.div
                                        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                        style={{ position: 'absolute', bottom: '20%', width: '140px', height: '30px', background: 'rgba(0,0,0,0.2)', borderRadius: '50%', filter: 'blur(8px)', zIndex: 0 }}
                                    />

                                    <AnimatePresence>
                                        {isFlashing && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ position: 'absolute', inset: 0, background: 'white', zIndex: 50, pointerEvents: 'none' }} />
                                        )}
                                    </AnimatePresence>

                                    <motion.div
                                        key={petData.level}
                                        animate={isEvolving ? { x: [-3, 3, -3, 3, 0], filter: ["brightness(1)", "brightness(1.8)", "brightness(1)"] } : { scale: [0.8, 1.15, 1], y: [0, -12, 0] }}
                                        transition={isEvolving ? { x: { repeat: Infinity, duration: 0.05 }, filter: { repeat: Infinity, duration: 0.5 } } : { scale: { type: "spring", stiffness: 300, damping: 12 }, y: { repeat: Infinity, duration: 3, ease: "easeInOut" } }}
                                        style={{ width: (petData.level === 3 || petData.level === 4) ? '264px' : '220px', height: (petData.level === 3 || petData.level === 4) ? '264px' : '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, cursor: 'pointer', background: 'transparent' }}
                                    >
                                        {!dragonInfo.isPlaceholder && (
                                            <img src={dragonInfo.image} alt={dragonInfo.name} style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'transparent', filter: `drop-shadow(0 10px 20px ${HIDEOUT_BACKGROUNDS[petData.background]?.glow || 'rgba(0,0,0,0.3)'}) ${petData.level >= 5 ? 'drop-shadow(0 0 25px rgba(255,193,7,0.8))' : ''}` }} />
                                        )}
                                    </motion.div>
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
                                        <div>
                                            <span style={{ fontSize: '0.85rem', color: '#FBC02D', fontWeight: 'bold', display: 'block' }}>{dragonInfo.name}</span>
                                            <span style={{ fontSize: '1.4rem', fontWeight: '900', color: '#5D4037' }}>{petData.name}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            {petData.level >= 5 && petData.exp >= 100 && (
                                                <span style={{ display: 'block', fontSize: '0.7rem', background: 'linear-gradient(45deg, #FFD700, #FF5722)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', marginBottom: '4px', boxShadow: '0 2px 5px rgba(255,87,34,0.3)' }}>MASTER 🏆</span>
                                            )}
                                            <span style={{ fontSize: '1rem', color: '#8D6E63', fontWeight: 'bold' }}>Lv.{petData.level}</span>
                                        </div>
                                    </div>
                                    <div style={{ height: '14px', background: 'rgba(0,0,0,0.05)', borderRadius: '7px', overflow: 'hidden' }}>
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${petData.exp}%` }} style={{ height: '100%', background: petData.exp >= 100 ? 'linear-gradient(90deg, #FFD700, #FF8A65, #BA68C8, #4FC3F7)' : 'linear-gradient(90deg, #FFB300, #FBC02D)', borderRadius: '7px' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#8D6E63' }}>식사 후 {daysSinceLastFed}일 경과</span>
                                        <span style={{ fontSize: '0.8rem', color: '#FBC02D', fontWeight: 'bold' }}>{petData.level < 5 || petData.exp < 100 ? `${100 - petData.exp}% 남음` : '전설의 마스터! 🌈'}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ background: '#FFFDE7', padding: '16px', borderRadius: '18px', border: '1px solid #FFF9C4' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#795548', lineHeight: '1.5' }}>
                                        <span style={{ fontWeight: 'bold' }}>💡 드래곤 돌보기 팁</span><br />
                                        글을 써서 모은 포인트로 맛있는 먹이를 줄 수 있어요. {dragonConfig.degenDays}일 동안 돌보지 않으면 드래곤이 지쳐서 레벨이 내려갈 수 있으니 주의하세요!
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleFeed} style={{ flex: 1, background: '#FF8A65', color: 'white', border: 'none', padding: '16px', borderRadius: '20px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 6px 0 #E64A19', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                                        🍖 먹이 주기 ({dragonConfig.feedCost}P)
                                    </motion.button>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsShopOpen(true)} style={{ flex: 1, background: '#3498DB', color: 'white', border: 'none', padding: '16px', borderRadius: '20px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 6px 0 #2980B9', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                                        🛍️ 상점/꾸미기
                                    </motion.button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default DragonHideoutModal;
