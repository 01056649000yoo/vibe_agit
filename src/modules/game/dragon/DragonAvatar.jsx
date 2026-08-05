import React from 'react';
import { getReaderDragonEffect, getReaderSceneTheme } from './presentation';
import './DragonAvatar.css';

const PARTICLE_POSITIONS = [
    ['18%', '27%'], ['78%', '22%'], ['88%', '55%'], ['70%', '83%'],
    ['28%', '84%'], ['9%', '56%'], ['50%', '10%']
];

const DragonAvatar = ({
    dragon,
    readerLevel = 1,
    alt = '',
    className = '',
    style,
    imageStyle,
    backgroundId = 'default',
    eager = false
}) => {
    const effect = getReaderDragonEffect(readerLevel);
    const sceneTheme = getReaderSceneTheme(backgroundId);
    const particles = Array.from({ length: effect.particles }, (_, index) => index);
    const readerRim = effect.level >= 2
        ? 'drop-shadow(0 0 5px var(--dragon-reader-contrast-edge)) drop-shadow(0 0 10px var(--dragon-reader-color-solid))'
        : '';
    const resolvedImageFilter = `${imageStyle?.filter || dragon.imageFilter || ''} ${readerRim}`.trim();

    return (
        <span
            className={`dragon-avatar dragon-reader-effect--${effect.className} ${className}`.trim()}
            style={{ ...sceneTheme, ...style }}
            data-reader-level={effect.level}
        >
            <span className="dragon-reader-effect__stage" aria-hidden="true" />
            {effect.level >= 2 && <span className="dragon-reader-effect__glow" aria-hidden="true" />}
            {effect.level >= 4 && (
                <span className="dragon-reader-effect__orbit" aria-hidden="true">
                    <i>✦</i><i>ᚱ</i>
                </span>
            )}
            {effect.level >= 5 && <span className="dragon-reader-effect__crest" aria-hidden="true"><i>✦</i><i>◆</i><i>✦</i></span>}
            {effect.level >= 6 && <span className="dragon-reader-effect__aurora" aria-hidden="true" />}
            {effect.level >= 7 && <span className="dragon-reader-effect__seal" aria-hidden="true" />}
            <img
                src={dragon.image}
                alt={alt}
                width="512"
                height="512"
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
                draggable="false"
                style={{ ...imageStyle, transform: imageStyle?.transform || `scale(${dragon.imageScale})`, filter: resolvedImageFilter }}
            />
            {effect.level >= 2 && <span className="dragon-reader-effect__sigil" aria-hidden="true"><i>{effect.level}</i></span>}
            {particles.map((index) => {
                const [left, top] = PARTICLE_POSITIONS.at(index);
                return (
                    <span
                        key={index}
                        className="dragon-reader-effect__particle"
                        aria-hidden="true"
                        style={{ '--dragon-particle-index': index, left, top }}
                    />
                );
            })}
        </span>
    );
};

export default DragonAvatar;
