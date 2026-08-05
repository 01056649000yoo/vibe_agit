import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';
import DragonHideoutScene from './DragonHideoutScene';
import DragonSpeciesPicker from './DragonSpeciesPicker';
import { canReselectDragonSpecies, getReaderDragonEffect } from './presentation';
import './DragonHideoutModal.css';

const getBondMessage = (bondCount) => {
    const messages = [
        '오늘의 인사를 기억할게요.',
        '네 글 이야기를 들으며 기분이 좋아졌어요.',
        '함께 아지트를 지켜볼게요.'
    ];
    return messages[Math.max(0, Number(bondCount || 1) - 1) % messages.length];
};

const DragonHideoutModal = ({
    isOpen,
    onClose,
    isMobile,
    petData,
    dragonInfo,
    ownerName,
    daysSinceLastFed,
    handleBond,
    setIsShopOpen,
    isFlashing,
    isBusy,
    readerLevel,
    selectSpecies
}) => {
    const [bondFeedback, setBondFeedback] = useState('idle');
    const [speciesPickerOpen, setSpeciesPickerOpen] = useState(() => !petData?.species);
    const feedbackTimerRef = useRef(null);
    const readerEffect = getReaderDragonEffect(readerLevel);
    const canReselect = canReselectDragonSpecies(petData, petData.level);
    const exp = Math.min(100, Math.max(0, Number(petData?.exp || 0)));
    const bondStatus = daysSinceLastFed === 0
        ? `오늘 교감했어요 · 총 ${Number(petData?.bondCount || 0)}회`
        : daysSinceLastFed == null ? '첫 교감을 기다려요' : `마지막 교감 ${daysSinceLastFed}일 전`;

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

    const handleSpeciesSelect = async (speciesId) => {
        const isReselection = Boolean(petData?.species);
        if (isReselection && !window.confirm('수호룡을 다시 고를 기회는 한 번뿐이에요. 이 모습으로 바꿀까요?')) return;
        const success = await selectSpecies(speciesId, { isReselection });
        if (success) setSpeciesPickerOpen(false);
    };

    return (
        <ModalPortal>
            <AnimatePresence>
                {isOpen && (
                    <div className={`dragon-room-modal${isMobile ? ' is-mobile' : ''}`} onClick={onClose}>
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-label="작가 수호룡의 방"
                            initial={{ y: isMobile ? '100%' : 32, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: isMobile ? '100%' : 32, opacity: 0 }}
                            className="dragon-room-modal__panel"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <header className="dragon-room-modal__header">
                                <div>
                                    <small>글과 독서로 자라는 나의 친구</small>
                                    <h2>작가 수호룡의 방</h2>
                                </div>
                                <ModalCloseButton onClick={onClose} label="작가 수호룡의 방 닫기" />
                            </header>

                            {speciesPickerOpen ? (
                                <DragonSpeciesPicker
                                    currentSpecies={petData?.species}
                                    isReselection={Boolean(petData?.species)}
                                    isBusy={isBusy}
                                    onSelect={handleSpeciesSelect}
                                    onCancel={petData?.species ? () => setSpeciesPickerOpen(false) : null}
                                />
                            ) : (
                                <div className="dragon-room-modal__content">
                                    <motion.div animate={isFlashing ? { scale: [1, 1.025, 1] } : {}} className="dragon-room-modal__scene">
                                        <DragonHideoutScene
                                            petData={petData}
                                            dragon={dragonInfo}
                                            readerLevel={readerLevel}
                                            ownerName={ownerName}
                                            eager
                                        />
                                    </motion.div>

                                    <section className="dragon-room-modal__status">
                                        <small>{dragonInfo.species.name} · {dragonInfo.name}</small>
                                        <h3>{petData.name || '나의 드래곤'}</h3>
                                        <div className="dragon-room-modal__badges">
                                            <span>작가 성장 {petData.level}/10</span>
                                            <span>독자 효과 {readerEffect.level}/7</span>
                                        </div>
                                        <div className="dragon-room-modal__progress" aria-label={`다음 성장 진행도 ${exp}%`}>
                                            <span style={{ width: `${exp}%` }} />
                                        </div>
                                        <div className="dragon-room-modal__progress-copy">
                                            <span>{bondStatus}</span>
                                            <strong>{petData.level < 10 ? `다음 모습까지 ${100 - exp}%` : '전설의 작가 수호룡'}</strong>
                                        </div>

                                        <div className="dragon-room-modal__reader">
                                            <span aria-hidden="true">✦</span>
                                            <div><strong>{readerEffect.name}</strong><small>{readerEffect.description}</small></div>
                                        </div>

                                        <p className="dragon-room-modal__guide">승인된 글은 수호룡을 성장시키고, 독서 활동은 빛 효과를 만들어요. 포인트는 아지트 공방에서 공간을 꾸미는 데만 사용해요.</p>
                                        {canReselect && (
                                            <button type="button" className="dragon-room-modal__reselect" onClick={() => setSpeciesPickerOpen(true)}>
                                                작가 3단계 기회로 수호룡 다시 고르기
                                            </button>
                                        )}
                                    </section>

                                    <div className="dragon-room-modal__actions">
                                        <button type="button" className="dragon-room-modal__bond" onClick={handleBondClick} disabled={isBusy || bondFeedback === 'success'}>
                                            {bondFeedback === 'success' ? '교감했어요!' : bondFeedback === 'saving' ? '마음을 나누는 중...' : '수호룡과 교감하기'}
                                        </button>
                                        <button type="button" className="dragon-room-modal__workshop" onClick={() => setIsShopOpen(true)}>
                                            아지트 공방
                                        </button>
                                    </div>

                                    <AnimatePresence>
                                        {bondFeedback === 'success' && (
                                            <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="dragon-room-modal__bond-message">
                                                {petData.name || '작가 수호룡'}: “{getBondMessage(petData.bondCount)}”
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </ModalPortal>
    );
};

export default DragonHideoutModal;
