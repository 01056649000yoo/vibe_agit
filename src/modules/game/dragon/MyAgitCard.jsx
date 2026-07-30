import React from 'react';
import { motion } from 'framer-motion';
import { getDragonStage, getHideoutBackground } from './presentation';

const INK = '#3E2E23';

/**
 * 나의 아지트 모듈 슬롯.
 * 카드의 표현과 드래곤 상태 해석을 모듈이 소유해, 드래곤 업데이트가 공통 셸 수정 없이 반영된다.
 */
const MyAgitCard = ({ runtime, onOpen }) => {
    const petData = runtime?.petData;
    if (!petData) return null;

    const level = Number(petData.level || 1);
    const exp = Math.min(100, Math.max(0, Number(petData.exp || 0)));
    const days = Math.max(0, Number(runtime?.daysSinceLastFed || 0));
    const careLimit = Math.max(1, Number(runtime?.dragonConfig?.degenDays || 14));
    const needsCare = days >= Math.max(1, careLimit - 2);
    const careText = days === 0 ? '오늘 돌봤어요' : `마지막 먹이 ${days}일 전`;
    const mastered = level >= 5 && exp >= 100;
    const dragonInfo = getDragonStage(level);
    const habitat = getHideoutBackground(petData.background);

    return (
        <motion.button
            type="button"
            onClick={onOpen}
            aria-label={`${petData.name || '나의 드래곤'}, 레벨 ${level}, ${dragonInfo.name}. 드래곤 방 들어가기`}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            style={{
                position: 'relative', display: 'grid', gridTemplateColumns: '126px minmax(0,1fr)',
                width: '100%', minHeight: '164px', marginBottom: '14px', padding: 0, overflow: 'hidden',
                border: `2px solid ${habitat.border}`, borderRadius: '23px', background: habitat.color,
                boxShadow: `0 10px 24px ${habitat.glow}`, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', color: habitat.textColor
            }}
        >
            <span aria-hidden="true" style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg,rgba(255,255,255,.08),transparent 45%), radial-gradient(circle at 17% 82%,rgba(255,255,255,.46),transparent 32%)'
            }} />
            <span style={{
                position: 'relative', alignSelf: 'stretch', display: 'grid', placeItems: 'center',
                minWidth: 0, padding: '26px 4px 10px'
            }}>
                <span aria-hidden="true" style={{
                    position: 'absolute', left: '12px', top: '11px', padding: '4px 7px', borderRadius: '99px',
                    background: 'rgba(41,31,24,.58)', color: '#FFF7E5', fontSize: '.61rem', fontWeight: 950
                }}>🐉 나의 반려 드래곤</span>
                <img
                    src={dragonInfo.image}
                    alt=""
                    aria-hidden="true"
                    width="116"
                    height="116"
                    style={{
                        display: 'block', width: '116px', height: '116px', objectFit: 'contain',
                        filter: `drop-shadow(0 8px 9px ${habitat.glow})`
                    }}
                />
            </span>
            <span style={{
                position: 'relative', alignSelf: 'center', minWidth: 0, margin: '12px 12px 12px 0',
                padding: '12px', borderRadius: '17px', background: 'rgba(255,255,255,.82)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.8), 0 4px 12px rgba(47,32,22,.12)',
                color: INK, backdropFilter: 'blur(5px)'
            }}>
                <span style={{ display: 'block', color: '#9B6A23', fontSize: '.64rem', fontWeight: 950 }}>{dragonInfo.name}</span>
                <span style={{
                    display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: INK, fontSize: '1.02rem', fontWeight: 950
                }}>{petData.name || '나의 드래곤'}</span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '7px', marginTop: '8px' }}>
                    <span style={{ color: '#8A5B27', fontSize: '.7rem', fontWeight: 950 }}>LV.{level}</span>
                    <span style={{ color: needsCare ? '#C74735' : '#527453', fontSize: '.64rem', fontWeight: 900 }}>
                        {needsCare ? '🍖 돌봐주세요' : `● ${careText}`}
                    </span>
                </span>
                <span aria-label={mastered ? '성장 완료' : `성장 경험치 ${exp}%`} style={{
                    display: 'block', height: '8px', marginTop: '6px', overflow: 'hidden', borderRadius: '99px',
                    background: 'rgba(101,76,52,.13)'
                }}>
                    <span style={{
                        display: 'block', width: `${exp}%`, height: '100%', borderRadius: 'inherit',
                        background: mastered
                            ? 'linear-gradient(90deg,#F2B92C,#EA6A59,#7C78E8)'
                            : 'linear-gradient(90deg,#F2B92C,#E78632)'
                    }} />
                </span>
                <span style={{ display: 'block', marginTop: '7px', color: '#7C654E', fontSize: '.64rem', fontWeight: 900 }}>
                    {mastered ? '최고 단계까지 자랐어요 ✨' : `성장 ${exp}%`} · 방에 들어가기 ›
                </span>
            </span>
        </motion.button>
    );
};

export default MyAgitCard;
