import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DragonHideoutModal = ({
    isOpen, onClose, isMobile, petData, dragonInfo,
    HIDEOUT_BACKGROUNDS, daysSinceLastFed, dragonConfig,
    handleFeed, setIsShopOpen, isEvolving, isFlashing, isBusy,
    currentPoints = 0
}) => {
    const [showConfirm, setShowConfirm] = useState(false);

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
                                    background: '#F0F0F0',
                                    borderRadius: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    border: petData.level >= 5 ? '4px solid #FFD700' : `2px solid ${HIDEOUT_BACKGROUNDS[petData.background]?.border || '#DDD'}`,
                                }}>
                                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.2) 100%)', pointerEvents: 'none', zIndex: 10 }} />

                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={`${petData.background}-${isOpen}`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.4 }}
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                pointerEvents: 'none',
                                                zIndex: 0,
                                                background: HIDEOUT_BACKGROUNDS[petData.background]?.color || HIDEOUT_BACKGROUNDS.default.color
                                            }}
                                        >
                                            {petData.background === 'volcano' && (
                                                <>
                                                    {[...Array(6)].map((_, i) => (
                                                        <motion.span
                                                            key={`${petData.background}-fire-${i}`}
                                                            initial={{ y: 20, opacity: 0, scale: 0.5 }}
                                                            animate={{ y: -80, opacity: [0, 0.8, 0], scale: [0.8, 1.4, 0.6] }}
                                                            transition={{ repeat: Infinity, duration: 1.5 + i * 0.3, delay: i * 0.2 }}
                                                            style={{ position: 'absolute', bottom: '10%', left: `${10 + i * 15}%`, fontSize: '1.8rem', filter: 'drop-shadow(0 0 8px #FF5722)' }}
                                                        >
                                                            🔥
                                                        </motion.span>
                                                    ))}
                                                </>
                                            )}
                                            {petData.background === 'sky' && (
                                                <>
                                                    {[...Array(6)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-cloud-layer-${i}`}
                                                            animate={{
                                                                x: i % 2 === 0 ? [-50, 50, -50] : [50, -50, 50],
                                                                opacity: [0.3, 0.6, 0.3]
                                                            }}
                                                            transition={{
                                                                duration: 8 + i * 2,
                                                                repeat: Infinity,
                                                                ease: "easeInOut"
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${10 + i * 15}%`,
                                                                left: `${-20 + (i * 30) % 100}%`,
                                                                fontSize: `${2 + i * 0.5}rem`,
                                                                filter: 'blur(2px)',
                                                                zIndex: 1
                                                            }}
                                                        >
                                                            ☁️
                                                        </motion.div>
                                                    ))}

                                                    {[...Array(8)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-sky-orb-${i}`}
                                                            animate={{
                                                                scale: [1, 1.5, 1],
                                                                opacity: [0.2, 0.5, 0.2],
                                                                y: [0, -20, 0]
                                                            }}
                                                            transition={{
                                                                duration: 4 + i,
                                                                repeat: Infinity,
                                                                delay: i * 0.5
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${20 + (i * 123) % 60}%`,
                                                                left: `${10 + (i * 157) % 80}%`,
                                                                width: '4px', height: '4px',
                                                                background: 'white',
                                                                borderRadius: '50%',
                                                                boxShadow: '0 0 10px white',
                                                                zIndex: 1
                                                            }}
                                                        />
                                                    ))}

                                                    <motion.div
                                                        key={`${petData.background}-sky-halo`}
                                                        animate={{
                                                            scale: [1, 1.05, 1],
                                                            opacity: [0.15, 0.25, 0.15]
                                                        }}
                                                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                                        style={{
                                                            position: 'absolute', top: '30%', left: '50%',
                                                            transform: 'translate(-50%, -50%)',
                                                            width: '300px', height: '300px',
                                                            background: 'radial-gradient(circle, #FFFFFF 0%, transparent 70%)',
                                                            borderRadius: '50%',
                                                            filter: 'blur(40px)',
                                                            zIndex: 0
                                                        }}
                                                    />

                                                    {[...Array(4)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-feather-${i}`}
                                                            animate={{
                                                                y: [0, 100],
                                                                x: [0, 30, 0],
                                                                rotate: [0, 45, -45, 0],
                                                                opacity: [0, 0.6, 0]
                                                            }}
                                                            transition={{
                                                                duration: 6 + i,
                                                                repeat: Infinity,
                                                                delay: i * 2,
                                                                ease: "linear"
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: '-10%',
                                                                left: `${20 + i * 20}%`,
                                                                fontSize: '1.2rem',
                                                                zIndex: 3
                                                            }}
                                                        >
                                                            🪶
                                                        </motion.div>
                                                    ))}
                                                </>
                                            )}
                                            {petData.background === 'crystal' && (
                                                <>
                                                    {[...Array(8)].map((_, i) => (
                                                        <motion.span
                                                            key={`${petData.background}-gem-${i}`}
                                                            animate={{
                                                                scale: [0.5, 1.1, 0.5],
                                                                opacity: [0.3, 0.8, 0.3],
                                                                filter: ['brightness(1)', 'brightness(1.3)', 'brightness(1)']
                                                            }}
                                                            transition={{ repeat: Infinity, duration: 3 + i * 0.5, delay: i * 0.3 }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${15 + (i * 123) % 70}%`,
                                                                left: `${10 + (i * 247) % 80}%`,
                                                                fontSize: i % 2 === 0 ? '1.4rem' : '1rem',
                                                                color: '#E1BEE7',
                                                                textShadow: '0 0 10px rgba(255,255,255,0.6)'
                                                            }}
                                                        >
                                                            {i % 3 === 0 ? '💎' : '✨'}
                                                        </motion.span>
                                                    ))}
                                                </>
                                            )}
                                            {petData.background === 'storm' && (
                                                <>
                                                    {[...Array(20)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-rain-${i}`}
                                                            animate={{
                                                                y: [0, 300],
                                                                opacity: [0, 0.5, 0]
                                                            }}
                                                            transition={{
                                                                duration: 0.5 + Math.random() * 0.5,
                                                                repeat: Infinity,
                                                                delay: Math.random() * 2
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: '-10%',
                                                                left: `${(i * 7) % 100}%`,
                                                                width: '1px', height: '25px',
                                                                background: 'rgba(255,255,255,0.4)',
                                                                transform: 'rotate(15deg)',
                                                                zIndex: 1
                                                            }}
                                                        />
                                                    ))}

                                                    {[...Array(4)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-storm-cloud-${i}`}
                                                            animate={{
                                                                x: i % 2 === 0 ? [-20, 20, -20] : [20, -20, 20],
                                                                opacity: [0.5, 0.8, 0.5]
                                                            }}
                                                            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${i * 12}%`,
                                                                left: `${-10 + (i * 25) % 100}%`,
                                                                fontSize: '4.5rem',
                                                                filter: 'grayscale(1) brightness(0.2) blur(5px)',
                                                                zIndex: 1
                                                            }}
                                                        >
                                                            ☁️
                                                        </motion.div>
                                                    ))}

                                                    <motion.div
                                                        key={`${petData.background}-lightning-flash`}
                                                        animate={{
                                                            opacity: [0, 0, 0.8, 0, 1, 0, 0, 0],
                                                            background: ['transparent', 'transparent', '#FFFFFF', 'transparent', '#B3E5FC', 'transparent', 'transparent', 'transparent']
                                                        }}
                                                        transition={{
                                                            duration: 6,
                                                            repeat: Infinity,
                                                            times: [0, 0.8, 0.82, 0.84, 0.86, 0.88, 0.9, 1]
                                                        }}
                                                        style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}
                                                    />

                                                    {[...Array(3)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-bolt-wrapper-${i}`}
                                                            animate={{
                                                                opacity: [0, 0, 1, 0, 1, 0, 0]
                                                            }}
                                                            transition={{
                                                                duration: 4.5,
                                                                repeat: Infinity,
                                                                times: [0, 0.1, 0.12, 0.14, 0.16, 0.18, 1],
                                                                delay: i * 1.5
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: 0,
                                                                left: `${10 + i * 35}%`,
                                                                width: '100px',
                                                                height: '80%',
                                                                zIndex: 10,
                                                                pointerEvents: 'none'
                                                            }}
                                                        >
                                                            <svg width="100%" height="100%" viewBox="0 0 100 300" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                                                                <path
                                                                    d={i === 0
                                                                        ? "M 50 0 L 30 60 L 70 120 L 20 180 L 80 240 L 50 300"
                                                                        : i === 1
                                                                            ? "M 50 0 L 70 50 L 30 110 L 80 170 L 40 230 L 50 300"
                                                                            : "M 50 0 L 40 70 L 60 140 L 30 210 L 70 280 L 50 300"}
                                                                    fill="none"
                                                                    stroke="#FFF"
                                                                    strokeWidth="4"
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    style={{
                                                                        filter: 'drop-shadow(0 0 15px #81D4FA) drop-shadow(0 0 25px #FFF)'
                                                                    }}
                                                                />
                                                            </svg>
                                                        </motion.div>
                                                    ))}

                                                    {[...Array(4)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-spark-${i}`}
                                                            animate={{
                                                                opacity: [0, 1, 0],
                                                                scale: [0, 1.5, 0]
                                                            }}
                                                            transition={{
                                                                duration: 0.2,
                                                                repeat: Infinity,
                                                                delay: Math.random() * 6
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${40 + (i * 15) % 30}%`,
                                                                left: `${35 + (i * 20) % 30}%`,
                                                                width: '2px', height: '2px',
                                                                background: '#FFF',
                                                                boxShadow: '0 0 10px #4FC3F7',
                                                                zIndex: 6
                                                            }}
                                                        />
                                                    ))}
                                                </>
                                            )}
                                            {petData.background === 'galaxy' && (
                                                <div style={{ position: 'absolute', inset: 0 }}>
                                                    {[...Array(12)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-star-${i}`}
                                                            animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }}
                                                            transition={{ repeat: Infinity, duration: 3 + i * 0.5, delay: i * 0.4 }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${(i * 137) % 100}%`,
                                                                left: `${(i * 251) % 100}%`,
                                                                width: '2px', height: '2px', background: 'white',
                                                                borderRadius: '50%', boxShadow: '0 0 4px white'
                                                            }}
                                                        />
                                                    ))}
                                                    <motion.span
                                                        key={`${petData.background}-moon`}
                                                        animate={{ y: [0, -5, 0], opacity: [0.7, 1, 0.7] }}
                                                        transition={{ repeat: Infinity, duration: 4 }}
                                                        style={{ position: 'absolute', top: '10%', right: '15%', fontSize: '2.2rem', filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.4))' }}
                                                    >
                                                        🌙
                                                    </motion.span>
                                                </div>
                                            )}

                                            {petData.background === 'legend' && (
                                                <>
                                                    <motion.div
                                                        key={`${petData.background}-nebula`}
                                                        animate={{
                                                            background: [
                                                                'radial-gradient(circle at 20% 20%, #2D1B00 0%, #000000 70%)',
                                                                'radial-gradient(circle at 80% 80%, #2D1B00 0%, #000000 70%)',
                                                                'radial-gradient(circle at 20% 20%, #2D1B00 0%, #000000 70%)',
                                                            ]
                                                        }}
                                                        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                                        style={{ position: 'absolute', inset: 0, opacity: 0.8 }}
                                                    />

                                                    {[...Array(6)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-gold-ray-${i}`}
                                                            animate={{
                                                                opacity: [0.2, 0.6, 0.2],
                                                                scaleX: [1, 1.3, 1]
                                                            }}
                                                            transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut" }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: '-50%',
                                                                left: `${10 + i * 20}%`,
                                                                width: '60px',
                                                                height: '200%',
                                                                background: 'linear-gradient(to bottom, rgba(255, 215, 0, 0.4), transparent)',
                                                                transform: `rotate(${15 + i * 5}deg)`,
                                                                filter: 'blur(25px)',
                                                                zIndex: 1
                                                            }}
                                                        />
                                                    ))}

                                                    {[...Array(15)].map((_, i) => (
                                                        <motion.div
                                                            key={`${petData.background}-ember-${i}`}
                                                            animate={{
                                                                y: [0, -180],
                                                                opacity: [0, 1, 0],
                                                                rotate: [0, 360],
                                                                scale: [0, 1, 0]
                                                            }}
                                                            transition={{ duration: 4 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}
                                                            style={{
                                                                position: 'absolute',
                                                                bottom: '5%',
                                                                left: `${(i * 37) % 100}%`,
                                                                fontSize: i % 3 === 0 ? '1rem' : '0.7rem',
                                                                color: '#FFD700',
                                                                filter: 'drop-shadow(0 0 8px #FFD700)',
                                                                zIndex: 4
                                                            }}
                                                        >
                                                            {i % 4 === 0 ? '✦' : i % 4 === 1 ? '✨' : i % 4 === 2 ? '✻' : '·'}
                                                        </motion.div>
                                                    ))}

                                                    {petData.level >= 5 && petData.exp >= 100 && (
                                                        <>
                                                            <motion.div
                                                                key={`${petData.background}-ring-1`}
                                                                animate={{ rotateZ: 360, rotateX: [60, 70, 60] }}
                                                                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                                                style={{
                                                                    position: 'absolute', top: '45%', left: '50%',
                                                                    width: '320px', height: '320px',
                                                                    margin: '-160px 0 0 -160px',
                                                                    border: '1.5px solid rgba(255, 215, 0, 0.4)',
                                                                    borderRadius: '50%',
                                                                    zIndex: 1,
                                                                    perspective: '1000px'
                                                                }}
                                                            />
                                                            <motion.div
                                                                key={`${petData.background}-ring-2`}
                                                                animate={{ rotateZ: -360, rotateY: [60, 50, 60] }}
                                                                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                                                style={{
                                                                    position: 'absolute', top: '45%', left: '50%',
                                                                    width: '350px', height: '350px',
                                                                    margin: '-175px 0 0 -175px',
                                                                    border: '1.5px dashed rgba(255, 215, 0, 0.2)',
                                                                    borderRadius: '50%',
                                                                    zIndex: 1
                                                                }}
                                                            />

                                                            <motion.div
                                                                key={`${petData.background}-sun-halo`}
                                                                animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.3, 0.5, 0.3] }}
                                                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                                                style={{
                                                                    position: 'absolute', top: '45%', left: '50%',
                                                                    width: '280px', height: '280px',
                                                                    margin: '-140px 0 0 -140px',
                                                                    background: 'radial-gradient(circle, rgba(255, 215, 0, 0.6) 0%, transparent 70%)',
                                                                    borderRadius: '50%',
                                                                    filter: 'blur(30px)',
                                                                    zIndex: 1
                                                                }}
                                                            />
                                                        </>
                                                    )}

                                                    <motion.div
                                                        key={`${petData.background}-ground-ripple`}
                                                        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.1, 0.3, 0.1] }}
                                                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                                        style={{
                                                            position: 'absolute', bottom: '15%', left: '50%',
                                                            width: '240px', height: '60px',
                                                            margin: '0 0 0 -120px',
                                                            background: 'radial-gradient(ellipse, #FFD700 0%, transparent 70%)',
                                                            filter: 'blur(15px)', zIndex: 2
                                                        }}
                                                    />
                                                </>
                                            )}
                                        </motion.div>
                                    </AnimatePresence>

                                    <motion.div
                                        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                        style={{ position: 'absolute', bottom: '20%', width: '140px', height: '30px', background: 'rgba(0,0,0,0.2)', borderRadius: '50%', filter: 'blur(8px)', zIndex: 2 }}
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
                                        style={{ width: (petData.level === 3 || petData.level === 4) ? '264px' : '220px', height: (petData.level === 3 || petData.level === 4) ? '264px' : '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 5, cursor: 'pointer', background: 'transparent' }}
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

                                <AnimatePresence mode="wait">
                                    {!showConfirm ? (
                                        <motion.div 
                                            key="action-buttons"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            style={{ display: 'flex', gap: '12px' }}
                                        >
                                            <motion.button 
                                                whileHover={!isBusy ? { scale: 1.05 } : {}} 
                                                whileTap={!isBusy ? { scale: 0.95 } : {}} 
                                                onClick={() => setShowConfirm(true)} 
                                                disabled={isBusy}
                                                style={{ 
                                                    flex: 2, 
                                                    background: isBusy ? '#BDC3C7' : '#FF8A65', 
                                                    color: 'white', 
                                                    border: 'none', 
                                                    padding: '16px', 
                                                    borderRadius: '20px', 
                                                    fontSize: '1rem', 
                                                    fontWeight: 'bold', 
                                                    cursor: isBusy ? 'default' : 'pointer', 
                                                    boxShadow: isBusy ? '0 6px 0 #95A5A6' : '0 6px 0 #E64A19', 
                                                    display: 'flex', 
                                                    justifyContent: 'center', 
                                                    alignItems: 'center', 
                                                    gap: '10px',
                                                    opacity: isBusy ? 0.8 : 1
                                                }}
                                            >
                                                {isBusy ? '🍖 잠시만요...' : `🍖 먹이 주기 (${dragonConfig.feedCost}P)`}
                                            </motion.button>
                                            <motion.button 
                                                whileHover={{ scale: 1.05 }} 
                                                whileTap={{ scale: 0.95 }} 
                                                onClick={() => setIsShopOpen(true)} 
                                                style={{ 
                                                    flex: 1, 
                                                    background: '#3498DB', 
                                                    color: 'white', 
                                                    border: 'none', 
                                                    padding: '16px', 
                                                    borderRadius: '20px', 
                                                    fontSize: '1rem', 
                                                    fontWeight: 'bold', 
                                                    cursor: 'pointer', 
                                                    boxShadow: '0 6px 0 #2980B9', 
                                                    display: 'flex', 
                                                    justifyContent: 'center', 
                                                    alignItems: 'center', 
                                                    gap: '10px' 
                                                }}
                                            >
                                                🛍️ 상점
                                            </motion.button>
                                        </motion.div>
                                    ) : (
                                        <motion.div 
                                            key="confirm-buttons"
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            style={{ 
                                                background: '#FFF3E0', 
                                                padding: '20px', 
                                                borderRadius: '24px', 
                                                border: '2px solid #FFB74D',
                                                boxShadow: '0 8px 16px rgba(255,152,0,0.1)'
                                            }}
                                        >
                                            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#E65100', marginBottom: '8px' }}>🍖 먹이를 주시겠습니까?</div>
                                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: '#FB8C00' }}>현재</div>
                                                        <div style={{ fontWeight: 'bold' }}>{currentPoints.toLocaleString()}P</div>
                                                    </div>
                                                    <div style={{ fontSize: '1.2rem', color: '#FFB74D' }}>➜</div>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: '#FB8C00' }}>남은 포인트</div>
                                                        <div style={{ fontWeight: 'bold', color: '#E65100' }}>{(currentPoints - dragonConfig.feedCost).toLocaleString()}P</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button 
                                                    onClick={() => setShowConfirm(false)}
                                                    style={{ 
                                                        flex: 1, 
                                                        background: 'white', 
                                                        color: '#7F8C8D', 
                                                        border: '1px solid #DDD', 
                                                        padding: '12px', 
                                                        borderRadius: '14px', 
                                                        fontWeight: 'bold', 
                                                        cursor: 'pointer' 
                                                    }}
                                                >
                                                    취소
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        handleFeed();
                                                        setShowConfirm(false);
                                                    }}
                                                    style={{ 
                                                        flex: 1.5, 
                                                        background: '#FF9800', 
                                                        color: 'white', 
                                                        border: 'none', 
                                                        padding: '12px', 
                                                        borderRadius: '14px', 
                                                        fontWeight: 'bold', 
                                                        cursor: 'pointer',
                                                        boxShadow: '0 4px 0 #E65100'
                                                    }}
                                                >
                                                    확인
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default DragonHideoutModal;
