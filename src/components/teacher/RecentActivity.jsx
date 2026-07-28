import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

// 최근 활동 요약 컴포넌트
const RecentActivity = ({ classId, isMobile, onPostClick }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (classId) fetchRecentActivities();
    }, [classId]);

    const fetchRecentActivities = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, created_at, title, content, char_count, is_confirmed,
                    students!inner(name, class_id),
                    writing_missions!inner(title)
                `)
                // 학급은 student_posts.class_id 로 직접 좁힌다. students 를 거쳐 걸면
                // 학급 인덱스를 못 써서 다른 학급 글까지 훑고 나서 버리게 된다.
                .eq('class_id', classId)
                .is('students.deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            setActivities(data || []);
        } catch (err) {
            console.error('최근 활동 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const timeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return '방금 전';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}분 전`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}시간 전`;
        return new Date(date).toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    };

    return (
        <div style={{ width: '100%' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#212529', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔔 최근 활동 <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>{activities.length}건</span>
            </h3>
            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                gridAutoRows: 'minmax(70px, auto)',
                maxHeight: '440px',
                overflowY: 'auto',
                gap: '8px',
                paddingRight: '4px', // 스크롤바 공간
                scrollbarWidth: 'thin'
            }}>
                {loading ? (
                    <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem', padding: '20px' }}>로딩 중...</p>
                ) : activities.length === 0 ? (
                    <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem', padding: '40px' }}>아직 활동 내용이 없어요. ✍️</p>
                ) : (
                    activities.map((act) => (
                        <button
                            type="button"
                            key={act.id}
                            onClick={() => onPostClick && onPostClick(act)}
                            style={{
                                padding: '12px 14px',
                                borderRadius: '12px',
                                background: '#FFFFFF',
                                border: '1px solid #F1F3F5',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxSizing: 'border-box',
                                minWidth: 0,
                                textAlign: 'left'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = '#F8F9FA';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.borderColor = '#3498DB';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = '#FFFFFF';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.borderColor = '#F1F3F5';
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '0.9rem' }}>{act.students?.name || '알 수 없는 학생'}</span>
                                <span style={{ fontSize: '0.75rem', color: '#ADB5BD', fontWeight: 'bold' }}>{timeAgo(act.created_at)}</span>
                            </div>
                            <div style={{
                                fontSize: '0.85rem',
                                color: '#7F8C8D',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%'
                            }}>
                                {act.title || '제목 없는 글'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#3498DB', marginTop: '2px' }}>
                                미션: {act.writing_missions?.title || act.writing_missions?.[0]?.title || '미션 정보 없음'}
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};

export default RecentActivity;
