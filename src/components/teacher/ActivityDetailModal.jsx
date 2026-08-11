import React from 'react';
import ModalCloseButton from '../common/ModalCloseButton';
import { getSelfWritingType } from '../../modules/writing/selfWritingTypes';
import ReportDocument from '../../modules/writing/mission-types/report/ReportDocument';
import { isReportStructuredContent } from '../../modules/writing/mission-types/report/reportContent';

const ActivityDetailModal = ({ post, onClose }) => {
    if (!post) return null;

    const recentActivity = post.recent_activity;
    const isCommentActivity = recentActivity?.kind === 'comment';
    const selfType = getSelfWritingType(post);
    const missionTitle = post.writing_missions?.title
        || (Array.isArray(post.writing_missions) ? post.writing_missions[0]?.title : null);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '24px', width: '100%', maxWidth: '800px',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>
                <header style={{ padding: '20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span style={{ color: '#3498DB', fontWeight: 'bold', fontSize: '0.9rem' }}>{post.students?.name || '학생'}의 글</span>
                        <h3 style={{ margin: '4px 0 0 0', color: '#2C3E50', fontWeight: '900' }}>{post.title || '제목 없음'}</h3>
                    </div>
                    <ModalCloseButton onClick={onClose} label="최근 활동 글 닫기" />
                </header>
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: '#444', fontSize: '1.1rem' }}>
                    {isCommentActivity && (
                        <aside style={{
                            marginBottom: '22px', padding: '15px 17px', borderRadius: '15px',
                            background: '#FAF5FF', border: '1px solid #E9D5FF', whiteSpace: 'normal'
                        }}>
                            <strong style={{ display: 'block', color: '#7E22CE', fontSize: '0.82rem', marginBottom: '6px' }}>
                                💬 {recentActivity.actor_name || '학생'}이 남긴 댓글
                            </strong>
                            <div style={{ color: '#4C1D95', fontSize: '0.95rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                                {recentActivity.comment_content || '댓글 내용이 없습니다.'}
                            </div>
                        </aside>
                    )}
                    {isReportStructuredContent(post.structured_content) ? (
                        <ReportDocument structuredContent={post.structured_content} content={post.content} />
                    ) : post.content || '내용이 없습니다.'}
                </div>
                <footer style={{ padding: '20px', borderTop: '1px solid #EEE', textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem' }}>
                    {selfType ? `학생 ${selfType.label}` : `미션: ${missionTitle || '정보 없음'}`} | 글자 수: {post.char_count || 0}자
                </footer>
            </div>
        </div>
    );
};

export default ActivityDetailModal;
