import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../../../components/common/ModalPortal';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import {
    DIARY_LEVELS,
    READER_LEVELS,
    READING_LEVELS,
    WRITER_LEVELS
} from '../../../constants/writerLevels';
import useMyTitleStatus from './useMyTitleStatus';

const INK = '#3E2E23';
const INK_SOFT = '#8D7B6C';
const LINE = 'rgba(62,46,35,.10)';
const num = (value) => Number(value || 0).toLocaleString('ko-KR');
const titleBadgeSrc = (kind, level) => `/assets/title-badges/${kind}-level-${level}.webp`;

const TITLE_TRACKS = Object.freeze({
    writer: Object.freeze({
        label: '작가 칭호', icon: '✍️', levels: WRITER_LEVELS, assetKind: 'writer',
        accent: '#F4B740', deepAccent: '#9A5B00',
        border: 'rgba(255,211,117,.48)', glow: 'rgba(81,48,8,.18)',
        background: 'linear-gradient(155deg,rgba(255,247,220,.98),rgba(255,220,143,.92))',
        description: '선생님 과제와 일반 자유글로 성장해요. 자율 일기와 독서록은 각각의 칭호에서 따로 자라요.'
    }),
    reader: Object.freeze({
        label: '소통 칭호', icon: '💬', levels: READER_LEVELS, assetKind: 'reader',
        accent: '#72B7FF', deepAccent: '#145EA8',
        border: 'rgba(139,199,255,.48)', glow: 'rgba(8,54,98,.2)',
        background: 'linear-gradient(155deg,rgba(237,248,255,.98),rgba(171,216,255,.92))',
        description: '친구의 서로 다른 글에 공감하거나 댓글을 남기면 1점, 댓글은 20자마다 보너스 1점이 붙어요. 한 글에서는 최대 4점까지 얻어요.'
    }),
    diary: Object.freeze({
        label: '기록가 칭호', icon: '📔', levels: DIARY_LEVELS,
        accent: '#C58AEE', deepAccent: '#713E98',
        border: 'rgba(197,138,238,.48)', glow: 'rgba(79,42,104,.18)',
        background: 'linear-gradient(155deg,rgba(252,244,255,.98),rgba(226,190,247,.92))',
        description: '이번 학기에 일기를 쓰고 선생님이 확인한 서로 다른 날짜를 세요. 같은 날에는 한 번만 인정하고 연속으로 쓸 필요는 없어요.'
    }),
    reading: Object.freeze({
        label: '독서가 칭호', icon: '📚', levels: READING_LEVELS,
        accent: '#68C79A', deepAccent: '#16704A',
        border: 'rgba(104,199,154,.5)', glow: 'rgba(22,90,62,.18)',
        background: 'linear-gradient(155deg,rgba(240,255,247,.98),rgba(174,230,198,.92))',
        description: '선생님이 확인한 독서록 수와 서로 다른 책 수를 함께 세요. 같은 책을 다시 읽은 기록은 편수에는 남지만 책 수에는 한 번만 들어가요.'
    })
});

const getTitleTrack = (kind) => {
    if (kind === 'reader') return TITLE_TRACKS.reader;
    if (kind === 'diary') return TITLE_TRACKS.diary;
    if (kind === 'reading') return TITLE_TRACKS.reading;
    return TITLE_TRACKS.writer;
};

const TitleArtwork = ({ kind, level, size, loading = false }) => {
    const track = getTitleTrack(kind);
    if (track.assetKind) {
        return (
            <img
                src={titleBadgeSrc(track.assetKind, level.level)}
                alt=""
                aria-hidden="true"
                width={size}
                height={size}
                loading={loading ? 'lazy' : undefined}
                style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
            />
        );
    }
    return (
        <span aria-hidden="true" style={{
            width: `${size}px`, height: `${size}px`, display: 'grid', placeItems: 'center', borderRadius: '50%',
            background: 'rgba(255,255,255,.72)', border: `2px solid ${track.accent}90`,
            fontSize: `${Math.round(size * .52)}px`, boxShadow: `0 6px 12px ${track.glow}`
        }}>
            {level.emoji}
        </span>
    );
};

