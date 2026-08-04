import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Card from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import WritingEditorFields from '../../../components/writing/WritingEditorFields';
import {
    WritingNotice,
    WritingSectionHeader,
    WritingWorkspace,
    WritingWorkspaceHeader,
    WritingWorkspacePath
} from '../../../components/writing/WritingWorkspace';
import useMediaQuery from '../../../hooks/useMediaQuery';
import { supabase } from '../../../lib/supabaseClient';
import WritingToolHost from '../tools/WritingToolHost';
import { buildDraftKey, readLocalDraft, useLocalWritingDraft } from '../drafts/localWritingDraft';
import BookSearchPanel from './BookSearchPanel';
import BookCover from './BookCover';
import './ReadingLogShelf.css';

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

const formatTime = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(value);
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

const SHELF_WRITING_STATES = {
    complete: {
        label: '작성 완료',
        actionLabel: '작성 완료 · 수정',
        buttonStyle: { backgroundColor: '#2F7D52', color: '#FFFFFF' }
    },
    draft: {
        label: '작성 중',
        actionLabel: '작성 중 · 계속 쓰기',
        buttonStyle: { backgroundColor: '#B45309', color: '#FFFFFF' }
    },
    saved: {
        label: '책만 저장',
        actionLabel: '책만 저장 · 쓰기',
        buttonStyle: {
            backgroundColor: '#F1F5F9',
            borderColor: '#CBD5E1',
            color: '#475569',
            boxShadow: 'none'
        }
    }
};

const getBookKeys = (book = {}) => (
    [book.isbn13, book.isbn10, book.title]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
);

const bookFromDraft = (book = {}) => ({
    source: book.source || 'manual',
    title: book.title || '',
    authors: Array.isArray(book.authors) ? book.authors : [],
    translators: Array.isArray(book.translators) ? book.translators : [],
    publisher: book.publisher || '',
    publishedDate: book.publishedDate || book.published_date || '',
    thumbnailUrl: book.thumbnailUrl || book.thumbnail_url || '',
    sourceUrl: book.sourceUrl || book.source_url || '',
    isbn10: book.isbn10 || '',
    isbn13: book.isbn13 || ''
});

