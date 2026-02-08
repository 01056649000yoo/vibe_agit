import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';

const AnnouncementItem = ({ ann, onDelete, onUpdate }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(ann.title);
    const [editContent, setEditContent] = useState(ann.content);
    const [editIsPopup, setEditIsPopup] = useState(ann.is_popup);
    const [editTargetRole, setEditTargetRole] = useState(ann.target_role);

    const handleSave = () => {
        onUpdate(ann.id, {
            title: editTitle,
            content: editContent,
            is_popup: editIsPopup,
            target_role: editTargetRole
        });
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div style={{
                background: 'white', borderRadius: '16px', padding: '20px',
                border: '2px solid #6366F1', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                display: 'flex', flexDirection: 'column', gap: '12px'
            }}>
                <div style={{ fontWeight: 'bold', color: '#6366F1', marginBottom: '8px' }}>✏️ 공지사항 수정</div>

                <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="제목"
                    style={{ padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E0', fontWeight: 'bold' }}
                />

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <select
                        value={editTargetRole}
                        onChange={(e) => setEditTargetRole(e.target.value)}
                        style={{ padding: '6px', borderRadius: '8px', border: '1px solid #CBD5E0' }}
                    >
                        <option value="TEACHER">선생님만</option>
                        <option value="STUDENT">학생만</option>
                        <option value="ALL">전체 공개</option>
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={editIsPopup}
                            onChange={(e) => setEditIsPopup(e.target.checked)}
                        />
                        팝업 강조
                    </label>
                </div>

                <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="내용"
                    style={{ padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E0', minHeight: '120px', resize: 'vertical' }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditing(false)}
                        style={{ color: '#64748B' }}
                    >
                        취소
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        style={{ background: '#6366F1', color: 'white' }}
                    >
                        저장
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
                background: 'white', borderRadius: '16px', padding: '20px',
                border: '2px solid #F1F5F9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                cursor: 'pointer', transition: 'all 0.2s ease',
                borderLeft: ann.is_popup ? '5px solid #F59E0B' : '5px solid #6366F1',
                display: 'flex', flexDirection: 'column',
                minHeight: '160px',
                height: isExpanded ? 'auto' : '220px'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px', marginBottom: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{
                            fontWeight: '900', fontSize: '1.05rem', color: '#1E293B',
                            wordBreak: 'break-all'
                        }}>
                            {ann.title}
                        </span>
                        <span style={{
                            fontSize: '0.7rem', background: '#F1F5F9', color: '#475569',
                            padding: '1px 8px', borderRadius: '12px', fontWeight: 'bold'
                        }}>
                            {ann.target_role === 'TEACHER' ? '선생님' : ann.target_role === 'STUDENT' ? '학생' : '전체'}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                        }}
                        style={{
                            color: '#3B82F6', fontSize: '0.75rem', flexShrink: 0,
                            padding: '2px 8px', borderRadius: '6px', background: '#EFF6FF'
                        }}
                    >
                        수정
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(ann.id);
                        }}
                        style={{
                            color: '#EF4444', fontSize: '0.75rem', flexShrink: 0,
                            padding: '2px 8px', borderRadius: '6px', background: '#FEF2F2'
                        }}
                    >
                        삭제
                    </Button>
                </div>
            </div>

            <div style={{
                flex: 1,
                fontSize: '0.9rem',
                color: '#475569',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.5',
                wordBreak: 'break-word',
                overflow: 'hidden',
                position: 'relative'
            }}>
                <div style={{
                    maxHeight: isExpanded ? 'none' : '100px',
                    overflow: 'hidden'
                }}>
                    {ann.content}
                </div>
                {!isExpanded && (
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: '30px', background: 'linear-gradient(transparent, white)'
                    }} />
                )}
            </div>

            <div style={{
                fontSize: '0.75rem', color: '#94A3B8', marginTop: '12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <span>📅 {new Date(ann.created_at).toLocaleDateString()}</span>
                <span style={{ fontWeight: 'bold', color: '#6366F1' }}>
                    {isExpanded ? '🔼 접기' : '상세 보기 🔽'}
                </span>
            </div>
        </div>
    );
};

const AdminAnnouncementManager = () => {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [isPopup, setIsPopup] = useState(false);

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setAnnouncements(data || []);
        } catch (err) {
            console.error('공지사항 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddAnnouncement = async () => {
        if (!newTitle || !newContent) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        try {
            const { error } = await supabase
                .from('announcements')
                .insert([{
                    title: newTitle,
                    content: newContent,
                    target_role: 'TEACHER',
                    is_popup: isPopup
                }]);

            if (error) throw error;

            alert('공지사항이 등록되었습니다.');
            setNewTitle('');
            setNewContent('');
            setIsAdding(false);
            fetchAnnouncements();
        } catch (err) {
            alert('등록 실패: ' + err.message);
        }
    };

    const handleUpdate = async (id, updates) => {
        try {
            const { error } = await supabase
                .from('announcements')
                .update(updates)
                .eq('id', id);

            if (error) throw error;

            alert('공지사항이 수정되었습니다.');
            fetchAnnouncements();
        } catch (err) {
            alert('수정 실패: ' + err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if (error) throw error;
            fetchAnnouncements();
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    };

    return (
        <div style={{ padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#2D3748' }}>📢 시스템 공지사항 관리</h3>
                <Button
                    onClick={() => setIsAdding(!isAdding)}
                    style={{ background: isAdding ? '#E53E3E' : '#6366F1' }}
                >
                    {isAdding ? '취소' : '➕ 새 공지 작성'}
                </Button>
            </div>

            {isAdding && (
                <Card style={{ padding: '24px', marginBottom: '30px', border: '1px solid #6366F1' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#4A5568', marginBottom: '5px', fontWeight: 'bold' }}>공지 제목</label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="예: [안내] 시스템 점검 안내"
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E0' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#4A5568', marginBottom: '5px', fontWeight: 'bold' }}>공지 내용</label>
                            <textarea
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                placeholder="공지할 내용을 상세히 적어주세요."
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E0', minHeight: '150px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
                                <input
                                    type="checkbox"
                                    id="popup-check"
                                    checked={isPopup}
                                    onChange={(e) => setIsPopup(e.target.checked)}
                                />
                                <label htmlFor="popup-check" style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4A5568', cursor: 'pointer' }}>
                                    팝업으로 강조 알림
                                </label>
                            </div>
                        </div>
                        <Button
                            onClick={handleAddAnnouncement}
                            style={{ background: '#6366F1', fontWeight: 'bold', marginTop: '10px' }}
                        >
                            공지사항 등록하기
                        </Button>
                    </div>
                </Card>
            )}

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: '20px',
                marginTop: '20px'
            }}>
                {announcements.map(ann => (
                    <AnnouncementItem key={ann.id} ann={ann} onDelete={handleDelete} onUpdate={handleUpdate} />
                ))}
            </div>

            {!loading && announcements.length === 0 && (
                <div style={{ textAlign: 'center', padding: '50px', color: '#A0AEC0' }}>등록된 공지사항이 없습니다.</div>
            )}
        </div>
    );
};

export default AdminAnnouncementManager;
