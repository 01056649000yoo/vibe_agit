import React, { useState, useEffect } from 'react';
import { useAnnouncements } from '../../hooks/useAnnouncements';
import { AnnouncementModal, AnnouncementListModal } from './AnnouncementComponents';
import { AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

const TeacherAnnouncementManager = ({ isMobile }) => {
    const { announcements, latestAnnouncement, loading } = useAnnouncements('TEACHER');
    const [showPopup, setShowPopup] = useState(false);
    const [showList, setShowList] = useState(false);

    const handleClosePopup = () => {
        if (latestAnnouncement) {
            localStorage.setItem(`announcement_popup_seen_${latestAnnouncement.id}`, 'true');
        }
        setShowPopup(false);
    };

    useEffect(() => {
        if (!loading && latestAnnouncement && latestAnnouncement.is_popup) {
            const popupKey = `announcement_popup_seen_${latestAnnouncement.id}`;
            const hasSeen = localStorage.getItem(popupKey);

            if (!hasSeen) {
                setShowPopup(true);
            }
        }
    }, [latestAnnouncement, loading]);

    if (loading) return null;

    return (
        <>
            {/* 헤더용 간소화된 버튼 */}
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowList(true)}
                style={{
                    fontSize: '0.8rem',
                    color: '#6366F1',
                    border: '1px solid #E0E7FF',
                    background: '#F5F7FF',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}
            >
                {isMobile ? '🔔' : '🔔 공지사항'}
            </Button>

            <AnimatePresence>
                {showPopup && latestAnnouncement && (
                    <AnnouncementModal
                        announcement={latestAnnouncement}
                        onClose={handleClosePopup}
                    />
                )}
                {showList && (
                    <AnnouncementListModal
                        announcements={announcements}
                        onClose={() => setShowList(false)}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

export default TeacherAnnouncementManager;
