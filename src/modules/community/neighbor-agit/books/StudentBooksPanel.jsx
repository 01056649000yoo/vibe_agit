import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../../../../components/common/Button';
import StudentBookReader from '../../../class-agit/anthology/StudentBookReader.jsx';
import { bookCoverStyle, getBookDesign } from '../../../class-agit/designs.js';
import '../../../class-agit/classAgit.css';
import '../../../class-agit/anthology/cover.css';
import { neighborBooksApi } from './booksApi';
import './books.css';

const STATUS_TEXT = Object.freeze({
    pending: '✍️ 선생님이 확인하고 있어요. 확인되면 모두에게 보여요.',
    approved: '🎉 내 방문록이 올라갔어요.',
    rejected: '선생님이 올리지 않았어요. 고쳐 쓰면 다시 확인받을 수 있어요.'
});

/*
 * 📚 문집 나눔 — 학생 칸. 이웃 반 문집 표지 → 책 펼치기(차례) → 작품 읽기, 그리고 방문록.
 * 표지·작품 읽기 창은 우리 반 서가(글꽃 책방)와 같은 부품을 쓴다.
 */
export default function StudentBooksPanel({ spaceId, initialSharedBookId = null, api = neighborBooksApi }) {
    const [books, setBooks] = useState(null);
    const [error, setError] = useState('');
    const [openId, setOpenId] = useState(null);
    const [book, setBook] = useState(null);
    const [bookLoading, setBookLoading] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const openedInitial = useRef(null);
    const loadPrint = useCallback(() => api.getSharedBookPrint({ spaceId, sharedBookId: openId }), [api, spaceId, openId]);

    const loadBooks = useCallback(async () => {
        setError('');
        try {
            setBooks(await api.getSpaceBooks(spaceId));
        } catch {
            setError('문집을 불러오지 못했어요. 잠시 뒤 다시 들어와 주세요.');
        }
    }, [api, spaceId]);

    const openBook = useCallback(async (sharedBookId) => {
        setOpenId(sharedBookId);
        setBook(null);
        setNotice('');
        setBookLoading(true);
        try {
            const next = await api.getSharedBook({ spaceId, sharedBookId });
            setBook(next);
            setDraft(next.guestbook?.mine?.content || '');
        } catch {
            setNotice('지금은 이 문집을 읽을 수 없어요. 소개가 내려갔을 수 있어요.');
        } finally {
            setBookLoading(false);
        }
    }, [api, spaceId]);

    useEffect(() => { void loadBooks(); }, [loadBooks]);
    // 알림을 눌러 들어오면 그 책을 바로 편다(한 번만).
    useEffect(() => {
        if (!initialSharedBookId || openedInitial.current === initialSharedBookId) return;
        openedInitial.current = initialSharedBookId;
        void openBook(initialSharedBookId);
    }, [initialSharedBookId, openBook]);

    const closeBook = () => {
        setOpenId(null);
        setBook(null);
        setNotice('');
        void loadBooks();
    };

    const loadWork = useCallback(async (workId) => {
        const next = await api.getSharedBook({ spaceId, sharedBookId: openId, workId });
        return next.work;
    }, [api, spaceId, openId]);

    const saveEntry = async (action) => {
        const content = draft.replace(/\s+/g, ' ').trim();
        if (action === 'save' && !content) { setNotice('방문록을 한 줄 적어 주세요.'); return; }
        setSaving(true);
        setNotice('');
        try {
            await api.saveGuestbook({ spaceId, sharedBookId: openId, content, action });
            const next = await api.getSharedBook({ spaceId, sharedBookId: openId });
            setBook(next);
            setDraft(next.guestbook?.mine?.content || '');
            setNotice(action === 'delete' ? '방문록을 지웠어요.' : '방문록을 보냈어요. 선생님이 확인하면 모두에게 보여요.');
        } catch {
            setNotice('방문록을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setSaving(false);
        }
    };

    if (openId) {
        const mine = book?.guestbook?.mine || null;
        const entries = book?.guestbook?.entries || [];
        return (
            <section className="neighbor-books-student" aria-label="문집 읽기">
                <button type="button" className="neighbor-books__back" onClick={closeBook}>← 문집 목록으로</button>
                {bookLoading && <p className="neighbor-books__empty">책을 펼치는 중…</p>}
                {notice && !book && <p className="neighbor-books__empty">{notice}</p>}
                {book && (
                    <>
                        <div className="class-agit neighbor-books__book">
                            <span className="class-agit-eyebrow">{book.guestbook?.owner_class_name} · {book.number}판</span>
                            <h2>{book.book.title}</h2>
                            {book.book.subtitle && <p>{book.book.subtitle}</p>}
                            {book.book.introduction && <div className="class-agit-book-introduction">{book.book.introduction}</div>}
                            <StudentBookReader key={openId} book={book.book} works={book.works} loadPrint={loadPrint} loadWork={loadWork} />
                        </div>

                        <section className="neighbor-books__card neighbor-books__guestbook" aria-labelledby="neighbor-guestbook-title">
                            <header><h3 id="neighbor-guestbook-title">✍️ 방문록 {entries.length > 0 && `(${entries.length})`}</h3>
                                <p>책을 읽고 느낀 점을 한 줄로 남겨요. {book.guestbook?.owner_class_name} 선생님이 확인하면 모두에게 보여요.</p></header>
                            <div className="neighbor-books__form">
                                {mine && <p className={`neighbor-books__status is-${mine.status}`}>{STATUS_TEXT[mine.status]}</p>}
                                <input value={draft} maxLength={200} disabled={saving}
                                    placeholder="이 책에서 좋았던 점을 한 줄로 적어 보세요"
                                    onChange={(event) => setDraft(event.target.value.replace(/[\r\n]/g, ' '))} />
                                <span className="neighbor-books__actions">
                                    <Button type="button" size="sm" loading={saving} disabled={saving || !draft.trim()} onClick={() => saveEntry('save')}>{mine ? '고쳐서 보내기' : '방문록 보내기'}</Button>
                                    {mine && <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => saveEntry('delete')}>지우기</Button>}
                                </span>
                                {notice && <p className="neighbor-books__notice" role="status">{notice}</p>}
                            </div>
                            {entries.length === 0
                                ? <p className="neighbor-books__empty">아직 올라간 방문록이 없어요. 첫 방문록을 남겨 보세요!</p>
                                : <ul className="neighbor-books__guestcards">{entries.map((entry) => (
                                    /* 학생마다 한 장씩 — 방명록 종이처럼 카드로 남는다. */
                                    <li key={entry.entry_id} className={`neighbor-books__guestcard is-approved${entry.is_mine ? ' is-mine' : ''}`}>
                                        <span className="neighbor-books__guestcard-who">
                                            <em>{entry.class_name}</em><strong>{entry.student_name}</strong>
                                            {entry.is_mine && <span className="neighbor-books__mine-tag">내 방문록</span>}
                                        </span>
                                        <blockquote>{entry.content}</blockquote>
                                    </li>))}</ul>}
                        </section>
                    </>
                )}
            </section>
        );
    }

    return (
        <section className="neighbor-books-student" aria-label="문집 나눔">
            <div className="neighbor-books__intro">
                <h2>여러 반 친구들의 문집을 읽어요</h2>
                <p>표지를 누르면 책이 펼쳐져요. 다 읽고 방문록을 남겨 보세요.</p>
            </div>
            {error && <p className="neighbor-books__empty" role="alert">{error}</p>}
            {!books && !error && <p className="neighbor-books__empty">문집을 불러오는 중…</p>}
            {books && books.length === 0 && <p className="neighbor-books__empty">📚 아직 소개된 문집이 없어요. 선생님이 문집을 소개하면 이곳에 나타나요.</p>}
            {books && books.length > 0 && (
                <div className="class-agit neighbor-books__shelf">
                    {books.map((item) => (
                        <button type="button" key={item.shared_book_id} className="class-agit-book-cover" data-design={getBookDesign(item.design).id}
                            style={bookCoverStyle(item.design, item.paper)} onClick={() => openBook(item.shared_book_id)}>
                            <small>{item.is_own_class ? '⭐ 우리 반' : item.class_name} · {item.number}판</small>
                            <h2>{item.title}</h2>
                            {item.subtitle && <p>{item.subtitle}</p>}
                            <span className="class-agit-cover-mark" aria-hidden="true">{getBookDesign(item.design).mark}</span>
                            <strong>책 펼치기 ↗ · 방문록 {item.guestbook_count}{item.my_entry_status === 'pending' ? ' · 내 방문록 확인 중' : ''}</strong>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
