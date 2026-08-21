import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import {
    FEEDBACK_CATEGORIES,
    describeFeedbackCategory,
    describeFeedbackStatus
} from '../../modules/feedback/feedbackCategories';

const STATUS_TONES = {
    open: { background: '#FFF7ED', color: '#B45309' },
    in_progress: { background: '#EFF6FF', color: '#2B6CB0' },
    done: { background: '#F0FFF4', color: '#2F855A' }
};

const NEXT_STATUS_ACTIONS = [
    { id: 'in_progress', label: '확인 중으로' },
    { id: 'done', label: '완료 처리' }
];

/*
 * 관리자 제보 목록.
 *
 * 2026-08-21 개편: 제보에 종류·맥락이 붙었고 **답장**이 생겼다.
 * 답장은 표를 직접 고치지 않고 `admin_reply_feedback_v1` 하나로 모은다 — 답장 시각을
 * 서버가 쥐어야 선생님 쪽 "새 답장" 배지와 어긋나지 않는다.
 */
const AdminFeedbackList = ({ onFeedbackUpdated }) => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [replyDrafts, setReplyDrafts] = useState({});
    const [savingId, setSavingId] = useState(null);

    const fetchFeedbacks = useCallback(async () => {
        setLoading(true);
        try {
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
    }, []);

    useEffect(() => {
        void fetchFeedbacks();
    }, [fetchFeedbacks]);

    const counts = useMemo(() => {
        const result = { all: feedbacks.length };
        for (const item of feedbacks) {
            const key = item.category || 'other';
            Reflect.set(result, key, (Reflect.get(result, key) || 0) + 1);
        }
        return result;
    }, [feedbacks]);

    const visible = useMemo(
        () => (categoryFilter === 'all'
            ? feedbacks
            : feedbacks.filter((item) => (item.category || 'other') === categoryFilter)),
        [feedbacks, categoryFilter]
    );

    /*
     * 답장과 상태를 함께 보낸다. 답장 칸을 비워 두고 상태만 옮길 수도 있다
     * (서버가 빈 답장은 무시하고 기존 답장을 유지한다).
     */
    const handleSave = async (item, nextStatus) => {
        const draft = (Reflect.get(replyDrafts, item.id) ?? item.admin_reply ?? '').trim();
        setSavingId(item.id);
        try {
            const { error } = await supabase.rpc('admin_reply_feedback_v1', {
                p_feedback_id: item.id,
                p_reply: draft || null,
                p_status: nextStatus
            });
            if (error) throw error;
            await fetchFeedbacks();
            onFeedbackUpdated?.();
        } catch (error) {
            console.error('답장 저장 실패:', error);
            alert(error?.message || '답장을 저장하지 못했습니다.');
        } finally {
            setSavingId(null);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('정말로 이 제보를 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('feedback_reports').delete().eq('id', id);
            if (error) throw error;
            setFeedbacks((prev) => prev.filter((f) => f.id !== id));
            onFeedbackUpdated?.();
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        }
    };

    const toggleExpand = (id) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#6C757D' }}>불러오는 중...</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 종류별로 걸러 본다. 내용 정정은 검수 화면으로 이어지므로 따로 모아 보는 일이 잦다. */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[{ id: 'all', icon: '📋', label: '전체' }, ...FEEDBACK_CATEGORIES].map((item) => {
                    const isActive = categoryFilter === item.id;
                    const count = Reflect.get(counts, item.id) || 0;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setCategoryFilter(item.id)}
                            style={{
                                border: isActive ? '1px solid #2B6CB0' : '1px solid #E2E8F0',
                                background: isActive ? '#EBF8FF' : 'white',
                                color: isActive ? '#2B6CB0' : '#4A5568',
                                fontWeight: isActive ? 'bold' : 'normal',
                                borderRadius: '999px', padding: '7px 14px',
                                fontSize: '0.85rem', cursor: 'pointer'
                            }}
                        >
                            {item.icon} {item.label} {count > 0 && `(${count})`}
                        </button>
                    );
                })}
            </div>

            {visible.length === 0 ? (
                <div style={{
                    padding: '60px', textAlign: 'center', color: '#ADB5BD',
                    background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF'
                }}>
                    {feedbacks.length === 0 ? '접수된 제보가 없습니다. 📭' : '이 종류의 제보가 없습니다.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {visible.map((item) => {
                        const teacherName = item.teacher?.full_name || '알 수 없음';
                        const category = describeFeedbackCategory(item.category);
                        const status = describeFeedbackStatus(item.status);
                        const tone = Reflect.get(STATUS_TONES, item.status) || STATUS_TONES.open;
                        const isExpanded = expandedIds.has(item.id);
                        const draft = Reflect.get(replyDrafts, item.id) ?? item.admin_reply ?? '';

                        return (
                            <div key={item.id} style={{
                                background: 'white', borderRadius: '12px',
                                border: '1px solid #E9ECEF', padding: '18px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <span style={{
                                        padding: '4px 9px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold',
                                        background: tone.background, color: tone.color
                                    }}>
                                        {status.label}
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                                        {category.icon} {category.label}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#A0AEC0' }}>
                                        {teacherName} · {new Date(item.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                <div style={{ fontWeight: 'bold', color: '#2C3E50', marginBottom: '6px', wordBreak: 'break-word' }}>
                                    {item.title}
                                </div>
                                <div
                                    onClick={() => toggleExpand(item.id)}
                                    style={{
                                        fontSize: '0.85rem', color: '#546E7A', lineHeight: '1.5',
                                        maxHeight: isExpanded ? 'none' : '46px', overflow: 'hidden',
                                        cursor: 'pointer', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                    }}
                                >
                                    {item.content}
                                </div>
                                {(item.content?.length || 0) > 60 && (
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(item.id)}
                                        style={{ border: 'none', background: 'none', color: '#3498DB', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 0' }}
                                    >
                                        {isExpanded ? '접기 ▲' : '더보기 ▼'}
                                    </button>
                                )}

                                {/* 어느 화면·어느 기기였는지. 앱이 담아 보내므로 다시 물어볼 필요가 없다. */}
                                {isExpanded && item.context && Object.keys(item.context).length > 0 && (
                                    <div style={{
                                        marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
                                        background: '#F7FAFC', color: '#718096', fontSize: '0.75rem',
                                        wordBreak: 'break-all', lineHeight: '1.6'
                                    }}>
                                        <strong style={{ color: '#4A5568' }}>보낸 곳</strong>{' '}
                                        {item.context.screen || '-'} · {item.context.viewport || '-'}
                                        <br />
                                        {item.context.ua || ''}
                                    </div>
                                )}

                                {/* 답장 — 이 기능의 핵심. 선생님 화면에 그대로 보인다. */}
                                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #F1F3F5' }}>
                                    <label
                                        htmlFor={`reply-${item.id}`}
                                        style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#4A5568' }}
                                    >
                                        💬 답장 {item.replied_at && `(${new Date(item.replied_at).toLocaleDateString()} 보냄)`}
                                    </label>
                                    <textarea
                                        id={`reply-${item.id}`}
                                        value={draft}
                                        onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                                        placeholder="예: 확인했습니다. 다음 배포 때 고칠게요."
                                        maxLength={2000}
                                        style={{
                                            width: '100%', boxSizing: 'border-box', minHeight: '64px',
                                            padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                            fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical'
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px', flexWrap: 'wrap' }}>
                                        {NEXT_STATUS_ACTIONS.map((action) => (
                                            <Button
                                                key={action.id}
                                                size="sm"
                                                onClick={() => handleSave(item, action.id)}
                                                disabled={savingId === item.id}
                                                style={{
                                                    background: action.id === 'done' ? '#38A169' : '#3182CE',
                                                    color: 'white', border: 'none', padding: '6px 12px'
                                                }}
                                            >
                                                {savingId === item.id ? '저장 중...' : `답장 + ${action.label}`}
                                            </Button>
                                        ))}
                                        <Button
                                            size="sm"
                                            onClick={() => handleDelete(item.id)}
                                            style={{ background: '#FFF5F5', color: '#C0392B', border: '1px solid #FC8181', padding: '6px 12px' }}
                                        >
                                            삭제
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminFeedbackList;
