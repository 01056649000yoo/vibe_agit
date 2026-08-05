import React from 'react';
import DragonAvatar from './DragonAvatar';
import { getHideoutBackground } from './presentation';
import { getDragonDecorItem, normalizeDragonDecor } from './decorCatalog';
import './DragonHideoutScene.css';

const DecorProp = ({ itemId, side }) => {
    const item = getDragonDecorItem(itemId);
    if (!item || item.preview === 'none') return null;

    return (
        <span className={`dragon-hideout-scene__prop dragon-hideout-scene__prop--${side}`} data-visual={item.preview} aria-hidden="true">
            {item.image && <img src={item.image} alt="" loading="lazy" decoding="async" draggable="false" />}
        </span>
    );
};

const DragonHideoutScene = ({
    petData,
    dragon,
    readerLevel = 1,
    ownerName = '나',
    compact = false,
    className = '',
    style,
    eager = false
}) => {
    const { equipped } = normalizeDragonDecor(petData);
    const frameTheme = getHideoutBackground(equipped.wallpaper);
    const pedestal = getDragonDecorItem(equipped.pedestal);
    const nameplate = getDragonDecorItem(equipped.nameplate);
    const roomLabel = `${ownerName || '나'}의 아지트`;

    return (
        <div
            role="img"
            className={`dragon-hideout-scene${compact ? ' dragon-hideout-scene--compact' : ''} ${className}`.trim()}
            data-frame={equipped.wallpaper}
            data-pedestal={pedestal?.preview || 'stone'}
            data-nameplate={nameplate?.preview || 'simple'}
            style={{
                '--hideout-frame': frameTheme.border,
                '--hideout-frame-glow': frameTheme.glow,
                '--hideout-frame-ink': frameTheme.subColor,
                ...style
            }}
            aria-label={`${roomLabel}, ${petData?.name || '작가 수호룡'}`}
        >
            <span className="dragon-hideout-scene__wall" aria-hidden="true" />
            <span className="dragon-hideout-scene__window" aria-hidden="true"><i /><i /></span>
            <span className="dragon-hideout-scene__floor" aria-hidden="true" />
            <span className="dragon-hideout-scene__frame" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="dragon-hideout-scene__pedestal" aria-hidden="true"><i /></span>
            <DecorProp itemId={equipped.leftProp} side="left" />
            <DecorProp itemId={equipped.rightProp} side="right" />
            <DragonAvatar
                dragon={dragon}
                readerLevel={readerLevel}
                backgroundId="default"
                alt=""
                eager={eager}
                className="dragon-hideout-scene__dragon"
            />
            <span className="dragon-hideout-scene__nameplate">
                {nameplate?.image && (
                    <img
                        className="dragon-hideout-scene__nameplate-art"
                        src={nameplate.image}
                        alt=""
                        loading={eager ? 'eager' : 'lazy'}
                        decoding="async"
                        draggable="false"
                    />
                )}
                <span className="dragon-hideout-scene__nameplate-effect" aria-hidden="true" />
                <span className="dragon-hideout-scene__nameplate-copy">
                    <strong>{roomLabel}</strong>
                    <small>{petData?.name || '작가 수호룡'}</small>
                </span>
            </span>
        </div>
    );
};

export default DragonHideoutScene;
