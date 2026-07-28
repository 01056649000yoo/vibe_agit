import React, { useCallback, useEffect, useState } from 'react';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';

const PAGE_SIZE = 20;
const CACHE_TTL_MS = 30000;

const FILTERS = [
    { id: 'all', label: '전체', icon: '🔔' },
    { id: 'assignment', label: '선생님 과제', icon: '📝' },
    { id: 'reading_log', label: '독서록', icon: '📚' },
    { id: 'comment', label: '댓글', icon: '💬' }
];

const ACTIVITY_META = {
    assignment: { icon: '📝', label: '과제 글을 제출했어요', color: '#1D4ED8', background: '#EFF6FF', border: '#BFDBFE' },
    reading_log: { icon: '📚', label: '독서록을 올렸어요', color: '#15803D', background: '#F0FDF4', border: '#BBF7D0' },
    comment: { icon: '💬', label: '댓글을 남겼어요', color: '#7E22CE', background: '#FAF5FF', border: '#E9D5FF' }
};

const EMPTY_COUNTS = { all: 0, assignment: 0, reading_log: 0, comment: 0 };

const timeAgo = (value) => {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return '방금 전';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    return new Date(timestamp).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

const RecentActivity = ({ classId, onPostClick, isMobile }) => {
    const [filter, setFilter] = useState('all');
    const [activities, setActivities] = useState([]);
    const [counts, setCounts] = useState(EMPTY_COUNTS);
    const [nextOffset, setNextOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [openingId, setOpeningId] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');

    const fetchPage = useCallback(async ({ offset = 0, append = false, force = false } = {}) => {
        if (!classId) return;
        const cacheKey = classKey(classId, 'recent-activity', { filter, offset });
        if (force) dataCache.invalidate(cacheKey);

        if (append) setLoadingMore(true);
        else if (force) setRefreshing(true);
        else setLoading(true);
        setErrorMessage('');

        try {
            const result = await dataCache.get(cacheKey, async () => {
                const { data, error } = await supabase.rpc('get_class_recent_activity', {
                    p_class_id: classId,
                    p_kind: filter,
                    p_limit: PAGE_SIZE,
                    p_offset: offset
                });
                if (error) throw error;
                return data || {};
            }, CACHE_TTL_MS);

            const items = Array.isArray(result.items) ? result.items : [];
            setActivities((current) => append ? [...current, ...items] : items);
            setCounts({ ...EMPTY_COUNTS, ...(result.counts || {}) });
            setHasMore(Boolean(result.has_more));
            setNextOffset(Number(result.next_offset || offset + items.length));
        } catch (error) {
            console.error('최근 활동 로드 실패:', error.message);
            if (!append) setActivities([]);
            setErrorMessage('최근 활동을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    }, [classId, filter]);

    useEffect(() => {
        fetchPage({ offset: 0 });
    }, [fetchPage]);

    const openActivity = async (activity) => {
        if (!activity?.post_id || openingId) return;
        setOpeningId(activity.activity_id);
        setErrorMessage('');

        try {
            const postRequest = supabase
                .from('student_posts')
                .select('id, created_at, title, content, char_count, is_confirmed, writing_context, self_writing_type, students(name), writing_missions(title)')
                .eq('class_id', classId)
                .eq('id', activity.post_id)
                .single();

            const commentRequest = activity.kind === 'comment'
                ? supabase
                    .from('post_comments')
                    .select('id, content')
                    .eq('class_id', classId)
                    .eq('id', activity.activity_id)
                    .eq('status', 'approved')
                    .single()
                : Promise.resolve({ data: null, error: null });

            const [postResult, commentResult] = await Promise.all([postRequest, commentRequest]);
            if (postResult.error) throw postResult.error;
            if (commentResult.error) throw commentResult.error;

            onPostClick?.({
                ...postResult.data,
                recent_activity: {
                    ...activity,
                    comment_content: commentResult.data?.content || activity.preview || ''
                }
            });
        } catch (error) {
            console.error('최근 활동 상세 조회 실패:', error.message);
            setErrorMessage('선택한 활동의 상세 내용을 불러오지 못했습니다.');
        } finally {
            setOpeningId(null);
        }
    };

    return (
        <div style={{ width: '100%', minWidth: 0 }}>
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#1E293B', fontWeight: '900' }}>🔔 최근 활동</h3>
                    <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '0.74rem', lineHeight: 1.45 }}>
                        우리 반 학생이 올린 글, 독서록과 승인된 댓글을 시간순으로 확인합니다.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => fetchPage({ offset: 0, force: true })}
                    disabled={refreshing}
                    style={{
                        alignSelf: isMobile ? 'flex-start' : undefined,
                        border: '1px solid #CBD5E1', borderRadius: '10px', padding: '8px 11px',
                        background: 'white', color: '#475569', cursor: refreshing ? 'wait' : 'pointer',
                        fontSize: '0.72rem', fontWeight: '800', opacity: refreshing ? 0.65 : 1
                    }}
                >{refreshing ? '갱신 중...' : '↻ 새로고침'}</button>
            </header>

            <div role="tablist" aria-label="최근 활동 유형" style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '3px', marginBottom: '14px' }}>
                {FILTERS.map((item) => {
                    const selected = filter === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setFilter(item.id)}
                            style={{
                                flex: '0 0 auto', border: selected ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                                borderRadius: '999px', padding: '8px 11px', cursor: 'pointer',
                                background: selected ? '#EFF6FF' : 'white', color: selected ? '#1D4ED8' : '#64748B',
                                fontSize: '0.72rem', fontWeight: '850'
                            }}
                        >{item.icon} {item.label} {Number(counts[item.id] || 0).toLocaleString()}</button>
                    );
                })}
            </div>

            {errorMessage && (
                <div role="alert" style={{ marginBottom: '12px', padding: '11px', borderRadius: '11px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.74rem', fontWeight: '700' }}>
                    {errorMessage}
                </div>
            )}

            {loading ? (
                <div role="status" style={{ minHeight: '260px', display: 'grid', placeItems: 'center', color: '#64748B', fontSize: '0.78rem', fontWeight: '700' }}>
                    최근 활동을 불러오는 중...
                </div>
            ) : activities.length === 0 ? (
                <div style={{ minHeight: '220px', display: 'grid', placeItems: 'center', borderRadius: '14px', border: '1px dashed #CBD5E1', background: '#F8FAFC', color: '#64748B', fontSize: '0.78rem', textAlign: 'center', padding: '20px' }}>
                    선택한 유형의 활동이 아직 없습니다.
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '9px' }}>
                        {activities.map((activity) => {
                            const meta = ACTIVITY_META[activity.kind] || ACTIVITY_META.assignment;
                            const opening = openingId === activity.activity_id;
                            return (
                                <button
                                    key={`${activity.kind}-${activity.activity_id}`}
                                    type="button"
                                    onClick={() => openActivity(activity)}
                                    disabled={Boolean(openingId)}
                                    style={{
                                        minWidth: 0, padding: '13px', borderRadius: '14px', border: `1px solid ${meta.border}`,
                                        background: meta.background, cursor: openingId ? 'wait' : 'pointer', textAlign: 'left',
                                        opacity: openingId && !opening ? 0.72 : 1
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <strong style={{ color: '#334155', fontSize: '0.82rem' }}>{meta.icon} {activity.actor_name || '이름 없음'}</strong>
                                            <div style={{ marginTop: '3px', color: meta.color, fontSize: '0.7rem', fontWeight: '800' }}>{meta.label}</div>
                                        </div>
                                        <time style={{ flex: '0 0 auto', color: '#94A3B8', fontSize: '0.66rem', fontWeight: '700' }}>{timeAgo(activity.occurred_at)}</time>
                                    </div>
                                    <div style={{ marginTop: '10px', color: '#1E293B', fontSize: '0.78rem', fontWeight: '850', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {activity.title}
                                    </div>
                                    {activity.kind === 'comment' && activity.preview && (
                                        <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.72rem', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            “{activity.preview}”
                                        </p>
                                    )}
                                    <div style={{ marginTop: '8px', color: '#64748B', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {activity.kind === 'comment' && activity.post_owner_name && `${activity.post_owner_name}의 글 · `}{activity.context_title}
                                    </div>
                                    {opening && <div style={{ marginTop: '7px', color: meta.color, fontSize: '0.68rem', fontWeight: '800' }}>상세 내용 여는 중...</div>}
                                </button>
                            );
                        })}
                    </div>

                    {hasMore && (
                        <div style={{ marginTop: '14px', textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => fetchPage({ offset: nextOffset, append: true })}
                                disabled={loadingMore}
                                style={{
                                    border: '1px solid #CBD5E1', borderRadius: '11px', padding: '9px 18px',
                                    background: 'white', color: '#475569', cursor: loadingMore ? 'wait' : 'pointer',
                                    fontSize: '0.74rem', fontWeight: '850', opacity: loadingMore ? 0.65 : 1
                                }}
                            >{loadingMore ? '불러오는 중...' : '활동 더 보기'}</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default RecentActivity;
