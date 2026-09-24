import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import StudentBackButton from '../../../components/student/StudentBackButton';
import { getNeighborActivityLabel, getNeighborSpace, NEIGHBOR_ACTIVITY_TABS } from './activityTypes';
import { neighborBooksApi } from './books/booksApi';
import './spaces.css';
import { neighborAgitApi } from './api';
import StudentBooksPanel from './books/StudentBooksPanel';
import StudentGalleryPanel from './gallery/StudentGalleryPanel';
import { NEIGHBOR_AGIT_LIMITS } from './policy';
import './StudentEntry.css';

const formatPublishedAt = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('ko-KR', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
};

const formatDeadline = (value) => new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(value));

// 글쓰기 마감이 지났으면 서버가 몇 분 안에 활동을 닫는다. 그 사이에도 글쓰기 단추가 보이지 않게 시각으로도 본다.
const isWritingClosed = (activity) => activity.status === 'closed'
    || Boolean(activity.writing_close_at && new Date(activity.writing_close_at) <= new Date());

const NeighborAgitStudentEntry = ({ spaceId, params, onBack, onNavigate, api = neighborAgitApi, booksApi = neighborBooksApi }) => {
    const [feed, setFeed] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [interactionBusy, setInteractionBusy] = useState('');
    const [interactionError, setInteractionError] = useState('');
    const [commentDraft, setCommentDraft] = useState('');
    // 열린 글에서 내 댓글이 아직/더는 보이지 않는 까닭: 'pending'(검사 중)·'blocked'(선생님 확인 중)·'hidden'(선생님이 숨김).
    // 글마다 서버가 알려 주는 값(my_comment)이라 다른 글을 열면 따라오지 않는다(점검표 D2, 2026-09-24).
    const [myCommentStatus, setMyCommentStatus] = useState(null);
    // 저장 뒤 딱 한 번만 결과를 다시 본다. 학생 화면은 폴링하지 않는다(PERFORMANCE_HARNESS).
    const commentRecheckTimer = useRef(null);
    const openDetailId = useRef(null);
    // `결과 확인` 을 연달아 눌러도 요청은 하나씩, 3초에 한 번만 보낸다.
    const [rechecking, setRechecking] = useState(false);
    const lastRecheckAt = useRef(0);
    // 처음에는 세 공간의 입구(로비)를 보여 준다(null). 알림을 눌러 들어오면 그 공간에서 바로 시작한다
    // — 방문록 알림은 문집 도서관, 이웃 댓글 알림은 이웃 글 마당.
    const [activeSection, setActiveSection] = useState(
        params?.section === 'books' ? 'books' : params?.sharedPostId ? 'gallery' : null
    );
    const [bookCount, setBookCount] = useState(null);
    // 이웃 글 마당 안: null = 반 고르기, 'latest' = 🆕 새 글 모아보기(최신순 피드), 그 밖 = 고른 반 열쇠.
    const [galleryView, setGalleryView] = useState(null);
    // 상세 창을 닫으면 올린다 — 반별 목록이 댓글·공감 수를 다시 맞춘다.
    const [detailRefresh, setDetailRefresh] = useState(0);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [activityFeed, setActivityFeed] = useState(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityMessage, setActivityMessage] = useState('');

    const loadFirstPage = useCallback(async () => {
        if (!spaceId) return;
        setLoading(true);
        setErrorMessage('');
        try {
            const data = await api.getFeed({
                spaceId,
                limit: NEIGHBOR_AGIT_LIMITS.initialFeedRows
            });
            setFeed(data);
        } catch {
            setErrorMessage('이웃 글을 불러오지 못했어요. 학급 공개 상태를 확인해 주세요.');
        } finally {
            setLoading(false);
        }
    }, [api, spaceId]);

    useEffect(() => {
        void loadFirstPage();
    }, [loadFirstPage]);

    // 로비에서만 문집 수를 가볍게 한 번 읽는다(문집 도서관 칸은 들어갈 때 자기 목록을 읽는다).
    useEffect(() => {
        if (activeSection !== null || !spaceId || bookCount !== null) return;
        booksApi.getSpaceBooks(spaceId).then((books) => setBookCount(books.length)).catch(() => setBookCount(-1));
    }, [activeSection, spaceId, bookCount, booksApi]);

    const topicActivities = (feed?.activities || []).filter((activity) => activity.type === 'topic');
    const openTopics = topicActivities.filter((activity) => activity.status !== 'closed'
        && !(activity.writing_close_at && new Date(activity.writing_close_at) <= new Date()));
    const lobbyStat = (spaceKey) => {
        if (spaceKey === 'books') return bookCount === null ? '불러오는 중…' : bookCount < 0 ? '문집 보러 가기' : `문집 ${bookCount}권`;
        if (loading) return '불러오는 중…';
        if (spaceKey === 'topic') {
            return openTopics.some((activity) => !activity.is_submitted)
                ? `✏️ 쓸 주제가 있어요 (${openTopics.length})`
                : `진행 중인 주제 ${openTopics.length}`;
        }
        return `공개된 글 ${feed?.items?.length || 0}편${feed?.has_more ? '+' : ''}`;
    };

    const visibleFeed = activeSection === 'gallery' ? feed : activityFeed;
    // 같이 쓰기 광장의 댓글·반응 마감이 지났으면 새 댓글·공감을 막고 보기만 하게 한다.
    const activityCommentsLocked = activeSection !== 'gallery'
        && Boolean(activityFeed?.activity?.comments_close_at)
        && new Date(activityFeed.activity.comments_close_at) <= new Date();

    const loadMore = async () => {
        if (!visibleFeed?.has_more || loadingMore) return;
        setLoadingMore(true);
        try {
            const request = activeSection === 'gallery'
                ? api.getFeed
                : api.getActivityFeed;
            const next = await request({
                spaceId, activityId: selectedActivity?.id,
                limit: NEIGHBOR_AGIT_LIMITS.initialFeedRows,
                cursor: { at: visibleFeed.next_cursor_at, id: visibleFeed.next_cursor_id }
            });
            const apply = (current) => ({
                ...next,
                items: [...(current?.items || []), ...next.items]
            });
            if (activeSection === 'gallery') setFeed(apply);
            else setActivityFeed(apply);
        } catch {
            setErrorMessage('다음 글을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setLoadingMore(false);
        }
    };

    const clearCommentRecheck = () => {
        if (commentRecheckTimer.current) window.clearTimeout(commentRecheckTimer.current);
        commentRecheckTimer.current = null;
    };
    useEffect(() => clearCommentRecheck, []);

    const applyDetail = (nextDetail) => {
        setDetail(nextDetail);
        setMyCommentStatus(nextDetail.my_comment?.status || null);
    };

    const openDetail = async (sharedPostId) => {
        clearCommentRecheck();
        openDetailId.current = sharedPostId;
        setDetail(null);
        setMyCommentStatus(null);
        setDetailError('');
        setInteractionError('');
        setCommentDraft('');
        setDetailLoading(true);
        try {
            const nextDetail = await api.getDetail({ spaceId, sharedPostId });
            if (openDetailId.current !== sharedPostId) return;
            applyDetail(nextDetail);
            setCommentDraft(nextDetail.comments?.find((comment) => comment.is_mine)?.content
                || nextDetail.my_comment?.content || '');
        } catch {
            if (openDetailId.current === sharedPostId) {
                setDetailError('현재 공개 중인 글을 찾지 못했어요. 선생님이 잠시 숨겼을 수 있어요.');
            }
        } finally {
            if (openDetailId.current === sharedPostId) setDetailLoading(false);
        }
    };

    // "내 글 소식" 의 이웃 댓글 알림을 눌러 들어오면 그 글을 바로 연다(한 번만).
    const openedFromNotice = useRef(null);
    const noticePostId = params?.sharedPostId || null;
    useEffect(() => {
        if (!noticePostId || !spaceId || openedFromNotice.current === noticePostId) return;
        openedFromNotice.current = noticePostId;
        void openDetail(noticePostId);
        // openDetail 은 렌더마다 새로 만들어지지만 위 ref 가 두 번 열지 않게 막는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noticePostId, spaceId]);

    const closeDetail = () => {
        clearCommentRecheck();
        openDetailId.current = null;
        setDetailRefresh((value) => value + 1);
        setDetail(null);
        setMyCommentStatus(null);
        setDetailError('');
        setDetailLoading(false);
        setInteractionBusy('');
        setInteractionError('');
        setCommentDraft('');
    };

    const updateFeedItem = (sharedPostId, patch) => {
        setFeed((current) => current ? {
            ...current,
            items: current.items.map((item) => (
                item.shared_post_id === sharedPostId ? { ...item, ...patch } : item
            ))
        } : current);
        setActivityFeed((current) => current ? {
            ...current,
            items: current.items.map((item) => (
                item.shared_post_id === sharedPostId ? { ...item, ...patch } : item
            ))
        } : current);
    };

    // 검사 결과만 다시 읽는다(입력 중인 글은 건드리지 않는다). 그새 다른 글을 열었으면 버린다.
    const recheckMyComment = async (sharedPostId) => {
        clearCommentRecheck();
        if (rechecking || Date.now() - lastRecheckAt.current < 3000) return;
        lastRecheckAt.current = Date.now();
        setRechecking(true);
        try {
            const nextDetail = await api.getDetail({ spaceId, sharedPostId });
            if (openDetailId.current !== sharedPostId) return;
            applyDetail(nextDetail);
            updateFeedItem(sharedPostId, { comment_count: nextDetail.comment_count });
        } catch {
            // 결과 확인은 덤이다 — 실패해도 저장은 끝났으니 조용히 둔다.
        } finally {
            setRechecking(false);
        }
    };

    const selectSection = (section) => {
        setActiveSection(section);
        setGalleryView(null);
        if (section === null) setBookCount(null); // 로비로 돌아오면 문집 수를 다시 센다
        setSelectedActivity(null);
        setActivityFeed(null);
        setActivityMessage('');
        setErrorMessage('');
    };

    const openActivity = async (activity) => {
        setSelectedActivity(activity);
        setActivityFeed(null);
        setActivityMessage('');
        setActivityLoading(true);
        try {
            setActivityFeed(await api.getActivityFeed({
                spaceId, activityId: activity.id, limit: NEIGHBOR_AGIT_LIMITS.initialFeedRows
            }));
        } catch {
            setActivityMessage('활동 글을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setActivityLoading(false);
        }
    };

    const startActivityWriting = (activity) => {
        if (!activity?.mission_id || typeof onNavigate !== 'function') return;
        onNavigate('writing', {
            missionId: activity.mission_id,
            returnTo: 'neighbor_agit',
            neighborActivityId: activity.id
        });
    };

    const toggleReaction = async () => {
        if (!detail || interactionBusy) return;
        setInteractionBusy('reaction');
        setInteractionError('');
        try {
            const result = await api.toggleReaction({
                spaceId, sharedPostId: detail.shared_post_id
            });
            const patch = { my_reaction: result.active, reaction_count: result.reaction_count };
            setDetail((current) => ({ ...current, ...patch }));
            updateFeedItem(detail.shared_post_id, patch);
        } catch {
            setInteractionError('공감을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setInteractionBusy('');
        }
    };


    const saveComment = async (event) => {
        event.preventDefault();
        if (!detail || interactionBusy) return;
        const content = commentDraft.trim();
        if (!content) {
            setInteractionError('댓글을 한 줄로 입력해 주세요.');
            return;
        }
        setInteractionBusy('comment');
        setInteractionError('');
        clearCommentRecheck();
        try {
            const result = await api.saveComment({
                spaceId, sharedPostId: detail.shared_post_id, content, action: 'save'
            });
            // 검사를 기다리는 동안에는 목록에 넣지 않는다. 아직 아무에게도 보이지 않는 상태다.
            setDetail((current) => {
                const withoutMine = (current.comments || []).filter((comment) => !comment.is_mine);
                return {
                    ...current,
                    comment_count: result.comment_count,
                    comments: result.comment
                        ? [...withoutMine, result.comment].sort((left, right) => (
                            new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
                        ))
                        : withoutMine
                };
            });
            setCommentDraft(result.comment ? result.comment.content : content);
            setMyCommentStatus(result.pending_review ? 'pending' : null);
            updateFeedItem(detail.shared_post_id, { comment_count: result.comment_count });
            if (result.pending_review) {
                // 검사는 보통 몇 초 안에 끝난다. 창이 열려 있으면 한 번만 결과를 맞춘다.
                const sharedPostId = detail.shared_post_id;
                commentRecheckTimer.current = window.setTimeout(() => { void recheckMyComment(sharedPostId); }, 8000);
            }
        } catch (error) {
            // PT429: 10분에 20번 넘게 쓰거나 고쳤다(20261340). 서버 문구를 그대로 보인다.
            setInteractionError(error?.code === 'PT429' && error?.message
                ? error.message
                : '댓글을 저장하지 못했어요. 숨김 상태이거나 공개가 끝났을 수 있어요.');
        } finally {
            setInteractionBusy('');
        }
    };

    const deleteComment = async () => {
        if (!detail || interactionBusy) return;
        setInteractionBusy('comment-delete');
        setInteractionError('');
        try {
            const result = await api.saveComment({
                spaceId, sharedPostId: detail.shared_post_id, action: 'delete'
            });
            setDetail((current) => ({
                ...current,
                comment_count: result.comment_count,
                comments: (current.comments || []).filter((comment) => !comment.is_mine)
            }));
            setCommentDraft('');
            setMyCommentStatus(null);
            clearCommentRecheck();
            updateFeedItem(detail.shared_post_id, { comment_count: result.comment_count });
        } catch {
            setInteractionError('댓글을 삭제하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setInteractionBusy('');
        }
    };

    // 보이는 내 댓글이 있거나, 검사·확인 중인 내 댓글이 있으면 "고치기"다(한 글에 댓글 하나).
    const hasMyComment = Boolean(detail?.comments?.some((comment) => comment.is_mine) || myCommentStatus);

    return (
        <main className="neighbor-student-page">
            <header className="neighbor-student-page__header">
                <StudentBackButton onClick={onBack} />
                <div>
                    <span className="neighbor-student-page__eyebrow">여러 학급이 함께 읽는 공간</span>
                    <h1>🤝 {feed?.space?.name || '모두의 아지트'}</h1>
                    <p>선생님이 확인한 글만 보여요. 서로의 학급 이름과 등록 이름으로 책임 있게 만나요.</p>
                </div>
                {feed?.space?.active_class_count > 0 && (
                    <span className="neighbor-student-page__class-count">
                        {feed.space.active_class_count}개 학급 참여
                    </span>
                )}
            </header>

            {activeSection === null ? (
                /* 로비: 세 공간의 입구. 방에 들어간다는 느낌이 아이들에게 가장 쉽다. 숫자는 이미 받은 피드에서 센다. */
                <nav className="neighbor-student-lobby" aria-label="모두의 아지트 공간 고르기">
                    {NEIGHBOR_ACTIVITY_TABS.map(({ id, icon, label, studentSummary }) => (
                        <button type="button" key={id} data-space={id} className="neighbor-student-lobby__door" onClick={() => selectSection(id)}>
                            <span className="neighbor-student-lobby__mark" aria-hidden="true">{icon}</span>
                            <strong>{label}</strong>
                            <small>{studentSummary}</small>
                            <span className="neighbor-student-lobby__stat">{lobbyStat(id)}</span>
                            <span className="neighbor-student-lobby__enter">들어가기 →</span>
                        </button>
                    ))}
                </nav>
            ) : (
                /* 방 머리띠: 지금 어느 공간인지 색으로 말하고, 로비나 다른 방으로 바로 간다. */
                <section className="neighbor-student-room" data-space={activeSection}>
                    <button type="button" className="neighbor-student-room__lobby" onClick={() => selectSection(null)}>← 로비로</button>
                    <div className="neighbor-student-room__title">
                        <span aria-hidden="true">{getNeighborSpace(activeSection)?.icon}</span>
                        <h2>{getNeighborActivityLabel(activeSection)}</h2>
                    </div>
                    <p>{activeSection === 'gallery'
                        ? '내 글은 담임 선생님이 골라 이웃 반에 소개해 줘요. 공개된 글을 읽고 댓글·공감을 남겨요.'
                        : getNeighborSpace(activeSection)?.studentSummary}</p>
                    <nav className="neighbor-student-room__switch" aria-label="다른 공간으로">
                        {NEIGHBOR_ACTIVITY_TABS.filter(({ id }) => id !== activeSection).map(({ id, icon, label }) => (
                            <button type="button" key={id} data-space={id} onClick={() => selectSection(id)}>
                                <span aria-hidden="true">{icon}</span> {label}
                            </button>
                        ))}
                    </nav>
                </section>
            )}

            {activeSection === 'topic' && !loading && (
                <section className="neighbor-activity-space">
                    {(feed?.activities || []).filter((activity) => activity.type === activeSection).length === 0 ? (
                        <div className="neighbor-student-state">
                            <span aria-hidden="true">🌱</span>
                            <h2>지금 진행 중인 활동이 없어요</h2>
                            <p>선생님들이 함께 주제를 정하면 이곳에 나타나요.</p>
                        </div>
                    ) : (
                        <div className="neighbor-activity-list">
                            {(feed?.activities || []).filter((activity) => activity.type === activeSection).map((activity) => (
                                <article key={activity.id} className={selectedActivity?.id === activity.id ? 'is-selected' : ''}>
                                    <div>
                                        <span>{isWritingClosed(activity) ? '글쓰기 끝' : '글 쓰는 중'}</span>
                                        <h3>{activity.title}</h3>
                                        <p>{activity.prompt}</p>
                                        {(activity.writing_close_at || activity.comments_close_at) && (
                                            <ul className="neighbor-activity-list__deadlines">
                                                {activity.writing_close_at && !isWritingClosed(activity) && <li>✏️ {formatDeadline(activity.writing_close_at)}까지 써요</li>}
                                                {activity.comments_close_at && (new Date(activity.comments_close_at) > new Date()
                                                    ? <li>💬 {formatDeadline(activity.comments_close_at)}까지 댓글·공감을 남겨요</li>
                                                    : <li>🔒 댓글·공감은 마감됐어요. 읽을 수는 있어요</li>)}
                                            </ul>
                                        )}
                                        {activity.is_submitted && <small>글을 냈어요. 선생님이 확인하고 이웃 반에 소개해 줄 거예요.</small>}
                                    </div>
                                    <div className="neighbor-activity-list__actions">
                                        {!isWritingClosed(activity) && !activity.is_submitted && <Button type="button" onClick={() => startActivityWriting(activity)}>이 주제로 글쓰기</Button>}
                                        {(activity.published_count > 0 || activity.share_status === 'published') && <Button type="button" variant="outline" loading={activityLoading && selectedActivity?.id === activity.id} onClick={() => openActivity(activity)}>활동 글 보기</Button>}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    {activityMessage && <p className="neighbor-student-inline-error" role="status">{activityMessage}</p>}
                </section>
            )}

            {activeSection === 'gallery' && galleryView === 'latest' && (
                <div className="neighbor-gallery__head" data-space="gallery">
                    <button type="button" className="neighbor-gallery__back" onClick={() => setGalleryView(null)}>← 반 고르기</button>
                    <h2>🆕 새 글 모아보기 <small>모든 반의 최근 글</small></h2>
                </div>
            )}

            {activeSection === null ? null : activeSection === 'books' ? (
                <StudentBooksPanel spaceId={spaceId} api={booksApi} initialSharedBookId={params?.section === 'books' ? params?.sharedBookId : null} />
            ) : activeSection === 'gallery' && galleryView !== 'latest' ? (
                <StudentGalleryPanel spaceId={spaceId} api={api} view={galleryView} onSelect={setGalleryView}
                    onOpenPost={openDetail} refreshToken={detailRefresh} />
            ) : loading ? (
                <section className="neighbor-student-state" aria-live="polite">이웃 글을 불러오고 있어요…</section>
            ) : errorMessage && !feed ? (
                <section className="neighbor-student-state neighbor-student-state--error">
                    <p>{errorMessage}</p>
                    <Button type="button" variant="outline" onClick={loadFirstPage}>다시 불러오기</Button>
                </section>
            ) : activeSection !== 'gallery' && !selectedActivity ? null
            : activityLoading ? (
                <section className="neighbor-student-state" aria-live="polite">활동 글을 불러오고 있어요…</section>
            ) : visibleFeed?.items?.length ? (
                <>
                    {selectedActivity && <div className="neighbor-activity-feed-heading"><span>같이 쓴 글</span><h2>{selectedActivity.title}</h2></div>}
                    <section className="neighbor-student-feed" aria-label={selectedActivity ? `${selectedActivity.title} 글 목록` : '이웃 글 목록'}>
                        {visibleFeed.items.map((item) => (
                            <button
                                type="button"
                                className="neighbor-post-card"
                                key={item.shared_post_id}
                                onClick={() => openDetail(item.shared_post_id)}
                            >
                                <span className="neighbor-post-card__meta">
                                    <strong>{item.author_name}</strong>
                                    <span>{item.class_name}</span>
                                    {item.is_mine && <em>내 글</em>}
                                </span>
                                <h2>{item.title}</h2>
                                <p>{item.excerpt || '글을 눌러 내용을 읽어 보세요.'}</p>
                                <span className="neighbor-post-card__footer">
                                    <time dateTime={item.published_at}>{formatPublishedAt(item.published_at)}</time>
                                    <span>💛 {Number(item.reaction_count) || 0} · 💬 {Number(item.comment_count) || 0}</span>
                                </span>
                            </button>
                        ))}
                    </section>
                    {errorMessage && <p className="neighbor-student-inline-error" role="status">{errorMessage}</p>}
                    {visibleFeed.has_more && (
                        <div className="neighbor-student-page__more">
                            <Button type="button" variant="outline" loading={loadingMore} onClick={loadMore}>
                                글 더 보기
                            </Button>
                        </div>
                    )}
                </>
            ) : (
                <section className="neighbor-student-state">
                    <span aria-hidden="true">✍️</span>
                    <h2>{selectedActivity ? '아직 공개된 활동 글이 없어요' : '아직 공개된 이웃 글이 없어요'}</h2>
                    <p>각 학급 선생님이 글을 확인하면 이곳에서 함께 읽을 수 있어요.</p>
                </section>
            )}

            <Modal
                isOpen={detailLoading || Boolean(detail) || Boolean(detailError)}
                onClose={closeDetail}
                title={detail?.title || '이웃 글 읽기'}
                maxWidth="760px"
            >
                {detailLoading ? (
                    <div className="neighbor-detail-state">글을 불러오고 있어요…</div>
                ) : detailError ? (
                    <div className="neighbor-detail-state neighbor-detail-state--error">{detailError}</div>
                ) : detail ? (
                    <article className="neighbor-post-detail">
                        <div className="neighbor-post-detail__meta">
                            <strong>{detail.author_name}</strong>
                            <span>{detail.class_name}</span>
                            {detail.is_mine && <em>내 글</em>}
                            <time dateTime={detail.published_at}>{formatPublishedAt(detail.published_at)}</time>
                        </div>
                        <div className="neighbor-post-detail__content">{detail.content}</div>
                        <div className="neighbor-post-detail__actions" aria-label="이웃 글 반응">
                            <Button
                                type="button"
                                variant={detail.my_reaction ? 'primary' : 'outline'}
                                loading={interactionBusy === 'reaction'}
                                disabled={(Boolean(interactionBusy) && interactionBusy !== 'reaction') || (activityCommentsLocked && !detail.my_reaction)}
                                onClick={toggleReaction}
                            >
                                💛 공감 {Number(detail.reaction_count) || 0}
                            </Button>
                        </div>

                        <section className="neighbor-comments" aria-labelledby="neighbor-comments-title">
                            <div className="neighbor-comments__heading">
                                <h3 id="neighbor-comments-title">한 줄 댓글</h3>
                                <span>{Number(detail.comment_count) || 0}개</span>
                            </div>
                            {activityCommentsLocked ? (
                                <p className="neighbor-student-inline-notice" role="status">
                                    🔒 이 주제는 댓글·반응이 마감됐어요. 이제 친구들의 글을 읽을 수만 있어요.
                                </p>
                            ) : (
                            <form className="neighbor-comment-form" onSubmit={saveComment}>
                                <label htmlFor="neighbor-comment-input">
                                    {hasMyComment ? '내 댓글 고치기' : '따뜻한 한 줄 남기기'}
                                </label>
                                <div>
                                    <input
                                        id="neighbor-comment-input"
                                        value={commentDraft}
                                maxLength={300}
                                        disabled={Boolean(interactionBusy)}
                                        onChange={(event) => setCommentDraft(event.target.value.replace(/[\r\n]/g, ' '))}
                                        placeholder="글에서 좋았던 점을 한 줄로 적어 보세요"
                                    />
                                    <Button type="submit" loading={interactionBusy === 'comment'} disabled={Boolean(interactionBusy)}>
                                        {hasMyComment ? '고치기' : '남기기'}
                                    </Button>
                                </div>
                                <span>{commentDraft.length}/300 · 한 글에 댓글 하나만 남길 수 있어요.</span>
                            </form>
                            )}

                            {myCommentStatus === 'pending' && !interactionError && (
                                <p className="neighbor-student-inline-notice" role="status">
                                    🕐 댓글을 확인하는 중이에요. 확인이 끝나면 이웃 학급에 보여요.
                                    <button type="button" className="neighbor-student-inline-notice__action"
                                        disabled={Boolean(interactionBusy) || rechecking}
                                        onClick={() => { void recheckMyComment(detail.shared_post_id); }}>
                                        결과 확인
                                    </button>
                                </p>
                            )}
                            {myCommentStatus === 'blocked' && !interactionError && (
                                <p className="neighbor-student-inline-notice" role="status">
                                    🙋 이 댓글은 선생님이 한 번 더 확인하고 있어요. 고쳐 쓰면 처음부터 다시 확인해요.
                                </p>
                            )}
                            {myCommentStatus === 'hidden' && !interactionError && (
                                <p className="neighbor-student-inline-notice" role="status">
                                    선생님이 이 댓글을 숨겼어요. 궁금한 점은 선생님께 여쭤 보세요.
                                </p>
                            )}
                            {interactionError && <p className="neighbor-student-inline-error" role="status">{interactionError}</p>}

                            <div className="neighbor-comment-list">
                                {(detail.comments || []).map((comment) => (
                                    <article key={comment.comment_id} className="neighbor-comment-item">
                                        <div>
                                            <strong>{comment.author_name}</strong>
                                            <span>{comment.class_name}</span>
                                            {comment.is_mine && <em>내 댓글</em>}
                                        </div>
                                        <p>{comment.content}</p>
                                        {comment.is_mine && (
                                            <button
                                                type="button"
                                                disabled={Boolean(interactionBusy)}
                                                onClick={deleteComment}
                                            >
                                                내 댓글 삭제
                                            </button>
                                        )}
                                    </article>
                                ))}
                                {!detail.comments?.length && <p className="neighbor-comments__empty">첫 번째 따뜻한 댓글을 남겨 보세요.</p>}
                            </div>
                            {detail.comments_truncated && (
                                <p className="neighbor-comments__limit">최근 공개 댓글 100개까지만 보여요.</p>
                            )}
                        </section>
                    </article>
                ) : null}
            </Modal>
        </main>
    );
};

export default NeighborAgitStudentEntry;
