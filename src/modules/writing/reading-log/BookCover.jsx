import React, { useState } from 'react';
import { normalizeBookCoverUrl } from './bookCoverUrl';

const BookCover = ({ src, title, size = 'md' }) => {
    const [failedSrc, setFailedSrc] = useState('');
    const optimizedSrc = normalizeBookCoverUrl(src);
    const imageFailed = failedSrc === optimizedSrc;
    const dimensions = size === 'sm'
        ? { width: 66, height: 96, fontSize: '1.8rem' }
        : { width: 112, height: 162, fontSize: '2.8rem' };

    if (optimizedSrc && !imageFailed) {
        return (
            <img
                src={optimizedSrc}
                alt={`${title || '책'} 표지`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setFailedSrc(optimizedSrc)}
                style={{
                    width: `${dimensions.width}px`,
                    height: `${dimensions.height}px`,
                    objectFit: 'cover',
                    borderRadius: '8px 12px 12px 8px',
                    boxShadow: '0 7px 18px rgba(55, 71, 79, 0.18)',
                    flexShrink: 0,
                    background: '#ECEFF1'
                }}
            />
        );
    }

    return (
        <div
            role="img"
            aria-label={`${title || '책'} 기본 표지`}
            style={{
                width: `${dimensions.width}px`,
                height: `${dimensions.height}px`,
                borderRadius: '8px 12px 12px 8px',
                background: 'linear-gradient(145deg, #8BC34A, #558B2F)',
                boxShadow: '0 7px 18px rgba(55, 71, 79, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: dimensions.fontSize,
                flexShrink: 0,
                color: 'white'
            }}
        >
            📖
        </div>
    );
};

export default BookCover;
