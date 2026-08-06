import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { getSelfWritingType } from '../../modules/writing/selfWritingTypes';
import MyPostEngagementPanel from '../../modules/writing/engagement/MyPostEngagementPanel';

const formatDate = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
};

const MyShelfPostDetail = ({ summary, post, loading, errorMessage, onClose, onRetry }) => {
    const [showOriginal, setShowOriginal] = useState(false);

    const selfType = getSelfWritingType(post);
    const readingLog = selfType?.id === 'reading_log';
    const book = post?.structured_content || {};
    const canCompare = Boolean(post?.original_content) && (
        post.original_title !== post.title || post.original_content !== post.content
    );
    const title = showOriginal ? (post?.original_title || post?.title) : post?.title;
    const content = showOriginal ? post?.original_content : post?.content;
    const typeName = selfType ? selfType.label : '선생님 과제';

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 230 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${summary?.title || '내 글'} 상세`}
            style={{
                position: 'fixed', inset: 0, zIndex: 3200, overflowY: 'auto',
                background: 'linear-gradient(180deg,#F8FBFF 0%,#FFFDF7 100%)'
            }}
        >
            <div style={{ width: 'min(760px, 100%)', margin: '0 auto', padding: '18px 18px 90px', boxSizing: 'border-box' }}>
                <header style={{
                    position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: '12px', margin: '-18px -18px 18px',
                    padding: '18px', background: 'rgba(248,251,255,.94)', backdropFilter: 'blur(10px)',
                    borderBottom: '1px solid rgba(62,46,35,.08)'
                }}>
                    <button type="button" onClick={onClose} style={{
                        border: 'none', borderRadius: '12px', padding: '9px 12px', background: '#FFFFFF',
                        color: '#546E7A', cursor: 'pointer', fontWeight: 900, boxShadow: '0 2px 8px rgba(0,0,0,.06)'
                    }}>← 내 서재</button>
                    <strong style={{ color: '#3E2E23', fontSize: '.95rem' }}>📖 내 글 보기</strong>
                    <span style={{ width: '76px' }} aria-hidden="true" />
                </header>

                {loading ? (
                    <div style={{ padding: '90px 20px', textAlign: 'center', color: '#8D7B6C', fontWeight: 900 }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📚</div>
                        내 글을 펼치는 중...
                    </div>
                ) : errorMessage || !post ? (
                    <div style={{ padding: '70px 24px', borderRadius: '24px', background: 'white', textAlign: 'center', border: '1px solid #FFCDD2' }}>
                        <div style={{ fontSize: '2.5rem' }}>😢</div>
                        <p style={{ color: '#C62828', fontWeight: 900 }}>{errorMessage || '글을 찾지 못했어요.'}</p>
                        <button type="button" onClick={onRetry} style={{ border: 0, borderRadius: '12px', padding: '10px 15px', background: '#E3F2FD', color: '#1565C0', cursor: 'pointer', fontWeight: 900 }}>다시 불러오기</button>
                    </div>
                ) : (
                    <article style={{ padding: '26px', borderRadius: '28px', background: 'white', border: '1px solid #E3E8EF', boxShadow: '0 12px 34px rgba(55,71,79,.08)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '14px' }}>
                            <span style={{ padding: '5px 9px', borderRadius: '9px', background: selfType ? '#F1F8E9' : '#E3F2FD', color: selfType ? '#558B2F' : '#1565C0', fontSize: '.72rem', fontWeight: 950 }}>
                                {selfType ? selfType.icon : '✍️'} {typeName}
                            </span>
                            <span style={{ padding: '5px 9px', borderRadius: '9px', background: post.visibility === 'class' ? '#F3E5F5' : '#F5F5F5', color: post.visibility === 'class' ? '#7B1FA2' : '#78909C', fontSize: '.72rem', fontWeight: 900 }}>
                                {post.visibility === 'class' ? '👥 친구 공개' : '🔒 친구에게 비공개'}
                            </span>
                            {post.mission?.is_archived && (
                                <span style={{ padding: '5px 9px', borderRadius: '9px', background: '#ECEFF1', color: '#607D8B', fontSize: '.72rem', fontWeight: 900 }}>📂 보관된 과제</span>
                            )}
                        </div>

                        <h1 style={{ margin: 0, color: '#263238', fontSize: 'clamp(1.45rem, 4vw, 2rem)', lineHeight: 1.35, wordBreak: 'break-word' }}>
                            {title || '제목 없는 글'}
                        </h1>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: '10px', color: '#90A4AE', fontSize: '.78rem', fontWeight: 800 }}>
                            <span>{formatDate(post.updated_at || post.created_at)}</span>
                            <span>{Number(post.char_count || 0).toLocaleString('ko-KR')}자</span>
                            {post.mission?.title && <span>과제 · {post.mission.title}</span>}
                        </div>

                        {readingLog && (
                            <section style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '24px', padding: '16px', borderRadius: '18px', background: '#F7FBEF', border: '1px solid #DCEDC8' }}>
                                {book.thumbnailUrl ? (
                                    <img src={book.thumbnailUrl} alt={`${book.bookTitle || '책'} 표지`} loading="lazy" referrerPolicy="no-referrer" style={{ width: '58px', height: '84px', objectFit: 'cover', borderRadius: '7px 11px 11px 7px', boxShadow: '0 5px 12px rgba(55,71,79,.15)', flexShrink: 0 }} />
                                ) : (
                                    <div style={{ width: '58px', height: '84px', display: 'grid', placeItems: 'center', borderRadius: '7px 11px 11px 7px', background: '#7CB342', color: 'white', fontSize: '1.6rem', flexShrink: 0 }}>📖</div>
                                )}
                                <div style={{ minWidth: 0 }}>
                                    <small style={{ color: '#689F38', fontWeight: 950 }}>읽은 책</small>
                                    <strong style={{ display: 'block', margin: '5px 0', color: '#263238' }}>{book.bookTitle || '책 제목 없음'}</strong>
                                    <span style={{ color: '#78909C', fontSize: '.8rem' }}>{[book.bookAuthor, book.publisher].filter(Boolean).join(' · ') || '책 정보 없음'}</span>
                                </div>
                            </section>
                        )}

                        {canCompare && (
                            <button type="button" onClick={() => setShowOriginal((value) => !value)} style={{
                                marginTop: '22px', border: '1px solid #FFE0B2', borderRadius: '12px', padding: '9px 13px',
                                background: showOriginal ? '#E3F2FD' : '#FFF8E1', color: showOriginal ? '#1565C0' : '#E65100', cursor: 'pointer', fontWeight: 900
                            }}>
                                {showOriginal ? '✨ 마지막글 보기' : '📜 처음글과 비교하기'}
                            </button>
                        )}

                        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #ECEFF1', color: showOriginal ? '#78909C' : '#37474F', fontSize: '1rem', lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {content || '아직 내용이 없어요.'}
                        </div>

                        {/* 확인 상태·선생님 의견·친구 댓글은 세 글쓰기가 같은 공용 부품을 쓴다. */}
                        <MyPostEngagementPanel postId={post.id} />
                    </article>
                )}
            </div>
        </motion.div>
    );
};

export default MyShelfPostDetail;