const BadgeButton = ({ kind, level, loading, errorMessage, onClick }) => {
    const track = getTitleTrack(kind);

    return (
        <motion.button
            type="button"
            onClick={onClick}
            aria-label={`${track.label} 설명 보기`}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            style={{
                position: 'relative', minWidth: 0, minHeight: '166px', padding: '11px 10px 12px', overflow: 'hidden',
                border: `1px solid ${track.border}`, borderRadius: '19px',
                background: track.background,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,.9), 0 8px 18px ${track.glow}`,
                cursor: 'pointer', color: INK, fontFamily: 'inherit', textAlign: 'center'
            }}
        >
            <span aria-hidden="true" style={{
                position: 'absolute', width: '108px', height: '108px', left: '50%', top: '40px', transform: 'translateX(-50%)',
                borderRadius: '50%', background: `radial-gradient(circle,${track.accent}42 0%,${track.accent}14 48%,transparent 70%)`
            }} />
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ color: track.deepAccent, fontSize: '.68rem', fontWeight: 950, letterSpacing: '.02em' }}>
                    {track.icon} {track.label}
                </span>
                <span aria-hidden="true" style={{
                    width: '20px', height: '20px', display: 'grid', placeItems: 'center', borderRadius: '50%',
                    background: 'rgba(255,255,255,.7)', border: `1px solid ${track.accent}90`, color: track.deepAccent,
                    fontSize: '.68rem', fontWeight: 950
                }}>i</span>
            </span>
            <span style={{ position: 'relative', display: 'inline-block', marginTop: '2px' }}>
                <TitleArtwork kind={kind} level={level} size={82} />
            </span>
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-2px' }}>
                <span style={{
                    padding: '3px 7px', borderRadius: '99px', background: track.deepAccent, color: '#FFFFFF',
                    fontSize: '.62rem', fontWeight: 950, boxShadow: '0 2px 5px rgba(31,28,25,.15)'
                }}>LV.{level.level} / {track.levels.length}</span>
            </span>
            <span style={{ position: 'relative', display: 'block', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#342820', fontSize: '.86rem', fontWeight: 950 }}>
                {loading ? '살펴보는 중...' : errorMessage ? '확인 필요' : level.name}
            </span>
        </motion.button>
    );
};

const titleRequirement = (kind, item) => {
    if ((item.from ?? item.logsFrom) === 0) return '시작';
    if (kind === 'writer' && item.criterion === 'posts') return `승인 글 ${num(item.from)}편`;
    if (kind === 'writer') return `${num(item.from)}자`;
    if (kind === 'reader') return `${num(item.from)}점`;
    if (kind === 'diary') return `${num(item.from)}일`;
    return `${num(item.logsFrom)}편 · ${num(item.booksFrom)}권`;
};

const TitleGuide = ({ kind, currentLevel, currentSummary, onClose }) => {
    if (!kind) return null;
    const track = getTitleTrack(kind);

    return (
        <ModalPortal>
            <div onClick={onClose} role="presentation" style={{
                position: 'fixed', inset: 0, zIndex: 3600, display: 'grid', placeItems: 'center', padding: '18px',
                background: 'rgba(45,32,24,.58)', backdropFilter: 'blur(5px)'
            }}>
                <section role="dialog" aria-modal="true" aria-label={`${track.label} 단계 설명`}
                    onClick={(event) => event.stopPropagation()} style={{
                        width: 'min(440px,100%)', maxHeight: '84vh', overflowY: 'auto', borderRadius: '26px',
                        background: '#FFFDF7', boxShadow: '0 24px 60px rgba(45,32,24,.3)'
                    }}>
                    <header style={{
                        position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '16px 18px 13px', background: 'rgba(255,253,247,.96)', borderBottom: `1px solid ${LINE}`
                    }}>
                        <TitleArtwork kind={kind} level={currentLevel} size={62} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: INK_SOFT, fontSize: '.7rem', fontWeight: 900 }}>{track.icon} {track.label}</div>
                            <h3 style={{ margin: '2px 0 0', color: INK, fontSize: '1.08rem', fontWeight: 950 }}>{currentLevel.name}</h3>
                            <div style={{ marginTop: '2px', color: track.deepAccent, fontSize: '.72rem', fontWeight: 900 }}>
                                LV. {currentLevel.level} · {currentSummary}
                            </div>
                        </div>
                        <ModalCloseButton onClick={onClose} label="칭호 설명 닫기"
                            style={{ alignSelf: 'flex-start' }} />
                    </header>
                    <div style={{ padding: '14px 18px 20px' }}>
                        <p style={{ margin: '0 0 13px', color: INK_SOFT, fontSize: '.78rem', fontWeight: 750, lineHeight: 1.55 }}>
                            {track.description}
                        </p>
                        <div style={{ display: 'grid', gap: '7px' }}>
                            {track.levels.map((item) => {
                                const current = item.level === currentLevel.level;
                                const achieved = item.level <= currentLevel.level;
                                return (
                                    <div key={item.level} style={{
                                        display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', alignItems: 'center', gap: '9px',
                                        padding: '9px 11px', borderRadius: '13px', background: current ? `${track.accent}12` : '#FFFFFF',
                                        border: current ? `1.5px solid ${track.accent}70` : `1px solid ${LINE}`
                                    }}>
                                        <span style={{ position: 'relative', width: '40px', height: '40px', display: 'grid', placeItems: 'center' }}>
                                            <span style={{ filter: achieved ? 'none' : 'grayscale(1)', opacity: achieved ? 1 : .42 }}>
                                                <TitleArtwork kind={kind} level={item} size={40} loading />
                                            </span>
                                            {!achieved && <span aria-hidden="true" style={{ position: 'absolute', right: '-2px', bottom: '-2px', fontSize: '.7rem' }}>🔒</span>}
                                        </span>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', color: INK, fontSize: '.8rem', fontWeight: current ? 950 : 850 }}>
                                                LV.{item.level} {item.name}
                                            </span>
                                            {current && <span style={{ display: 'block', marginTop: '1px', color: track.deepAccent, fontSize: '.64rem', fontWeight: 900 }}>지금 나의 칭호</span>}
                                        </span>
                                        <span style={{ color: achieved ? track.deepAccent : INK_SOFT, fontSize: '.69rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
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
    const {
        status,
        writerLevel,
        readerLevel,
        diaryLevel,
        readingLevel,
        loading,
        errorMessage
    } = useMyTitleStatus({ studentSession, active });
    const activeGuideLevel = activeGuide === 'reader'
        ? readerLevel
        : activeGuide === 'diary'
            ? diaryLevel
            : activeGuide === 'reading'
                ? readingLevel
                : writerLevel;
    const activeGuideSummary = activeGuide === 'reader'
        ? `${num(status.readerScore)}점`
        : activeGuide === 'diary'
            ? `${num(status.diaryDays)}일`
            : activeGuide === 'reading'
                ? `${num(status.readingLogCount)}편 · ${num(status.readingBookCount)}권`
                : `${num(writerLevel.progressValue)}${writerLevel.nextUnit}`;

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
            <section aria-label="나의 성장 칭호" style={{
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
                    <BadgeButton kind="diary" level={diaryLevel} loading={loading} errorMessage={errorMessage} onClick={() => setActiveGuide('diary')} />
                    <BadgeButton kind="reading" level={readingLevel} loading={loading} errorMessage={errorMessage} onClick={() => setActiveGuide('reading')} />
                </div>
                <div style={{ position: 'relative', marginTop: '9px', textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: '.64rem', fontWeight: 800 }}>
                    {status.season?.name || '현재 학기'} · {status.season?.status === 'closing' ? '성장 기록 완료' : status.season?.status === 'closed' ? '보관된 성장' : '이번 학기 성장'} · 칭호 카드를 눌러 단계를 확인해요
                </div>
            </section>

            <TitleGuide
                kind={activeGuide}
                currentLevel={activeGuideLevel}
                currentSummary={activeGuideSummary}
                onClose={() => setActiveGuide(null)}
            />
        </>
    );
};

export default MyTitleStatusPanel;
