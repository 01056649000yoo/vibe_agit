import React, { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import BookCover from './BookCover';

const searchCache = new Map();

const EMPTY_MANUAL_BOOK = {
    title: '',
    author: '',
    publisher: '',
    isbn: ''
};

const getErrorPayload = async (error) => {
    try {
        return await error?.context?.json();
    } catch {
        return null;
    }
};

const BookSearchPanel = ({ selectedBook, onSelectBook, disabled = false }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchMessage, setSearchMessage] = useState('');
    const [manualMode, setManualMode] = useState(false);
    const [manualBook, setManualBook] = useState(EMPTY_MANUAL_BOOK);
    const [resolvingBookKey, setResolvingBookKey] = useState('');

    useEffect(() => {
        const cleanQuery = query.trim();
        if (cleanQuery.length < 2 || manualMode || selectedBook) return undefined;

        let active = true;
        const timerId = window.setTimeout(async () => {
            const cacheKey = cleanQuery.toLocaleLowerCase('ko-KR');
            if (searchCache.has(cacheKey)) {
                if (active) {
                    setResults(searchCache.get(cacheKey));
                    setSearchMessage('');
                }
                return;
            }

            setSearching(true);
            setSearchMessage('');
            const { data, error } = await supabase.functions.invoke('book-search', {
                body: { query: cleanQuery }
            });

            if (!active) return;
            setSearching(false);
            if (error) {
                const payload = await getErrorPayload(error);
                setResults([]);
                setSearchMessage(payload?.code === 'BOOK_SEARCH_NOT_CONFIGURED'
                    ? '책 검색 연결을 준비하고 있어요. 지금은 직접 입력해 주세요.'
                    : (payload?.error || '책 검색에 잠시 연결할 수 없어요. 직접 입력할 수 있어요.'));
                return;
            }

            const books = Array.isArray(data?.books) ? data.books : [];
            searchCache.set(cacheKey, books);
            setResults(books);
            setSearchMessage(books.length === 0 ? '검색 결과가 없어요. 다른 검색어나 직접 입력을 이용해 주세요.' : '');
        }, 500);

        return () => {
            active = false;
            window.clearTimeout(timerId);
        };
    }, [manualMode, query, selectedBook]);

    const handleQueryChange = (event) => {
        const nextQuery = event.target.value;
        setQuery(nextQuery);
        if (nextQuery.trim().length < 2) {
            setResults([]);
            setSearchMessage('');
        }
    };

    // 책을 다시 고를 때는 검색창을 빈 상태로 되돌린다.
    // 옛 검색어와 결과가 남아 있으면 학생에게는 "검색이 그 책에 붙잡혀 있는" 것처럼 보인다.
    const handleClearBook = () => {
        setQuery('');
        setResults([]);
        setSearchMessage('');
        setManualMode(false);
        setManualBook(EMPTY_MANUAL_BOOK);
        onSelectBook(null);
    };

    const resolvePageCount = async (book) => {
        if (!book.isbn13 && !book.isbn10) return book;

        const { data, error } = await supabase.functions.invoke('book-search', {
            body: { isbn13: book.isbn13 || '', isbn10: book.isbn10 || '' }
        });
        if (error || !data?.pageCount) return book;
        return { ...book, pageCount: Number(data.pageCount), pageCountSource: 'google' };
    };

    const selectBookWithPageCount = async (book, key) => {
        setResolvingBookKey(key);
        try {
            onSelectBook(await resolvePageCount(book));
        } catch {
            // Google 조회 실패가 책 선택 자체를 막으면 안 된다.
            onSelectBook(book);
        } finally {
            setResolvingBookKey('');
        }
    };

    const handleManualSelect = async () => {
        if (!manualBook.title.trim()) {
            alert('책 제목을 적어주세요. 📖');
            return;
        }

        const digits = manualBook.isbn.replace(/[^0-9X]/gi, '').toUpperCase();
        const book = {
            source: 'manual',
            title: manualBook.title.trim(),
            authors: manualBook.author.trim() ? [manualBook.author.trim()] : [],
            translators: [],
            publisher: manualBook.publisher.trim(),
            publishedDate: '',
            thumbnailUrl: '',
            sourceUrl: '',
            isbn10: digits.length === 10 ? digits : '',
            isbn13: digits.length === 13 ? digits : ''
        };
        await selectBookWithPageCount(book, `manual:${digits || book.title}`);
    };

    if (selectedBook) {
        return (
            <div className="selected-reading-book">
                <BookCover src={selectedBook.thumbnailUrl} title={selectedBook.title} />
                <div className="selected-reading-book-info">
                    <span className="selected-reading-book-label">선택한 책</span>
                    <h3>{selectedBook.title}</h3>
                    <p>{selectedBook.authors?.join(', ') || '지은이 정보 없음'}</p>
                    {selectedBook.publisher && <small>{selectedBook.publisher}</small>}
                    <span className={`selected-reading-book-pages ${selectedBook.pageCount ? 'is-ready' : ''}`}>
                        {selectedBook.pageCount
                            ? `📄 총 ${Number(selectedBook.pageCount).toLocaleString('ko-KR')}쪽`
                            : '📄 저장할 때 쪽수 정보를 한 번 더 자동 확인해요'}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearBook}
                        disabled={disabled}
                    >
                        🔍 다른 책 검색하기
                    </Button>
                </div>
                <style>{`
                    .selected-reading-book { display:flex; align-items:center; gap:24px; padding:24px; border:1px solid var(--writing-workspace-border,#C5E1A5); border-radius:var(--ui-radius-lg,18px); background:linear-gradient(135deg,var(--writing-workspace-soft,#F1F8E9),var(--ui-surface,#FFFFFF)); box-shadow:var(--ui-shadow-xs); }
                    .selected-reading-book-info { display:flex; flex-direction:column; align-items:flex-start; min-width:0; }
                    .selected-reading-book-label { color:var(--writing-workspace-accent-strong,#558B2F); font-size:.78rem; font-weight:900; }
                    .selected-reading-book-info h3 { margin:7px 0 5px; color:var(--ui-ink,#263238); font-size:1.35rem; }
                    .selected-reading-book-info p { margin:0 0 4px; color:var(--ui-ink-muted,#607D8B); }
                    .selected-reading-book-info small { margin-bottom:10px; color:var(--ui-ink-subtle,#90A4AE); }
                    .selected-reading-book-pages { margin:3px 0 12px; padding:6px 9px; border-radius:9px; background:#F8FAFC; color:#64748B; font-size:.72rem; font-weight:800; }
                    .selected-reading-book-pages.is-ready { background:#F0FDF4; color:#15803D; }
                    @media (max-width:560px) { .selected-reading-book { align-items:flex-start; gap:16px; padding:18px; } }
                `}</style>
            </div>
        );
    }

    return (
        <div className="book-search-panel">
            <div className="book-search-heading">
                <div>
                    <h3>📚 어떤 책을 읽었나요?</h3>
                    <p>책을 찾으면 표지와 책 정보가 내 책장에 자동으로 정리돼요.</p>
                </div>
                <button type="button" onClick={() => setManualMode((value) => !value)} disabled={disabled || Boolean(resolvingBookKey)}>
                    {manualMode ? '책 검색으로 찾기' : '직접 입력'}
                </button>
            </div>

            {manualMode ? (
                <div className="manual-book-form">
                    <label><span>책 제목 *</span><input value={manualBook.title} onChange={(event) => setManualBook((current) => ({ ...current, title: event.target.value }))} placeholder="책 제목" disabled={disabled} /></label>
                    <label><span>지은이</span><input value={manualBook.author} onChange={(event) => setManualBook((current) => ({ ...current, author: event.target.value }))} placeholder="지은이" disabled={disabled} /></label>
                    <label><span>출판사</span><input value={manualBook.publisher} onChange={(event) => setManualBook((current) => ({ ...current, publisher: event.target.value }))} placeholder="출판사" disabled={disabled} /></label>
                    <label><span>ISBN</span><input value={manualBook.isbn} onChange={(event) => setManualBook((current) => ({ ...current, isbn: event.target.value }))} placeholder="책 뒤쪽의 ISBN(선택)" disabled={disabled} /></label>
                    <Button onClick={handleManualSelect} disabled={disabled || Boolean(resolvingBookKey)}>
                        {resolvingBookKey ? '쪽수 확인 중...' : '이 책으로 독서록 쓰기'}
                    </Button>
                </div>
            ) : (
                <>
                    <div className="book-search-box">
                        <span>🔎</span>
                        <input
                            value={query}
                            onChange={handleQueryChange}
                            placeholder="책 제목이나 지은이를 두 글자 이상 입력하세요"
                            autoFocus
                            disabled={disabled}
                        />
                        {searching && <small>찾는 중...</small>}
                    </div>
                    {searchMessage && <div className="book-search-message">{searchMessage}</div>}
                    {results.length > 0 && (
                        <div className="book-search-results">
                            {results.map((book, index) => {
                                const bookKey = `${book.source}:${book.isbn13 || book.isbn10 || `${book.title}:${index}`}`;
                                const resolving = resolvingBookKey === bookKey;
                                return (
                                <button
                                    type="button"
                                    key={bookKey}
                                    onClick={() => selectBookWithPageCount(book, bookKey)}
                                    disabled={disabled || Boolean(resolvingBookKey)}
                                    className="book-search-result"
                                >
                                    <BookCover src={book.thumbnailUrl} title={book.title} size="sm" />
                                    <span>
                                        <strong>{book.title}</strong>
                                        <em>{book.authors?.join(', ') || '지은이 정보 없음'}</em>
                                        <small>{resolving ? 'Google Books에서 쪽수 확인 중…' : [book.publisher, book.publishedDate?.slice(0, 4)].filter(Boolean).join(' · ')}</small>
                                    </span>
                                </button>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <style>{`
                .book-search-panel { padding:26px; border-radius:var(--ui-radius-xl,24px); background:var(--writing-workspace-soft,#F8FBF4); border:1px solid var(--writing-workspace-border,#DCEDC8); }
                .book-search-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:20px; }
                .book-search-heading h3 { margin:0 0 6px; color:var(--writing-workspace-accent-strong,#33691E); }
                .book-search-heading p { margin:0; color:var(--ui-ink-muted,#78909C); font-size:.9rem; }
                .book-search-heading button { min-height:44px; border:1px solid var(--writing-workspace-border,#DCEDC8); background:var(--ui-surface,#fff); color:var(--writing-workspace-accent-strong,#558B2F); padding:8px 12px; border-radius:var(--ui-radius-sm,10px); font-weight:800; cursor:pointer; white-space:nowrap; box-shadow:none; }
                .book-search-box { display:flex; align-items:center; gap:10px; padding:4px 15px; background:var(--ui-surface,#fff); border:2px solid var(--writing-workspace-border,#AED581); border-radius:var(--ui-radius-md,14px); }
                .book-search-box:focus-within { border-color:var(--writing-workspace-accent,#558B2F); box-shadow:var(--ui-focus-ring); }
                .book-search-box input { flex:1; min-width:0; padding:13px 0; border:0; outline:0; font:inherit; }
                .book-search-box small { color:var(--writing-workspace-accent,#7CB342); white-space:nowrap; }
                .book-search-message { margin-top:12px; padding:11px 13px; border-radius:11px; background:#FFF8E1; color:#8D6E63; font-size:.88rem; }
                .book-search-results { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:16px; max-height:390px; overflow-y:auto; }
                .book-search-result { display:flex; align-items:center; gap:13px; padding:13px; border:1px solid var(--ui-border,#E0E0E0); border-radius:var(--ui-radius-md,14px); background:var(--ui-surface,#fff); text-align:left; cursor:pointer; box-shadow:none; }
                .book-search-result:hover { border-color:var(--writing-workspace-accent,#8BC34A); background:var(--ui-surface,#fff); transform:translateY(-1px); box-shadow:var(--ui-shadow-xs); }
                .book-search-result > span { display:flex; flex-direction:column; min-width:0; }
                .book-search-result strong { color:var(--ui-ink,#263238); line-height:1.35; }
                .book-search-result em { color:var(--ui-ink-muted,#607D8B); font-size:.83rem; font-style:normal; margin-top:5px; }
                .book-search-result small { color:var(--ui-ink-subtle,#9E9E9E); font-size:.75rem; margin-top:4px; }
                .manual-book-form { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
                .manual-book-form label { display:flex; flex-direction:column; gap:7px; color:var(--writing-workspace-accent-strong,#558B2F); font-size:.85rem; font-weight:800; }
                .manual-book-form input { box-sizing:border-box; width:100%; min-height:44px; padding:12px 13px; border:1px solid var(--writing-workspace-border,#C5E1A5); border-radius:var(--ui-radius-sm,10px); background:var(--ui-surface,#fff); font:inherit; }
                .manual-book-form input:focus { border-color:var(--writing-workspace-accent,#558B2F); outline:0; box-shadow:var(--ui-focus-ring); }
                .manual-book-form > button { grid-column:1 / -1; justify-self:end; }
                @media (max-width:680px) {
                    .book-search-panel { padding:19px; }
                    .book-search-heading { flex-direction:column; }
                    .book-search-results, .manual-book-form { grid-template-columns:1fr; }
                    .manual-book-form > button { grid-column:auto; width:100%; }
                }
            `}</style>
        </div>
    );
};

export default BookSearchPanel;
