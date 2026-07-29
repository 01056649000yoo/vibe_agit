import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import BookCover from '../../writing/reading-log/BookCover';
import { supabase } from '../../../lib/supabaseClient';
import { classKey, dataCache } from '../../../lib/cache';

const FILTERS = [
    { id: 'all', label: '전체' },
    { id: 'reading_log', label: '📚 독서록' },
    { id: 'assignment', label: '✍️ 선생님 과제' }
];

const normalizeRelation = (value) => Array.isArray(value) ? (value[0] || null) : (value || null);

const isReadingLog = (post) => (
    post?.writing_context === 'self' && post?.self_writing_type === 'reading_log'
);

const SHELF_CACHE_MS = 120000;

const FriendWritingShelf = ({ friend, viewerId, classId, onOpenPost }) => {
    const friendId = friend?.id;
    const [posts, setPosts] = useState([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [openingPostId, setOpeningPostId] = useState(null);

    const fetchShelf = useCallback(async (forceRefresh = false) => {
        if (!friendId || !viewerId || !classId) return;

        setLoading(true);
        setErrorMessage('');
        const cacheKey = classKey(classId, 'friend-shelf', { viewer: viewerId, friend: friendId });
        if (forceRefresh) dataCache.invalidate(cacheKey);

        try {
            const data = await dataCache.get(cacheKey, async () => {
                const { data: shelfRows, error } = await supabase
                    .from('student_posts')
                    .select(`
                        id, title, student_id, mission_id, created_at, updated_at, published_at,
                        writing_context, self_writing_type, visibility, structured_content,
                        writing_missions(id, title, mission_type, input_template),
                        post_reactions(id, reaction_type)
                    `)
                    // 학급을 직접 건다. student_id 만으로 거르면 학급 인덱스를 못 쓰고,
                    // 전학 온 친구의 **예전 학급 글**까지 딸려 온다 (WORKLOG '학급 글 조회 기준' ①).
                    .eq('class_id', classId)
                    .eq('student_id', friendId)
                    .eq('is_submitted', true)
                    .eq('visibility', 'class')
                    .order('published_at', { ascending: false, nullsFirst: false })
                    .order('updated_at', { ascending: false })
                    .limit(36);

                if (error) throw error;
                return shelfRows || [];
            }, SHELF_CACHE_MS);

            setPosts(data || []);
        } catch (error) {
            console.error('친구 공개 글 책장 로드 실패:', error.message);
            setPosts([]);
            setErrorMessage('친구의 글 책장을 불러오지 못했어요. 잠시 후 다시 열어주세요.');
        } finally {
            setLoading(false);
        }
    }, [friendId, viewerId, classId]);

    useEffect(() => {
        const timerId = window.setTimeout(fetchShelf, 0);
        return () => window.clearTimeout(timerId);
    }, [fetchShelf]);

    const counts = useMemo(() => ({
        all: posts.length,
        reading_log: posts.filter(isReadingLog).length,
        assignment: posts.filter((post) => !isReadingLog(post)).length
    }), [posts]);

    const visiblePosts = useMemo(() => {
        if (filter === 'reading_log') return posts.filter(isReadingLog);
        if (filter === 'assignment') return posts.filter((post) => !isReadingLog(post));
        return posts;
    }, [filter, posts]);

    const handleOpenPost = async (postSummary) => {
        if (!postSummary?.id || openingPostId) return;

        setOpeningPostId(postSummary.id);
        const { data, error } = await supabase
            .from('student_posts')
            .select(`
                id, title, content, student_id, mission_id, created_at, updated_at, published_at,
                char_count, is_confirmed, is_submitted, writing_context, self_writing_type,
                visibility, structured_content, show_original, original_title, original_content,
                students:student_id(name, pet_data),
                writing_missions(id, title, allow_comments, mission_type, input_template),
                post_reactions(id, reaction_type, student_id)
            `)
            .eq('id', postSummary.id)
            .eq('student_id', friend.id)
            .eq('is_submitted', true)
            .eq('visibility', 'class')
            .maybeSingle();

        setOpeningPostId(null);
        if (error || !data) {
            setPosts((current) => current.filter((post) => post.id !== postSummary.id));
            alert('이 글은 비공개로 바뀌었거나 더 이상 볼 수 없어요. 🔒');
            return;
        }

        const embeddedStudent = normalizeRelation(data.students);
        const embeddedMission = normalizeRelation(data.writing_missions);
        onOpenPost({
            ...data,
            student_name: embeddedStudent?.name || friend.name,
            students: embeddedStudent || { name: friend.name, pet_data: friend.pet_data || null },
            writing_missions: embeddedMission,
            original_title: data.show_original ? data.original_title : null,
            original_content: data.show_original ? data.original_content : null
        });
    };

    return (
        <section className="friend-writing-shelf" aria-label={`${friend?.name || '친구'}의 공개 글 책장`}>
            <div className="friend-writing-shelf-heading">
                <div>
                    <span>글 책장</span>
                    <h3>📚 {friend?.name}의 공개 글</h3>
                    <p>친구가 공개한 과제 글과 독서록만 보여요.</p>
                </div>
                <button type="button" onClick={() => fetchShelf(true)} disabled={loading}>새로고침</button>
            </div>

            <div className="friend-writing-shelf-filters" role="tablist" aria-label="공개 글 종류">
                {FILTERS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={filter === item.id}
                        className={filter === item.id ? 'active' : ''}
                        onClick={() => setFilter(item.id)}
                    >
                        {item.label} <small>{counts[item.id]}</small>
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="friend-writing-shelf-state">글 책장을 펼치는 중... 📖</div>
            ) : errorMessage ? (
                <div className="friend-writing-shelf-state error">{errorMessage}</div>
            ) : visiblePosts.length === 0 ? (
                <div className="friend-writing-shelf-state">
                    <span>📭</span>
                    {posts.length === 0 ? '아직 공개한 글이 없어요.' : '이 종류의 공개 글은 아직 없어요.'}
                </div>
            ) : (
                <div className="friend-writing-shelf-grid">
                    {visiblePosts.map((post) => {
                        const readingLog = isReadingLog(post);
                        const mission = normalizeRelation(post.writing_missions);
                        const book = post.structured_content || {};
                        const reactionCount = Array.isArray(post.post_reactions) ? post.post_reactions.length : 0;
                        const isMeeting = mission?.mission_type === 'meeting' || mission?.input_template === 'meeting';

                        return (
                            <button
                                key={post.id}
                                type="button"
                                className={`friend-writing-shelf-card ${readingLog ? 'reading-log' : 'assignment'}`}
                                onClick={() => handleOpenPost(post)}
                                disabled={Boolean(openingPostId)}
                            >
                                {readingLog ? (
                                    <BookCover src={book.thumbnailUrl} title={book.bookTitle || post.title} size="sm" />
                                ) : (
                                    <span className={`friend-writing-paper-icon ${isMeeting ? 'meeting' : ''}`}>
                                        {isMeeting ? '🏛️' : '✍️'}
                                    </span>
                                )}
                                <span className="friend-writing-shelf-card-copy">
                                    <small>{readingLog ? '독서록' : (isMeeting ? '회의 안건' : mission?.title || '선생님 과제')}</small>
                                    <strong>{post.title || '제목 없는 글'}</strong>
                                    <em>
                                        {readingLog
                                            ? ([book.bookAuthor, book.publisher].filter(Boolean).join(' · ') || '책 정보 보기')
                                            : (mission?.title || '과제 글쓰기')}
                                    </em>
                                    <span>💬 글 보기 · 반응 {reactionCount}</span>
                                </span>
                                {openingPostId === post.id && <b>여는 중...</b>}
                            </button>
                        );
                    })}
                </div>
            )}

            <style>{`
                .friend-writing-shelf { margin-top:32px; padding:24px; border-radius:26px; border:1px solid #DDE7F0; background:linear-gradient(145deg,#F8FBFF,#FFFFFF); text-align:left; }
                .friend-writing-shelf-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
                .friend-writing-shelf-heading span { color:#5C6BC0; font-size:.74rem; font-weight:950; letter-spacing:.08em; }
                .friend-writing-shelf-heading h3 { margin:5px 0 4px; color:#263238; font-size:1.2rem; }
                .friend-writing-shelf-heading p { margin:0; color:#78909C; font-size:.82rem; }
                .friend-writing-shelf-heading > button { border:0; border-radius:10px; padding:7px 10px; background:#EEF2FF; color:#4F46E5; font-size:.75rem; font-weight:900; cursor:pointer; }
                .friend-writing-shelf-filters { display:flex; gap:7px; margin-bottom:16px; overflow-x:auto; }
                .friend-writing-shelf-filters button { border:1px solid #DDE3EA; border-radius:999px; padding:7px 11px; background:white; color:#607D8B; font-size:.76rem; font-weight:850; white-space:nowrap; cursor:pointer; }
                .friend-writing-shelf-filters button.active { border-color:#5C6BC0; background:#5C6BC0; color:white; }
                .friend-writing-shelf-filters small { margin-left:3px; opacity:.8; }
                .friend-writing-shelf-state { display:flex; align-items:center; justify-content:center; gap:8px; min-height:120px; border:2px dashed #E2E8F0; border-radius:18px; color:#90A4AE; font-weight:800; text-align:center; }
                .friend-writing-shelf-state > span { font-size:1.5rem; }
                .friend-writing-shelf-state.error { color:#C62828; background:#FFF5F5; }
                .friend-writing-shelf-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:11px; }
                .friend-writing-shelf-card { position:relative; display:flex; align-items:center; gap:13px; min-width:0; padding:13px; border-radius:17px; border:1px solid #E3E8EF; background:white; text-align:left; cursor:pointer; box-shadow:0 5px 14px rgba(44,62,80,.05); }
                .friend-writing-shelf-card:hover { border-color:#7986CB; transform:translateY(-1px); }
                .friend-writing-shelf-card:disabled { cursor:wait; opacity:.72; }
                .friend-writing-shelf-card.reading-log { border-left:5px solid #7CB342; }
                .friend-writing-shelf-card.assignment { border-left:5px solid #42A5F5; }
                .friend-writing-paper-icon { display:flex; width:58px; height:72px; flex:0 0 58px; align-items:center; justify-content:center; border-radius:8px 13px 13px 8px; background:linear-gradient(145deg,#E3F2FD,#BBDEFB); font-size:1.7rem; box-shadow:0 6px 12px rgba(30,136,229,.12); }
                .friend-writing-paper-icon.meeting { background:linear-gradient(145deg,#F3E8FF,#DDD6FE); }
                .friend-writing-shelf-card-copy { display:flex; flex:1; min-width:0; flex-direction:column; }
                .friend-writing-shelf-card-copy small { color:#5C6BC0; font-size:.66rem; font-weight:950; }
                .friend-writing-shelf-card-copy strong { margin:4px 0; overflow:hidden; color:#263238; font-size:.88rem; text-overflow:ellipsis; white-space:nowrap; }
                .friend-writing-shelf-card-copy em { overflow:hidden; color:#78909C; font-size:.7rem; font-style:normal; text-overflow:ellipsis; white-space:nowrap; }
                .friend-writing-shelf-card-copy > span { margin-top:7px; color:#90A4AE; font-size:.65rem; font-weight:800; }
                .friend-writing-shelf-card > b { position:absolute; inset:auto 8px 8px auto; padding:3px 6px; border-radius:7px; background:#263238; color:white; font-size:.62rem; }
                @media (max-width:620px) {
                    .friend-writing-shelf { padding:18px; }
                    .friend-writing-shelf-heading { flex-direction:column; }
                    .friend-writing-shelf-grid { grid-template-columns:1fr; }
                }
            `}</style>
        </section>
    );
};

export default memo(FriendWritingShelf);
