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
            {item.preview === 'dragon-library' && <span className="dragon-hideout-scene__library"><i /><i /><i /><i /><b>ᚱ</b></span>}
            {item.preview === 'breath-sprout' && <span className="dragon-hideout-scene__sprout"><i /><i /><i /><b /></span>}
            {item.preview === 'guardian-flame' && <span className="dragon-hideout-scene__guardian-flame"><i /><b /></span>}
            {item.preview === 'rune-stone' && <span className="dragon-hideout-scene__runestone"><i>ᚱ</i></span>}
            {item.preview === 'story-altar' && <span className="dragon-hideout-scene__altar"><i /><b /></span>}
            {item.preview === 'star-orb' && <span className="dragon-hideout-scene__star-orb"><i>✦</i><b /></span>}
            {item.preview === 'dragon-hoard' && <span className="dragon-hideout-scene__hoard"><i /><b /></span>}
            {item.preview === 'hatchling-nest' && <span className="dragon-hideout-scene__nest"><i /><b /></span>}
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
                <strong>{roomLabel}</strong>
                <small>{petData?.name || '작가 수호룡'}</small>
            </span>
        </div>
    );
};

export default DragonHideoutScene;
