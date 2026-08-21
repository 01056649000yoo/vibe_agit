import React from 'react';
import Button from '../common/Button';

/*
 * 머리말의 공지 버튼.
 *
 * 2026-08-21 개편: 예전에는 이 컴포넌트가 스스로 공지를 불러오고 읽음까지 관리했다.
 * 이제 위쪽 띠(`AnnouncementSpotlight`)와 **같은 자료를 봐야 하므로** 대시보드가 한 번 읽어
 * 넘겨준다. 여기는 그리기만 한다.
 *
 * ⚠️ 예전 읽음 판정은 "최신 공지 ID 하나"였다. 새 공지가 3건 쌓여도 목록을 한 번 열면 3건 모두
 * 읽은 것이 됐다. 지금은 `useAnnouncementSeen` 이 공지별로 세므로 개수가 정확하다.
 */
const TeacherAnnouncementManager = ({ isMobile, unreadCount = 0, onOpenList }) => {
    const hasUnread = unreadCount > 0;

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onOpenList}
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
                boxShadow: hasUnread ? '0 0 0 3px rgba(99, 102, 241, 0.08)' : 'none'
            }}
            title="공지사항"
        >
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <span>{isMobile ? '🔔' : '📢'}</span>
            </span>
            {isMobile ? null : <span>공지사항</span>}
            {hasUnread && (
                <span style={{
                    minWidth: '18px', padding: '1px 6px', borderRadius: '999px',
                    background: '#EF4444', color: 'white',
                    fontSize: '0.7rem', fontWeight: 900, textAlign: 'center'
                }}>
                    {unreadCount}
                </span>
            )}
        </Button>
    );
};

export default TeacherAnnouncementManager;
