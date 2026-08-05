import React, { memo } from 'react';
import { getReaderLevel, getWriterLevel } from '../../../../../constants/writerLevels';
import DragonHideoutScene from '../../../../game/dragon/DragonHideoutScene';
import { getDragonGrowthFromWriterLevel, getDragonStage, normalizeFriendPet } from '../dragonProfile';

const FriendDragonProfileCard = ({ friend }) => {
    const storedPet = normalizeFriendPet(friend?.pet_data);
    const writerLevel = getWriterLevel(
        friend?.writer_total_chars,
        friend?.writer_completed_posts,
        friend?.pet_data?._testWriterLevel
    );
    const growth = getDragonGrowthFromWriterLevel(writerLevel);
    const pet = { ...storedPet, level: growth.level, exp: growth.progress };
    const readerLevel = getReaderLevel(friend?.reader_score, friend?.pet_data?._testReaderLevel);
    const dragon = getDragonStage(pet.level, pet.species);
    const exp = Math.min(100, Math.max(0, Number(pet.exp || 0)));

    return (
        <section aria-label={`${friend.name}의 작가 수호룡과 아지트 꾸미기`} style={{ marginTop: '14px', padding: '14px', border: '1px solid #E2D7CC', borderRadius: '24px', background: '#FFFFFF', boxShadow: '0 10px 24px rgba(73,52,37,.08)' }}>
            <DragonHideoutScene
                petData={pet}
                dragon={dragon}
                readerLevel={readerLevel}
                ownerName={friend.name}
            />
            <div style={{ padding: '14px 4px 3px' }}>
                <small style={{ display: 'block', color: '#9B6A23', fontSize: '.64rem', fontWeight: 950 }}>{dragon.species.name} · {dragon.name}</small>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginTop: '3px' }}>
                    <strong style={{ overflow: 'hidden', color: '#3E2E23', fontSize: '1.02rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pet.name}</strong>
                    <span style={{ flexShrink: 0, color: '#496D7E', fontSize: '.68rem', fontWeight: 900 }}>{readerLevel.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '9px', color: '#8A5B27', fontSize: '.68rem', fontWeight: 900 }}>
                    <span>작가 성장 {pet.level}/10</span><span>다음 모습 {exp}%</span>
                </div>
                <span style={{ display: 'block', height: '8px', marginTop: '6px', overflow: 'hidden', borderRadius: '99px', background: 'rgba(101,76,52,.13)' }}>
                    <span style={{ display: 'block', width: `${exp}%`, height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg,#F2B92C,#E78632)' }} />
                </span>
                <p style={{ margin: '9px 0 0', color: '#7C654E', fontSize: '.65rem', fontWeight: 800, lineHeight: 1.45 }}>
                    친구가 장착한 벽지·받침대·좌우 소품·문패가 그대로 전시돼요.
                </p>
            </div>
        </section>
    );
};

export default memo(FriendDragonProfileCard);
