import React from 'react';

/**
 * 모달·패널의 공용 닫기 버튼.
 *
 * 글자 ×는 폰트의 기준선에 따라 원 안에서 위아래로 흔들리므로 쓰지 않는다.
 * 고정 viewBox의 SVG 선을 grid 중앙에 놓아 모든 브라우저에서 같은 위치를 유지한다.
 */
const ModalCloseButton = ({
    onClick,
    disabled = false,
    label = '닫기',
    className = '',
    style
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`ui-icon-button ${className}`.trim()}
        style={{ flex: '0 0 auto', cursor: disabled ? 'default' : 'pointer', lineHeight: 0, ...style }}
    >
        <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            style={{ display: 'block' }}
        >
            <path
                d="M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.35"
                strokeLinecap="round"
            />
        </svg>
    </button>
);

export default ModalCloseButton;
