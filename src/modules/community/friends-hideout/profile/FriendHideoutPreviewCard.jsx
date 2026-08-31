import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { getDiaryLevel, getReaderLevel, getReadingLevel, getWriterLevel } from '../../../../constants/writerLevels';
import TitleArtwork from '../../../writing/title-status/TitleArtwork';
import { getTitleTrack } from '../../../writing/title-status/titleTracks';

const MiniTitle = ({ kind, level }) => {
    const track = getTitleTrack(kind);
    return (
        <span style={{
            display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, padding: '7px 9px',
            borderRadius: '13px', border: `1px solid ${track.border}`,
            background: track.background
        }}>
            <TitleArtwork kind={kind} level={level} size={34} />
            <span style={{ minWidth: 0 }}>
                <small style={{ display: 'block', color: track.deepAccent, fontSize: '.58rem', fontWeight: 950 }}>{track.shortLabel} LV.{level.level}</small>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#3E2E23', fontSize: '.69rem' }}>{level.name}</strong>
            </span>
        </span>
    );
};

const FriendHideoutPreviewCard = ({ friend, onSelect }) => {
    const writer = getWriterLevel(
        friend?.writer_total_chars,
        friend?.writer_completed_posts,
        friend?.pet_data?._testWriterLevel
    );
    const reader = getReaderLevel(friend?.reader_score, friend?.pet_data?._testReaderLevel);
    const diary = getDiaryLevel(friend?.diary_days);
    const reading = getReadingLevel(friend?.reading_log_count, friend?.reading_book_count);
    const initial = Array.from(friend?.name || '친').at(0);

    return (
        <motion.button
            type="button"
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onSelect(friend)}
            aria-label={`${friend.name}의 아지트 방문, ${writer.name}, ${reader.name}, ${diary.name}, ${reading.name}`}
            style={{
                position: 'relative', overflow: 'hidden', width: '100%', minHeight: '226px', padding: '18px',
                border: '1px solid #E2D7CC', borderRadius: '24px', cursor: 'pointer', textAlign: 'left',
                background: 'linear-gradient(145deg,#FFFFFF,#FFF9EE)', boxShadow: '0 8px 20px rgba(73,52,37,.08)'
            }}
        >
            <span aria-hidden="true" style={{ position: 'absolute', right: '-25px', top: '-35px', width: '110px', height: '110px', borderRadius: '50%', background: 'rgba(255,211,117,.16)' }} />
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span aria-hidden="true" style={{
                    width: '46px', height: '46px', display: 'grid', placeItems: 'center', flexShrink: 0,
                    borderRadius: '16px', color: '#FFFFFF', fontSize: '1.12rem', fontWeight: 950,
                    background: 'linear-gradient(145deg,#6D4C41,#3E2723)', boxShadow: '0 5px 12px rgba(62,39,35,.22)'
                }}>{initial}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <small style={{ display: 'block', color: '#9A7B65', fontSize: '.63rem', fontWeight: 900 }}>친구 이름으로 찾아가기</small>
                    <strong style={{ display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#3E2E23', fontSize: '1.12rem', fontWeight: 950 }}>{friend.name}</strong>
                </span>
                <span aria-hidden="true" style={{ color: '#8D6E63', fontSize: '1.15rem' }}>→</span>
            </span>
            <span style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px', marginTop: '13px' }}>
                <MiniTitle kind="writer" level={writer} />
                <MiniTitle kind="reader" level={reader} />
                <MiniTitle kind="diary" level={diary} />
                <MiniTitle kind="reading" level={reading} />
            </span>
        </motion.button>
    );
};

export default memo(FriendHideoutPreviewCard);
