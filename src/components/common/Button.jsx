import React from 'react';

/**
 * Button 공통 컴포넌트 (초등학생 친화적 버전)
 * @param {string} variant - 버튼 스타일 (primary, secondary, accent, ghost, outline, danger)
 * @param {string} size - 버튼 크기 (xs, sm, md, lg)
 * @param {boolean} loading - 로딩 상태 여부
 * @param {boolean} disabled - 비활성화 여부
 * @param {React.ReactNode} children - 버튼 내부 콘텐츠
 */
const Button = ({
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    type = 'submit',
    children,
    onClick,
    style,
    loadingText = '기다려요...',
    className = '',
    ...props
}) => {
    const baseDefaultStyles = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--ui-radius-md)',
        fontWeight: '800',
        lineHeight: 'var(--ui-line-compact)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'transform var(--ui-motion-fast), background-color var(--ui-motion-fast), border-color var(--ui-motion-fast), box-shadow var(--ui-motion-fast)',
        border: '1px solid transparent',
        gap: 'var(--ui-space-2)',
        boxShadow: 'var(--ui-shadow-xs)',
    };

    const variants = {
        primary: {
            backgroundColor: 'var(--ui-primary)',
            color: 'white',
        },
        secondary: {
            backgroundColor: 'var(--ui-secondary)',
            color: 'var(--ui-secondary-ink)',
        },
        accent: {
            backgroundColor: 'var(--ui-accent)',
            color: 'white',
        },
        ghost: {
            backgroundColor: 'var(--ui-surface-muted)',
            color: 'var(--ui-ink-muted)',
            boxShadow: 'none',
        },
        outline: {
            backgroundColor: 'var(--ui-surface)',
            color: 'var(--ui-primary)',
            borderColor: 'var(--ui-primary-border)',
            boxShadow: 'none',
        },
        danger: {
            backgroundColor: 'var(--ui-danger)',
            color: 'white',
        }
    };

    const sizes = {
        xs: { minHeight: 'var(--ui-control-xs)', padding: '5px 10px', fontSize: '0.78rem', borderRadius: 'var(--ui-radius-xs)' },
        sm: { minHeight: 'var(--ui-control-sm)', padding: '7px 14px', fontSize: '0.86rem', borderRadius: 'var(--ui-radius-sm)' },
        md: { minHeight: 'var(--ui-control-md)', padding: '10px 18px', fontSize: '0.95rem' },
        lg: { minHeight: 'var(--ui-control-lg)', padding: '13px 24px', fontSize: '1.05rem', borderRadius: 'var(--ui-radius-lg)' }
    };

    const resolvedVariant = Reflect.get(variants, variant) || variants.primary;
    const resolvedSize = Reflect.get(sizes, size) || sizes.md;

    // merging order: internal defaults -> variants -> sizes -> custom styles (prop)
    const currentStyle = {
        ...baseDefaultStyles,
        ...resolvedVariant,
        ...resolvedSize,
        ...style
    };

    // If 'background' is provided in style, we should remove 'backgroundColor' from the final object
    // to avoid the React warning about mixing shorthand/non-shorthand.
    if (style?.background && currentStyle.backgroundColor) {
        delete currentStyle.backgroundColor;
    }

    return (
        <button
            type={type}
            className={`ui-button ui-button--${variant} ui-button--${size} custom-button ${className}`}
            style={currentStyle}
            onClick={!disabled && !loading ? onClick : undefined}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...props}
        >
            {loading ? loadingText : children}
        </button>
    );
};

export default Button;
