import React, { useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import DragonHideoutScene from './DragonHideoutScene';
import {
    DEFAULT_EQUIPPED_DECOR,
    DRAGON_DECOR_COLLECTIONS,
    DRAGON_DECOR_RARITIES,
    DRAGON_DECOR_SLOTS,
    getDragonDecorCollectionItems,
    getDragonDecorItemsForSlot
} from './decorCatalog';
import { getDragonStage } from './presentation';
import './TeacherWorkshopPreview.css';

const formatPrice = (item) => {
    if (item.acquisitionType === 'achievement') return '작가 10 · 소통 7 달성 선물';
    if (Number(item.price || 0) > 0) return `${Number(item.price).toLocaleString('ko-KR')}P`;
    if (Number(item.requiredWriterLevel || 1) > 1) return `작가 ${item.requiredWriterLevel}단계 보상`;
    return '기본 제공';
};

const TeacherWorkshopPreview = () => {
    const [activeSlot, setActiveSlot] = useState(DRAGON_DECOR_SLOTS[0].id);
    const [equipped, setEquipped] = useState({ ...DEFAULT_EQUIPPED_DECOR });
    const [activeCollectionId, setActiveCollectionId] = useState(null);
    const items = useMemo(() => getDragonDecorItemsForSlot(activeSlot), [activeSlot]);
    const paidItemCount = useMemo(() => (
        DRAGON_DECOR_SLOTS.reduce((total, slot) => (
            total + getDragonDecorItemsForSlot(slot.id).filter((item) => Number(item.price || 0) > 0).length
        ), 0)
    ), []);
    const previewPet = useMemo(() => ({
        name: '공방 미리보기',
        species: 'star',
        level: 10,
        background: equipped.wallpaper,
        equippedDecor: equipped,
        ownedDecorItems: Object.values(equipped)
    }), [equipped]);
    const dragon = getDragonStage(7, 'star');

    const previewItem = (item) => {
        setEquipped((current) => ({ ...current, [item.slot]: item.id }));
        setActiveCollectionId(null);
    };

    const previewCollection = (collection) => {
        setEquipped({ ...collection.items });
        setActiveCollectionId(collection.id);
    };

    return (
        <section className="dragon-workshop-preview" aria-labelledby="dragon-workshop-preview-title">
            <header className="dragon-workshop-preview__header">
                <div>
                    <span className="dragon-teacher-eyebrow">WORKSHOP CATALOG</span>
                    <h3 id="dragon-workshop-preview-title">아지트 공방 상품 미리보기</h3>
                    <p>학생 상점의 실제 가격·구매 단계와 달성 선물을 확인하고, 5개 슬롯을 자유롭게 조합해 봅니다.</p>
                </div>
                <span className="dragon-workshop-preview__safe-badge">교사 전용 · 구매·저장 안 됨</span>
            </header>

            <div className="dragon-workshop-preview__summary">
                <div><small>유료 상품</small><strong>{paidItemCount}종</strong></div>
                <div><small>완성 세트</small><strong>{DRAGON_DECOR_COLLECTIONS.length}개</strong></div>
                <p>상품을 누르면 왼쪽 아지트에 바로 적용됩니다. 학생의 포인트와 보유 상품에는 영향을 주지 않습니다.</p>
            </div>

            <div className="dragon-workshop-preview__collections" aria-label="완성 아지트 세트">
                <div>
                    <span>CURATED ROOMS</span>
                    <strong>6개 완성 세트</strong>
                    <small>세트 전체를 먼저 보고 슬롯별 상품을 비교할 수 있습니다.</small>
                </div>
                {DRAGON_DECOR_COLLECTIONS.map((collection, index) => {
                    const totalPrice = getDragonDecorCollectionItems(collection.id)
                        .reduce((sum, item) => sum + Number(item.price || 0), 0);
                    return (
                        <button
                            type="button"
                            key={collection.id}
                            className={activeCollectionId === collection.id ? 'is-active' : ''}
                            style={{ '--collection-accent': collection.accent }}
                            aria-pressed={activeCollectionId === collection.id}
                            onClick={() => previewCollection(collection)}
                        >
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <strong>{collection.name}</strong>
                            <small>{collection.summary}</small>
                            <em>{collection.acquisitionType === 'achievement' ? '작가 10 · 소통 7 선물' : `${collection.levelFree ? '자유 구매 · ' : ''}${totalPrice.toLocaleString('ko-KR')}P`} · 전체 미리보기</em>
                        </button>
                    );
                })}
            </div>

            <div className="dragon-workshop-preview__layout">
                <section className="dragon-workshop-preview__stage" aria-label="공방 상품 조합 미리보기">
                    <div className="dragon-workshop-preview__stage-heading">
                        <div><small>선택한 상품 조합</small><strong>학생 아지트 표시 모습</strong></div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setEquipped({ ...DEFAULT_EQUIPPED_DECOR });
                                setActiveCollectionId(null);
                            }}
                        >
                            기본 조합으로
                        </Button>
                    </div>
                    <DragonHideoutScene
                        petData={previewPet}
                        dragon={dragon}
                        readerLevel={4}
                        ownerName="교사 미리보기"
                        eager
                    />
                    <div className="dragon-workshop-preview__equipped">
                        {DRAGON_DECOR_SLOTS.map((slot) => {
                            const selected = getDragonDecorItemsForSlot(slot.id).find((item) => item.id === equipped[slot.id]);
                            return (
                                <button type="button" key={slot.id} onClick={() => setActiveSlot(slot.id)}>
                                    <span aria-hidden="true">{slot.icon}</span>
                                    <small>{slot.name}</small>
                                    <strong>{selected?.name || '기본'}</strong>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section className="dragon-workshop-preview__catalog" aria-label="학생 공방 상품 목록">
                    <div className="dragon-workshop-preview__tabs" role="tablist" aria-label="꾸미기 상품 종류">
                        {DRAGON_DECOR_SLOTS.map((slot) => (
                            <button
                                type="button"
                                role="tab"
                                key={slot.id}
                                aria-selected={activeSlot === slot.id}
                                className={activeSlot === slot.id ? 'is-active' : ''}
                                onClick={() => setActiveSlot(slot.id)}
                            >
                                <span aria-hidden="true">{slot.icon}</span>
                                {slot.name}
                                <small>{getDragonDecorItemsForSlot(slot.id).length}종</small>
                            </button>
                        ))}
                    </div>

                    <div className="dragon-workshop-preview__catalog-heading">
                        <div>
                            <strong>{DRAGON_DECOR_SLOTS.find((slot) => slot.id === activeSlot)?.name}</strong>
                            <small>{DRAGON_DECOR_SLOTS.find((slot) => slot.id === activeSlot)?.description}</small>
                        </div>
                        <span>{items.length}종</span>
                    </div>

                    <div className="dragon-workshop-preview__items">
                        {items.map((item) => {
                            const rarity = DRAGON_DECOR_RARITIES[item.rarity];
                            const isSelected = equipped[item.slot] === item.id;
                            return (
                                <button
                                    type="button"
                                    key={item.id}
                                    className={isSelected ? 'is-selected' : ''}
                                    data-rarity={item.rarity || 'default'}
                                    aria-pressed={isSelected}
                                    onClick={() => previewItem(item)}
                                >
                                    <span
                                        className="dragon-workshop-preview__item-art"
                                        data-slot={item.slot}
                                        data-visual={item.preview || item.id}
                                        style={item.slot === 'wallpaper' ? {
                                            '--teacher-frame-color': item.border,
                                            '--teacher-frame-glow': item.glow
                                        } : undefined}
                                        aria-hidden="true"
                                    >
                                        {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" draggable="false" /> : <i />}
                                    </span>
                                    <span className="dragon-workshop-preview__item-copy">
                                        <span>{item.isLevelFree ? `자유 구매 · ${item.collectionName}` : item.collectionName || rarity?.name || (item.isDefault ? '기본' : '시그니처')}</span>
                                        <strong>{item.name}</strong>
                                        <small>{formatPrice(item)}{item.acquisitionType !== 'achievement' && Number(item.requiredWriterLevel || 1) > 1 ? ` · 작가 ${item.requiredWriterLevel}단계` : ''}</small>
                                    </span>
                                    <em>{isSelected ? '미리보기 중' : '적용해 보기'}</em>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
        </section>
    );
};

export default TeacherWorkshopPreview;
