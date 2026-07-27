import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { getDragonStage, getHideoutBackground, normalizeFriendPet } from '../dragonProfile';

const FriendDragonProfileCard = ({ friend }) => {
    const pet = normalizeFriendPet(friend?.pet_data);
    const background = getHideoutBackground(pet.background);
    const dragon = getDragonStage(pet.level);

    return (
        <section aria-label={`${friend.name}의 대표 드래곤`}>
            <div style={{
                position: 'relative', height: '320px', background: background.color,
                borderRadius: '24px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', border: `4px solid ${background.border}`,
                overflow: 'hidden', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.1)'
            }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.1) 100%)' }} />
                <motion.div
                    animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                    style={{ position: 'relative', zIndex: 2 }}
                >
                    <img src={dragon.image} alt={`${pet.name} 드래곤`} style={{ width: '260px', height: '260px', objectFit: 'contain', filter: `drop-shadow(0 20px 30px ${background.glow})` }} />
                </motion.div>
                <div style={{ position: 'absolute', bottom: '20%', width: '160px', height: '24px', background: 'rgba(0,0,0,0.15)', borderRadius: '50%', filter: 'blur(10px)', zIndex: 1 }} />
            </div>

            <div style={{
                marginTop: '20px', color: '#5D4037', background: '#FFF9C4',
                padding: '22px', borderRadius: '24px', border: '1px solid #FFE082',
                fontSize: '1rem', lineHeight: '1.6', textAlign: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.02)'
            }}>
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        <span>성장도</span>
                        <span>{pet.exp}%</span>
                    </div>
                    <div style={{ height: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '5px', overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pet.exp}%` }} style={{ height: '100%', background: pet.exp >= 100 ? 'linear-gradient(90deg, #FFD700, #BA68C8)' : 'linear-gradient(90deg, #FBC02D, #FFA000)', borderRadius: '5px' }} />
                    </div>
                </div>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💖</div>
                <strong>{friend.name}</strong> 친구가 정성을 다해 드래곤을 키우고 있어요!<br />
                멋진 드래곤으로 성장할 수 있게 응원해주세요.
            </div>
        </section>
    );
};

export default memo(FriendDragonProfileCard);
