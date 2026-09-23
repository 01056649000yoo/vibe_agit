import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import StudentBackButton from '../../../components/student/StudentBackButton';
import { getNeighborActivityLabel, NEIGHBOR_ACTIVITY_TABS } from './activityTypes';
import { neighborAgitApi } from './api';
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

const NeighborAgitStudentEntry = ({ spaceId, params, onBack, onNavigate }) => {
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
    // 댓글이 검사를 기다리는 중인지. 아이가 “댓글이 사라졌다”고 여기지 않도록 알려 준다.
    const [commentPending, setCommentPending] = useState(false);
    const [activeSection, setActiveSection] = useState('gallery');
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [activityFeed, setActivityFeed] = useState(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityMessage, setActivityMessage] = useState('');

    const loadFirstPage = useCallback(async () => {
        if (!spaceId) return;
        setLoading(true);
        setErrorMessage('');
        try {
            const data = await neighborAgitApi.getFeed({
                spaceId,
                limit: NEIGHBOR_AGIT_LIMITS.initialFeedRows
            });
            setFeed(data);
        } catch {
            setErrorMessage('이웃 글을 불러오지 못했어요. 학급 공개 상태를 확인해 주세요.');
        } finally {
            setLoading(false);
        }
    }, [spaceId]);

    useEffect(() => {
        void loadFirstPage();
    }, [loadFirstPage]);

    const visibleFeed = activeSection === 'gallery' ? feed : activityFeed;
    // 함께 쓰는 주제의 댓글·반응 마감이 지났으면 새 댓글·공감을 막고 보기만 하게 한다.
    const activityCommentsLocked = activeSection !== 'gallery'
        && Boolean(activityFeed?.activity?.comments_close_at)
        && new Date(activityFeed.activity.comments_close_at) <= new Date();

    const loadMore = async () => {
        if (!visibleFeed?.has_more || loadingMore) return;
        setLoadingMore(true);
        try {
            const request = activeSection === 'gallery'
                ? neighborAgitApi.getFeed
                : neighborAgitApi.getActivityFeed;
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

    const openDetail = async (sharedPostId) => {
        setDetail(null);
        setDetailError('');
        setInteractionError('');
        setCommentDraft('');
        setDetailLoading(true);
        try {
            const nextDetail = await neighborAgitApi.getDetail({ spaceId, sharedPostId });
            setDetail(nextDetail);
            setCommentDraft(nextDetail.comments?.find((comment) => comment.is_mine)?.content || '');
        } catch {
            setDetailError('현재 공개 중인 글을 찾지 못했어요. 선생님이 잠시 숨겼을 수 있어요.');
        } finally {
            setDetailLoading(false);
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
        setDetail(null);
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

    const selectSection = (section) => {
        setActiveSection(section);
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
            setActivityFeed(await neighborAgitApi.getActivityFeed({
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
            const result = await neighborAgitApi.toggleReaction({
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
        setCommentPending(false);
        try {
            const result = await neighborAgitApi.saveComment({
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
            setCommentPending(Boolean(result.pending_review));
            updateFeedItem(detail.shared_post_id, { comment_count: result.comment_count });
        } catch {
            setInteractionError('댓글을 저장하지 못했어요. 숨김 상태이거나 공개가 끝났을 수 있어요.');
        } finally {
            setInteractionBusy('');
        }
    };

    const deleteComment = async () => {
        if (!detail || interactionBusy) return;
        setInteractionBusy('comment-delete');
        setInteractionError('');
        try {
            const result = await neighborAgitApi.saveComment({
                spaceId, sharedPostId: detail.shared_post_id, action: 'delete'
            });
            setDetail((current) => ({
                ...current,
                comment_count: result.comment_count,
                comments: (current.comments || []).filter((comment) => !comment.is_mine)
            }));
            setCommentDraft('');
            updateFeedItem(detail.shared_post_id, { comment_count: result.comment_count });
        } catch {
            setInteractionError('댓글을 삭제하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setInteractionBusy('');
        }
    };

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

            <nav className="neighbor-student-activities" aria-label="모두의 아지트 활동">
                {NEIGHBOR_ACTIVITY_TABS.map(({ id, icon, label }) => (
                    <button type="button" key={id} className={activeSection === id ? 'is-active' : ''} aria-pressed={activeSection === id} onClick={() => selectSection(id)}>
                        <span aria-hidden="true">{icon}</span><strong>{label}</strong>
                    </button>
                ))}
            </nav>

            {activeSection === 'gallery' && <section className="neighbor-share-panel">
                <div>
                    <span>{getNeighborActivityLabel('gallery')}</span>
                    <h2>이웃 반 친구들의 글을 읽어요</h2>
                    <p>내 글은 담임 선생님이 골라 이웃 반에 소개해 줘요. 여기서는 공개된 글을 읽고 댓글·공감을 남길 수 있어요.</p>
                </div>
            </section>}

            {activeSection !== 'gallery' && !loading && (
                <section className="neighbor-activity-space">
                    <header>
                        <span>{getNeighborActivityLabel(activeSection)}</span>
                        <h2>같은 생각거리로 쓰고 함께 읽어요</h2>
                    </header>
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

            {loading ? (
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
                                    {detail.comments?.some((comment) => comment.is_mine)
                                        ? '내 댓글 고치기' : '따뜻한 한 줄 남기기'}
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
                                        {detail.comments?.some((comment) => comment.is_mine) ? '고치기' : '남기기'}
                                    </Button>
                                </div>
                                <span>{commentDraft.length}/300 · 한 글에 댓글 하나만 남길 수 있어요.</span>
                            </form>
                            )}

                            {commentPending && !interactionError && (
                                <p className="neighbor-student-inline-notice" role="status">
                                    🕐 댓글을 확인하는 중이에요. 확인이 끝나면 이웃 학급에 보여요.
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
