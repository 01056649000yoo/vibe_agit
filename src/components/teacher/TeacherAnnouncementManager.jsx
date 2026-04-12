import React, { useState, useEffect } from 'react';
import { useAnnouncements } from '../../hooks/useAnnouncements';
import { AnnouncementListModal } from './AnnouncementComponents';
import Button from '../common/Button';

const TeacherAnnouncementManager = ({ isMobile }) => {
    const { announcements, latestAnnouncement, loading } = useAnnouncements('TEACHER');
    const [showList, setShowList] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    useEffect(() => {
        if (loading || !latestAnnouncement?.id) return;

        const latestSeenId = localStorage.getItem('teacher_latest_announcement_seen');
        setHasUnread(latestSeenId !== latestAnnouncement.id);
    }, [latestAnnouncement?.id, loading]);

    if (loading) return null;

    const handleOpenList = () => {
        if (latestAnnouncement?.id) {
            localStorage.setItem('teacher_latest_announcement_seen', latestAnnouncement.id);
            setHasUnread(false);
        }
        setShowList(true);
    };

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenList}
                style={{
                    fontSize: '0.8rem',
                    color: hasUnread ? '#4338CA' : '#6366F1',
                    border: hasUnread ? '1px solid #C7D2FE' : '1px solid #E0E7FF',
                    background: hasUnread ? '#EEF2FF' : '#F5F7FF',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: hasUnread ? '0 0 0 3px rgba(99, 102, 241, 0.08)' : 'none',
                    maxWidth: isMobile ? '52px' : '240px'
                }}
                title={latestAnnouncement ? latestAnnouncement.title : '공지사항'}
            >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <span>{isMobile ? '🔔' : '📢'}</span>
                    {hasUnread && (
                        <span style={{
                            position: 'absolute',
                            top: '-4px',
                            right: isMobile ? '-5px' : '-8px',
                            minWidth: '8px',
                            height: '8px',
                            borderRadius: '999px',
                            background: '#EF4444',
                            border: '2px solid white'
                        }} />
                    )}
                </span>
                {isMobile ? null : (
                    <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '180px'
                    }}>
                        {hasUnread && latestAnnouncement ? `새 공지: ${latestAnnouncement.title}` : '공지사항'}
                    </span>
                )}
            </Button>

            {showList && (
                <AnnouncementListModal
                    announcements={announcements}
                    onClose={() => setShowList(false)}
                />
            )}
        </>
    );
};

export default TeacherAnnouncementManager;
