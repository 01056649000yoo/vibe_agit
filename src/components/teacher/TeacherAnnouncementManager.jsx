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
        // [수정] 무조건 저장하지 않고, 모달 내부에서 체크박스 여부에 따라 저장을 결정하도록 함.
        // 여기서는 단순히 닫기만 수행
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

    // [수정] 로딩 중이라도 이미 데이터가 있다면 언마운트 하지 않음 (체크박스 상태 유지)
    if (loading && !latestAnnouncement) return null;

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
