import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';

const AdminFeedbackList = ({ onFeedbackUpdated }) => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState(new Set());

    useEffect(() => {
        fetchFeedbacks();
    }, []);

    const fetchFeedbacks = async () => {
        setLoading(true);
        try {
            // 교사 정보도 함께 조인해서 가져오기
            const { data, error } = await supabase
                .from('feedback_reports')
                .select(`
                    *,
                    teacher:profiles!teacher_id(
                        full_name,
                        email
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) {
                // 권한 없음(403) 에러 시 안내
                if (error.code === '42501' || error.message.includes('permission')) {
                    console.error('권한 부족:', error);
                    alert('데이터를 불러올 권한이 없습니다. (새로고침 하거나 관리자 계정인지 확인해주세요)');
                }
                throw error;
            }
            setFeedbacks(data || []);
        } catch (error) {
            console.error('피드백 로드 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            const { error } = await supabase
                .from('feedback_reports')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            // 상태 업데이트 반영
            setFeedbacks(prev => prev.map(f =>
                f.id === id ? { ...f, status: newStatus } : f
            ));
            onFeedbackUpdated?.();
        } catch (error) {
            alert('상태 업데이트 실패: ' + error.message);
        }
    };
    const handleDelete = async (id) => {
        if (!confirm('정말로 이 피드백을 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase
                .from('feedback_reports')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setFeedbacks(prev => prev.filter(f => f.id !== id));
            onFeedbackUpdated?.();
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        }
    };

    const toggleExpand = (id) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6C757D' }}>Loading...</div>;

    return (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            {feedbacks.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#ADB5BD' }}>접수된 의견이 없습니다. 📭</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: '800px' }}>
                        <thead>
                            <tr style={{ background: '#F8F9FA', borderBottom: '2px solid #E9ECEF', color: '#495057' }}>
                                <th style={{ padding: '16px', textAlign: 'left', minWidth: '80px' }}>상태</th>
                                <th style={{ padding: '16px', textAlign: 'left' }}>제목</th>
                                <th style={{ padding: '16px', textAlign: 'left', minWidth: '150px' }}>작성자</th>
                                <th style={{ padding: '16px', textAlign: 'left', minWidth: '100px' }}>날짜</th>
                                <th style={{ padding: '16px', textAlign: 'center', minWidth: '120px' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {feedbacks.map(item => {
                                const teacherName = item.teacher?.teachers?.[0]?.name || item.teacher?.full_name || '알 수 없음';
                                const schoolName = item.teacher?.teachers?.[0]?.school_name || '';

                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #F1F3F5' }}>
                                        <td style={{ padding: '16px' }}>
                                            <span style={{
                                                padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                                                background: item.status === 'done' ? '#E8F5E9' : item.status === 'open' ? '#FFF3E0' : '#ECEFF1',
                                                color: item.status === 'done' ? '#2E7D32' : item.status === 'open' ? '#F57C00' : '#546E7A'
                                            }}>
                                                {item.status === 'done' ? '완료' : item.status === 'open' ? '대기중' : item.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', maxWidth: '400px' }}>
                                            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#2C3E50', wordBreak: 'break-word', whiteSpace: 'normal' }}>{item.title}</div>
                                            <div
                                                style={{
                                                    fontSize: '0.85rem', color: '#546E7A', lineHeight: '1.4',
                                                    maxHeight: expandedIds.has(item.id) ? 'none' : '40px',
                                                    overflow: 'hidden', cursor: 'pointer',
                                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                                }}
                                                onClick={() => toggleExpand(item.id)}
                                            >
                                                {item.content}
                                            </div>
                                            {item.content.length > 50 && (
                                                <div
                                                    onClick={() => toggleExpand(item.id)}
                                                    style={{ fontSize: '0.75rem', color: '#3498DB', cursor: 'pointer', marginTop: '4px' }}
                                                >
                                                    {expandedIds.has(item.id) ? '접기 ▲' : '더보기 ▼'}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px', fontSize: '0.85rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>{teacherName}</div>
                                            <div style={{ color: '#90A4AE' }}>{schoolName}</div>
                                        </td>
                                        <td style={{ padding: '16px', color: '#78909C', fontSize: '0.85rem' }}>
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                            {item.status !== 'done' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleUpdateStatus(item.id, 'done')}
                                                    style={{ background: '#38A169', color: 'white', border: 'none', padding: '6px 12px' }}
                                                >
                                                    완료 처리
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                onClick={() => handleDelete(item.id)}
                                                style={{ background: '#FFF5F5', color: '#C0392B', border: '1px solid #FC8181', padding: '6px 12px', marginLeft: '6px' }}
                                            >
                                                삭제
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AdminFeedbackList;
