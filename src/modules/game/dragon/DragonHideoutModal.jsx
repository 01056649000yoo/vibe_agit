import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';

const BOND_PARTICLES = [
    { symbol: '💛', x: -92, y: -92, delay: 0 },
    { symbol: '✨', x: -48, y: -116, delay: 0.08 },
    { symbol: '✦', x: 12, y: -122, delay: 0.16 },
    { symbol: '💫', x: 76, y: -88, delay: 0.24 },
    { symbol: '✨', x: 98, y: -28, delay: 0.12 },
    { symbol: '💛', x: -104, y: -24, delay: 0.2 }
];

const getBondMessage = (bondCount) => {
    const messages = [
        '오늘의 인사를 기억할게요.',
        '네 글 이야기를 들으며 기분이 좋아졌어요.',
        '함께 아지트를 지켜볼게요.'
    ];
    return messages[Math.max(0, Number(bondCount || 1) - 1) % messages.length];
};

const DragonHideoutModal = ({
    isOpen, onClose, isMobile, petData, dragonInfo,
    HIDEOUT_BACKGROUNDS, daysSinceLastFed,
    handleBond, setIsShopOpen, isFlashing, isBusy
}) => {
    const [bondFeedback, setBondFeedback] = useState('idle');
    const feedbackTimerRef = useRef(null);

    useEffect(() => () => {
        if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    }, []);

    const handleBondClick = async () => {
        if (isBusy) return;
        setBondFeedback('saving');
        const success = await handleBond();
        if (!success) {
            setBondFeedback('idle');
            return;
        }

        setBondFeedback('success');
        if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = window.setTimeout(() => setBondFeedback('idle'), 2600);
    };

    return (

        <ModalPortal>
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
                        <ModalCloseButton
                            onClick={onClose}
                            label="작가 수호룡의 방 닫기"
                            style={{
                                position: 'absolute', top: '24px', right: '24px',
                                background: '#FFFFFF',
                                border: '1px solid #EEEEEE',
                                width: '40px', height: '40px', borderRadius: '50%',
                                cursor: 'pointer', zIndex: 10,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                color: '#7F8C8D',
                                fontWeight: 'bold'
                            }}
                        />

                        <div style={{ textAlign: 'center', marginBottom: '24px', position: 'relative' }}>
                            <h2 style={{ margin: 0, color: '#5D4037', fontWeight: '900', fontSize: '1.5rem' }}>🐉 작가 수호룡의 방</h2>
                            <p style={{ margin: '4px 0 0 0', color: '#8D6E63', fontSize: '0.9rem' }}>내가 쓴 글과 함께 자라는 아지트 친구</p>
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
                                    border: petData.level >= 10 ? '4px solid #FFD700' : `2px solid ${HIDEOUT_BACKGROUNDS[petData.background]?.border || '#DDD'}`,
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
                                                                duration: 0.5 + ((i * 37) % 10) / 20,
                                                                repeat: Infinity,
                                                                delay: ((i * 73) % 20) / 10
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
                                                                delay: (i * 1.47) % 6
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

                                                    {petData.level >= 10 && petData.exp >= 100 && (
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
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: [0, 0.75, 0], scale: [0.5, 1.25, 1.55] }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 1.25, ease: 'easeOut' }}
                                                style={{ position: 'absolute', left: '50%', top: '50%', width: '220px', height: '220px', margin: '-110px 0 0 -110px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,244,166,.95) 0%, rgba(255,193,7,.4) 42%, transparent 72%)', zIndex: 4, pointerEvents: 'none' }}
                                            />
                                        )}
                                    </AnimatePresence>

                                    <AnimatePresence>
                                        {isFlashing && BOND_PARTICLES.map((particle, index) => (
                                            <motion.span
                                                key={`bond-particle-${index}`}
                                                initial={{ x: 0, y: 10, opacity: 0, scale: 0.35 }}
                                                animate={{ x: particle.x, y: particle.y, opacity: [0, 1, 1, 0], scale: [0.35, 1.25, 1] }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 1.25, delay: particle.delay, ease: 'easeOut' }}
                                                style={{ position: 'absolute', left: '50%', top: '54%', zIndex: 30, fontSize: index % 2 === 0 ? '1.55rem' : '1.25rem', pointerEvents: 'none', filter: 'drop-shadow(0 2px 5px rgba(99,62,18,.28))' }}
                                            >
                                                {particle.symbol}
                                            </motion.span>
                                        ))}
                                    </AnimatePresence>

                                    <motion.div
                                        key={petData.level}
                                        animate={isFlashing
                                            ? { scale: [1, 1.18, 0.96, 1.08, 1], y: [0, -34, 3, -10, 0], rotate: [0, -6, 7, -3, 0] }
                                            : { scale: [0.96, 1.03, 0.98], y: [0, -10, 0], rotate: 0 }}
                                        transition={isFlashing
                                            ? { duration: 1.2, ease: 'easeInOut' }
                                            : { scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, y: { repeat: Infinity, duration: 3, ease: "easeInOut" } }}
                                        style={{ width: (dragonInfo.formLevel === 3 || dragonInfo.formLevel === 4) ? '264px' : '220px', height: (dragonInfo.formLevel === 3 || dragonInfo.formLevel === 4) ? '264px' : '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 5, cursor: 'pointer', background: 'transparent' }}
                                    >
                                        {!dragonInfo.isPlaceholder && (
                                            <img src={dragonInfo.image} alt={dragonInfo.name} style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'transparent', transform: `scale(${dragonInfo.imageScale})`, filter: `${dragonInfo.imageFilter} drop-shadow(0 10px 20px ${HIDEOUT_BACKGROUNDS[petData.background]?.glow || 'rgba(0,0,0,0.3)'}) ${petData.level >= 9 ? 'drop-shadow(0 0 25px rgba(255,193,7,0.8))' : ''}` }} />
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
                                            {petData.level >= 10 && petData.exp >= 100 && (
                                                <span style={{ display: 'block', fontSize: '0.7rem', background: 'linear-gradient(45deg, #FFD700, #FF5722)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', marginBottom: '4px', boxShadow: '0 2px 5px rgba(255,87,34,0.3)' }}>MASTER 🏆</span>
                                            )}
                                            <span style={{ fontSize: '1rem', color: '#8D6E63', fontWeight: 'bold' }}>Lv.{petData.level}</span>
                                        </div>
                                    </div>
                                    <div style={{ height: '14px', background: 'rgba(0,0,0,0.05)', borderRadius: '7px', overflow: 'hidden' }}>
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${petData.exp}%` }} style={{ height: '100%', background: petData.exp >= 100 ? 'linear-gradient(90deg, #FFD700, #FF8A65, #BA68C8, #4FC3F7)' : 'linear-gradient(90deg, #FFB300, #FBC02D)', borderRadius: '7px' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#8D6E63' }}>{daysSinceLastFed === 0 ? `오늘 교감했어요 · 총 ${Number(petData.bondCount || 0)}회` : daysSinceLastFed == null ? '첫 교감을 기다려요' : `마지막 교감 ${daysSinceLastFed}일 전`}</span>
                                        <span style={{ fontSize: '0.8rem', color: '#FBC02D', fontWeight: 'bold' }}>{petData.level < 10 ? `다음 모습까지 ${100 - petData.exp}%` : '전설의 작가 수호룡! 🌈'}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ background: '#FFFDE7', padding: '16px', borderRadius: '18px', border: '1px solid #FFF9C4' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#795548', lineHeight: '1.5' }}>
                                        <span style={{ fontWeight: 'bold' }}>💡 작가 수호룡 성장 안내</span><br />
                                        승인된 글이 쌓이면 작가 칭호와 함께 성장해요. 자주 접속하지 않아도 퇴화하지 않으며, 포인트는 아지트 꾸미기에만 사용해요.
                                    </div>
                                </div>

                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{ display: 'flex', gap: '12px' }}
                                >
                                            <motion.button 
                                                whileHover={!isBusy && bondFeedback !== 'success' ? { scale: 1.05 } : {}}
                                                whileTap={!isBusy && bondFeedback !== 'success' ? { scale: 0.95 } : {}}
                                                onClick={handleBondClick}
                                                disabled={isBusy || bondFeedback === 'success'}
                                                style={{ 
                                                    flex: 2, 
                                                    background: bondFeedback === 'success' ? '#43A047' : isBusy ? '#BDC3C7' : '#FF8A65',
                                                    color: 'white', 
                                                    border: 'none', 
                                                    padding: '16px', 
                                                    borderRadius: '20px', 
                                                    fontSize: '1rem', 
                                                    fontWeight: 'bold', 
                                                    cursor: isBusy || bondFeedback === 'success' ? 'default' : 'pointer',
                                                    boxShadow: bondFeedback === 'success' ? '0 6px 0 #2E7D32' : isBusy ? '0 6px 0 #95A5A6' : '0 6px 0 #E64A19',
                                                    display: 'flex', 
                                                    justifyContent: 'center', 
                                                    alignItems: 'center', 
                                                    gap: '10px',
                                                    opacity: isBusy ? 0.8 : 1
                                                }}
                                            >
                                                {bondFeedback === 'success' ? '💛 교감했어요!' : isBusy ? '🐉 마음을 나누는 중...' : '🐉 교감하기'}
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
                                                🎨 꾸미기
                                            </motion.button>
                                </motion.div>
                                <AnimatePresence>
                                    {bondFeedback === 'success' && (
                                        <motion.div
                                            role="status"
                                            aria-live="polite"
                                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            style={{ padding: '11px 14px', borderRadius: '15px', border: '1px solid #C8E6C9', background: '#F1F8E9', color: '#33691E', textAlign: 'center', fontSize: '0.88rem', fontWeight: '850' }}
                                        >
                                            {petData.name || '작가 수호룡'}: “{getBondMessage(petData.bondCount)}”
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        </ModalPortal>
    );
};

export default DragonHideoutModal;
