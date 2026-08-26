import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../common/Button';
import Card from '../common/Card';
import { supabase } from '../../lib/supabaseClient';
import TeacherGuideButton from './TeacherGuideButton';
import './teacherComments.css';

/**
 * 학급의 학생 댓글을 한자리에서 본다.
 *
 * 만든 이유: AI 검사가 부적절로 판정하면 예전에는 댓글을 **지웠다.** 그래서 학생은 애써 쓴 글을 잃고,
 * 교사는 무엇이 막혔는지 모르고, 오탐률도 잴 수 없었다. 이제 `blocked` 로 남으므로
 * 선생님이 보고 풀어 주거나 지울 수 있다.
 *
 * 탭을 **성격대로** 둘로 나눴다. 둘을 같은 모양으로 두면 8,000건짜리 기록에 처리할 4건이 묻힌다.
 *   * `처리할 것` — 막힘 + 대기. 교사가 봐야 할 것이라 **기간을 걸지 않고 전부** 보여 준다. 비우는 게 목표다.
 *   * `기록`     — 이미 보이는 댓글. 스크롤이 아니라 **검색으로 찾는다.** 기본은 최근 7일만.
 */

const VIEWS = [
    {
        id: 'todo',
        label: '🛠️ 처리할 것',
        countKey: 'todo',
        hint: 'AI가 막았거나 판정이 끝나지 않아 친구에게 보이지 않는 댓글이에요. 확인해서 풀어 주거나 지워 주세요.',
        empty: '처리할 댓글이 없어요. 모두 확인하셨습니다. ✅',
        usePeriod: false
    },
    {
        id: 'approved',
        label: '📚 기록',
        countKey: 'approved',
        hint: '친구들에게 보이고 있는 댓글이에요. 기간을 좁히거나 이름·내용으로 찾아보세요.',
        empty: '이 기간에 남긴 댓글이 없어요.',
        usePeriod: true
    }
];

const PERIODS = [
    { id: 3, label: '최근 3일' },
    { id: 7, label: '최근 7일' },
    { id: 14, label: '최근 2주' },
    { id: 30, label: '최근 30일' },
    // 옛 댓글은 기간을 풀고 검색으로 찾는다.
    { id: 0, label: '전체' }
];

const PAGE_SIZE = 50;

const formatWhen = (value) => (value
    ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '');

