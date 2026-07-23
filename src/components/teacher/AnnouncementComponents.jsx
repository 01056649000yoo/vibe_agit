import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import Card from '../common/Card';

const AnnouncementModal = ({ announcement, onClose, onDoNotShowAgain }) => {
    const [doNotShow, setDoNotShow] = useState(false);

    if (!announcement) return null;

    const handleClose = () => {
        if (doNotShow && onDoNotShowAgain) onDoNotShowAgain();
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: 3000, padding: '20px', boxSizing: 'border-box'
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
                <Card style={{
                    maxWidth: '500px', width: '100%', padding: '30px',
                    overflow: 'hidden', position: 'relative',
                    background: 'white', border: '3px solid #6366F1'
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📢</div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#1E1B4B', marginBottom: '15px' }}>
                        {announcement.title}
                    </h2>
                    <div style={{
                        fontSize: '1rem', color: '#4B5563', lineHeight: '1.7',
                        marginBottom: '25px', whiteSpace: 'pre-wrap', textAlign: 'left',
                        maxHeight: '400px', overflowY: 'auto', paddingRight: '10px'
                    }}>
                        {announcement.content}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <input
                            type="checkbox"
                            id="doNotShow"
                            checked={doNotShow}
                            onChange={(e) => setDoNotShow(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="doNotShow" style={{ fontSize: '0.9rem', color: '#64748B', cursor: 'pointer', fontWeight: 'bold' }}>
                            다시 보지 않기 (닫기 시 적용)
                        </label>
                    </div>

                    <Button
                        onClick={handleClose}
                        style={{ width: '100%', background: '#6366F1', fontWeight: 'bold' }}
                    >
                        닫기
                    </Button>
                </Card>
            </motion.div>
        </div>
    );
};

const AnnouncementListModal = ({ announcements, onClose }) => {
    const [expandedId, setExpandedId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const totalPages = Math.ceil(announcements.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const pagedAnnouncements = announcements.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: 3000, padding: '20px', boxSizing: 'border-box'
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                style={{ width: '100%', maxWidth: '500px', maxHeight: '55vh', display: 'flex', flexDirection: 'column' }}
            >
                <div style={{
                    background: 'white',
                    borderRadius: '24px',
                    padding: '24px',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #E5E7EB',
                    overflow: 'hidden'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1E1B4B', margin: 0 }}>
                            공지사항 목록 📜
                        </h2>
                        <Button variant="ghost" onClick={onClose} style={{ color: '#6B7280', padding: '4px 8px' }}>닫기</Button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', marginBottom: '16px' }}>
                        {announcements.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#9CA3AF', padding: '30px 0' }}>등록된 공지사항이 없습니다.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {pagedAnnouncements.map((ann) => (
                                    <div key={ann.id} style={{
                                        border: '1px solid #F3F4F6',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        background: expandedId === ann.id ? '#F9FAFB' : 'white',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div
                                            onClick={() => setExpandedId(expandedId === ann.id ? null : ann.id)}
                                            style={{
                                                padding: '12px 16px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                fontWeight: 'bold',
                                                color: '#1E1B4B',
                                                fontSize: '0.95rem'
                                            }}
                                        >
                                            <div style={{ flex: 1, marginRight: '10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <span>{ann.title}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: 'normal' }}>
                                                    {new Date(ann.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
                                                {expandedId === ann.id ? '🔼' : '🔽'}
                                            </span>
                                        </div>

                                        <AnimatePresence>
                                            {expandedId === ann.id && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    style={{ overflow: 'hidden' }}
                                                >
                                                    <div style={{
                                                        padding: '0 16px 12px 16px',
                                                        fontSize: '0.85rem',
                                                        color: '#4B5563',
                                                        lineHeight: '1.5',
                                                        whiteSpace: 'pre-wrap',
                                                        borderTop: '1px solid #F3F4F6',
                                                        paddingTop: '10px'
                                                    }}>
                                                        {ann.content}
                                                        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#9CA3AF' }}>
                                                            {new Date(ann.created_at).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', flexShrink: 0, paddingTop: '10px', borderTop: '1px solid #F3F4F6' }}>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            >
                                이전
                            </Button>
                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#6B7280' }}>
                                {currentPage} / {totalPages}
                            </span>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            >
                                다음
                            </Button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

const AnnouncementBanner = ({ latestAnnouncement, onViewAll }) => {
    const [isOpen, setIsOpen] = useState(false);

    // 이전에 확인했는지 로컬스토리지 체크 (선택사항)

    if (!latestAnnouncement) return null;

    return (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.005 }}
                style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                    padding: '12px 20px',
                    borderRadius: '16px',
                    border: '1px solid #C7D2FE',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                onClick={() => setIsOpen(true)}
            >
                <span style={{ fontSize: '1.5rem' }}>📢</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4338CA' }}>
                        [최신 공지] {latestAnnouncement.title}
                    </div>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#6366F1', fontWeight: 'bold' }}>자세히 보기 &gt;</span>
            </motion.div>

            <Button
                variant="ghost"
                onClick={onViewAll}
                style={{
                    height: 'auto',
                    marginBottom: '20px',
                    borderRadius: '16px',
                    background: '#F3F4F6',
                    fontSize: '0.85rem',
                    color: '#6B7280',
                    border: '1px solid #E5E7EB',
                    padding: '0 15px',
                    fontWeight: 'bold'
                }}
            >
                전체 목록 📜
            </Button>

            <AnimatePresence>
                {isOpen && (
                    <AnnouncementModal
                        announcement={latestAnnouncement}
                        onClose={() => setIsOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export { AnnouncementBanner, AnnouncementModal, AnnouncementListModal };
