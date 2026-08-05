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
            {item.preview === 'bookshelf' && <span className="dragon-hideout-scene__books"><i /><i /><i /><i /></span>}
            {item.preview === 'plant' && <span className="dragon-hideout-scene__plant"><i /><i /><i /></span>}
            {item.preview === 'lantern' && <span className="dragon-hideout-scene__lantern"><i /></span>}
            {item.preview === 'desk' && <span className="dragon-hideout-scene__desk"><i /><b /></span>}
            {item.preview === 'telescope' && <span className="dragon-hideout-scene__telescope"><i /><b /></span>}
            {item.preview === 'chest' && <span className="dragon-hideout-scene__chest"><i /></span>}
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
    const wallpaper = getHideoutBackground(equipped.wallpaper);
    const pedestal = getDragonDecorItem(equipped.pedestal);
    const nameplate = getDragonDecorItem(equipped.nameplate);
    const roomLabel = `${ownerName || '나'}의 아지트`;

    return (
        <div
            role="img"
            className={`dragon-hideout-scene${compact ? ' dragon-hideout-scene--compact' : ''} ${className}`.trim()}
            data-wallpaper={equipped.wallpaper}
            data-pedestal={pedestal?.preview || 'stone'}
            data-nameplate={nameplate?.preview || 'simple'}
            style={{
                '--hideout-wallpaper': wallpaper.color,
                '--hideout-border': wallpaper.border,
                '--hideout-glow': wallpaper.glow,
                '--hideout-text': wallpaper.textColor,
                ...style
            }}
            aria-label={`${roomLabel}, ${petData?.name || '작가 수호룡'}`}
        >
            <span className="dragon-hideout-scene__wall" aria-hidden="true" />
            <span className="dragon-hideout-scene__window" aria-hidden="true"><i /><i /></span>
            <span className="dragon-hideout-scene__floor" aria-hidden="true" />
            <span className="dragon-hideout-scene__pedestal" aria-hidden="true"><i /></span>
            <DecorProp itemId={equipped.leftProp} side="left" />
            <DecorProp itemId={equipped.rightProp} side="right" />
            <DragonAvatar
                dragon={dragon}
                readerLevel={readerLevel}
                backgroundId={equipped.wallpaper}
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
