import React, { memo, Suspense } from 'react';
import { motion } from 'framer-motion';
import Button from '../../../../components/common/Button';
import ModalCloseButton from '../../../../components/common/ModalCloseButton';
import { getDiaryLevel, getReaderLevel, getReadingLevel, getWriterLevel } from '../../../../constants/writerLevels';
import TitleArtwork from '../../../writing/title-status/TitleArtwork';
import { getTitleTrack } from '../../../writing/title-status/titleTracks';
import FriendProfileCardBoundary from './FriendProfileCardBoundary';
import { getActiveFriendProfileCards } from './profileCardManifest';

const TitleIdentity = ({ kind, level }) => {
    const track = getTitleTrack(kind);
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, padding: '9px 10px',
            borderRadius: '15px', background: track.background,
            border: `1px solid ${track.border}`
        }}>
            <TitleArtwork kind={kind} level={level} size={42} />
            <div style={{ minWidth: 0 }}>
                <small style={{ display: 'block', color: track.deepAccent, fontSize: '.6rem', fontWeight: 950 }}>{track.icon} {track.label} · LV.{level.level}</small>
                <strong style={{ display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#3E2E23', fontSize: '.76rem' }}>{level.name}</strong>
            </div>
        </div>
    );
};

const LoadingCard = ({ message }) => (
    <div style={{ marginBottom: '14px', padding: '36px 20px', borderRadius: '22px', background: '#FFFFFF', color: '#78909C', textAlign: 'center', fontWeight: 800 }}>
        {message}
    </div>
);

/** 공개 칭호·드래곤·서재와 둘 사이의 기록만 보여 주는 친구 공간. */
const FriendProfileShell = ({ friend, viewerId, classId, onClose, onOpenPost }) => {
    if (!friend?.id || !viewerId) return null;

    const writer = getWriterLevel(
        friend.writer_total_chars,
        friend.writer_completed_posts,
        friend.pet_data?._testWriterLevel
    );
    const reader = getReaderLevel(friend.reader_score, friend.pet_data?._testReaderLevel);
    const diary = getDiaryLevel(friend.diary_days);
    const reading = getReadingLevel(friend.reading_log_count, {
        minimumLevel: friend.reading_level_floor
    });
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
                        <p style={{ margin: '3px 0 0', color: '#8D7B6C', fontSize: '.72rem', fontWeight: 800 }}>친구가 고른 모습과 우리 둘의 기록을 구경해요</p>
                    </div>
                    <ModalCloseButton onClick={onClose} label="친구 아지트 닫기" />
                </header>

                <section aria-label={`${friend.name}의 아지트 소개`} style={{
                    position: 'relative', marginBottom: '14px', padding: '17px', overflow: 'hidden',
                    border: '1px solid rgba(255,226,168,.38)', borderRadius: '24px',
                    background: 'radial-gradient(circle at 8% 0%,rgba(255,210,109,.28),transparent 34%), radial-gradient(circle at 100% 100%,rgba(90,164,235,.22),transparent 38%), linear-gradient(145deg,#3B2924 0%,#503A32 48%,#263E56 100%)',
                    boxShadow: '0 14px 30px rgba(62,46,35,.18)'
                }}>
                    <span aria-hidden="true" style={{ position: 'absolute', right: '-28px', top: '-34px', width: '112px', height: '112px', border: '1px solid rgba(255,255,255,.1)', borderRadius: '50%' }} />
                    <div style={{ position: 'relative' }}>
                        <small style={{ display: 'block', color: '#FFD987', fontSize: '.63rem', fontWeight: 950, letterSpacing: '.05em' }}>친구의 성장 칭호</small>
                        <strong style={{ display: 'block', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#FFFFFF', fontSize: '1.1rem' }}>{friend.name}</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px', marginTop: '12px' }}>
                            <TitleIdentity kind="writer" level={writer} />
                            <TitleIdentity kind="reader" level={reader} />
                            <TitleIdentity kind="diary" level={diary} />
                            <TitleIdentity kind="reading" level={reading} />
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
