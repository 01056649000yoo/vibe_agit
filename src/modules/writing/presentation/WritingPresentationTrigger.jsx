import React from 'react';

const WritingPresentationTrigger = ({
    onOpen,
    label,
    className = '',
    children,
    ...rest
}) => {
    const handleKeyDown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen?.();
    };

    return (
        <article
            role="button"
            tabIndex="0"
            aria-label={label}
            className={`writing-presentation-trigger ${className}`.trim()}
            onClick={onOpen}
            onKeyDown={handleKeyDown}
            {...rest}
        >
            {children}
        </article>
    );
};

export default WritingPresentationTrigger;