const TeacherCommentManager = ({ activeClass }) => {
    const classId = activeClass?.id || null;
    const [view, setView] = useState('todo');
    const [days, setDays] = useState(7);
    const [query, setQuery] = useState('');
    const [counts, setCounts] = useState({});
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [busyId, setBusyId] = useState(null);
    const requestSequenceRef = useRef(0);
    const scheduledLoadRef = useRef(null);

    const activeView = VIEWS.find((item) => item.id === view) || VIEWS[0];

    const fetchPage = useCallback(async (offset) => supabase.rpc('get_teacher_class_comments', {
        p_class_id: classId,
        p_status: view,
        p_query: query.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
        // `처리할 것` 은 오래된 것도 반드시 보여야 하므로 기간을 걸지 않는다.
        p_days: view === 'todo' ? null : (days || null)
    }), [classId, days, query, view]);

    const load = useCallback(async ({ keepContent = false } = {}) => {
        if (!classId) return;
        const requestId = requestSequenceRef.current + 1;
        requestSequenceRef.current = requestId;

        if (keepContent) {
            setRefreshing(true);
        } else {
            setLoading(true);
            setRefreshing(false);
        }
        setErrorMessage('');
        const { data, error } = await fetchPage(0);

        // 검색어나 탭이 바뀐 뒤 도착한 예전 응답이 최신 목록을 덮지 않게 한다.
        if (requestId !== requestSequenceRef.current) return;

        if (error) {
            console.error('학생 댓글 목록 불러오기 실패:', error.message);
            setErrorMessage('댓글 목록을 불러오지 못했습니다.');
            if (!keepContent) {
                setItems([]);
                setTotal(0);
            }
        } else {
            setCounts(data?.counts || {});
            setItems(Array.isArray(data?.items) ? data.items : []);
            setTotal(Number(data?.total || 0));
        }
        setLoading(false);
        setRefreshing(false);
    }, [classId, fetchPage]);

    useEffect(() => {
        // 조건이 바뀌는 즉시 진행 중인 이전 조건의 요청을 무효화한다.
        requestSequenceRef.current += 1;
        if (!classId) return undefined;
        scheduledLoadRef.current = window.setTimeout(() => {
            scheduledLoadRef.current = null;
            load();
        }, 250);
        return () => {
            window.clearTimeout(scheduledLoadRef.current);
            scheduledLoadRef.current = null;
        };
    }, [classId, load]);

    const refresh = useCallback(() => {
        if (scheduledLoadRef.current !== null) {
            window.clearTimeout(scheduledLoadRef.current);
            scheduledLoadRef.current = null;
        }
        load({ keepContent: true });
    }, [load]);

    const loadMore = async () => {
        const requestId = requestSequenceRef.current;
        setLoadingMore(true);
        const { data, error } = await fetchPage(items.length);
        setLoadingMore(false);
        // 더 보기를 누른 뒤 검색·탭·학급이 바뀌면 이전 조건의 다음 페이지를 새 목록에 섞지 않는다.
        if (requestId !== requestSequenceRef.current) return;
        if (error) {
            console.error('댓글 더 보기 실패:', error.message);
            return;
        }
        setItems((current) => [...current, ...(data?.items || [])]);
    };

    const changeStatus = async (comment, nextStatus) => {
        setBusyId(comment.id);
        const { data, error } = await supabase.rpc('set_teacher_comment_status', {
            p_comment_id: comment.id,
            p_status: nextStatus,
            p_reason: null
        });
        setBusyId(null);
        if (error || !data?.success) {
            console.error('댓글 상태 변경 실패:', error?.message || data?.error);
            alert('댓글 상태를 바꾸지 못했습니다.');
            return;
        }
        load();
    };

    const removeComment = async (comment) => {
        if (!window.confirm(`${comment.student_name} 학생의 댓글을 지울까요?\n「${comment.content.slice(0, 30)}${comment.content.length > 30 ? '…' : ''}」\n지우면 되돌릴 수 없어요.`)) return;
        setBusyId(comment.id);
        const { data, error } = await supabase.rpc('delete_teacher_class_comment', { p_comment_id: comment.id });
        setBusyId(null);
        if (error || !data?.success) {
            console.error('댓글 삭제 실패:', error?.message || data?.error);
            alert('댓글을 지우지 못했습니다.');
            return;
        }
        load();
    };

    const count = (key) => Number(Reflect.get(counts || {}, key) ?? 0);

    return (
        <div className="teacher-comments">
            <header className="teacher-comments__header">
                <div className="teacher-comments__heading-copy">
                    <div className="teacher-comments__title-row">
                        <h2>🗨️ 학생 댓글 관리</h2>
                        <TeacherGuideButton tabId="comments" variant="help" />
                    </div>
                    <p>친구 글에 남긴 댓글을 한자리에서 보고, AI가 막은 것을 풀어 주거나 지울 수 있어요.</p>
                </div>
                <div className="teacher-comments__tools">
                    <input
                        className="teacher-comments__search"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="학생 이름이나 댓글 내용으로 찾기"
                        aria-label="학생 이름이나 댓글 내용으로 찾기"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="teacher-comments__refresh"
                        onClick={refresh}
                        loading={refreshing}
                        loadingText="갱신 중..."
                        disabled={loading || loadingMore || busyId !== null || !classId}
                        aria-label="학생 댓글 목록 새로고침"
                    >
                        ↻ 새로고침
                    </Button>
                </div>
            </header>

            <div className="teacher-comments__filters" role="tablist" aria-label="댓글 보기">
                {VIEWS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={view === item.id}
                        className={view === item.id ? 'is-active' : ''}
                        onClick={() => setView(item.id)}
                    >
                        {item.label}
                        {count(item.countKey) > 0 && <strong>{count(item.countKey)}</strong>}
                    </button>
                ))}
            </div>

            <p className="teacher-comments__hint">{activeView.hint}</p>

            {activeView.usePeriod && (
                <div className="teacher-comments__periods" role="group" aria-label="기간">
                    {PERIODS.map((period) => (
                        <button
                            key={period.id}
                            type="button"
                            className={days === period.id ? 'is-active' : ''}
                            onClick={() => setDays(period.id)}
                        >
                            {period.label}
                        </button>
                    ))}
                </div>
            )}

            {errorMessage && <Card style={{ borderColor: '#FCA5A5', color: '#B91C1C' }}>{errorMessage}</Card>}

            {loading ? (
                <Card><p style={{ textAlign: 'center', padding: '42px' }}>학생 댓글을 모으는 중... 🗨️</p></Card>
            ) : items.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '56px 24px' }}>
                    <div style={{ fontSize: '3rem' }}>{view === 'todo' ? '✅' : '🗨️'}</div>
                    <p style={{ color: 'var(--ui-ink-muted)' }}>{activeView.empty}</p>
                </Card>
            ) : (
                <>
                    <ul className="teacher-comments__list">
                        {items.map((comment) => (
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
                                    <span className="teacher-comments__buttons">
                                        {comment.status !== 'approved' ? (
                                            <Button
                                                size="sm"
                                                disabled={busyId === comment.id}
                                                onClick={() => changeStatus(comment, 'approved')}
                                            >
                                                {busyId === comment.id ? '처리 중...' : '이건 괜찮아요'}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={busyId === comment.id}
                                                onClick={() => changeStatus(comment, 'blocked')}
                                            >
                                                가리기
                                            </Button>
                                        )}
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            disabled={busyId === comment.id}
                                            onClick={() => removeComment(comment)}
                                        >
                                            삭제
                                        </Button>
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>

                    {items.length < total && (
                        <div className="teacher-comments__more">
                            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                                {loadingMore ? '불러오는 중...' : `더 보기 (${items.length} / ${total})`}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default TeacherCommentManager;
