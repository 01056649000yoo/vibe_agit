import React from 'react';

const ActivityDetailModal = ({ post, onClose }) => {
    if (!post) return null;

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
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                </header>
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: '#444', fontSize: '1.1rem' }}>
                    {post.content || '내용이 없습니다.'}
                </div>
                <footer style={{ padding: '20px', borderTop: '1px solid #EEE', textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem' }}>
                    미션: {post.writing_missions?.title || (Array.isArray(post.writing_missions) ? post.writing_missions[0]?.title : '정보 없음')} | 글자 수: {post.char_count || 0}자
                </footer>
            </div>
        </div>
    );
};

export default ActivityDetailModal;
