import React, { useEffect } from 'react';
import WritingChangeHighlight from '../../modules/writing/review/WritingChangeHighlight';
import WritingVersionSwitch, { WRITING_VIEW, useWritingVersion } from '../../modules/writing/review/WritingVersionSwitch';
import ModalCloseButton from '../common/ModalCloseButton';
import ModalPortal from '../common/ModalPortal';
import { getSelfWritingType } from '../../modules/writing/selfWritingTypes';
import ReportDocument from '../../modules/writing/mission-types/report/ReportDocument';
import { isReportStructuredContent } from '../../modules/writing/mission-types/report/reportContent';
import { normalizeBookCoverUrl } from '../../modules/writing/reading-log/bookCoverUrl';
import './TeacherStudentAgitPostDetail.css';

const formatDate = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
};

const TeacherStudentAgitPostDetail = ({
    studentName,
    summary,
    post,
    loading,
    errorMessage,
    onClose,
    onRetry
}) => {
    const version = useWritingVersion({
        postId: post?.id, before: post?.original_content, after: post?.content,
        beforeTitle: post?.original_title, afterTitle: post?.title, approved: Boolean(post?.is_confirmed),
        teacherText: post?.teacher_revision_content
    });
    const showOriginal = version.view === WRITING_VIEW.ORIGINAL;
    const showChanges = version.view === WRITING_VIEW.CHANGES;
    const source = post || summary;
    const selfType = getSelfWritingType(source);
    const readingLog = selfType?.id === 'reading_log';
    const book = post?.structured_content || {};
    const bookCoverUrl = normalizeBookCoverUrl(book.thumbnailUrl);
    const title = showOriginal ? (post?.original_title || post?.title) : post?.title;
    const content = showOriginal ? post?.original_content : post?.content;
    const displayingReport = version.view === WRITING_VIEW.FINAL && isReportStructuredContent(post?.structured_content);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [onClose]);

    return (
        <ModalPortal>
            <div
                className="teacher-agit-post-detail__backdrop"
                onClick={(event) => {
                    if (event.target === event.currentTarget) onClose();
                }}
            >
                <section
                    className="teacher-agit-post-detail"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${studentName || '학생'}의 글 읽기`}
                >
                    <header className="teacher-agit-post-detail__header">
                        <div>
                            <span>교사 읽기 전용</span>
                            <strong>{studentName || '학생'}의 책장</strong>
                        </div>
                        <ModalCloseButton onClick={onClose} label="학생 글 닫기" />
                    </header>

                    <div className="teacher-agit-post-detail__scroll">
                        {loading ? (
                            <div className="teacher-agit-post-detail__state" role="status">
                                <span aria-hidden="true">📖</span>
                                글을 펼치는 중입니다…
                            </div>
                        ) : errorMessage || !post ? (
                            <div className="teacher-agit-post-detail__state is-error">
                                <span aria-hidden="true">😢</span>
                                <strong>{errorMessage || '글을 찾지 못했습니다.'}</strong>
                                <button type="button" onClick={onRetry}>다시 불러오기</button>
                            </div>
                        ) : (
                            <article className="teacher-agit-post-detail__article">
                                <div className="teacher-agit-post-detail__tags">
                                    <span className={selfType ? 'is-self' : 'is-assignment'}>
                                        {selfType ? selfType.icon : '✍️'} {selfType?.label || '선생님 과제'}
                                    </span>
                                    <span className="is-visibility">
                                        {post.visibility === 'class' ? '👥 친구 공개' : '🔒 친구에게 비공개'}
                                    </span>
                                    <span className="is-readonly">보기만 가능</span>
                                </div>

                                <h2>{title || '제목 없는 글'}</h2>
                                <div className="teacher-agit-post-detail__meta">
                                    <span>{formatDate(post.updated_at || post.created_at)}</span>
                                    <span>{Number(post.char_count || 0).toLocaleString('ko-KR')}자</span>
                                    {showOriginal && <span>처음글</span>}
                                </div>

                                {readingLog && (
                                    <section className="teacher-agit-post-detail__book" aria-label="독서록 책 정보">
                                        {bookCoverUrl ? (
                                            <img
                                                src={bookCoverUrl}
                                                alt={`${book.bookTitle || '책'} 표지`}
                                                loading="lazy"
                                                decoding="async"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <span aria-hidden="true">📖</span>
                                        )}
                                        <div>
                                            <small>읽은 책</small>
                                            <strong>{book.bookTitle || '책 제목 없음'}</strong>
                                            <p>{[book.bookAuthor, book.publisher].filter(Boolean).join(' · ') || '책 정보 없음'}</p>
                                        </div>
                                    </section>
                                )}

                                <WritingVersionSwitch {...version} onChange={version.setView} />

                                <div className={`teacher-agit-post-detail__content${displayingReport ? ' is-report' : ''}`}>
                                    {displayingReport ? (
                                        <ReportDocument structuredContent={post.structured_content} content={post.content} />
                                    ) : showChanges ? (
                                        <WritingChangeHighlight before={post.original_content} after={post.content} teacherText={post.teacher_revision_content} showLegend={false} />
                                    ) : content || '내용이 없습니다.'}
                                </div>
                            </article>
                        )}
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

export default TeacherStudentAgitPostDetail;
