import React, { memo, Suspense } from 'react';
import { motion } from 'framer-motion';
import Button from '../../../../components/common/Button';
import FriendProfileCardBoundary from './FriendProfileCardBoundary';
import { getActiveFriendProfileCards } from './profileCardManifest';
import { getDragonStage, getHideoutBackground, normalizeFriendPet } from './dragonProfile';

const LoadingCard = ({ message }) => (
    <div style={{ marginBottom: '14px', padding: '36px 20px', borderRadius: '22px', background: '#FFFFFF', color: '#78909C', textAlign: 'center', fontWeight: 800 }}>
        {message}
    </div>
);

/** 나의 아지트와 같은 전체 화면 흐름으로 친구의 공개 공간을 보여 준다. */
const FriendProfileShell = ({ friend, viewerId, classId, onClose, onOpenPost }) => {
    if (!friend?.id || !viewerId) return null;

    const pet = normalizeFriendPet(friend.pet_data);
    const background = getHideoutBackground(pet.background);
    const dragon = getDragonStage(pet.level);
    const activeCards = getActiveFriendProfileCards();

    return (
        <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${friend.name}의 아지트`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 210 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 10001, overflowY: 'auto',
                background: 'linear-gradient(180deg,#FFFDF5 0%,#FFF8E1 100%)'
            }}
        >
            <div style={{ width: 'min(560px,100%)', margin: '0 auto', padding: '18px 18px 90px', boxSizing: 'border-box' }}>
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#3E2E23', fontSize: '1.3rem', fontWeight: 950 }}>
                            🏡 {friend.name}의 아지트
                        </h2>
                        <p style={{ margin: '3px 0 0', color: '#8D7B6C', fontSize: '.72rem', fontWeight: 800 }}>친구가 공개한 성장과 글을 구경해요</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="친구 아지트 닫기" style={{ border: 'none', background: 'none', color: '#8D7B6C', cursor: 'pointer', fontSize: '1.5rem' }}>✕</button>
                </header>

                <section aria-label={`${friend.name}의 아지트 소개`} style={{
                    position: 'relative', minHeight: '128px', marginBottom: '14px', padding: '16px', overflow: 'hidden',
                    border: `2px solid ${background.border}`, borderRadius: '24px', background: background.color,
                    boxShadow: `0 12px 28px ${background.glow}`
                }}>
                    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,rgba(255,255,255,.26),transparent 58%)' }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '92px minmax(0,1fr)', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '88px', height: '88px', display: 'grid', placeItems: 'center', borderRadius: '24px', background: 'rgba(255,255,255,.58)', border: `1px solid ${background.border}` }}>
                            <img src={dragon.image} alt="" aria-hidden="true" width="78" height="78" style={{ width: '78px', height: '78px', objectFit: 'contain', filter: `drop-shadow(0 6px 8px ${background.glow})` }} />
                        </div>
                        <div style={{ minWidth: 0, padding: '12px', borderRadius: '18px', background: 'rgba(255,255,255,.78)', color: '#3E2E23', backdropFilter: 'blur(5px)' }}>
                            <span style={{ display: 'block', color: '#80624D', fontSize: '.65rem', fontWeight: 950 }}>친구 아지트 방문 중</span>
                            <strong style={{ display: 'block', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1.12rem' }}>{friend.name}</strong>
                            <span style={{ display: 'block', marginTop: '4px', color: '#80624D', fontSize: '.72rem', fontWeight: 850 }}>{pet.name} · LV.{pet.level} {dragon.name}</span>
                        </div>
                    </div>
                </section>

                <main>
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
                </main>

                <footer style={{ marginTop: '18px' }}>
                    <Button variant="primary" onClick={onClose} style={{ width: '100%', minHeight: '50px', borderRadius: '16px', fontWeight: '900' }}>
                        친구 목록으로 돌아가기
                    </Button>
                </footer>
            </div>
        </motion.div>
    );
};

export default memo(FriendProfileShell);
