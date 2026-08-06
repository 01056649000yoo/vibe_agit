import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../../../components/common/ModalPortal';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import { READER_LEVELS, WRITER_LEVELS } from '../../../constants/writerLevels';
import useMyTitleStatus from './useMyTitleStatus';

const INK = '#3E2E23';
const INK_SOFT = '#8D7B6C';
const LINE = 'rgba(62,46,35,.10)';
const num = (value) => Number(value || 0).toLocaleString('ko-KR');
const titleBadgeSrc = (kind, level) => `/assets/title-badges/${kind}-level-${level}.webp`;

const BadgeButton = ({ kind, level, loading, errorMessage, onClick }) => {
    const writer = kind === 'writer';
    const accent = writer ? '#F4B740' : '#72B7FF';
    const deepAccent = writer ? '#9A5B00' : '#145EA8';
    const totalLevels = writer ? WRITER_LEVELS.length : READER_LEVELS.length;

    return (
        <motion.button
            type="button"
            onClick={onClick}
            aria-label={`${writer ? '작가' : '독자'} 칭호 설명 보기`}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            style={{
                position: 'relative', minWidth: 0, minHeight: '166px', padding: '11px 10px 12px', overflow: 'hidden',
                border: `1px solid ${writer ? 'rgba(255,211,117,.48)' : 'rgba(139,199,255,.48)'}`, borderRadius: '19px',
                background: writer
                    ? 'linear-gradient(155deg,rgba(255,247,220,.98),rgba(255,220,143,.92))'
                    : 'linear-gradient(155deg,rgba(237,248,255,.98),rgba(171,216,255,.92))',
                boxShadow: `inset 0 1px 0 rgba(255,255,255,.9), 0 8px 18px ${writer ? 'rgba(81,48,8,.18)' : 'rgba(8,54,98,.2)'}`,
                cursor: 'pointer', color: INK, fontFamily: 'inherit', textAlign: 'center'
            }}
        >
            <span aria-hidden="true" style={{
                position: 'absolute', width: '108px', height: '108px', left: '50%', top: '40px', transform: 'translateX(-50%)',
                borderRadius: '50%', background: `radial-gradient(circle,${accent}42 0%,${accent}14 48%,transparent 70%)`
            }} />
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ color: deepAccent, fontSize: '.68rem', fontWeight: 950, letterSpacing: '.02em' }}>
                    {writer ? '✍️ 작가 칭호' : '📖 독자 칭호'}
                </span>
                <span aria-hidden="true" style={{
                    width: '20px', height: '20px', display: 'grid', placeItems: 'center', borderRadius: '50%',
                    background: 'rgba(255,255,255,.7)', border: `1px solid ${accent}90`, color: deepAccent,
                    fontSize: '.68rem', fontWeight: 950
                }}>i</span>
            </span>
            <span style={{ position: 'relative', display: 'inline-block', marginTop: '2px' }}>
                <img src={titleBadgeSrc(kind, level.level)} alt="" aria-hidden="true" width="82" height="82"
                    style={{ display: 'block', width: '82px', height: '82px', objectFit: 'contain', filter: 'drop-shadow(0 6px 7px rgba(35,27,22,.2))' }} />
            </span>
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-2px' }}>
                <span style={{
                    padding: '3px 7px', borderRadius: '99px', background: deepAccent, color: '#FFFFFF',
                    fontSize: '.62rem', fontWeight: 950, boxShadow: '0 2px 5px rgba(31,28,25,.15)'
                }}>LV.{level.level} / {totalLevels}</span>
            </span>
            <span style={{ position: 'relative', display: 'block', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#342820', fontSize: '.86rem', fontWeight: 950 }}>
                {loading ? '살펴보는 중...' : errorMessage ? '확인 필요' : level.name}
            </span>
        </motion.button>
    );
};

const titleRequirement = (kind, item) => {
    if (item.from === 0) return '시작';
    if (kind === 'writer' && item.criterion === 'posts') return `승인 글 ${num(item.from)}편`;
    return `${num(item.from)}${kind === 'writer' ? '자' : '점'}`;
};

