import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { getReaderLevel, getWriterLevel } from '../../../../../constants/writerLevels';
import DragonAvatar from '../../../../game/dragon/DragonAvatar';
import { getDragonGrowthFromWriterLevel, getDragonStage, getHideoutBackground, normalizeFriendPet } from '../dragonProfile';

const FriendDragonProfileCard = ({ friend }) => {
    const storedPet = normalizeFriendPet(friend?.pet_data);
    const writerLevel = getWriterLevel(
        friend?.writer_total_chars,
        friend?.writer_completed_posts,
        friend?.pet_data?._testWriterLevel
    );
    const growth = getDragonGrowthFromWriterLevel(writerLevel);
    const pet = { ...storedPet, level: growth.level, exp: growth.progress };
    const background = getHideoutBackground(pet.background);
    const readerLevel = getReaderLevel(friend?.reader_score, friend?.pet_data?._testReaderLevel);
    const dragon = getDragonStage(pet.level, pet.species);
    const exp = Math.min(100, Math.max(0, Number(pet.exp || 0)));

    return (
        <section
            aria-label={`${friend.name}의 작가 수호룡`}
            style={{
                position: 'relative', display: 'grid', gridTemplateColumns: '126px minmax(0,1fr)',
                minHeight: '164px', marginTop: '14px', overflow: 'hidden', border: `2px solid ${background.border}`,
                borderRadius: '23px', background: background.color, boxShadow: `0 10px 24px ${background.glow}`
            }}
        >
            <span aria-hidden="true" style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg,rgba(255,255,255,.08),transparent 45%), radial-gradient(circle at 17% 82%,rgba(255,255,255,.46),transparent 32%)'
            }} />
            <span style={{ position: 'relative', alignSelf: 'stretch', display: 'grid', placeItems: 'center', padding: '26px 4px 10px' }}>
                <span aria-hidden="true" style={{
                    position: 'absolute', left: '12px', top: '11px', padding: '4px 7px', borderRadius: '99px',
                    background: 'rgba(41,31,24,.58)', color: '#FFF7E5', fontSize: '.61rem', fontWeight: 950
                }}>🐉 작가 수호룡</span>
                <motion.span animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }} style={{ width: '116px', height: '116px' }}>
                    <DragonAvatar
                        dragon={dragon}
                        readerLevel={readerLevel}
                        backgroundId={pet.background}
                        alt={`${pet.name} ${dragon.species.name} 드래곤`}
                        style={{ width: '116px', height: '116px' }}
                        imageStyle={{ filter: `drop-shadow(0 8px 9px ${background.glow})` }}
                    />
                </motion.span>
            </span>
            <span style={{
                position: 'relative', alignSelf: 'center', minWidth: 0, margin: '12px 12px 12px 0', padding: '12px',
                borderRadius: '17px', background: 'rgba(255,255,255,.84)', color: '#3E2E23',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.8),0 4px 12px rgba(47,32,22,.12)', backdropFilter: 'blur(5px)'
            }}>
                <span style={{ display: 'block', color: '#9B6A23', fontSize: '.64rem', fontWeight: 950 }}>{dragon.species.name} · {dragon.name}</span>
                <strong style={{ display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1.02rem' }}>{pet.name}</strong>
                <span style={{ display: 'flex', justifyContent: 'space-between', marginTop: '9px', color: '#8A5B27', fontSize: '.7rem', fontWeight: 950 }}>
                    <span>{pet.level}/10단계</span><span>다음 모습 {exp}%</span>
                </span>
                <span style={{ display: 'block', height: '8px', marginTop: '6px', overflow: 'hidden', borderRadius: '99px', background: 'rgba(101,76,52,.13)' }}>
                    <motion.span initial={{ width: 0 }} animate={{ width: `${exp}%` }} style={{ display: 'block', height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg,#F2B92C,#E78632)' }} />
                </span>
                <span style={{ display: 'block', marginTop: '8px', color: '#7C654E', fontSize: '.64rem', fontWeight: 850 }}>
                    {friend.name} 친구의 글과 함께 자라고 있어요 💛
                </span>
            </span>
        </section>
    );
};

export default memo(FriendDragonProfileCard);
