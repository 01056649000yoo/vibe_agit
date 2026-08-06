import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';
import DragonHideoutScene from './DragonHideoutScene';
import DragonFarewellPanel from './DragonFarewellPanel';
import DragonSpeciesPicker from './DragonSpeciesPicker';
import { canReselectDragonSpecies, getReaderDragonEffect } from './presentation';
import './DragonHideoutModal.css';

const STORY_KIND_LABELS = new Map(Object.entries({
    mission: '과제 글',
    reading_log: '독서록',
    diary: '일기',
    free: '자유글'
}));

/**
 * 교감 반응은 그날 학생이 실제로 쓴 글에서 나온다.
 * 예전에는 문구 3개가 돌아가서 네 번째 교감부터 같은 말이 반복됐고, 눌러도 달라지는 것이 없었다.
 * 들려줄 글이 없으면 반응 대신 글쓰기로 안내해 교감이 글쓰기의 유인이 되게 한다.
 */
const getBondReaction = (bond) => {
    const kind = STORY_KIND_LABELS.get(bond?.storyKind) || '글';
    // `submitted` 는 오늘 승인받은 과제이거나 오늘 작성 완료한 독서록이다.
    if (bond?.storyState === 'submitted') {
        // 자율 글(독서록·일기)은 학생이 스스로 완료한 글이라 승인 문구를 쓰지 않는다.
        if (bond.storyKind === 'reading_log' || bond.storyKind === 'diary') {
            return bond.storyTitle
                ? `오늘 완성한 ${kind} 「${bond.storyTitle}」 잘 들었어. 다음 이야기도 들려줘!`
                : `오늘 ${kind}을 완성했구나. 이야기 잘 들었어!`;
        }
        return bond.storyTitle
            ? `선생님께 승인받은 「${bond.storyTitle}」 잘 들었어. 정말 멋진 글이야!`
            : `오늘 ${kind}이 승인됐구나. 이야기 잘 들었어!`;
    }
    // 오늘 냈지만 아직 승인 전이다. 글을 쓴 것은 사실이니 없다고 하지 않는다.
    if (bond?.storyState === 'writing') {
        return bond.storyTitle
            ? `「${bond.storyTitle}」 오늘 선생님께 보냈구나! 승인되면 자세히 들려줘.`
            : '오늘 쓴 글을 선생님께 보냈구나! 승인되면 자세히 들려줘.';
    }
    return '오늘은 아직 들려줄 이야기가 없네. 한 편 쓰고 다시 와 줄래?';
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
    selectSpecies,
    onGoWrite
}) => {
    const [bondFeedback, setBondFeedback] = useState('idle');
    const [bondReaction, setBondReaction] = useState(null);
    const [speciesPickerOpen, setSpeciesPickerOpen] = useState(() => !petData?.species);
    const readerEffect = getReaderDragonEffect(readerLevel);
    const canReselect = canReselectDragonSpecies(petData, petData.level);
    const exp = Math.min(100, Math.max(0, Number(petData?.exp || 0)));
    const bondStatus = daysSinceLastFed === 0
        ? `오늘 교감했어요 · 총 ${Number(petData?.bondCount || 0)}회`
        : daysSinceLastFed == null ? '첫 교감을 기다려요' : `마지막 교감 ${daysSinceLastFed}일 전`;

    // 반응에 글쓰기 안내가 붙을 수 있어 자동으로 사라지지 않는다. 학생이 읽고 움직일 시간을 준다.
    const handleBondClick = async () => {
        if (isBusy) return;
        setBondFeedback('saving');
        const bond = await handleBond();
        if (!bond) {
            setBondFeedback('idle');
            return;
        }
        setBondReaction(bond);
        setBondFeedback('success');
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
                                            {bondFeedback === 'success' ? '오늘 이야기를 들려줬어요!' : bondFeedback === 'saving' ? '이야기를 들려주는 중...' : '오늘 이야기 들려주기'}
                                        </button>
                                        <button type="button" className="dragon-room-modal__workshop" onClick={() => setIsShopOpen(true)}>
                                            아지트 공방
                                        </button>
                                    </div>

                                    <AnimatePresence>
                                        {bondFeedback === 'success' && bondReaction && (
                                            <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="dragon-room-modal__bond-message">
                                                <p>{petData.name || '작가 수호룡'}: “{getBondReaction(bondReaction)}”</p>
                                                {bondReaction.storyState === 'none' && onGoWrite && (
                                                    <div className="dragon-room-modal__bond-actions">
                                                        <button type="button" onClick={() => onGoWrite('mission_list')}>과제 글쓰기</button>
                                                        <button type="button" onClick={() => onGoWrite('reading_logs')}>독서록 쓰기</button>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <DragonFarewellPanel ownerName={ownerName} />
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
