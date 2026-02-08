import React, { useState, useEffect } from 'react';
import { useAnnouncements } from '../../hooks/useAnnouncements';
import { AnnouncementModal, AnnouncementListModal } from './AnnouncementComponents';
import { AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

const TeacherAnnouncementManager = ({ isMobile }) => {
    const { announcements, latestAnnouncement, loading } = useAnnouncements('TEACHER');
    const [showPopup, setShowPopup] = useState(false);
    const [showList, setShowList] = useState(false);

    useEffect(() => {
        // 로딩 중이거나 공지사항이 없거나 팝업 설정이 없으면 무시
        if (loading || !latestAnnouncement || !latestAnnouncement.is_popup) return;

        const popupKey = `announcement_popup_${latestAnnouncement.id}`;
        const hasSeen = localStorage.getItem(popupKey);

        // 아직 보지 않은 경우에만 팝업 표시
        if (hasSeen !== 'true') {
            setShowPopup(true);
        }
    }, [latestAnnouncement?.id, loading, latestAnnouncement?.is_popup]); // 의존성 배열 최적화

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
                        onClose={() => setShowPopup(false)}
                        onDoNotShowAgain={() => {
                            const popupKey = `announcement_popup_${latestAnnouncement.id}`;
                            localStorage.setItem(popupKey, 'true');
                            setShowPopup(false); // 즉시 닫기
                        }}
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
