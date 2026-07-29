import React, { memo, Suspense } from 'react';
import { motion } from 'framer-motion';
import Button from '../../../../components/common/Button';
import FriendProfileCardBoundary from './FriendProfileCardBoundary';
import { getActiveFriendProfileCards } from './profileCardManifest';
import { getDragonStage, getHideoutBackground, normalizeFriendPet } from './dragonProfile';

const LoadingCard = ({ message }) => (
    <div style={{ marginTop: '24px', padding: '36px 20px', borderRadius: '24px', background: '#F8F9FA', color: '#78909C', textAlign: 'center', fontWeight: '800' }}>
        {message}
    </div>
);

const FriendProfileShell = ({ friend, viewerId, classId, onClose, onOpenPost, isMobile }) => {
    if (!friend?.id || !viewerId) return null;

    const pet = normalizeFriendPet(friend.pet_data);
    const background = getHideoutBackground(pet.background);
    const dragon = getDragonStage(pet.level);
    const activeCards = getActiveFriendProfileCards();

    return (
        <div
            role="presentation"
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(10px)', zIndex: 10001, display: 'flex',
                justifyContent: 'center', alignItems: 'center', padding: isMobile ? '10px' : '20px'
            }}
            onClick={onClose}
        >
            <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={`${friend.name}의 아지트 정보`}
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.97, opacity: 0 }}
                onClick={(event) => event.stopPropagation()}
                style={{
                    background: 'white', width: '100%', maxWidth: '680px', maxHeight: isMobile ? '96vh' : '92vh',
                    borderRadius: isMobile ? '24px' : '32px', position: 'relative',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column'
                }}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="친구 아지트 닫기"
                    style={{
                        position: 'absolute', top: '18px', right: '18px', background: 'rgba(255,255,255,.38)',
                        border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer',
                        fontWeight: 'bold', zIndex: 10, color: background.textColor, backdropFilter: 'blur(5px)'
                    }}
                >✕</button>

                <header style={{ padding: isMobile ? '28px 62px 22px 22px' : '34px 72px 26px 34px', background: background.color, borderBottom: `3px solid ${background.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '66px', height: '66px', flex: '0 0 66px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px', background: 'rgba(255,255,255,.55)', border: `1px solid ${background.border}` }}>
                            <img src={dragon.image} alt="" style={{ width: '52px', height: '52px', objectFit: 'contain' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <span style={{ color: background.subColor, fontSize: '.78rem', fontWeight: 950 }}>🏠 친구 아지트 방문 중</span>
                            <h2 style={{ margin: '3px 0 2px', color: background.textColor, fontSize: isMobile ? '1.45rem' : '1.75rem', fontWeight: 950 }}>{friend.name}의 정보창</h2>
                            <span style={{ color: background.subColor, fontSize: '.9rem', fontWeight: 800 }}>{pet.name} · Lv.{pet.level} {dragon.name}</span>
                        </div>
                    </div>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '22px 16px' : '28px 30px 34px' }}>
                    {activeCards.map((card) => {
                        const CardComponent = card.component;
                        return (
                            <FriendProfileCardBoundary key={card.id} cardId={card.id} title={card.title} resetKey={`${friend.id}:${card.id}`}>
                                <Suspense fallback={<LoadingCard message={card.loadingMessage} />}>
                                    <CardComponent
                                        friend={friend}
                                        friendId={friend.id}
                                        friendName={friend.name}
                                        viewerId={viewerId}
                                        classId={classId}
                                        onOpenPost={onOpenPost}
                                    />
                                </Suspense>
                            </FriendProfileCardBoundary>
                        );
                    })}
                </div>

                <footer style={{ padding: isMobile ? '16px' : '20px 24px', background: '#F8F9FA', borderTop: '1px solid #E9ECEF', textAlign: 'center' }}>
                    <Button variant="primary" onClick={onClose} style={{ width: '100%', borderRadius: '16px', fontWeight: 'bold', height: '52px' }}>
                        구경 마치기
                    </Button>
                </footer>
            </motion.div>
        </div>
    );
};

export default memo(FriendProfileShell);
