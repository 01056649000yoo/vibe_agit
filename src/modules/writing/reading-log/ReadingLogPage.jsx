import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Card from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import WritingEditorFields from '../../../components/writing/WritingEditorFields';
import { supabase } from '../../../lib/supabaseClient';
import WritingToolHost from '../tools/WritingToolHost';
import BookSearchPanel from './BookSearchPanel';
import BookCover from './BookCover';

const EMPTY_FORM = {
    title: '',
    selectedBook: null,
    content: '',
    // 기본은 친구 공개 — 독서록을 서로 보며 읽을거리를 찾게 한다.
    // 남기고 싶지 않은 글은 저장 화면에서 비공개로 바꿀 수 있다.
    visibility: 'class',
    readingStatus: 'completed'
};

const formatDate = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date(value));
};

const bookFromStructuredContent = (content = {}) => ({
    source: content.source === 'kakao' ? 'kakao' : 'manual',
    title: content.bookTitle || '',
    authors: Array.isArray(content.bookAuthors)
        ? content.bookAuthors
        : (content.bookAuthor ? [content.bookAuthor] : []),
    translators: Array.isArray(content.translators) ? content.translators : [],
    publisher: content.publisher || '',
    publishedDate: content.publishedDate || '',
    thumbnailUrl: content.thumbnailUrl || '',
    sourceUrl: content.sourceUrl || '',
    isbn10: content.isbn10 || '',
    isbn13: content.isbn13 || ''
});

