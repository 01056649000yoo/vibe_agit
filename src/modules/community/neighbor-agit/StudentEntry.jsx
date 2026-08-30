import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import StudentBackButton from '../../../components/student/StudentBackButton';
import { neighborAgitApi } from './api';
import { NEIGHBOR_AGIT_LIMITS } from './policy';
import './StudentEntry.css';

const formatPublishedAt = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('ko-KR', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
};

const NeighborAgitStudentEntry = ({ spaceId, onBack }) => {
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

    const loadMore = async () => {
        if (!feed?.has_more || loadingMore) return;
        setLoadingMore(true);
        try {
            const next = await neighborAgitApi.getFeed({
                spaceId,
                limit: NEIGHBOR_AGIT_LIMITS.initialFeedRows,
                cursor: { at: feed.next_cursor_at, id: feed.next_cursor_id }
            });
            setFeed((current) => ({
                ...next,
                items: [...(current?.items || []), ...next.items]
            }));
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

    return (
        <main className="neighbor-student-page">
            <header className="neighbor-student-page__header">
                <StudentBackButton onClick={onBack} />
                <div>
                    <span className="neighbor-student-page__eyebrow">여러 학급이 함께 읽는 공간</span>
                    <h1>🤝 {feed?.space?.name || '이웃 아지트'}</h1>
                    <p>선생님이 확인한 글만 보여요. 글쓴이는 안전한 이웃 작가 이름으로 만나요.</p>
                </div>
                {feed?.space?.active_class_count > 0 && (
                    <span className="neighbor-student-page__class-count">
                        {feed.space.active_class_count}개 학급 참여
                    </span>
                )}
            </header>

            {loading ? (
                <section className="neighbor-student-state" aria-live="polite">이웃 글을 불러오고 있어요…</section>
            ) : errorMessage && !feed ? (
                <section className="neighbor-student-state neighbor-student-state--error">
                    <p>{errorMessage}</p>
                    <Button type="button" variant="outline" onClick={loadFirstPage}>다시 불러오기</Button>
                </section>
            ) : feed?.items?.length ? (
                <>
                    <section className="neighbor-student-feed" aria-label="이웃 글 목록">
                        {feed.items.map((item) => (
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
                    {feed.has_more && (
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
                    <h2>아직 공개된 이웃 글이 없어요</h2>
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
