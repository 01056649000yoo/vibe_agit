import React from 'react';

/**
 * 모달·패널의 공용 닫기 버튼.
 *
 * 글자 ×는 폰트의 기준선에 따라 원 안에서 위아래로 흔들리므로 쓰지 않는다.
 * 고정 viewBox의 SVG 선을 grid 중앙에 놓아 모든 브라우저에서 같은 위치를 유지한다.
 *
 * 2026-08-10 통일: 기본 모양이 실제로 쓰이는 모양과 달라서, 부르는 곳 15군데가
 * 저마다 `style` 로 테두리를 지우고 색을 따로 넣고 있었다(회색만 7종류였다).
 * 기본값을 **연회색 원 배경**으로 바꾸고, 상황은 `tone`·`size` 두 가지로만 고른다.
 * **부르는 곳에서 색·크기·테두리를 다시 지정하지 않는다** — 또 갈라진다.
 * 위치 조정(absolute top/right 등)은 `className` 으로 한다.
 */
const ModalCloseButton = ({
    onClick,
    disabled = false,
    label = '닫기',
    /** 'default' = 밝은 배경 위 연회색 원 / 'onDark' = 어두운 배경·사진 위 흰색 반투명 */
    tone = 'default',
    /** 'md' = 38px(기본) / 'sm' = 34px(카드 안처럼 좁은 자리) */
    size = 'md',
    className = '',
    style,
    ...rest
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`ui-icon-button ui-icon-button--${tone} ui-icon-button--${size} ${className}`.trim()}
        style={style}
        {...rest}
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