const ReadingLogEditor = ({ studentSession, postId, initialBook, onDone, onCancel }) => {
    const createInitialForm = () => ({
        ...EMPTY_FORM,
        selectedBook: initialBook || null,
        readingStatus: initialBook?.readingStatus || 'completed'
    });
    const [form, setForm] = useState(createInitialForm);
    const [initialForm, setInitialForm] = useState(createInitialForm);
    const [loading, setLoading] = useState(Boolean(postId));
    const [saving, setSaving] = useState(false);
    const isMobile = window.innerWidth <= 768;
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

    useEffect(() => {
        if (!postId) return;

        let active = true;
        const loadPost = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, title, content, structured_content, visibility')
                .eq('id', postId)
                .eq('student_id', studentSession.id)
                .eq('writing_context', 'self')
                .eq('self_writing_type', 'reading_log')
                .maybeSingle();

            if (!active) return;
            if (error || !data) {
                alert('독서록을 불러오지 못했습니다.');
                onCancel();
                return;
            }

            const loadedBook = bookFromStructuredContent(data.structured_content || {});
            const loadedForm = {
                title: data.title || '',
                selectedBook: loadedBook.title ? loadedBook : null,
                content: data.content || '',
                // 이미 저장된 글은 학생이 고른 값을 그대로 유지한다
                visibility: data.visibility === 'private' ? 'private' : 'class',
                readingStatus: data.structured_content?.readingStatus === 'reading' ? 'reading' : 'completed'
            };
            setForm(loadedForm);
            setInitialForm(loadedForm);
            setLoading(false);
        };

        loadPost();
        return () => {
            active = false;
        };
    }, [onCancel, postId, studentSession.id]);

    useEffect(() => {
        const warnBeforeLeaving = (event) => {
            if (!isDirty || saving) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnBeforeLeaving);
        return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
    }, [isDirty, saving]);

    const updateForm = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const handleBookSelect = (book) => {
        setForm((current) => ({
            ...current,
            selectedBook: book,
            title: book && !current.title.trim() ? `『${book.title}』을 읽고` : current.title
        }));
    };

    const handleCancel = () => {
        if (isDirty && !window.confirm('아직 저장하지 않은 내용이 있어요. 독서록 목록으로 나갈까요?')) return;
        onCancel();
    };

    const handleSave = async () => {
        if (!form.selectedBook?.title?.trim()) {
            alert('먼저 읽은 책을 찾아 선택하거나 직접 입력해 주세요. 📖');
            return;
        }
        if (!form.title.trim()) {
            alert('독서록 제목을 적어주세요. ✍️');
            return;
        }
        if (!form.content.trim()) {
            alert('책을 읽고 떠오른 생각을 적어주세요. 💭');
            return;
        }

        setSaving(true);
        const result = await supabase.rpc('upsert_my_reading_log', {
            p_post_id: postId || null,
            p_book: form.selectedBook,
            p_title: form.title.trim(),
            p_content: form.content,
            p_visibility: form.visibility,
            p_reading_status: form.readingStatus
        });

        setSaving(false);
        if (result.error) {
            console.error('독서록 저장 실패:', result.error.message);
            alert('독서록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        setInitialForm(form);
        alert(form.visibility === 'class'
            ? '독서록을 친구 공개로 저장했어요! 📚'
            : '친구에게 비공개로 저장했어요. 선생님은 확인할 수 있어요. 🔒');
        onDone();
    };

    if (loading) {
        return <Card><p style={{ textAlign: 'center', padding: '40px' }}>독서록을 펼치는 중... 📖</p></Card>;
    }

    return (
        <Card style={{
            maxWidth: '900px',
            margin: '20px auto 50px',
            padding: isMobile ? '22px 18px' : '36px',
            border: 'none',
            boxShadow: '0 15px 40px rgba(0,0,0,0.08)'
        }}>
            <div className="reading-log-editor-header">
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>⬅️ 나가기</Button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#2E7D32', fontWeight: 900, fontSize: '0.82rem' }}>📚 나의 독서록</div>
                    <h2 style={{ margin: '6px 0 0', color: '#263238' }}>{postId ? '독서록 다듬기' : '새 독서록 쓰기'}</h2>
                </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
                <BookSearchPanel
                    selectedBook={form.selectedBook}
                    onSelectBook={handleBookSelect}
                    disabled={saving}
                />
            </div>

            {form.selectedBook && <>
            <div className="reading-status-picker">
                <span>이 책은 지금</span>
                <button type="button" className={form.readingStatus === 'reading' ? 'active' : ''} onClick={() => updateForm('readingStatus', 'reading')} disabled={saving}>📖 읽는 중</button>
                <button type="button" className={form.readingStatus === 'completed' ? 'active' : ''} onClick={() => updateForm('readingStatus', 'completed')} disabled={saving}>✅ 다 읽음</button>
            </div>

            <section style={{
                padding: isMobile ? '28px 20px' : '44px 54px',
                borderRadius: '28px',
                border: '2px solid #F1F3F5',
                boxShadow: '0 18px 45px rgba(0,0,0,0.04)'
            }}>
                <WritingToolHost disabled={saving} />
                <WritingEditorFields
                    title={form.title}
                    onTitleChange={(value) => updateForm('title', value)}
                    content={form.content}
                    onContentChange={(value) => updateForm('content', value)}
                    titlePlaceholder="독서록 제목을 적어주세요..."
                    contentPlaceholder={'책에서 기억에 남는 장면, 새롭게 알게 된 점, 내 생각을 자유롭게 적어보세요...'}
                    disabled={saving}
                    isMobile={isMobile}
                />
            </section>

            <label className={`reading-log-visibility ${form.visibility === 'class' ? 'is-public' : ''}`}>
                <input
                    type="checkbox"
                    checked={form.visibility === 'class'}
                    onChange={(event) => updateForm('visibility', event.target.checked ? 'class' : 'private')}
                    disabled={saving}
                />
                <span style={{ fontSize: '1.6rem' }}>{form.visibility === 'class' ? '📚' : '🔒'}</span>
                <span>
                    <strong>{form.visibility === 'class' ? '친구 공개로 저장' : '친구에게 비공개'}</strong>
                    <small>{form.visibility === 'class' ? '친구들이 내 아지트의 글 책장에서 보고 반응과 댓글을 남길 수 있어요.' : '친구에게는 보이지 않지만 선생님은 확인할 수 있어요. 원할 때 공개할 수 있어요.'}</small>
                </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
                <Button variant="ghost" onClick={handleCancel} disabled={saving}>취소</Button>
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? '저장하는 중...' : '독서록 저장하기 💾'}
                </Button>
            </div>
            </>}

            <style>{`
                .reading-log-editor-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; }
                .reading-status-picker { display:flex; align-items:center; gap:8px; margin-bottom:18px; padding:12px 14px; border-radius:14px; background:#F8F9FA; }
                .reading-status-picker > span { margin-right:auto; color:#607D8B; font-size:.9rem; font-weight:800; }
                .reading-status-picker button { padding:8px 12px; border:1px solid #CFD8DC; border-radius:10px; background:white; color:#607D8B; cursor:pointer; font-weight:800; }
                .reading-status-picker button.active { border-color:#7CB342; background:#F1F8E9; color:#33691E; }
                .reading-log-visibility { display:flex; align-items:center; gap:14px; margin-top:24px; padding:18px 20px; border:2px solid #E0E0E0; border-radius:18px; cursor:pointer; background:#FAFAFA; }
                .reading-log-visibility.is-public { border-color:#81C784; background:#F1F8E9; }
                .reading-log-visibility input { width:20px; height:20px; accent-color:#43A047; }
                .reading-log-visibility span:last-child { display:flex; flex-direction:column; gap:4px; color:#37474F; }
                .reading-log-visibility small { color:#78909C; font-weight:500; }
                @media (max-width: 640px) {
                    .reading-log-editor-header h2 { font-size:1.25rem; }
                    .reading-status-picker { flex-wrap:wrap; }
                    .reading-status-picker > span { width:100%; }
                }
            `}</style>
        </Card>
    );
};

