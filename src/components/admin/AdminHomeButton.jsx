import React from 'react';
import './AdminHomeButton.css';

/**
 * 관리자 화면 어디서든 첫 운영 요약으로 돌아가는 고정 버튼.
 * 탭 안에 두면 긴 목록을 내렸을 때 사라지므로 화면 기준으로 고정한다.
 */
const AdminHomeButton = ({ onGoHome, isHome }) => (
    <button
        type="button"
        className={`admin-home-button${isHome ? ' admin-home-button--current' : ''}`}
        onClick={onGoHome}
        aria-label="관리자 대시보드 홈으로 이동"
        aria-current={isHome ? 'page' : undefined}
        title={isHome ? '관리자 홈 맨 위로 이동' : '관리자 홈으로 이동'}
    >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-5.3a.5.5 0 0 1-.5-.5v-5.8H9.3v5.8a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-9.7Z" />
        </svg>
        <span>관리자 홈</span>
    </button>
);

export default AdminHomeButton;
