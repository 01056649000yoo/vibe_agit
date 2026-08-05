import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';
import DragonAvatar from './DragonAvatar';
import { getDragonStage } from './presentation';
import './DragonGrowthCelebrationModal.css';

const PARTICLES = Array.from({ length: 14 }, (_, index) => index);

const DragonGrowthCelebrationModal = ({
    growth,
    species,
    dragonName,
    writerTitle,
    readerLevel,
    saving,
    onConfirm
}) => {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    if (!growth) return null;

    const previousDragon = getDragonStage(growth.fromLevel, species);
    const currentDragon = getDragonStage(growth.toLevel, species);

    return (
        <ModalPortal>
            <div className="dragon-growth-celebration" role="dialog" aria-modal="true" aria-labelledby="dragon-growth-title">
                <motion.div
                    className="dragon-growth-celebration__backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: .25 }}
                />
                <motion.section
                    className="dragon-growth-celebration__panel"
                    initial={{ opacity: 0, y: 28, scale: .94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 250, damping: 22 }}
                >
                    <ModalCloseButton
                        onClick={onConfirm}
                        disabled={saving}
                        autoFocus
                        label="성장 축하창 닫기"
                        className="dragon-growth-celebration__close"
                    />

                    <div className="dragon-growth-celebration__particles" aria-hidden="true">
                        {PARTICLES.map((index) => <span key={index} />)}
                    </div>

                    <header className="dragon-growth-celebration__header">
                        <span className="dragon-growth-celebration__eyebrow">작가 칭호 성장</span>
                        <h2 id="dragon-growth-title">수호룡이 새로운 모습으로 성장했어요!</h2>
                        <p>꾸준히 완성한 글이 {dragonName || '수호룡'}에게 멋진 힘이 되었어요.</p>
                    </header>

                    <div className="dragon-growth-celebration__scene">
                        <motion.div
                            className="dragon-growth-celebration__before"
                            initial={{ opacity: 0, x: -18 }}
                            animate={{ opacity: .62, x: 0 }}
                            transition={{ delay: .2 }}
                        >
                            <DragonAvatar dragon={previousDragon} readerLevel={1} alt={`성장 전 ${previousDragon.name}`} eager />
                            <span>{growth.fromLevel}단계</span>
                        </motion.div>

                        <motion.div
                            className="dragon-growth-celebration__beam"
                            aria-hidden="true"
                            initial={{ scaleX: 0, opacity: 0 }}
                            animate={{ scaleX: 1, opacity: 1 }}
                            transition={{ delay: .4, duration: .45 }}
                        >
                            <span>✦</span>
                        </motion.div>

                        <motion.div
                            className="dragon-growth-celebration__after"
                            initial={{ opacity: 0, scale: .62, rotate: -4 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            transition={{ delay: .55, type: 'spring', stiffness: 220, damping: 16 }}
                        >
                            <span className="dragon-growth-celebration__halo" aria-hidden="true" />
                            <DragonAvatar dragon={currentDragon} readerLevel={readerLevel} alt={`성장한 ${currentDragon.name}`} eager />
                            <strong>{growth.toLevel}단계</strong>
                        </motion.div>
                    </div>

                    <div className="dragon-growth-celebration__identity">
                        <span>{currentDragon.species.name}</span>
                        <strong>{currentDragon.name}</strong>
                        <em>작가 LV.{growth.toLevel} · {writerTitle}</em>
                    </div>

                    <button
                        type="button"
                        className="dragon-growth-celebration__confirm"
                        onClick={onConfirm}
                        disabled={saving}
                    >
                        {saving ? '새 모습을 기록하는 중…' : '새 모습 만나기'}
                    </button>
                </motion.section>
            </div>
        </ModalPortal>
    );
};

export default DragonGrowthCelebrationModal;