const ReadingLogPage = ({ studentSession, params = {}, onBack, onNavigate }) => {
    const [logs, setLogs] = useState([]);
    const [libraryItems, setLibraryItems] = useState([]);
    const [logLinks, setLogLinks] = useState([]);
    const [teacherReviews, setTeacherReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [expandedBookId, setExpandedBookId] = useState(null);
    const isEditing = params.mode === 'editor';

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const [logsResult, libraryResult, linksResult, reviewsResult] = await Promise.all([
            supabase
                .from('student_posts')
                .select('id, title, content, structured_content, visibility, published_at, created_at, updated_at')
                .eq('student_id', studentSession.id)
                .eq('writing_context', 'self')
                .eq('self_writing_type', 'reading_log')
                .order('updated_at', { ascending: false }),
            supabase
                .from('student_library_items')
                .select('id, reading_status, started_on, finished_on, created_at, updated_at, book:book_catalog!student_library_items_book_id_fkey(id, source, isbn10, isbn13, title, authors, translators, publisher, published_date, thumbnail_url, source_url)')
                .eq('student_id', studentSession.id)
                .order('updated_at', { ascending: false }),
            supabase
                .from('reading_log_entries')
                .select('post_id, library_item_id')
                .eq('student_id', studentSession.id),
            supabase
                .from('reading_log_teacher_reviews')
                .select('post_id, review_status, teacher_comment, reviewed_at')
                .eq('student_id', studentSession.id)
        ]);

        if (logsResult.error || libraryResult.error || linksResult.error) {
            console.error('독서 책장 로드 실패:', logsResult.error?.message || libraryResult.error?.message || linksResult.error?.message);
            setLogs([]);
            setLibraryItems([]);
            setLogLinks([]);
            setTeacherReviews([]);
        } else {
            setLogs(logsResult.data || []);
            setLibraryItems(libraryResult.data || []);
            setLogLinks(linksResult.data || []);
            if (reviewsResult.error) {
                console.error('독서록 선생님 확인 로드 실패:', reviewsResult.error.message);
                setTeacherReviews([]);
            } else {
                setTeacherReviews(reviewsResult.data || []);
            }
        }
        setLoading(false);
    }, [studentSession.id]);

    useEffect(() => {
        if (isEditing) return undefined;
        const timerId = window.setTimeout(fetchLogs, 0);
        return () => window.clearTimeout(timerId);
    }, [fetchLogs, isEditing]);

    const openList = useCallback(() => {
        onNavigate('reading_logs');
    }, [onNavigate]);

    const handleDelete = async (log) => {
        if (!window.confirm(`「${log.title || '제목 없는 독서록'}」을 삭제할까요? 삭제하면 되돌릴 수 없어요.`)) return;
        const { error } = await supabase
            .from('student_posts')
            .delete()
            .eq('id', log.id)
            .eq('student_id', studentSession.id)
            .eq('writing_context', 'self');
        if (error) {
            alert('독서록을 삭제하지 못했습니다.');
            return;
        }
        setLogs((current) => current.filter((item) => item.id !== log.id));
    };

    const shelfBooks = useMemo(() => {
        const postToLibrary = new Map(logLinks.map((link) => [link.post_id, link.library_item_id]));
        const shelves = new Map();

        libraryItems.forEach((item) => {
            const rawBook = Array.isArray(item.book) ? item.book[0] : item.book;
            if (!rawBook) return;
            shelves.set(item.id, {
                id: item.id,
                readingStatus: item.reading_status,
                startedOn: item.started_on,
                finishedOn: item.finished_on,
                updatedAt: item.updated_at,
                book: {
                    source: rawBook.source,
                    title: rawBook.title,
                    authors: rawBook.authors || [],
                    translators: rawBook.translators || [],
                    publisher: rawBook.publisher || '',
                    publishedDate: rawBook.published_date || '',
                    thumbnailUrl: rawBook.thumbnail_url || '',
                    sourceUrl: rawBook.source_url || '',
                    isbn10: rawBook.isbn10 || '',
                    isbn13: rawBook.isbn13 || ''
                },
                logs: []
            });
        });

        logs.forEach((log) => {
            const libraryItemId = log.structured_content?.libraryItemId || postToLibrary.get(log.id);
            if (libraryItemId && shelves.has(libraryItemId)) {
                shelves.get(libraryItemId).logs.push(log);
                return;
            }

            const fallbackBook = bookFromStructuredContent(log.structured_content || {});
            const fallbackId = `legacy-${fallbackBook.title}-${fallbackBook.authors.join(',')}`;
            if (!shelves.has(fallbackId)) {
                shelves.set(fallbackId, {
                    id: fallbackId,
                    readingStatus: log.structured_content?.readingStatus === 'reading' ? 'reading' : 'completed',
                    updatedAt: log.updated_at,
                    book: fallbackBook,
                    logs: []
                });
            }
            shelves.get(fallbackId).logs.push(log);
        });

        return [...shelves.values()]
            .map((shelf) => ({
                ...shelf,
                logs: [...shelf.logs].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            }))
            .sort((a, b) => new Date(b.updatedAt || b.logs[0]?.updated_at || 0) - new Date(a.updatedAt || a.logs[0]?.updated_at || 0));
    }, [libraryItems, logLinks, logs]);

    const filteredShelves = useMemo(() => (
        statusFilter === 'all'
            ? shelfBooks
            : shelfBooks.filter((shelf) => shelf.readingStatus === statusFilter)
    ), [shelfBooks, statusFilter]);

    const counts = useMemo(() => ({
        books: shelfBooks.length,
        logs: logs.length,
        public: logs.filter((log) => log.visibility === 'class').length,
        reading: shelfBooks.filter((shelf) => shelf.readingStatus === 'reading').length,
        completed: shelfBooks.filter((shelf) => shelf.readingStatus === 'completed').length,
        reviewed: teacherReviews.length
    }), [logs, shelfBooks, teacherReviews.length]);

    const teacherReviewByPost = useMemo(() => (
        new Map(teacherReviews.map((review) => [review.post_id, review]))
    ), [teacherReviews]);

    if (isEditing) {
        return (
            <ReadingLogEditor
                studentSession={studentSession}
                postId={params.postId}
                initialBook={params.book}
                onDone={openList}
                onCancel={openList}
            />
        );
    }

    return (
        <div className="reading-log-page">
            <div className="reading-log-list-header">
                <div>
                    <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 홈으로</Button>
                    <h1>📚 나의 책장</h1>
                    <p>읽고 있는 책과 다 읽은 책, 내가 쓴 독서록을 한곳에서 관리해요.</p>
                </div>
                <Button onClick={() => onNavigate('reading_logs', { mode: 'editor' })}>새 책·독서록 추가 ✍️</Button>
            </div>

            <div className="reading-log-summary">
                <span><strong>{counts.books}</strong>권의 책</span>
                <span><strong>{counts.logs}</strong>개의 독서록</span>
                <span><strong>{counts.public}</strong>개를 친구 공개로 설정</span>
                {counts.reviewed > 0 && <span><strong>{counts.reviewed}</strong>개를 선생님이 확인</span>}
            </div>

            <div className="reading-shelf-tabs" role="tablist" aria-label="책장 독서 상태 필터">
                {[
                    { id: 'all', label: '전체', count: counts.books },
                    { id: 'reading', label: '📖 읽는 중', count: counts.reading },
                    { id: 'completed', label: '✅ 다 읽음', count: counts.completed }
                ].map((tab) => (
                    <button key={tab.id} type="button" className={statusFilter === tab.id ? 'active' : ''} onClick={() => setStatusFilter(tab.id)}>
                        {tab.label} <small>{tab.count}</small>
                    </button>
                ))}
            </div>

            {loading ? (
                <Card><p style={{ textAlign: 'center', padding: '42px' }}>내 책장을 정리하는 중... 📖</p></Card>
            ) : shelfBooks.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '64px 24px', border: '2px dashed #C5E1A5' }}>
                    <div style={{ fontSize: '4rem' }}>📗</div>
                    <h2 style={{ color: '#33691E' }}>내 책장의 첫 책을 골라보세요</h2>
                    <p style={{ color: '#78909C', marginBottom: '24px' }}>책을 검색하거나 직접 입력한 뒤 독서록을 남길 수 있어요.</p>
                    <Button onClick={() => onNavigate('reading_logs', { mode: 'editor' })}>첫 책 추가하기</Button>
                </Card>
            ) : filteredShelves.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: '3rem' }}>📭</div>
                    <p style={{ color: '#78909C' }}>이 상태의 책은 아직 없어요.</p>
                </Card>
            ) : (
                <div className="reading-shelf-grid">
                    {filteredShelves.map((shelf, index) => {
                        const isExpanded = expandedBookId === shelf.id;
                        const publicCount = shelf.logs.filter((log) => log.visibility === 'class').length;
                        return (
                        <motion.article
                            key={shelf.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.04, 0.24) }}
                            className="reading-shelf-card"
                        >
                            <div className="reading-shelf-card-main">
                                <BookCover src={shelf.book.thumbnailUrl} title={shelf.book.title} />
                                <div className="reading-shelf-book-info">
                                    <span className={`reading-status ${shelf.readingStatus}`}>
                                        {shelf.readingStatus === 'reading' ? '📖 읽는 중' : '✅ 다 읽음'}
                                    </span>
                                    <h2>{shelf.book.title || '책 제목 없음'}</h2>
                                    <p>{shelf.book.authors?.join(', ') || '지은이 정보 없음'}</p>
                                    {shelf.book.publisher && <small>{shelf.book.publisher}</small>}
                                    <div className="reading-shelf-stats">
                                        <span>독서록 {shelf.logs.length}개</span>
                                        {publicCount > 0 && <span>친구 공개 {publicCount}개</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="reading-shelf-card-actions">
                                <Button size="sm" onClick={() => onNavigate('reading_logs', { mode: 'editor', book: { ...shelf.book, readingStatus: shelf.readingStatus } })}>
                                    독서록 더 쓰기
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setExpandedBookId(isExpanded ? null : shelf.id)}>
                                    {isExpanded ? '접기' : `독서록 보기 (${shelf.logs.length})`}
                                </Button>
                            </div>

                            {isExpanded && (
                                <div className="reading-shelf-log-list">
                                    {shelf.logs.length === 0 ? (
                                        <p>이 책에 쓴 독서록이 아직 없어요.</p>
                                    ) : shelf.logs.map((log) => {
                                        const teacherReview = teacherReviewByPost.get(log.id);
                                        return (
                                        <div key={log.id} className="reading-shelf-log-row">
                                            <div>
                                                <span>{log.visibility === 'class' ? '📚' : '🔒'}</span>
                                                <strong>{log.title || '제목 없는 독서록'}</strong>
                                                <small>{formatDate(log.updated_at || log.created_at)}</small>
                                            </div>
                                            <p>{log.content || '아직 내용이 없어요.'}</p>
                                            {teacherReview && (
                                                <div className="reading-log-teacher-review">
                                                    <strong>{teacherReview.review_status === 'commented' ? '💬 선생님 한마디' : '✅ 선생님이 확인했어요'}</strong>
                                                    {teacherReview.teacher_comment && <p>{teacherReview.teacher_comment}</p>}
                                                </div>
                                            )}
                                            <div>
                                                <Button size="sm" onClick={() => onNavigate('reading_logs', { mode: 'editor', postId: log.id })}>열어보기</Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleDelete(log)}>삭제</Button>
                                            </div>
                                        </div>
                                    );})}
                                </div>
                            )}
                        </motion.article>
                    );})}
                </div>
            )}

            <style>{`
                .reading-log-page { width:min(1080px, calc(100% - 32px)); margin:24px auto 70px; }
                .reading-log-list-header { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:24px; }
                .reading-log-list-header h1 { margin:22px 0 8px; color:#263238; font-size:2rem; }
                .reading-log-list-header p { margin:0; color:#78909C; }
                .reading-log-summary { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:22px; }
                .reading-log-summary span { padding:9px 14px; border-radius:999px; background:#F1F8E9; color:#558B2F; font-size:.9rem; }
                .reading-log-summary strong { font-size:1.1rem; margin-right:3px; }
                .reading-shelf-tabs { display:flex; gap:8px; margin-bottom:22px; overflow-x:auto; }
                .reading-shelf-tabs button { padding:10px 15px; border:1px solid #DCEDC8; border-radius:12px; background:white; color:#607D8B; cursor:pointer; font-weight:800; white-space:nowrap; }
                .reading-shelf-tabs button.active { background:#558B2F; border-color:#558B2F; color:white; }
                .reading-shelf-tabs small { margin-left:4px; opacity:.8; }
                .reading-shelf-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; align-items:start; }
                .reading-shelf-card { padding:22px; border:1px solid #E0E0E0; border-radius:24px; background:white; box-shadow:0 10px 28px rgba(51,105,30,.08); }
                .reading-shelf-card-main { display:flex; align-items:flex-start; gap:20px; }
                .reading-shelf-book-info { min-width:0; display:flex; flex-direction:column; align-items:flex-start; }
                .reading-status { padding:5px 9px; border-radius:9px; font-size:.72rem; font-weight:900; }
                .reading-status.reading { background:#E3F2FD; color:#1565C0; }
                .reading-status.completed { background:#E8F5E9; color:#2E7D32; }
                .reading-shelf-book-info h2 { margin:10px 0 5px; color:#263238; font-size:1.2rem; line-height:1.35; }
                .reading-shelf-book-info p { margin:0 0 4px; color:#607D8B; font-size:.88rem; }
                .reading-shelf-book-info > small { color:#9E9E9E; }
                .reading-shelf-stats { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
                .reading-shelf-stats span { padding:5px 8px; border-radius:8px; background:#F5F5F5; color:#78909C; font-size:.72rem; font-weight:800; }
                .reading-shelf-card-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
                .reading-shelf-log-list { margin-top:18px; padding-top:16px; border-top:1px solid #ECEFF1; display:flex; flex-direction:column; gap:10px; }
                .reading-shelf-log-list > p { text-align:center; color:#90A4AE; }
                .reading-shelf-log-row { padding:13px; border-radius:13px; background:#FAFAFA; }
                .reading-shelf-log-row > div:first-child { display:flex; align-items:center; gap:7px; }
                .reading-shelf-log-row strong { color:#37474F; font-size:.92rem; }
                .reading-shelf-log-row small { margin-left:auto; color:#B0BEC5; font-size:.72rem; }
                .reading-shelf-log-row > p { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin:8px 0; color:#78909C; font-size:.82rem; line-height:1.5; white-space:pre-wrap; }
                .reading-log-teacher-review { margin:10px 0; padding:10px 12px; border-radius:11px; background:#EEF2FF; color:#4338CA; }
                .reading-log-teacher-review strong { font-size:.78rem; }
                .reading-log-teacher-review p { margin:5px 0 0; color:#475569; font-size:.82rem; line-height:1.5; white-space:pre-wrap; }
                .reading-shelf-log-row > div:last-child { display:flex; justify-content:flex-end; gap:6px; }
                @media (max-width: 720px) {
                    .reading-log-page { width:min(100% - 24px, 1080px); margin-top:14px; }
                    .reading-log-list-header { align-items:stretch; flex-direction:column; }
                    .reading-log-list-header > button { width:100%; }
                    .reading-shelf-grid { grid-template-columns:1fr; }
                    .reading-shelf-card-main { gap:16px; }
                    .reading-shelf-card-actions { flex-direction:column; }
                    .reading-shelf-card-actions > button { width:100%; }
                }
            `}</style>
        </div>
    );
};

export default ReadingLogPage;
