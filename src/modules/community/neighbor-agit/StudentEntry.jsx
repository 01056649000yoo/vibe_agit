import { useCallback, useEffect, useState } from 'react';
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

const NeighborAgitStudentEntry = ({ spaceId, onBack, onNavigate }) => {
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
    const [sharePanelOpen, setSharePanelOpen] = useState(false);
    const [shareCandidates, setShareCandidates] = useState(null);
    const [shareLoading, setShareLoading] = useState(false);
    const [shareBusy, setShareBusy] = useState('');
    const [shareMessage, setShareMessage] = useState('');
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

    const requestActivityShare = async (activity) => {
        if (shareBusy) return;
        setShareBusy(activity.id);
        setActivityMessage('');
        try {
            const result = await neighborAgitApi.requestActivityPost({ spaceId, activityId: activity.id });
            setFeed((current) => current ? {
                ...current,
                activities: current.activities.map((item) => item.id === activity.id
                    ? { ...item, shared_post_id: result.shared_post_id, share_status: result.status }
                    : item)
            } : current);
            setSelectedActivity((current) => current?.id === activity.id
                ? { ...current, shared_post_id: result.shared_post_id, share_status: result.status }
                : current);
            setActivityMessage(activity.type === 'exchange'
                ? '선생님께 글짝 활동 글 확인을 요청했어요.'
                : '선생님께 함께 쓴 글 공개 확인을 요청했어요.');
        } catch {
            setActivityMessage('공개를 요청하지 못했어요. 제출 상태를 확인해 주세요.');
        } finally {
            setShareBusy('');
        }
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

    const toggleSave = async () => {
        if (!detail || detail.is_mine || interactionBusy) return;
        setInteractionBusy('save');
        setInteractionError('');
        try {
            const result = await neighborAgitApi.toggleSave({
                spaceId, sharedPostId: detail.shared_post_id
            });
            setDetail((current) => ({ ...current, my_saved: result.saved }));
            updateFeedItem(detail.shared_post_id, { my_saved: result.saved });
        } catch {
            setInteractionError('간직하기를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
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
        try {
            const result = await neighborAgitApi.saveComment({
                spaceId, sharedPostId: detail.shared_post_id, content, action: 'save'
            });
            setDetail((current) => {
                const withoutMine = (current.comments || []).filter((comment) => !comment.is_mine);
                return {
                    ...current,
                    comment_count: result.comment_count,
                    comments: [...withoutMine, result.comment].sort((left, right) => (
                        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
                    ))
                };
            });
            setCommentDraft(result.comment.content);
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

    const openSharePanel = async () => {
        const nextOpen = !sharePanelOpen;
        setSharePanelOpen(nextOpen);
        setShareMessage('');
        if (!nextOpen || shareCandidates || shareLoading) return;
        setShareLoading(true);
        try {
            setShareCandidates(await neighborAgitApi.getShareCandidates({ spaceId }));
        } catch {
            setShareMessage('내 글 목록을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setShareLoading(false);
        }
    };

    const requestShare = async (post) => {
        if (shareBusy) return;
        setShareBusy(post.post_id);
        setShareMessage('');
        try {
            const result = await neighborAgitApi.requestShare({ spaceId, postId: post.post_id });
            setShareCandidates((current) => current.map((item) => item.post_id === post.post_id ? {
                ...item,
                shared_post_id: result.shared_post_id,
                share_status: result.status,
                review_note: ''
            } : item));
            setShareMessage('선생님께 이웃 공개 확인을 요청했어요.');
        } catch {
            setShareMessage('공개를 요청하지 못했어요. 현재 글 상태를 확인해 주세요.');
        } finally {
            setShareBusy('');
        }
    };

    const recallShare = async (post) => {
        if (!post.shared_post_id || shareBusy) return;
        setShareBusy(post.post_id);
        setShareMessage('');
        try {
            await neighborAgitApi.recallShare({ spaceId, sharedPostId: post.shared_post_id });
            setShareCandidates((current) => current.map((item) => item.post_id === post.post_id ? {
                ...item, share_status: 'recalled'
            } : item));
            setShareMessage('이웃 공개 요청을 회수했어요.');
        } catch {
            setShareMessage('공개 요청을 회수하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setShareBusy('');
        }
    };

    return (
        <main className="neighbor-student-page">
            <header className="neighbor-student-page__header">
                <StudentBackButton onClick={onBack} />
                <div>
                    <span className="neighbor-student-page__eyebrow">여러 학급이 함께 읽는 공간</span>
                    <h1>🤝 {feed?.space?.name || '이웃 아지트'}</h1>
                    <p>선생님이 확인한 글만 보여요. 서로의 학급 이름과 등록 이름으로 책임 있게 만나요.</p>
                </div>
                {feed?.space?.active_class_count > 0 && (
                    <span className="neighbor-student-page__class-count">
                        {feed.space.active_class_count}개 학급 참여
                    </span>
                )}
            </header>

            <nav className="neighbor-student-activities" aria-label="이웃 아지트 활동">
                {NEIGHBOR_ACTIVITY_TABS.map(({ id, icon, label }) => (
                    <button type="button" key={id} className={activeSection === id ? 'is-active' : ''} aria-pressed={activeSection === id} onClick={() => selectSection(id)}>
                        <span aria-hidden="true">{icon}</span><strong>{label}</strong>
                    </button>
                ))}
            </nav>

            {activeSection === 'gallery' && <section className="neighbor-share-panel">
                <div>
                    <span>{getNeighborActivityLabel('gallery')}</span>
                    <h2>내 아지트 글을 이웃에게 소개해요</h2>
                    <p>이미 제출한 글 중 하나를 골라 선생님께 공개 확인을 요청할 수 있어요.</p>
                </div>
                <Button type="button" variant="outline" loading={shareLoading} onClick={openSharePanel}>
                    {sharePanelOpen ? '내 글 목록 닫기' : '공개할 내 글 고르기'}
                </Button>
                {sharePanelOpen && (
                    <div className="neighbor-share-panel__list">
                        {shareMessage && <p className="neighbor-share-panel__message" role="status">{shareMessage}</p>}
                        {shareLoading ? <p>내 글을 불러오고 있어요…</p> : (shareCandidates || []).length === 0 ? (
                            <p>공개를 요청할 수 있는 제출 글이 아직 없어요.</p>
                        ) : (shareCandidates || []).map((post) => (
                            <article key={post.post_id}>
                                <div>
                                    <strong>{post.title || '제목 없는 글'}</strong>
                                    <small>{post.share_status === 'pending' ? '선생님 확인 중'
                                        : post.share_status === 'published' ? '이웃에게 공개 중'
                                            : post.share_status === 'returned' ? `다시 확인 필요${post.review_note ? ` · ${post.review_note}` : ''}`
                                                : '공개 요청 전'}</small>
                                </div>
                                {['pending', 'published'].includes(post.share_status) ? (
                                    <Button type="button" variant="outline" loading={shareBusy === post.post_id} disabled={Boolean(shareBusy)} onClick={() => recallShare(post)}>공개 회수</Button>
                                ) : (
                                    <Button type="button" loading={shareBusy === post.post_id} disabled={Boolean(shareBusy)} onClick={() => requestShare(post)}>공개 요청</Button>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </section>}

            {activeSection !== 'gallery' && !loading && (
                <section className="neighbor-activity-space">
                    <header>
                        <span>{getNeighborActivityLabel(activeSection)}</span>
                        <h2>{activeSection === 'topic' ? '같은 생각거리로 쓰고 함께 읽어요' : '정해진 글짝과 글로 인사해요'}</h2>
                    </header>
                    {(feed?.activities || []).filter((activity) => activity.type === activeSection).length === 0 ? (
                        <div className="neighbor-student-state">
                            <span aria-hidden="true">🌱</span>
                            <h2>지금 진행 중인 활동이 없어요</h2>
                            <p>호스트 선생님이 활동을 열면 이곳에 나타나요.</p>
                        </div>
                    ) : (
                        <div className="neighbor-activity-list">
                            {(feed?.activities || []).filter((activity) => activity.type === activeSection).map((activity) => (
                                <article key={activity.id} className={selectedActivity?.id === activity.id ? 'is-selected' : ''}>
                                    <div>
                                        <span>{activity.status === 'closed' ? '활동 종료' : activity.status === 'matched' ? '글짝 연결 완료' : '진행 중'}</span>
                                        <h3>{activity.title}</h3>
                                        <p>{activity.prompt}</p>
                                        {activity.type === 'exchange' && activity.partner_names?.length > 0 && <strong>내 글짝: {activity.partner_names.join(', ')}</strong>}
                                        {activity.type === 'exchange' && <small>{activity.exchange_share_scope === 'space' ? '글짝 교환 뒤 두 학급 전체와 글을 나눠요.' : '나와 연결된 글짝끼리만 글과 댓글을 나눠요.'}</small>}
                                        {activity.share_status === 'pending' && <small>담임 선생님이 공개 확인 중이에요.</small>}
                                        {activity.share_status === 'returned' && <small>다시 확인해 주세요{activity.review_note ? ` · ${activity.review_note}` : ''}</small>}
                                    </div>
                                    <div className="neighbor-activity-list__actions">
                                        {activity.status !== 'closed' && !activity.is_submitted && <Button type="button" onClick={() => startActivityWriting(activity)}>이 주제로 글쓰기</Button>}
                                        {activity.is_submitted && !['pending', 'published'].includes(activity.share_status) && <Button type="button" loading={shareBusy === activity.id} disabled={Boolean(shareBusy)} onClick={() => requestActivityShare(activity)}>{activity.type === 'exchange' ? '글짝에게 보내기' : '나눔 요청'}</Button>}
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
                    {selectedActivity && <div className="neighbor-activity-feed-heading"><span>{selectedActivity.type === 'topic' ? '같이 쓴 글' : selectedActivity.exchange_share_scope === 'space' ? '두 학급이 함께 보는 글' : '내 글짝의 글'}</span><h2>{selectedActivity.title}</h2></div>}
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
                                disabled={Boolean(interactionBusy) && interactionBusy !== 'reaction'}
                                onClick={toggleReaction}
                            >
                                💛 공감 {Number(detail.reaction_count) || 0}
                            </Button>
                            {!detail.is_mine && (
                                <Button
                                    type="button"
                                    variant={detail.my_saved ? 'primary' : 'outline'}
                                    loading={interactionBusy === 'save'}
                                    disabled={Boolean(interactionBusy) && interactionBusy !== 'save'}
                                    onClick={toggleSave}
                                >
                                    {detail.my_saved ? '🔖 간직했어요' : '🔖 간직하기'}
                                </Button>
                            )}
                        </div>

                        <section className="neighbor-comments" aria-labelledby="neighbor-comments-title">
                            <div className="neighbor-comments__heading">
                                <h3 id="neighbor-comments-title">한 줄 댓글</h3>
                                <span>{Number(detail.comment_count) || 0}개</span>
                            </div>
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
