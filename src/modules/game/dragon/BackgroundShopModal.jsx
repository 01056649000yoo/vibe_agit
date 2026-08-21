import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../../../components/common/ModalPortal';
import Button from '../../../components/common/Button';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import DragonHideoutScene from './DragonHideoutScene';
import {
    DRAGON_DECOR_COLLECTIONS,
    DRAGON_DECOR_RARITIES,
    DRAGON_DECOR_SLOTS,
    getDragonDecorCollectionItems,
    getDragonDecorItemsForSlot,
    normalizeDragonDecor
} from './decorCatalog';
import './BackgroundShopModal.css';

const BackgroundShopModal = ({
    isOpen,
    onClose,
    points,
    petData,
    dragonInfo,
    readerLevel,
    ownerName,
    buyDecorItem,
    equipDecorItem,
    isBusy
}) => {
    const [activeSlot, setActiveSlot] = useState('wallpaper');
    const [previewEquipped, setPreviewEquipped] = useState(null);
    const [previewCollectionId, setPreviewCollectionId] = useState(null);
    const [notice, setNotice] = useState('장착한 모습은 친구 아지트에도 그대로 보여요.');
    const decor = useMemo(() => normalizeDragonDecor(petData), [petData]);
    const items = getDragonDecorItemsForSlot(activeSlot);
    const activeSlotInfo = DRAGON_DECOR_SLOTS.find((slot) => slot.id === activeSlot);
    const previewPetData = useMemo(() => {
        if (!previewEquipped) return petData;
        return {
            ...petData,
            background: previewEquipped.wallpaper,
            equippedDecor: previewEquipped
        };
    }, [petData, previewEquipped]);

    if (!isOpen) return null;

    const handleBuy = async (item) => {
        const success = await buyDecorItem(item);
        if (success) setNotice(`${item.name}을(를) 구입했어요. 이제 장착할 수 있어요.`);
    };

    const handleEquip = async (item) => {
        const success = await equipDecorItem(item.slot, item.id);
        if (success) {
            setPreviewEquipped(null);
            setPreviewCollectionId(null);
            setNotice(`${item.name} 장착 완료! 친구 아지트에도 이 모습이 보여요.`);
        }
    };

    const previewCollection = (collection) => {
        setPreviewEquipped({ ...collection.items });
        setPreviewCollectionId(collection.id);
        setNotice(`${collection.name} 전체 조합이에요. 상품은 하나씩 구입하고 장착할 수 있어요.`);
    };

    const previewItem = (item) => {
        setPreviewEquipped((current) => ({ ...(current || decor.equipped), [item.slot]: item.id }));
        setPreviewCollectionId(null);
        setNotice(`${item.name} 미리보기예요. 구입하거나 장착하기 전에는 저장되지 않아요.`);
    };

    return (
        <ModalPortal>
            <div className="agit-workshop" onClick={onClose}>
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="아지트 공방"
                    initial={{ opacity: 0, scale: .96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="agit-workshop__panel"
                    onClick={(event) => event.stopPropagation()}
                >
                    <header className="agit-workshop__header">
                        <div>
                            <small>포인트로 꾸미는 나만의 공간</small>
                            <h3>아지트 공방</h3>
                            <p>보유 포인트 <strong>{Number(points || 0).toLocaleString()}P</strong></p>
                        </div>
                        <ModalCloseButton onClick={onClose} label="아지트 공방 닫기" />
                    </header>

                    <div className="agit-workshop__body">
                        <section className="agit-workshop__preview" aria-label="현재 아지트 미리보기">
                            <DragonHideoutScene
                                petData={previewPetData}
                                dragon={dragonInfo}
                                readerLevel={readerLevel}
                                ownerName={ownerName}
                                compact
                            />
                            <p role="status" aria-live="polite">{notice}</p>
                        </section>

                        <section className="agit-workshop__catalog">
                            <div className="agit-workshop__collections" aria-label="추천 아지트 세트">
                                <div className="agit-workshop__collections-heading">
                                    <span>5 COLLECTIONS</span>
                                    <strong>완성된 아지트부터 골라 보기</strong>
                                    <small>세트를 눌러 5개 상품 조합을 한 번에 미리 보세요.</small>
                                </div>
                                <div className="agit-workshop__collection-list">
                                    {DRAGON_DECOR_COLLECTIONS.map((collection, index) => {
                                        const totalPrice = getDragonDecorCollectionItems(collection.id)
                                            .reduce((sum, item) => sum + Number(item.price || 0), 0);
                                        return (
                                            <button
                                                key={collection.id}
                                                type="button"
                                                className={previewCollectionId === collection.id ? 'is-active' : ''}
                                                style={{ '--collection-accent': collection.accent }}
                                                aria-pressed={previewCollectionId === collection.id}
                                                onClick={() => previewCollection(collection)}
                                            >
                                                <span>{String(index + 1).padStart(2, '0')}</span>
                                                <strong>{collection.name}</strong>
                                                <small>{totalPrice.toLocaleString('ko-KR')}P</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="agit-workshop__tabs" role="tablist" aria-label="꾸미기 슬롯">
                                {DRAGON_DECOR_SLOTS.map((slot) => (
                                    <button
                                        key={slot.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeSlot === slot.id}
                                        className={activeSlot === slot.id ? 'is-active' : ''}
                                        onClick={() => setActiveSlot(slot.id)}
                                    >
                                        <span aria-hidden="true">{slot.icon}</span>
                                        {slot.name}
                                    </button>
                                ))}
                            </div>

                            <div className="agit-workshop__slot-heading">
                                <div>
                                    <strong>{activeSlotInfo?.name}</strong>
                                    <small>{activeSlotInfo?.description}</small>
                                </div>
                                <span>{decor.owned.size}개 보유</span>
                            </div>

                            <div className="agit-workshop__items">
                                {items.map((item) => {
                                    const isOwned = decor.owned.has(item.id);
                                    const isEquipped = Reflect.get(decor.equipped, item.slot) === item.id;
                                    const isLocked = Number(item.requiredWriterLevel || 1) > Number(petData?.level || 1);
                                    const rarity = Reflect.get(DRAGON_DECOR_RARITIES, item.rarity);
                                    return (
                                        <article key={item.id} data-slot={item.slot} data-rarity={item.rarity || 'default'} className={`agit-workshop__item${isEquipped ? ' is-equipped' : ''}${previewEquipped?.[item.slot] === item.id ? ' is-previewing' : ''}`}>
                                            <button
                                                type="button"
                                                className="agit-workshop__item-preview"
                                                data-slot={item.slot}
                                                data-visual={item.preview || item.id}
                                                style={item.slot === 'wallpaper' ? {
                                                    '--workshop-frame-color': item.border,
                                                    '--workshop-frame-glow': item.glow
                                                } : undefined}
                                                onClick={() => previewItem(item)}
                                                aria-label={`${item.name} 미리보기`}
                                            >
                                                {item.slot === 'nameplate' && (
                                                    <>
                                                        {item.image && <img src={item.image} alt="" loading="lazy" decoding="async" draggable="false" />}
                                                        <span>나의 아지트</span>
                                                    </>
                                                )}
                                                {item.slot === 'leftProp' || item.slot === 'rightProp' ? (
                                                    item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" draggable="false" /> : <span>비움</span>
                                                ) : null}
                                                {item.slot === 'pedestal' && <span />}
                                            </button>
                                            <div className="agit-workshop__item-copy">
                                                <div className="agit-workshop__item-badges">
                                                    {rarity && <span className="agit-workshop__rarity">{rarity.name}</span>}
                                                    {Number(item.price || 0) > 0 && (
                                                        <span className={`agit-workshop__collection-badge${item.collectionId ? '' : ' is-signature'}`}>
                                                            {item.collectionName || '시그니처'}
                                                        </span>
                                                    )}
                                                </div>
                                                <strong>{item.name}</strong>
                                                <small>
                                                    {isEquipped ? '현재 장착 중' : isOwned ? '보유 중' : isLocked ? `작가 ${item.requiredWriterLevel}단계 필요` : `${Number(item.price || 0).toLocaleString()}P`}
                                                </small>
                                            </div>
                                            {isOwned ? (
                                                <Button
                                                    size="sm"
                                                    variant={isEquipped ? 'ghost' : 'primary'}
                                                    disabled={isBusy || isEquipped}
                                                    onClick={() => handleEquip(item)}
                                                >
                                                    {isEquipped ? '장착 중' : '장착하기'}
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="primary"
                                                    disabled={isBusy || isLocked || Number(points || 0) < Number(item.price || 0)}
                                                    onClick={() => handleBuy(item)}
                                                >
                                                    {isLocked ? '잠김' : Number(points || 0) < Number(item.price || 0) ? '포인트 부족' : '구입하기'}
                                                </Button>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </motion.div>
            </div>
        </ModalPortal>
    );
};

export default BackgroundShopModal;
