import React from 'react';
import { motion } from 'framer-motion';
import Button from '../common/Button';
import './StudentHeader.css';

const HeaderAction = ({ icon, label, onClick, hasNotice = false }) => (
    <motion.button
        type="button"
        className={`student-home-toolbar__action${hasNotice ? ' has-notice' : ''}`}
        aria-label={hasNotice ? `${label}, 새 소식 있음` : label}
        whileHover={{ y: -1 }}
        whileTap={{ scale: .97 }}
        onClick={onClick}
    >
        <span className="student-home-toolbar__action-icon" aria-hidden="true">{icon}</span>
        <strong>{label}</strong>
        {hasNotice && (
            <span className="student-home-toolbar__notice" aria-hidden="true">
                <span className="student-home-toolbar__notice-full">새 소식</span>
                <span className="student-home-toolbar__notice-compact">새</span>
            </span>
        )}
    </motion.button>
);

const StudentHeader = ({ hasActivity, openFeedback, setIsGuideOpen, onLogout, onOpenFootprint }) => (
    <header className="student-home-toolbar">
        <div className="student-home-toolbar__brand">
            <span aria-hidden="true">✏️</span>
            <strong>끄적끄적 아지트</strong>
        </div>
        <nav aria-label="학생 홈 도움 메뉴" className="student-home-toolbar__actions">
            <HeaderAction icon="🔔" label="내 글 소식" onClick={() => openFeedback(0)} hasNotice={hasActivity} />
            <HeaderAction icon="👣" label="글쓰기 발자국" onClick={onOpenFootprint} />
            <HeaderAction icon="?" label="사용법" onClick={() => setIsGuideOpen(true)} />
            <Button variant="ghost" size="sm" onClick={onLogout} className="student-home-toolbar__logout">
                로그아웃
            </Button>
        </nav>
    </header>
);

export default StudentHeader;
