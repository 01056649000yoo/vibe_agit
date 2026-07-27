import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { getDragonStage, getHideoutBackground, normalizeFriendPet } from './dragonProfile';

const FriendHideoutPreviewCard = ({ friend, onSelect }) => {
    const pet = normalizeFriendPet(friend?.pet_data);
    const dragon = getDragonStage(pet.level);
    const background = getHideoutBackground(pet.background);

    return (
        <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            onClick={() => onSelect(friend)}
            aria-label={`${friend.name}의 아지트 방문`}
            style={{
                position: 'relative', overflow: 'hidden', background: background.color,
                padding: '22px', borderRadius: '26px', minHeight: '150px', width: '100%',
                boxShadow: `0 8px 22px ${background.glow}`, cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${background.border}`, display: 'flex', alignItems: 'center', gap: '16px'
            }}
        >
            <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg,rgba(255,255,255,.18),transparent 55%)', pointerEvents: 'none' }} />
            <span style={{
                width: '64px', height: '64px', background: background.color,
                borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', border: `1px solid ${background.border}`, position: 'relative', zIndex: 1,
                boxShadow: '0 6px 16px rgba(0,0,0,.12)'
            }}>
                <img src={dragon.image} alt="" style={{ width: '45px', height: '45px', objectFit: 'contain' }} />
            </span>
            <span style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <span style={{ display: 'block', fontSize: '0.8rem', color: background.subColor, fontWeight: '900' }}>🏠 {friend.name}의 아지트</span>
                <strong style={{ display: 'block', marginTop: '3px', fontSize: '1.1rem', fontWeight: '950', color: background.textColor }}>{pet.name}</strong>
                <span style={{ display: 'block', fontSize: '0.75rem', color: background.subColor, fontWeight: 'bold' }}>Lv.{pet.level} {dragon.name}</span>
                <span style={{ display: 'block', height: '4px', background: 'rgba(255,255,255,.52)', borderRadius: '2px', overflow: 'hidden', marginTop: '6px', width: '80%' }}>
                    <span style={{ display: 'block', width: `${pet.exp}%`, height: '100%', background: pet.exp >= 100 ? 'linear-gradient(90deg, #FFD700, #BA68C8)' : '#FBC02D', transition: 'width 0.5s ease' }} />
                </span>
            </span>
            <span aria-hidden="true" style={{ position: 'relative', zIndex: 1, color: background.textColor, fontSize: '1.2rem' }}>→</span>
        </motion.button>
    );
};

export default memo(FriendHideoutPreviewCard);
