import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { getSelfWritingType } from '../../writing/selfWritingTypes';
import { supabase } from '../../../lib/supabaseClient';
import { classKey, dataCache } from '../../../lib/cache';

const FILTERS = [
    { id: 'all', label: '전체 책장' },
    { id: 'assignment', label: '✍️ 과제 책장' },
    { id: 'reading_log', label: '📚 독서록 책장' },
    { id: 'diary', label: '📔 일기 책장' }
];

const BOOK_COLORS = new Map(Object.entries({
    assignment: [
        ['#477DB6', '#28527D', '#193B60'],
        ['#6589B1', '#365F8C', '#23466B'],
        ['#426A9B', '#25476F', '#173552']
    ],
    reading_log: [
        ['#6B9A70', '#3F704A', '#295237'],
        ['#5E958B', '#356A64', '#28514D'],
        ['#77955C', '#4E6F37', '#384F29']
    ],
    diary: [
        ['#7C86D6', '#4F5AA8', '#343C7A'],
        ['#8E86C9', '#5C509C', '#3E356F'],
        ['#6E8FCB', '#42639C', '#2D466F']
    ],
    meeting: [
        ['#9C76A8', '#714E7E', '#54395F'],
        ['#8B72B5', '#604B8D', '#403467'],
        ['#AF7FAE', '#80517F', '#5D385C']
    ]
}));

const KIND_ICONS = new Map(Object.entries({ assignment: '✍️', reading_log: '📚', diary: '📔', meeting: '🏛️' }));

const normalizeRelation = (value) => Array.isArray(value) ? (value[0] || null) : (value || null);

const isReadingLog = (post) => getSelfWritingType(post)?.id === 'reading_log';
const isDiaryPost = (post) => getSelfWritingType(post)?.id === 'diary';
// 자율 글은 과제가 아니다. 예전에는 `독서록이 아니면 과제` 로 갈라서
// 공개한 일기가 과제 칸에 섞여 들어갔다.
const isAssignmentPost = (post) => !getSelfWritingType(post);

const isMeetingPost = (post) => {
    const mission = normalizeRelation(post?.writing_missions);
    return mission?.mission_type === 'meeting' || mission?.input_template === 'meeting';
};

const getBookKind = (post) => {
    if (isReadingLog(post)) return 'reading_log';
    if (isDiaryPost(post)) return 'diary';
    if (isMeetingPost(post)) return 'meeting';
    return 'assignment';
};

const getBookLabel = (post) => {
    const mission = normalizeRelation(post?.writing_missions);
    const selfType = getSelfWritingType(post);
    if (selfType) return selfType.label;
    if (isMeetingPost(post)) return '회의 안건';
    return mission?.title || '선생님 과제';
};

