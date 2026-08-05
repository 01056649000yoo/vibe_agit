import React from 'react';
import { getReaderDragonEffect } from './presentation';
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
    eager = false
}) => {
    const effect = getReaderDragonEffect(readerLevel);
    const particles = Array.from({ length: effect.particles }, (_, index) => index);

    return (
        <span
            className={`dragon-avatar dragon-reader-effect--${effect.className} ${className}`.trim()}
            style={style}
            data-reader-level={effect.level}
        >
            {effect.level >= 2 && <span className="dragon-reader-effect__glow" aria-hidden="true" />}
            {effect.level >= 4 && <span className="dragon-reader-effect__orbit" aria-hidden="true" />}
            {effect.level >= 6 && <span className="dragon-reader-effect__aurora" aria-hidden="true" />}
            <img
                src={dragon.image}
                alt={alt}
                width="512"
                height="512"
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
                draggable="false"
                style={{
                    transform: `scale(${dragon.imageScale})`,
                    filter: dragon.imageFilter,
                    ...imageStyle
                }}
            />
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