const TitleGuide = ({ kind, currentLevel, currentValue, currentUnit, onClose }) => {
    if (!kind) return null;
    const writer = kind === 'writer';
    const levels = writer ? WRITER_LEVELS : READER_LEVELS;
    const accent = writer ? '#C77712' : '#2768B7';

    return (
        <ModalPortal>
            <div onClick={onClose} role="presentation" style={{
                position: 'fixed', inset: 0, zIndex: 3600, display: 'grid', placeItems: 'center', padding: '18px',
                background: 'rgba(45,32,24,.58)', backdropFilter: 'blur(5px)'
            }}>
                <section role="dialog" aria-modal="true" aria-label={`${writer ? '작가' : '독자'} 칭호 단계 설명`}
                    onClick={(event) => event.stopPropagation()} style={{
                        width: 'min(440px,100%)', maxHeight: '84vh', overflowY: 'auto', borderRadius: '26px',
                        background: '#FFFDF7', boxShadow: '0 24px 60px rgba(45,32,24,.3)'
                    }}>
                    <header style={{
                        position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '16px 18px 13px', background: 'rgba(255,253,247,.96)', borderBottom: `1px solid ${LINE}`
                    }}>
                        <img src={titleBadgeSrc(kind, currentLevel.level)} alt="" aria-hidden="true" width="62" height="62"
                            style={{ width: '62px', height: '62px', objectFit: 'contain' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: INK_SOFT, fontSize: '.7rem', fontWeight: 900 }}>{writer ? '✍️ 작가 칭호' : '📖 독자 칭호'}</div>
                            <h3 style={{ margin: '2px 0 0', color: INK, fontSize: '1.08rem', fontWeight: 950 }}>{currentLevel.name}</h3>
                            <div style={{ marginTop: '2px', color: accent, fontSize: '.72rem', fontWeight: 900 }}>
                                LV. {currentLevel.level} · {num(currentValue)}{currentUnit}
                            </div>
                        </div>
                        <ModalCloseButton onClick={onClose} label="칭호 설명 닫기"
                            style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', color: INK_SOFT }} />
                    </header>
                    <div style={{ padding: '14px 18px 20px' }}>
                        <p style={{ margin: '0 0 13px', color: INK_SOFT, fontSize: '.78rem', fontWeight: 750, lineHeight: 1.55 }}>
                            {writer
                                ? '승인된 글을 한 편 완성하면 첫 칭호가 열리고, 그다음부터는 지금까지 쓴 글자 수로 성장해요.'
                                : '친구의 서로 다른 글에 공감하거나 댓글을 남기면 1점, 댓글은 20자마다 보너스 1점이 붙어요. 한 글에서는 최대 4점까지 얻어요.'}
                        </p>
                        <div style={{ display: 'grid', gap: '7px' }}>
                            {levels.map((item) => {
                                const current = item.level === currentLevel.level;
                                const achieved = item.level <= currentLevel.level;
                                return (
                                    <div key={item.level} style={{
                                        display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', alignItems: 'center', gap: '9px',
                                        padding: '9px 11px', borderRadius: '13px', background: current ? `${accent}12` : '#FFFFFF',
                                        border: current ? `1.5px solid ${accent}70` : `1px solid ${LINE}`
                                    }}>
                                        <span style={{ position: 'relative', width: '40px', height: '40px', display: 'grid', placeItems: 'center' }}>
                                            <img src={titleBadgeSrc(kind, item.level)} alt="" aria-hidden="true" width="40" height="40" loading="lazy"
                                                style={{ width: '40px', height: '40px', objectFit: 'contain', filter: achieved ? 'none' : 'grayscale(1)', opacity: achieved ? 1 : .42 }} />
                                            {!achieved && <span aria-hidden="true" style={{ position: 'absolute', right: '-2px', bottom: '-2px', fontSize: '.7rem' }}>🔒</span>}
                                        </span>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', color: INK, fontSize: '.8rem', fontWeight: current ? 950 : 850 }}>
                                                LV.{item.level} {item.name}
                                            </span>
                                            {current && <span style={{ display: 'block', marginTop: '1px', color: accent, fontSize: '.64rem', fontWeight: 900 }}>지금 나의 칭호</span>}
                                        </span>
                                        <span style={{ color: achieved ? accent : INK_SOFT, fontSize: '.69rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                                            {titleRequirement(kind, item)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

const MyTitleStatusPanel = ({ active = true, studentSession, points = 0 }) => {
    const [activeGuide, setActiveGuide] = useState(null);
    const { status, writerLevel, readerLevel, loading, errorMessage } = useMyTitleStatus({ studentSession, active });

    useEffect(() => {
        if (!activeGuide) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setActiveGuide(null);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [activeGuide]);

    return (
        <>
            <section aria-label="나의 작가·독자 칭호" style={{
                position: 'relative', padding: '16px', overflow: 'hidden', borderRadius: '24px',
                border: '1px solid rgba(255,226,168,.38)',
                background: 'radial-gradient(circle at 8% 0%,rgba(255,210,109,.28),transparent 34%), radial-gradient(circle at 100% 100%,rgba(90,164,235,.22),transparent 38%), linear-gradient(145deg,#3B2924 0%,#503A32 48%,#263E56 100%)',
                boxShadow: '0 14px 30px rgba(62,46,35,.18)', margin: '14px 0'
            }}>
                <span aria-hidden="true" style={{ position: 'absolute', right: '-28px', top: '-34px', width: '112px', height: '112px', border: '1px solid rgba(255,255,255,.1)', borderRadius: '50%' }} />
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FFD987', fontSize: '.64rem', fontWeight: 950, letterSpacing: '.08em' }}>
                            <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7FE0A0', boxShadow: '0 0 8px #7FE0A0' }} />
                            나의 성장 상태
                        </div>
                        <div style={{ marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1.08rem', fontWeight: 950, color: '#FFFFFF' }}>
                            {studentSession?.name || '나'}의 칭호
                        </div>
                    </div>
                    <div role="group" aria-label={`보유 포인트 ${num(points)}점`} style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px 7px 8px',
                        border: '1px solid rgba(255,224,143,.42)', borderRadius: '15px', background: 'rgba(255,255,255,.12)'
                    }}>
                        <span aria-hidden="true" style={{
                            width: '31px', height: '31px', display: 'grid', placeItems: 'center', borderRadius: '50%',
                            background: 'linear-gradient(145deg,#FFE991,#F2AD27)', border: '2px solid #FFF1B6',
                            color: '#9B5B00', fontSize: '.9rem', fontWeight: 950
                        }}>★</span>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ color: 'rgba(255,255,255,.65)', fontSize: '.55rem', fontWeight: 850 }}>보유 포인트</div>
                            <div style={{ marginTop: '1px', color: '#FFE38A', fontSize: '1.05rem', fontWeight: 950, lineHeight: 1 }}>
                                {num(points)}<span style={{ marginLeft: '2px', fontSize: '.62rem', color: '#FFFFFF' }}>P</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px', marginTop: '13px' }}>
                    <BadgeButton kind="writer" level={writerLevel} loading={loading} errorMessage={errorMessage} onClick={() => setActiveGuide('writer')} />
                    <BadgeButton kind="reader" level={readerLevel} loading={loading} errorMessage={errorMessage} onClick={() => setActiveGuide('reader')} />
                </div>
                <div style={{ position: 'relative', marginTop: '9px', textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: '.64rem', fontWeight: 800 }}>
                    {status.season?.name || '현재 학기'} · {status.season?.status === 'closing' ? '성장 기록 완료' : status.season?.status === 'closed' ? '보관된 성장' : '이번 학기 성장'} · 칭호 카드를 눌러 단계를 확인해요
                </div>
            </section>

            <TitleGuide
                kind={activeGuide}
                currentLevel={activeGuide === 'reader' ? readerLevel : writerLevel}
                currentValue={activeGuide === 'reader' ? status.readerScore : writerLevel.progressValue}
                currentUnit={activeGuide === 'reader' ? '점' : writerLevel.nextUnit}
                onClose={() => setActiveGuide(null)}
            />
        </>
    );
};

export default MyTitleStatusPanel;
