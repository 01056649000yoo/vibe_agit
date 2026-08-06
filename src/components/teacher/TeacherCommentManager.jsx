import React, { useCallback, useEffect, useState } from 'react';
import Button from '../common/Button';
import Card from '../common/Card';
import { supabase } from '../../lib/supabaseClient';
import './teacherComments.css';

/**
 * 학급의 학생 댓글을 한자리에서 본다.
 *
 * 만든 이유: AI 검사가 부적절로 판정하면 예전에는 댓글을 **지웠다.** 그래서 학생은 애써 쓴 글을 잃고,
 * 교사는 무엇이 막혔는지 모르고, 오탐률도 잴 수 없었다. 이제 `blocked` 로 남으므로
 * 선생님이 보고 `이건 괜찮아요` 를 눌러 풀어 줄 수 있다.
 *
 * `확인 대기(pending)` 는 AI 판정이 끝나지 않은 댓글이다. 아무에게도 안 보이는데 학생은 썼다고
 * 생각하므로, 여기서 보이는 것 자체가 중요하다.
 */

const FILTERS = [
    { id: 'blocked', label: '🛡️ AI가 막음', hint: '억울하게 막힌 것이 있으면 풀어 주세요' },
    { id: 'pending', label: '🕓 확인 대기', hint: 'AI 판정이 끝나지 않아 아무에게도 안 보이는 댓글' },
    { id: 'approved', label: '✅ 보이는 댓글', hint: '친구들에게 보이고 있는 댓글' },
    { id: 'all', label: '전체', hint: '' }
];

const PAGE_SIZE = 50;

const formatWhen = (value) => (value
    ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '');

const TeacherCommentManager = ({ activeClass }) => {
    const classId = activeClass?.id || null;
    const [filter, setFilter] = useState('blocked');
    const [query, setQuery] = useState('');
    const [data, setData] = useState({ total: 0, counts: {}, items: [] });
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');
        const { data: result, error } = await supabase.rpc('get_teacher_class_comments', {
            p_class_id: classId,
            p_status: filter,
            p_query: query.trim() || null,
            p_limit: PAGE_SIZE,
            p_offset: 0
        });
        if (error) {
            console.error('학생 댓글 목록 불러오기 실패:', error.message);
            setErrorMessage('댓글 목록을 불러오지 못했습니다.');
            setData({ total: 0, counts: {}, items: [] });
        } else {
            setData({
                total: Number(result?.total || 0),
                counts: result?.counts || {},
                items: Array.isArray(result?.items) ? result.items : []
            });
        }
        setLoading(false);
    }, [classId, filter, query]);

    useEffect(() => {
        if (!classId) return undefined;
        const timerId = window.setTimeout(load, 250);
        return () => window.clearTimeout(timerId);
    }, [classId, load]);

    const changeStatus = async (comment, nextStatus) => {
        setBusyId(comment.id);
        const { data: result, error } = await supabase.rpc('set_teacher_comment_status', {
            p_comment_id: comment.id,
            p_status: nextStatus,
            p_reason: null
        });
        setBusyId(null);
        if (error || !result?.success) {
            console.error('댓글 상태 변경 실패:', error?.message || result?.error);
            alert('댓글 상태를 바꾸지 못했습니다.');
            return;
        }
        load();
    };

    const activeFilter = FILTERS.find((item) => item.id === filter);
    const count = (key) => Number(Reflect.get(data.counts || {}, key) ?? 0);

    return (
        <div className="teacher-comments">
            <header className="teacher-comments__header">
                <div>
                    <h2>🗨️ 학생 댓글 관리</h2>
                    <p>친구 글에 남긴 댓글을 한자리에서 보고, AI가 막은 것을 풀어 줄 수 있어요.</p>
                </div>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="학생 이름이나 댓글 내용으로 찾기"
                    aria-label="학생 이름이나 댓글 내용으로 찾기"
                />
            </header>

            <div className="teacher-comments__filters" role="tablist" aria-label="댓글 상태">
                {FILTERS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={filter === item.id}
                        className={filter === item.id ? 'is-active' : ''}
                        onClick={() => setFilter(item.id)}
                    >
                        {item.label}
                        {item.id !== 'all' && count(item.id) > 0 && <strong>{count(item.id)}</strong>}
                    </button>
                ))}
            </div>

            {activeFilter?.hint && <p className="teacher-comments__hint">{activeFilter.hint}</p>}

            {errorMessage && <Card style={{ borderColor: '#FCA5A5', color: '#B91C1C' }}>{errorMessage}</Card>}

            {loading ? (
                <Card><p style={{ textAlign: 'center', padding: '42px' }}>학생 댓글을 모으는 중... 🗨️</p></Card>
            ) : data.items.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '56px 24px' }}>
                    <div style={{ fontSize: '3rem' }}>🗨️</div>
                    <p style={{ color: 'var(--ui-ink-muted)' }}>
                        {filter === 'blocked' ? 'AI가 막은 댓글이 없어요.'
                            : filter === 'pending' ? '확인을 기다리는 댓글이 없어요.'
                                : '아직 댓글이 없어요.'}
                    </p>
                </Card>
            ) : (
                <ul className="teacher-comments__list">
                    {data.items.map((comment) => (
                        <li key={comment.id} className={`teacher-comments__item is-${comment.status}`}>
                            <div className="teacher-comments__meta">
                                <strong>{comment.student_name}</strong>
                                <span>
                                    {comment.post_owner_name
                                        ? `${comment.post_owner_name}의 「${comment.post_title || '제목 없는 글'}」에`
                                        : `「${comment.post_title || '제목 없는 글'}」에`}
                                </span>
                                <small>{formatWhen(comment.created_at)}</small>
                            </div>

                            <p className="teacher-comments__content">{comment.content}</p>

                            {comment.moderation_reason && (
                                <p className="teacher-comments__reason">
                                    <span>AI 판단</span> {comment.moderation_reason}
                                </p>
                            )}

                            <div className="teacher-comments__actions">
                                <span className={`teacher-comments__status is-${comment.status}`}>
                                    {comment.status === 'blocked' ? '🛡️ 막힘 (친구에게 안 보임)'
                                        : comment.status === 'pending' ? '🕓 확인 대기 (친구에게 안 보임)'
                                            : '✅ 보이는 중'}
                                </span>
                                {comment.status !== 'approved' ? (
                                    <Button
                                        size="sm"
                                        disabled={busyId === comment.id}
                                        onClick={() => changeStatus(comment, 'approved')}
                                    >
                                        {busyId === comment.id ? '바꾸는 중...' : '이건 괜찮아요 · 보여주기'}
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busyId === comment.id}
                                        onClick={() => changeStatus(comment, 'blocked')}
                                    >
                                        가리기
                                    </Button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {data.total > data.items.length && (
                <p className="teacher-comments__more">{data.total}건 중 {data.items.length}건을 보고 있어요.</p>
            )}
        </div>
    );
};

export default TeacherCommentManager;
