import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { classKey, dataCache } from '../../../../../lib/cache';
import { supabase } from '../../../../../lib/supabaseClient';
import { getReactionOption } from '../../../../writing/reactions/registry';

const RELATIONSHIP_CACHE_MS = 120000;
const POST_LIMIT = 160;
const INTERACTION_LIMIT = 120;

const formatDate = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

const FriendRelationshipCard = ({ friendId, friendName, viewerId, classId }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const loadRelationship = useCallback(async (forceRefresh = false) => {
        if (!friendId || !viewerId || !classId) return;

        setLoading(true);
        setErrorMessage('');
        const cacheKey = classKey(classId, 'friend-relationship', { viewer: viewerId, friend: friendId });
        if (forceRefresh) dataCache.invalidate(cacheKey);

        try {
            const relationshipEvents = await dataCache.get(cacheKey, async () => {
                const { data: posts, error: postError } = await supabase
                    .from('student_posts')
                    .select('id, title, student_id, created_at')
                    .eq('class_id', classId)
                    .in('student_id', [viewerId, friendId])
                    .eq('is_submitted', true)
                    .eq('visibility', 'class')
                    .order('created_at', { ascending: false })
                    .limit(POST_LIMIT);
                if (postError) throw postError;

                const postIds = (posts || []).map((post) => post.id);
                if (postIds.length === 0) return [];

                const [commentResult, reactionResult] = await Promise.all([
                    supabase
                        .from('post_comments')
                        .select('id, post_id, student_id, created_at')
                        .eq('class_id', classId)
                        .in('post_id', postIds)
                        .in('student_id', [viewerId, friendId])
                        .eq('status', 'approved')
                        .order('created_at', { ascending: false })
                        .limit(INTERACTION_LIMIT),
                    supabase
                        .from('post_reactions')
                        .select('id, post_id, student_id, reaction_type, created_at')
                        .eq('class_id', classId)
                        .in('post_id', postIds)
                        .in('student_id', [viewerId, friendId])
                        .order('created_at', { ascending: false })
                        .limit(INTERACTION_LIMIT)
                ]);
                if (commentResult.error) throw commentResult.error;
                if (reactionResult.error) throw reactionResult.error;

                const postMap = new Map((posts || []).map((post) => [post.id, post]));
                const isSharedEvent = (event) => {
                    const post = postMap.get(event.post_id);
                    return post && (
                        (event.student_id === viewerId && post.student_id === friendId) ||
                        (event.student_id === friendId && post.student_id === viewerId)
                    );
                };
                const normalizeEvent = (event, type) => ({
                    ...event,
                    type,
                    post: postMap.get(event.post_id),
                    fromViewer: event.student_id === viewerId
                });

                return [
                    ...(commentResult.data || []).filter(isSharedEvent).map((event) => normalizeEvent(event, 'comment')),
                    ...(reactionResult.data || []).filter(isSharedEvent).map((event) => normalizeEvent(event, 'reaction'))
                ].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
            }, RELATIONSHIP_CACHE_MS);

            setEvents(relationshipEvents || []);
        } catch (error) {
            console.error('친구와 나눈 기록 로드 실패:', error.message);
            setErrorMessage('함께 나눈 기록을 잠시 불러오지 못했어요.');
        } finally {
            setLoading(false);
        }
    }, [classId, friendId, viewerId]);

    useEffect(() => {
        const timerId = window.setTimeout(loadRelationship, 0);
        return () => window.clearTimeout(timerId);
    }, [loadRelationship]);

    const summary = useMemo(() => ({
        fromMe: events.filter((event) => event.fromViewer).length,
        fromFriend: events.filter((event) => !event.fromViewer).length,
        sharedPosts: new Set(events.map((event) => event.post_id)).size
    }), [events]);

    return (
        <section aria-label={`${friendName || '친구'}와 나눈 기록`} style={{
            marginTop: '14px', padding: '20px', borderRadius: '24px', border: '1px solid #C8E6C9',
            background: 'linear-gradient(145deg,#F1F8E9,#FFFFFF)', textAlign: 'left'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                <div>
                    <span style={{ color: '#2E7D32', fontSize: '.7rem', fontWeight: 950 }}>우리 둘의 이야기</span>
                    <h3 style={{ margin: '4px 0 3px', color: '#263238', fontSize: '1.08rem' }}>🤝 친구와 나눈 기록</h3>
                    <small style={{ color: '#558B2F' }}>최근 공개 글에 서로 남긴 댓글과 마음만 모았어요.</small>
                </div>
                <button type="button" onClick={() => loadRelationship(true)} disabled={loading} style={{ border: 0, borderRadius: '9px', padding: '6px 9px', background: '#DCEDC8', color: '#33691E', cursor: 'pointer', fontWeight: 850 }}>새로고침</button>
            </div>

            {loading ? (
                <div style={{ padding: '32px 12px', textAlign: 'center', color: '#689F38', fontWeight: 800 }}>우리 둘의 기록을 찾는 중... 🤝</div>
            ) : errorMessage ? (
                <div style={{ padding: '28px 12px', textAlign: 'center', color: '#C62828', fontSize: '.84rem' }}>{errorMessage}</div>
            ) : events.length === 0 ? (
                <div style={{ padding: '28px 14px', border: '2px dashed #C8E6C9', borderRadius: '18px', textAlign: 'center', color: '#689F38', fontWeight: 800 }}>
                    아직 둘이 주고받은 기록이 없어요.<br />친구의 글에 첫 마음을 남겨 보세요! 🌱
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '7px', marginBottom: '13px' }}>
                        {[
                            ['내가 보낸 마음', summary.fromMe],
                            [`${friendName}의 마음`, summary.fromFriend],
                            ['함께 읽은 글', summary.sharedPosts]
                        ].map(([label, value]) => (
                            <div key={label} style={{ padding: '10px 6px', borderRadius: '14px', background: 'rgba(255,255,255,.78)', textAlign: 'center' }}>
                                <strong style={{ display: 'block', color: '#2E7D32', fontSize: '1rem' }}>{value}</strong>
                                <small style={{ display: 'block', marginTop: '2px', color: '#66845C', fontSize: '.62rem', fontWeight: 850 }}>{label}</small>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gap: '7px' }}>
                        {events.slice(0, 5).map((event) => {
                            const reactionOption = getReactionOption(event.reaction_type);
                            const action = event.type === 'comment'
                                ? '댓글을 남겼어요 💬'
                                : `${reactionOption.emoji} ${reactionOption.label} 마음을 남겼어요`;
                            const subject = event.fromViewer ? '내가' : friendName;
                            const owner = event.fromViewer ? `${friendName}의` : '내';
                            return (
                                <div key={`${event.type}:${event.id}`} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 11px', borderRadius: '14px', background: '#FFFFFF' }}>
                                    <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>{event.type === 'comment' ? '💬' : reactionOption.emoji}</span>
                                    <span style={{ flex: 1, minWidth: 0, color: '#455A3E', fontSize: '.75rem', fontWeight: 800, lineHeight: 1.45 }}>
                                        {subject} {owner} 「{event.post?.title || '제목 없는 글'}」에 {action}
                                    </span>
                                    <small style={{ flexShrink: 0, color: '#91A58A', fontSize: '.62rem', fontWeight: 800 }}>{formatDate(event.created_at)}</small>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
};

export default memo(FriendRelationshipCard);
