import React, { useState } from 'react';

const BookCover = ({ src, title, size = 'md' }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const dimensions = size === 'sm'
        ? { width: 66, height: 96, fontSize: '1.8rem' }
        : { width: 112, height: 162, fontSize: '2.8rem' };

    if (src && !imageFailed) {
        return (
            <img
                src={src}
                alt={`${title || '책'} 표지`}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
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