const ReadingLogEditor = ({ studentSession, postId, initialBook, draftBookKey, onDone, onCancel }) => {
    const createInitialForm = () => ({
        ...EMPTY_FORM,
        selectedBook: initialBook || null,
        readingStatus: initialBook?.readingStatus || 'completed'
    });
    const [form, setForm] = useState(createInitialForm);
    const [initialForm, setInitialForm] = useState(createInitialForm);
    const [loading, setLoading] = useState(Boolean(postId));
    const [saving, setSaving] = useState(false);
    const [completedPostAt, setCompletedPostAt] = useState(null);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

    useEffect(() => {
        if (!postId) return;

        let active = true;
        const loadPost = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, title, content, structured_content, visibility, updated_at')
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
            setCompletedPostAt(data.updated_at ? new Date(data.updated_at) : null);
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

    /*
     * 쓰다 만 독서록을 이 단말에 남긴다.
     *
     * 예전에는 임시저장이 없어서, 20분 쓰던 학생이 배터리가 나가거나 실수로 뒤로 가면
     * 글이 통째로 사라졌다. 과제 글쓰기에는 있던 안전장치가 독서록에만 없었다.
     * 서버 저장(`upsert_my_reading_log`)은 책 카탈로그·책장까지 함께 건드리므로
     * 자동으로 부르지 않는다. 여기서는 이 기기에만 남기고 서버 저장은 학생이 `저장` 을 누를 때만 한다.
     */
    // 책장에서 특정 책으로 들어온 경우에는 책까지 열쇠에 넣는다.
    // 그러지 않으면 A 책 쓰다 만 내용이 B 책 독서록에 되살아난다.
    const draftScopeId = postId
        || draftBookKey || initialBook?.isbn13 || initialBook?.isbn10 || initialBook?.title
        || 'new';
    const draftKey = buildDraftKey('reading_log_draft', studentSession?.id, draftScopeId);
    const draftHasContent = useCallback((candidate) => Boolean(
        candidate?.title?.trim() || candidate?.content?.trim() || candidate?.selectedBook?.title
    ), []);
    const restoreDraft = useCallback((stored, storedAt) => {
        // 완성본 저장 뒤 초안 정리만 실패했을 때 옛 로컬 초안이 되살아나지 않게 한다.
        if (completedPostAt && storedAt && storedAt <= completedPostAt) return;
        setForm((current) => ({ ...current, ...stored }));
    }, [completedPostAt]);
    const {
        savedAt: draftSavedAt,
        error: draftError,
        clear: clearLocalDraft,
        saveNow: saveLocalDraftNow
    } = useLocalWritingDraft(
        draftKey,
        form,
        { enabled: !loading && !saving, hasContent: draftHasContent, onRestore: restoreDraft }
    );

    /*
     * 서버 임시본 — 학교 태블릿에서 쓰다가 집에서 이어 쓸 수 있게 한다.
     *
     * 완성된 글(`student_posts`)이 아니라 `reading_log_drafts` 에 따로 담는다.
     * 칭호·발자국 함수 여럿이 `is_submitted` 가 아니라 `is_confirmed` 만 보기 때문에,
     * 임시본을 글 테이블에 넣으면 쓰다 만 글이 집계에 섞일 위험이 있다.
     * 자리를 나누면 친구 공개·교사 화면·집계가 구조적으로 임시본을 볼 수 없다.
     */
    const [serverDraftAt, setServerDraftAt] = useState(null);
    const [savingDraft, setSavingDraft] = useState(false);
    const bookKey = postId ? '' : String(draftScopeId || '');

    // 다른 기기에서 남긴 임시본을 가져온다. 이 기기에 남은 것보다 **새 것일 때만** 덮는다.
    // 그러지 않으면 방금 이 기기에서 쓴 내용이 옛 임시본에 지워진다.
    useEffect(() => {
        if (loading || !studentSession?.id) return undefined;

        let active = true;
        const load = async () => {
            const { data, error } = await supabase.rpc('get_my_reading_log_draft', {
                p_post_id: postId || null,
                p_book_key: bookKey
            });

            if (!active) return;
            if (error) {
                console.error('독서록 서버 임시본 불러오기 실패:', error.message);
                return;
            }
            if (!data) return;

            const serverAt = new Date(data.updated_at);
            setServerDraftAt(serverAt);

            const localAt = readLocalDraft(draftKey)?.savedAt;
            if (localAt && new Date(localAt) >= serverAt) return;
            // 완성본보다 오래된 서버 초안은 삭제 실패 잔여본일 수 있으므로 절대 덮지 않는다.
            if (completedPostAt && completedPostAt >= serverAt) return;

            setForm((current) => ({
                ...current,
                title: data.title || current.title,
                content: data.content || current.content,
                selectedBook: data.book || current.selectedBook,
                visibility: data.visibility || current.visibility,
                readingStatus: data.reading_status || current.readingStatus
            }));
        };

        load();
        return () => {
            active = false;
        };
        // 처음 열릴 때 한 번만 가져온다. 이후에는 이 기기의 내용이 기준이다.
    }, [bookKey, completedPostAt, draftKey, loading, postId, studentSession?.id]);

    const handleSaveDraft = async () => {
        if (!draftHasContent(form)) {
            alert('아직 적은 내용이 없어요. 한 줄이라도 적은 뒤에 임시 저장해 주세요. ✍️');
            return;
        }

        setSavingDraft(true);
        saveLocalDraftNow();
        const { data, error } = await supabase.rpc('upsert_my_reading_log_draft', {
            p_post_id: postId || null,
            p_book_key: bookKey,
            p_title: form.title,
            p_content: form.content,
            p_book: form.selectedBook,
            p_visibility: form.visibility,
            p_reading_status: form.readingStatus
        });
        setSavingDraft(false);

        if (error) {
            console.error('독서록 임시 저장 실패:', error.message);
            alert('이 기기에는 남겼지만 서버 임시 저장에 실패했어요. 잠시 후 다시 눌러 주세요.');
            return;
        }
        setServerDraftAt(data?.updated_at ? new Date(data.updated_at) : new Date());
        alert('임시 저장했어요. 다른 기기에서도 이어 쓸 수 있어요. 💾\n아직 선생님과 친구에게는 보이지 않아요.');
    };

    const clearDraft = useCallback(async () => {
        // 로컬 초안은 완성본 저장 직후 반드시 지운다. 남기면 다음 진입 때 완성본 위로 복원될 수 있다.
        clearLocalDraft();
        const { error } = await supabase.rpc('delete_my_reading_log_draft', {
            p_post_id: postId || null,
            p_book_key: bookKey
        });
        if (error) {
            console.error('독서록 서버 임시본 삭제 실패:', error.message);
            return false;
        }
        setServerDraftAt(null);
        return true;
    }, [bookKey, clearLocalDraft, postId]);

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
            alert(result.error.code === '23505'
                ? '이 책에는 이미 독서록이 한 편 있어요. 책장에서 기존 독서록의 수정하기를 눌러 주세요.'
                : '독서록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        setInitialForm(form);
        // 완성본이 들어갔으니 임시본은 지운다(이 기기 + 서버 모두).
        // 남겨 두면 다음에 들어올 때 저장된 글 위에 옛 임시본이 되살아난다.
        const draftCleared = await clearDraft();
        const savedMessage = form.visibility === 'class'
            ? '독서록을 친구 공개로 저장했어요! 📚'
            : '친구에게 비공개로 저장했어요. 선생님은 확인할 수 있어요. 🔒';
        alert(draftCleared
            ? savedMessage
            : `${savedMessage}\n서버 임시본 정리가 늦어지고 있지만 저장한 글이 우선이라 옛 내용으로 덮이지 않아요.`);
        onDone();
    };

    if (loading) {
        return <Card><p style={{ textAlign: 'center', padding: '40px' }}>독서록을 펼치는 중... 📖</p></Card>;
    }

    return (
        <WritingWorkspace tone="reading">
            <WritingWorkspaceHeader
                onBack={handleCancel}
                disabled={saving}
                eyebrow="📚 나의 독서록"
                title={postId ? '독서록 다듬기' : '새 독서록 쓰기'}
                description="책을 고르고 기억에 남은 장면과 내 생각을 나만의 말로 기록해요."
            />
            <WritingWorkspacePath steps={['책 선택', '생각 쓰기', '공개·저장']} />

            <div className="reading-log-book-stage">
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

            <section className="writing-editor-surface">
                <WritingSectionHeader
                    icon="💭"
                    title="책에서 만난 생각"
                    description="정답을 찾기보다 기억에 남은 까닭과 내 생각을 자유롭게 적어봐요."
                />
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

                {(draftError || draftSavedAt || serverDraftAt) && (
                    <WritingNotice tone={draftError ? 'danger' : 'success'} icon={draftError ? '⚠️' : '💾'} compact>
                        {draftError || (serverDraftAt
                            ? `${formatTime(serverDraftAt)}에 임시 저장했어요. 다른 기기에서도 이어 쓸 수 있어요. 아직 선생님과 친구에게는 보이지 않아요.`
                            : `${formatTime(draftSavedAt)}에 이 기기에 남겨 뒀어요. 다른 기기에서도 이어 쓰려면 임시 저장을 눌러 주세요.`)}
                    </WritingNotice>
                )}
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

            <div className="writing-action-bar writing-action-bar--reading">
                <Button type="button" variant="ghost" size="lg" onClick={handleCancel} disabled={saving || savingDraft}>취소</Button>
                <Button type="button" variant="outline" size="lg" onClick={handleSaveDraft} disabled={saving || savingDraft}>
                    {savingDraft ? '임시 저장 중...' : '임시 저장 💾'}
                </Button>
                <Button type="button" size="lg" onClick={handleSave} disabled={saving || savingDraft}>
                    {saving ? '저장하는 중...' : '독서록 저장하기 📚'}
                </Button>
            </div>
            </>}

            <style>{`
                .reading-log-book-stage { margin-bottom:24px; }
                .reading-status-picker { display:flex; align-items:center; gap:8px; margin-bottom:18px; padding:12px 14px; border:1px solid var(--ui-border); border-radius:var(--ui-radius-md); background:var(--ui-surface-muted); }
                .reading-status-picker > span { margin-right:auto; color:var(--ui-ink-muted); font-size:.9rem; font-weight:800; }
                .reading-status-picker button { min-height:44px; padding:8px 12px; border:1px solid var(--ui-border-strong); border-radius:var(--ui-radius-sm); background:var(--ui-surface); color:var(--ui-ink-muted); cursor:pointer; font-weight:800; box-shadow:none; }
                .reading-status-picker button:hover { background:var(--writing-workspace-soft); box-shadow:none; }
                .reading-status-picker button.active { border-color:var(--writing-workspace-accent); background:var(--writing-workspace-soft); color:var(--writing-workspace-accent-strong); }
                .reading-log-visibility { display:flex; align-items:center; gap:14px; margin-top:24px; padding:18px 20px; border:1px solid var(--ui-border); border-radius:var(--ui-radius-lg); cursor:pointer; background:var(--ui-surface-muted); }
                .reading-log-visibility.is-public { border-color:var(--writing-workspace-accent); background:var(--writing-workspace-soft); }
                .reading-log-visibility input { width:20px; height:20px; accent-color:#43A047; }
                .reading-log-visibility span:last-child { display:flex; flex-direction:column; gap:4px; color:var(--ui-ink-strong); }
                .reading-log-visibility small { color:var(--ui-ink-muted); font-weight:500; line-height:1.55; }
                @media (max-width: 640px) {
                    .reading-log-editor-header h2 { font-size:1.25rem; }
                    .reading-status-picker { flex-wrap:wrap; }
                    .reading-status-picker > span { width:100%; }
                }
            `}</style>
        </WritingWorkspace>
    );
};

const ReadingLogPage = ({ studentSession, params = {}, onBack, onNavigate }) => {
    const [logs, setLogs] = useState([]);
    const [libraryItems, setLibraryItems] = useState([]);
    const [logLinks, setLogLinks] = useState([]);
    const [teacherReviews, setTeacherReviews] = useState([]);
    const [draftStatuses, setDraftStatuses] = useState([]);
    const [selectedTeacherComment, setSelectedTeacherComment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const isEditing = params.mode === 'editor';

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const [logsResult, libraryResult, linksResult, reviewsResult, draftsResult] = await Promise.all([
            supabase
                .from('student_posts')
                .select('id, title, structured_content, visibility, published_at, created_at, updated_at')
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
                .eq('student_id', studentSession.id),
            supabase.rpc('get_my_reading_log_draft_statuses')
        ]);

        if (logsResult.error || libraryResult.error || linksResult.error) {
            console.error('독서 책장 로드 실패:', logsResult.error?.message || libraryResult.error?.message || linksResult.error?.message);
            setLogs([]);
            setLibraryItems([]);
            setLogLinks([]);
            setTeacherReviews([]);
            setDraftStatuses([]);
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
            if (draftsResult.error) {
                console.error('독서록 작성 상태 로드 실패:', draftsResult.error.message);
                setDraftStatuses([]);
            } else {
                setDraftStatuses(draftsResult.data || []);
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

    const closeTeacherComment = useCallback(() => {
        setSelectedTeacherComment(null);
    }, []);

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
                logs: [],
                draft: null
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
                    logs: [],
                    draft: null
                });
            }
            shelves.get(fallbackId).logs.push(log);
        });

        draftStatuses.forEach((draft) => {
            // 이미 저장된 독서록의 수정 초안은 카드 상태를 "작성 완료"로 유지한다.
            if (draft.post_id) return;

            const draftBook = bookFromDraft(draft.book || {});
            const draftKeys = new Set([String(draft.book_key || '').trim(), ...getBookKeys(draftBook)].filter(Boolean));
            const matchingShelf = [...shelves.values()].find((shelf) => (
                getBookKeys(shelf.book).some((key) => draftKeys.has(key))
            ));

            if (matchingShelf) {
                matchingShelf.draft = draft;
                if (new Date(draft.updated_at) > new Date(matchingShelf.updatedAt || 0)) {
                    matchingShelf.updatedAt = draft.updated_at;
                }
                return;
            }

            // 책을 고르기 전 저장한 빈 범위 초안은 책장 카드로 만들 수 없으므로 편집기에서만 복원한다.
            if (!draftBook.title) return;
            shelves.set(`draft-${draft.book_key || draft.updated_at}`, {
                id: `draft-${draft.book_key || draft.updated_at}`,
                readingStatus: draft.reading_status === 'reading' ? 'reading' : 'completed',
                updatedAt: draft.updated_at,
                book: draftBook,
                logs: [],
                draft
            });
        });

        return [...shelves.values()]
            .map((shelf) => ({
                ...shelf,
                logs: [...shelf.logs].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            }))
            .sort((a, b) => new Date(b.updatedAt || b.logs[0]?.updated_at || 0) - new Date(a.updatedAt || a.logs[0]?.updated_at || 0));
    }, [draftStatuses, libraryItems, logLinks, logs]);

    const displayShelves = useMemo(() => shelfBooks.map((shelf) => {
        const mainLog = shelf.logs[0] || null;
        const writingStateId = mainLog ? 'complete' : (shelf.draft ? 'draft' : 'saved');
        return {
            ...shelf,
            mainLog,
            writingStateId,
            writingState: Reflect.get(SHELF_WRITING_STATES, writingStateId)
        };
    }), [shelfBooks]);

    const filteredShelves = useMemo(() => (
        statusFilter === 'all'
            ? displayShelves
            : displayShelves.filter((shelf) => shelf.readingStatus === statusFilter)
    ), [displayShelves, statusFilter]);

    const counts = useMemo(() => ({
        books: shelfBooks.length,
        logs: logs.length,
        public: logs.filter((log) => log.visibility === 'class').length,
        reading: shelfBooks.filter((shelf) => shelf.readingStatus === 'reading').length,
        completed: shelfBooks.filter((shelf) => shelf.readingStatus === 'completed').length,
        reviewed: teacherReviews.length,
        writingComplete: displayShelves.filter((shelf) => shelf.writingStateId === 'complete').length,
        writingDraft: displayShelves.filter((shelf) => shelf.writingStateId === 'draft').length,
        bookOnly: displayShelves.filter((shelf) => shelf.writingStateId === 'saved').length
    }), [displayShelves, logs, shelfBooks, teacherReviews.length]);

    const teacherReviewByPost = useMemo(() => (
        new Map(teacherReviews.map((review) => [review.post_id, review]))
    ), [teacherReviews]);

    if (isEditing) {
        return (
            <ReadingLogEditor
                studentSession={studentSession}
                postId={params.postId}
                initialBook={params.book}
                draftBookKey={params.draftBookKey}
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

            <div className="reading-writing-legend" aria-label="독서록 작성 상태 안내">
                <span className="complete">작성 완료 {counts.writingComplete}</span>
                <span className="draft">작성 중 {counts.writingDraft}</span>
                <span className="saved">책만 저장 {counts.bookOnly}</span>
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
                        // 책 한 권에 독서록 한 편이 우리 교실의 실제 모습이다(운영 데이터에서도 두 편 이상은 0건).
                        // 옛 데이터에 여러 편이 있더라도 가장 최근 것을 그 책의 독서록으로 본다.
                        const { mainLog, writingState, writingStateId } = shelf;
                        const teacherReview = mainLog ? teacherReviewByPost.get(mainLog.id) : null;
                        const hasTeacherComment = Boolean(teacherReview?.teacher_comment?.trim());
                        return (
                        <motion.article
                            key={shelf.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.04, 0.24) }}
                            className="reading-shelf-card"
                        >
                            <div className="reading-shelf-card-main">
                                <BookCover src={shelf.book.thumbnailUrl} title={shelf.book.title} size="sm" />
                                <div className="reading-shelf-book-info">
                                    <span className={`reading-status ${shelf.readingStatus}`}>
                                        {shelf.readingStatus === 'reading' ? '📖 읽는 중' : '✅ 다 읽음'}
                                    </span>
                                    <h2>{shelf.book.title || '책 제목 없음'}</h2>
                                    <p>{shelf.book.authors?.join(', ') || '지은이 정보 없음'}</p>
                                    {shelf.book.publisher && <small>{shelf.book.publisher}</small>}
                                    {mainLog && (
                                        <div className="reading-shelf-stats">
                                            <span>{mainLog.visibility === 'class' ? '📚 친구 공개' : '🔒 나만 보기'}</span>
                                            <span>{formatDate(mainLog.updated_at || mainLog.created_at)}</span>
                                            {hasTeacherComment ? (
                                                <button
                                                    type="button"
                                                    className="reading-teacher-comment-trigger"
                                                    onClick={() => setSelectedTeacherComment({
                                                        ...teacherReview,
                                                        bookTitle: shelf.book.title || '책 제목 없음'
                                                    })}
                                                    aria-label={`「${shelf.book.title || '책 제목 없음'}」 선생님 한마디 보기`}
                                                >
                                                    💬 한마디 있음
                                                </button>
                                            ) : teacherReview ? (
                                                <span className="reading-teacher-reviewed">✅ 선생님 확인</span>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="reading-shelf-card-actions">
                                <Button
                                    size="sm"
                                    className={`reading-shelf-action is-${writingStateId}`}
                                    style={writingState.buttonStyle}
                                    onClick={() => onNavigate('reading_logs', mainLog
                                        ? { mode: 'editor', postId: mainLog.id }
                                        : {
                                            mode: 'editor',
                                            book: { ...shelf.book, readingStatus: shelf.readingStatus },
                                            draftBookKey: shelf.draft?.book_key
                                        })}
                                >
                                    {writingState.actionLabel}
                                </Button>
                                {mainLog && (
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(mainLog)}>삭제</Button>
                                )}
                            </div>
                        </motion.article>
                    );})}
                </div>
            )}

            <Modal
                isOpen={Boolean(selectedTeacherComment)}
                onClose={closeTeacherComment}
                title="💬 선생님 한마디"
                maxWidth="560px"
            >
                <div className="reading-teacher-comment-modal">
                    <span>{selectedTeacherComment?.bookTitle}</span>
                    <p>{selectedTeacherComment?.teacher_comment}</p>
                    {selectedTeacherComment?.reviewed_at && (
                        <small>{formatDate(selectedTeacherComment.reviewed_at)}에 남긴 한마디</small>
                    )}
                </div>
            </Modal>

        </div>
    );
};

export default ReadingLogPage;
