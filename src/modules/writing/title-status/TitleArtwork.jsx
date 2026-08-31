import React from 'react';
import { getTitleTrack, titleBadgeSrc } from './titleTracks';

/** 이미지가 있는 작가·소통과 이모지 훈장을 쓰는 기록가·독서가를 같은 크기로 그린다. */
const TitleArtwork = ({ kind, level, size, loading = false, className, style }) => {
    const track = getTitleTrack(kind);
    const sharedStyle = { width: `${size}px`, height: `${size}px`, ...style };

    if (track.assetKind) {
        return (
            <img
                src={titleBadgeSrc(track.assetKind, level.level)}
                alt=""
                aria-hidden="true"
                width={size}
                height={size}
                loading={loading ? 'lazy' : undefined}
                className={className}
                style={{ ...sharedStyle, objectFit: 'contain' }}
            />
        );
    }

    return (
        <span
            aria-hidden="true"
            className={className}
            style={{
                ...sharedStyle,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.72)',
                border: `2px solid ${track.accent}90`,
                fontSize: `${Math.round(size * .52)}px`,
                boxShadow: `0 6px 12px ${track.glow}`,
                boxSizing: 'border-box'
            }}
        >
            {level.emoji}
        </span>
    );
};

export default TitleArtwork;