const stableBookVariant = (post) => String(post?.id || post?.title || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

const SHELF_CACHE_MS = 120000;

const ShelfBook = ({ post, opening, disabled, onOpen }) => {
    const kind = getBookKind(post);
    const variant = stableBookVariant(post);
    const palette = BOOK_COLORS.get(kind) || BOOK_COLORS.get('assignment');
    const [light, middle, dark] = palette[variant % palette.length];
    const title = post.title || '제목 없는 글';
    const titleLength = Array.from(title).length;
    const width = titleLength > 16 ? 60 : titleLength > 8 ? 52 : 44;
    const height = 146 + ((variant % 4) * 7);
    const icon = KIND_ICONS.get(kind) || KIND_ICONS.get('assignment');
    const reactionCount = Array.isArray(post.post_reactions) ? post.post_reactions.length : 0;

    return (
        <button
            type="button"
            onClick={onOpen}
            disabled={disabled}
            aria-label={`${getBookLabel(post)} ‘${title}’ 펼쳐보기, 반응 ${reactionCount}개`}
            title={`${icon} ${getBookLabel(post)} · ${title}`}
            className="friend-bookshelf-book"
            style={{
                flexBasis: `${width}px`, width: `${width}px`, height: `${height}px`,
                borderColor: dark,
                background: `linear-gradient(90deg,${dark} 0 8%,${light} 13%,${middle} 72%,${dark} 100%)`
            }}
        >
            <span className="friend-bookshelf-book-icon" aria-hidden="true">{icon}</span>
            <span className="friend-bookshelf-book-title" aria-hidden="true">
                <span>{title}</span>
            </span>
            <span className="friend-bookshelf-book-reactions" aria-hidden="true">♡ {reactionCount}</span>
            <span className="friend-bookshelf-book-ridge" aria-hidden="true" />
            {opening && <span className="friend-bookshelf-book-opening">여는 중</span>}
        </button>
    );
};

const FriendWritingShelf = ({ friend, viewerId, classId, onOpenPost }) => {
    const friendId = friend?.id;
    const [posts, setPosts] = useState([]);
    const [filter, setFilter] = useState('all');
    const [viewMode, setViewMode] = useState('books');
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
                    .select('id, title, student_id, mission_id, created_at, updated_at, published_at, writing_context, self_writing_type, visibility')
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
                const rows = shelfRows || [];
                const missionIds = [...new Set(rows.map((post) => post.mission_id).filter(Boolean))];
                const postIds = rows.map((post) => post.id);
                const [missionResult, reactionResult] = await Promise.all([
                    missionIds.length
                        ? supabase
                            .from('writing_missions')
                            .select('id, title, mission_type, input_template')
                            .eq('class_id', classId)
                            .in('id', missionIds)
                            .limit(missionIds.length)
                        : Promise.resolve({ data: [], error: null }),
                    postIds.length
                        ? supabase
                            .from('post_reactions')
                            .select('id, post_id, reaction_type')
                            .eq('class_id', classId)
                            .in('post_id', postIds)
                            .limit(Math.min(1000, postIds.length * 50))
                        : Promise.resolve({ data: [], error: null })
                ]);
                if (missionResult.error) throw missionResult.error;
                if (reactionResult.error) throw reactionResult.error;

                const missionMap = new Map((missionResult.data || []).map((mission) => [mission.id, mission]));
                const reactionsByPost = new Map();
                (reactionResult.data || []).forEach((reaction) => {
                    const list = reactionsByPost.get(reaction.post_id) || [];
                    list.push(reaction);
                    reactionsByPost.set(reaction.post_id, list);
                });
                return rows.map((post) => ({
                    ...post,
                    writing_missions: post.mission_id ? (missionMap.get(post.mission_id) || null) : null,
                    post_reactions: reactionsByPost.get(post.id) || []
                }));
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
        diary: posts.filter(isDiaryPost).length,
        assignment: posts.filter(isAssignmentPost).length
    }), [posts]);

    const visiblePosts = useMemo(() => {
        if (filter === 'reading_log') return posts.filter(isReadingLog);
        if (filter === 'diary') return posts.filter(isDiaryPost);
        if (filter === 'assignment') return posts.filter(isAssignmentPost);
        return posts;
    }, [filter, posts]);

    const handleOpenPost = async (postSummary) => {
        if (!postSummary?.id || openingPostId) return;

        setOpeningPostId(postSummary.id);
        const { data, error } = await supabase
            .from('student_posts')
            .select('id, title, content, student_id, mission_id, created_at, updated_at, published_at, char_count, is_confirmed, is_submitted, writing_context, self_writing_type, visibility, structured_content, show_original, original_title, original_content')
            .eq('class_id', classId)
            .eq('id', postSummary.id)
            .eq('student_id', friend.id)
            .eq('is_submitted', true)
            .eq('visibility', 'class')
            .maybeSingle();

        if (error || !data) {
            setOpeningPostId(null);
            setPosts((current) => current.filter((post) => post.id !== postSummary.id));
            alert('이 글은 비공개로 바뀌었거나 더 이상 볼 수 없어요. 🔒');
            return;
        }

        const [missionResult, reactionResult] = await Promise.all([
            data.mission_id
                ? supabase
                    .from('writing_missions')
                    .select('id, title, allow_comments, mission_type, input_template')
                    .eq('class_id', classId)
                    .eq('id', data.mission_id)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
            supabase
                .from('post_reactions')
                .select('id, reaction_type, student_id')
                .eq('class_id', classId)
                .eq('post_id', data.id)
                .limit(50)
        ]);
        if (missionResult.error || reactionResult.error) {
            setOpeningPostId(null);
            alert('글 정보를 완성하지 못했어요. 잠시 후 다시 시도해주세요.');
            return;
        }

        setOpeningPostId(null);
        onOpenPost({
            ...data,
            student_name: friend.name,
            students: { name: friend.name, pet_data: friend.pet_data || null },
            writing_missions: missionResult.data || null,
            post_reactions: reactionResult.data || [],
            original_title: data.show_original ? data.original_title : null,
            original_content: data.show_original ? data.original_content : null
        });
    };

    return (
        <section className="friend-writing-shelf" aria-label={`${friend?.name || '친구'}의 공개 글 책장`}>
            <div className="friend-writing-shelf-heading">
                <div>
                    <span>공개 서재</span>
                    <h3>📚 {friend?.name}의 책장</h3>
                    <p>책등을 눌러 친구가 공개한 글을 펼쳐보세요.</p>
                </div>
                <button type="button" onClick={() => fetchShelf(true)} disabled={loading}>새로고침</button>
            </div>

            <div className="friend-writing-shelf-toolbar">
                <div className="friend-writing-shelf-filters" role="tablist" aria-label="공개 글 책장 종류">
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
                {visiblePosts.length > 0 && (
                    <button type="button" className="friend-writing-shelf-view" onClick={() => setViewMode((current) => current === 'books' ? 'titles' : 'books')}>
                        {viewMode === 'books' ? '제목 전체 보기' : '책등으로 보기'}
                    </button>
                )}
            </div>

            {loading ? (
                <div className="friend-writing-shelf-state">글 책장을 펼치는 중... 📖</div>
            ) : errorMessage ? (
                <div className="friend-writing-shelf-state error">{errorMessage}</div>
            ) : visiblePosts.length === 0 ? (
                <div className="friend-writing-shelf-state">
                    <span>📭</span>
                    {posts.length === 0 ? '아직 공개한 글이 없어요.' : '이 책장에는 아직 공개한 글이 없어요.'}
                </div>
            ) : viewMode === 'titles' ? (
                <div className="friend-writing-title-list" role="group" aria-label="공개 글 제목 전체 목록">
                    {visiblePosts.map((post) => {
                        const kind = getBookKind(post);
                        const icon = KIND_ICONS.get(kind) || KIND_ICONS.get('assignment');
                        const reactionCount = Array.isArray(post.post_reactions) ? post.post_reactions.length : 0;
                        return (
                            <button key={post.id} type="button" onClick={() => handleOpenPost(post)} disabled={Boolean(openingPostId)}>
                                <span aria-hidden="true">{icon}</span>
                                <span>
                                    <strong>{post.title || '제목 없는 글'}</strong>
                                    <small>{getBookLabel(post)} · 반응 {reactionCount}</small>
                                </span>
                                <em>{openingPostId === post.id ? '여는 중...' : '펼치기 →'}</em>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="friend-bookshelf-scene">
                    <div className="friend-bookshelf-books" role="group" aria-label={`${FILTERS.find((item) => item.id === filter)?.label || '전체 책장'} 책등`}>
                        {visiblePosts.map((post) => (
                            <ShelfBook
                                key={post.id}
                                post={post}
                                opening={openingPostId === post.id}
                                disabled={Boolean(openingPostId)}
                                onOpen={() => handleOpenPost(post)}
                            />
                        ))}
                    </div>
                    <div className="friend-bookshelf-board" aria-hidden="true">
                        <span />
                    </div>
                    <p>← 책장을 좌우로 밀어 더 많은 글을 찾아보세요 →</p>
                </div>
            )}

            <style>{`
                .friend-writing-shelf { margin-top:14px; padding:20px; overflow:hidden; border-radius:24px; border:1px solid rgba(105,61,32,.18); background:linear-gradient(145deg,#FFF9EB,#F7E8CB); text-align:left; box-shadow:0 8px 22px rgba(82,51,29,.08); }
                .friend-writing-shelf-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:15px; }
                .friend-writing-shelf-heading span { color:#8A5B27; font-size:.7rem; font-weight:950; letter-spacing:.08em; }
                .friend-writing-shelf-heading h3 { margin:4px 0; color:#3E2E23; font-size:1.08rem; }
                .friend-writing-shelf-heading p { margin:0; color:#8D7B6C; font-size:.76rem; }
                .friend-writing-shelf-heading > button { border:1px solid rgba(112,65,38,.18); border-radius:10px; padding:7px 9px; background:rgba(255,255,255,.7); color:#75513A; font-size:.7rem; font-weight:900; cursor:pointer; }
                .friend-writing-shelf-toolbar { display:flex; align-items:flex-start; justify-content:space-between; gap:9px; margin-bottom:12px; }
                .friend-writing-shelf-filters { display:flex; gap:6px; min-width:0; overflow-x:auto; scrollbar-width:none; }
                .friend-writing-shelf-filters button { flex:0 0 auto; min-height:36px; border:1px solid rgba(112,65,38,.2); border-radius:11px 11px 5px 5px; padding:6px 10px; background:rgba(255,255,255,.65); color:#75513A; font-size:.69rem; font-weight:850; white-space:nowrap; cursor:pointer; }
                .friend-writing-shelf-filters button.active { border-color:#704126; background:linear-gradient(145deg,#8B5A35,#5D351F); color:#FFF8E8; box-shadow:0 4px 9px rgba(76,43,24,.18); }
                .friend-writing-shelf-filters small { margin-left:2px; opacity:.8; }
                .friend-writing-shelf-view { flex:0 0 auto; border:0; border-radius:9px; padding:7px 9px; background:#F3E1C0; color:#704126; font-size:.65rem; font-weight:900; cursor:pointer; }
                .friend-writing-shelf-state { display:flex; align-items:center; justify-content:center; gap:8px; min-height:120px; border:2px dashed rgba(112,65,38,.2); border-radius:18px; background:rgba(255,255,255,.36); color:#9A7A61; font-weight:800; text-align:center; }
                .friend-writing-shelf-state > span { font-size:1.5rem; }
                .friend-writing-shelf-state.error { color:#C62828; background:#FFF5F5; }
                .friend-bookshelf-scene { overflow:hidden; border-radius:15px; background:linear-gradient(180deg,#D9BB8B 0%,#B98755 62%,#82502D 100%); box-shadow:inset 0 5px 12px rgba(76,43,24,.28),0 7px 14px rgba(76,43,24,.14); }
                .friend-bookshelf-books { display:flex; align-items:flex-end; gap:3px; min-height:190px; padding:17px 14px 0; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:thin; scrollbar-color:#704126 transparent; scroll-snap-type:x proximity; }
                .friend-bookshelf-book { position:relative; flex-grow:0; flex-shrink:0; padding:8px 5px 7px; overflow:hidden; border-width:1px; border-style:solid; border-radius:5px 5px 2px 2px; color:#FFF9E9; cursor:pointer; font-family:inherit; scroll-snap-align:start; box-shadow:inset 2px 0 0 rgba(255,255,255,.18),inset -2px 0 0 rgba(0,0,0,.12),3px 3px 6px rgba(55,31,17,.28); transition:transform .15s ease,filter .15s ease; }
                .friend-bookshelf-book:hover { transform:translateY(-5px) rotate(-1deg); filter:brightness(1.06); }
                .friend-bookshelf-book:disabled { cursor:wait; opacity:.76; }
                .friend-bookshelf-book-icon { position:absolute; top:8px; left:50%; transform:translateX(-50%); font-size:.78rem; line-height:1; }
                .friend-bookshelf-book-title { position:absolute; top:25px; right:5px; bottom:28px; left:5px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
                .friend-bookshelf-book-title > span { display:block; height:100%; max-width:100%; overflow:hidden; writing-mode:vertical-rl; text-orientation:upright; color:#FFFDF5; white-space:normal; word-break:break-all; font-size:.69rem; font-weight:900; line-height:1.18; letter-spacing:.02em; text-align:center; text-shadow:0 1px 1px rgba(0,0,0,.35); }
                .friend-bookshelf-book-reactions { position:absolute; right:4px; bottom:8px; left:4px; overflow:hidden; color:rgba(255,255,255,.86); font-size:.54rem; font-weight:850; text-align:center; white-space:nowrap; }
                .friend-bookshelf-book-ridge { position:absolute; right:5px; bottom:3px; left:5px; height:2px; border-top:1px solid rgba(255,255,255,.55); border-bottom:1px solid rgba(0,0,0,.25); }
                .friend-bookshelf-book-opening { position:absolute; inset:0; display:grid; place-items:center; background:rgba(35,25,20,.7); color:#FFFFFF; font-size:.64rem; font-weight:950; writing-mode:horizontal-tb; }
                .friend-bookshelf-board { position:relative; height:21px; border-top:4px solid #6B3E22; border-bottom:3px solid #4B2B1A; background:linear-gradient(180deg,#A66A3E,#704126); box-shadow:0 5px 8px rgba(61,34,18,.38); }
                .friend-bookshelf-board > span { position:absolute; inset:4px 0 auto; height:2px; background:rgba(255,220,170,.16); }
                .friend-bookshelf-scene > p { margin:0; padding:8px 12px 10px; background:rgba(80,44,22,.88); color:#F8E4C8; font-size:.6rem; font-weight:800; text-align:center; }
                .friend-writing-title-list { display:grid; gap:7px; max-height:310px; overflow-y:auto; }
                .friend-writing-title-list > button { display:grid; grid-template-columns:28px minmax(0,1fr) auto; align-items:center; gap:8px; width:100%; padding:10px 11px; border:1px solid rgba(112,65,38,.15); border-radius:13px; background:rgba(255,255,255,.72); cursor:pointer; text-align:left; }
                .friend-writing-title-list > button:disabled { cursor:wait; opacity:.7; }
                .friend-writing-title-list > button > span:first-child { font-size:1.05rem; text-align:center; }
                .friend-writing-title-list > button > span:nth-child(2) { min-width:0; }
                .friend-writing-title-list strong { display:block; color:#3E2E23; font-size:.78rem; line-height:1.4; overflow-wrap:anywhere; }
                .friend-writing-title-list small { display:block; margin-top:2px; color:#8D7B6C; font-size:.61rem; font-weight:800; }
                .friend-writing-title-list em { color:#8A5B27; font-size:.61rem; font-style:normal; font-weight:900; white-space:nowrap; }
                @media (max-width:620px) {
                    .friend-writing-shelf { padding:17px 14px; }
                    .friend-writing-shelf-heading { gap:8px; }
                    .friend-writing-shelf-heading p { max-width:250px; }
                    .friend-writing-shelf-toolbar { align-items:flex-end; flex-direction:column; }
                    .friend-writing-shelf-filters { width:100%; }
                    .friend-bookshelf-books { min-height:186px; padding-right:12px; padding-left:12px; }
                }
            `}</style>
        </section>
    );
};

export default memo(FriendWritingShelf);
