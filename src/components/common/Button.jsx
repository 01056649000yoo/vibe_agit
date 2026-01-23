import React from 'react';

/**
 * Button 공통 컴포넌트 (초등학생 친화적 버전)
 * @param {string} variant - 버튼 스타일 (primary, secondary, ghost)
 * @param {string} size - 버튼 크기 (sm, md, lg)
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
    className = ''
}) => {
    const baseDefaultStyles = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--border-radius-md)',
        fontWeight: '700',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition-normal)',
        border: 'none',
        gap: '8px',
        boxShadow: 'var(--shadow-subtle)',
    };

    const variants = {
        primary: {
            backgroundColor: 'var(--primary-color)',
            color: 'white',
        },
        secondary: {
            backgroundColor: 'var(--secondary-color)',
            color: 'var(--text-primary)',
        },
        accent: {
            backgroundColor: 'var(--accent-color)',
            color: 'white',
        },
        ghost: {
            backgroundColor: 'rgba(0,0,0,0.05)',
            color: 'var(--text-secondary)',
            boxShadow: 'none',
        }
    };

    const sizes = {
        sm: { padding: '10px 20px', fontSize: '0.9rem' },
        md: { padding: '14px 28px', fontSize: '1rem' },
        lg: { padding: '18px 36px', fontSize: '1.2rem', borderRadius: 'var(--border-radius-lg)' }
    };

    // merging order: internal defaults -> variants -> sizes -> custom styles (prop)
    const currentStyle = {
        ...baseDefaultStyles,
        ...(variants[variant] || variants.primary),
        ...sizes[size],
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
            className={`custom-button ${className}`}
            style={currentStyle}
            onClick={!disabled && !loading ? onClick : undefined}
            disabled={disabled || loading}
        >
            {loading ? '기다려요...' : children}

            <style>{`
        .custom-button:hover:not(:disabled) {
          transform: translateY(-3px) scale(1.02);
          box-shadow: var(--shadow-normal);
          filter: brightness(1.05);
        }
        .custom-button:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
      `}</style>
        </button>
    );
};

export default Button;
