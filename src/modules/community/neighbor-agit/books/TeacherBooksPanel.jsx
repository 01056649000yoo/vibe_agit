import { useCallback, useEffect, useState } from 'react';
import Button from '../../../../components/common/Button';
import { bookCoverStyle, getBookDesign } from '../../../class-agit/designs.js';
import { neighborBooksApi } from './booksApi';
import './books.css';

/*
 * 📚 문집 나눔 — 교사 칸.
 *   ① 우리 반 문집 소개하기(글꽃 책방에서 확정하고 학생에게 보이게 한 학급 문집만)
 *   ② 확인할 방문록(우리 반 문집에 남겨진 것) — 승인해야 모두에게 보인다
 *   ③ 공간에 소개된 문집 / 우리 반 문집에 올라간 방문록(내리기)
 * 확인할 방문록 목록은 작업 공간(workspace.pending_guestbook)이 이미 들고 있어 검토함과 같은 원본을 쓴다.
 */
/**
 * 소개하기가 꺼진 까닭과 할 일. 글꽃 책방의 실제 단추 이름으로 안내한다.
 * @returns {null | { text: string, hint: string, action: string }}
 */
const blockedReason = (book) => {
    if (!book.any_edition_number) {
        return { text: '아직 확정한 판이 없어요.', hint: '글꽃 책방 5단계에서 ‘새 판 확정’을 누르면 소개할 수 있어요.', action: '글꽃 책방에서 확정하기' };
    }
    if (!book.latest_edition_id) {
        return { text: `확정한 ${book.any_edition_number}판이 학생에게 가려져 있어요.`, hint: '글꽃 책방 ‘확정판 보관함’에서 ‘학생 서가에 공개’를 눌러 주세요.', action: '학생 서가에 공개하러 가기' };
    }
    if (Number(book.work_count) === 0) {
        return { text: '지금 읽을 수 있는 작품이 없어요.', hint: '작품이 모두 수록 철회됐어요. 글꽃 책방에서 작품을 다시 담아 새 판을 확정해 주세요.', action: '글꽃 책방에서 확인하기' };
    }
    return null;
};

export default function TeacherBooksPanel({ spaceId, classId, pendingEntries = [], ask, onChanged, onOpenBooks, api = neighborBooksApi }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!spaceId || !classId) return;
        setLoading(true);
        setError('');
        try {
            setData(await api.getTeacherBooks({ spaceId, classId }));
        } catch (loadError) {
            setError(loadError?.message || '문집 나눔을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [api, classId, spaceId]);

    useEffect(() => { void load(); }, [load]);

    const run = async (key, action, doneMessage) => {
        if (busy) return;
        setBusy(key);
        setMessage('');
        setError('');
        try {
            await action();
            setMessage(doneMessage);
            await Promise.all([load(), onChanged?.()]);
        } catch (runError) {
            setError(runError?.message || '요청을 처리하지 못했습니다.');
        } finally {
            setBusy('');
        }
    };

    const share = (book) => run(`share:${book.book_id}`, () => api.shareBook({ spaceId, classId, bookId: book.book_id }),
        book.shared_status === 'published' ? `‘${book.title}’을 ${book.latest_number}판으로 바꿨습니다.` : `‘${book.title}’을 소개했습니다.`);
    const withdraw = async (book) => {
        const ok = await ask({
            title: `‘${book.title}’ 소개를 내릴까요?`,
            body: '다른 반 학생에게 더는 보이지 않습니다. 남겨진 방문록은 지워지지 않고, 다시 소개하면 이어서 보입니다.',
            confirmLabel: '소개 내리기', cancelLabel: '그만두기', tone: 'danger'
        });
        if (ok) await run(`withdraw:${book.book_id}`, () => api.withdrawBook({ spaceId, classId, sharedBookId: book.shared_book_id }), '소개를 내렸습니다.');
    };
    const review = (entry, action) => run(`review:${entry.entry_id}`,
        () => api.reviewGuestbook({ spaceId, classId, entryId: entry.entry_id, action }),
        action === 'approve' ? '방문록을 올렸습니다. 쓴 학생과 문집에 글이 실린 학생들에게 알림이 갑니다.' : '방문록을 올리지 않았습니다.');

    // 방문록 한 장: 쓴 반·학생 → 문집 제목 → 방문록 한 줄(따옴표) → 단추. 가로로 길게 늘어지지 않게 카드로 놓는다.
    const renderEntryCard = (entry, actions, tone) => (
        <li key={entry.entry_id} className={`neighbor-books__guestcard ${tone}`}>
            <span className="neighbor-books__guestcard-who"><em>{entry.class_name}</em><strong>{entry.student_name}</strong></span>
            <small>📚 {entry.book_title}</small>
            <blockquote>{entry.content}</blockquote>
            <span className="neighbor-books__actions">{actions}</span>
        </li>
    );

    const myBooks = data?.my_books || [];
    const sharedBooks = data?.shared_books || [];
    const approved = data?.approved_entries || [];

    return (
        <div className="neighbor-books-teacher" role="tabpanel">
            {message && <p className="neighbor-books__message" role="status">{message}</p>}
            {error && <p className="neighbor-books__message neighbor-books__message--error" role="alert">{error}</p>}

            <section className="neighbor-books__card">
                <header><h3>📥 확인할 방문록 {pendingEntries.length > 0 && <span className="neighbor-books__count">{pendingEntries.length}</span>}</h3>
                    <p>우리 반 문집에 남겨진 방문록이에요. 올려야 모든 반 학생에게 보여요.</p></header>
                {pendingEntries.length === 0
                    ? <p className="neighbor-books__empty">확인할 방문록이 없어요.</p>
                    : <ul className="neighbor-books__guestcards">{pendingEntries.map((entry) => renderEntryCard(entry, (
                        <>
                            <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => review(entry, 'approve')}>올리기</Button>
                            <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => review(entry, 'reject')}>올리지 않기</Button>
                        </>
                    ), 'is-pending'))}</ul>}
            </section>

            <section className="neighbor-books__card">
                <header><h3>📚 우리 반 문집 소개하기</h3>
                    <p>글꽃 책방에서 확정하고 <strong>학생 서가에 공개한</strong> 학급 문집을 참여한 모든 반에 소개해요.</p></header>
                {loading && !data && <p className="neighbor-books__empty">문집을 불러오는 중…</p>}
                {data && myBooks.length === 0 && (
                    <div className="neighbor-books__reason">
                        <p><strong>아직 우리 반 학급 문집이 없어요.</strong> 글꽃 책방에서 학급 문집을 만들고 새 판을 확정한 뒤 ‘학생 서가에 공개’를 누르면 여기서 소개할 수 있어요. (개인 문집은 소개하지 않아요.)</p>
                        {onOpenBooks && <Button type="button" size="sm" variant="outline" onClick={onOpenBooks}>📚 글꽃 책방으로 가기 →</Button>}
                    </div>
                )}
                {/* 문집마다 작은 표지 카드. 소개할 수 없으면 까닭과 글꽃 책방으로 가는 단추를 카드 안에 둔다. */}
                <ul className="neighbor-books__mine">{myBooks.map((book) => {
                    const shared = book.shared_status === 'published';
                    const reason = blockedReason(book);
                    const outdated = shared && Number(book.shared_number) < Number(book.latest_number);
                    const hiddenNewer = !reason && Number(book.any_edition_number) > Number(book.latest_number);
                    const design = getBookDesign(book.design);
                    return (
                        <li key={book.book_id} className={`neighbor-books__book-card${reason ? ' is-blocked' : ''}${shared ? ' is-shared' : ''}`}>
                            {shared && <span className="neighbor-books__ribbon" aria-hidden="true">📢 공개 중</span>}
                            {/* 작은 표지는 우리 클래스만 쓴다. 글꽃 책방의 .class-agit·.class-agit-book-cover 를 빌리면
                                그 스타일이 늦게 읽힐 때(메뉴를 연 순서에 따라) 여백·가운데 정렬이 붙어 표지가 글을 덮었다(2026-09-23).
                                색·비율만 bookCoverStyle 의 변수로 받는다. */}
                            <span className="neighbor-books__mini-cover" data-design={design.id} style={bookCoverStyle(book.design, book.paper)} aria-hidden="true">
                                <span>{design.mark}</span>
                            </span>
                            <div className="neighbor-books__book-body">
                                <strong>{book.title}</strong>
                                <small>{book.latest_edition_id ? `${book.latest_number}판 · 작품 ${book.work_count}편` : book.any_edition_number ? `${book.any_edition_number}판 확정 · 학생에게 가림` : '확정 전'}</small>
                                {shared && <span className="neighbor-books__badge">이웃 반에 소개 중 · {book.shared_number}판</span>}
                                {reason && (
                                    <div className="neighbor-books__reason" role="note">
                                        <p><strong>{reason.text}</strong> {reason.hint}</p>
                                        {onOpenBooks && <Button type="button" size="sm" variant="outline" onClick={onOpenBooks}>📚 {reason.action} →</Button>}
                                    </div>
                                )}
                                {hiddenNewer && <p className="neighbor-books__hint">새로 확정한 {book.any_edition_number}판은 아직 학생에게 가려져 있어요. 공개하면 그 판으로 바꿀 수 있어요.</p>}
                                <span className="neighbor-books__actions">
                                    {!shared && !reason && <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => share(book)}>소개하기</Button>}
                                    {outdated && <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => share(book)}>{book.latest_number}판으로 바꾸기</Button>}
                                    {shared && <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => withdraw(book)}>소개 내리기</Button>}
                                </span>
                            </div>
                        </li>
                    );
                })}</ul>
            </section>

            <section className="neighbor-books__card">
                <header><h3>🏫 공간에 소개된 문집 {sharedBooks.length > 0 && `(${sharedBooks.length})`}</h3></header>
                {sharedBooks.length === 0
                    ? <p className="neighbor-books__empty">아직 소개된 문집이 없어요.</p>
                    : <ul className="neighbor-books__shared">{sharedBooks.map((book) => (
                        <li key={book.shared_book_id} className={book.is_own_class ? 'is-own' : ''}>
                            <span className="neighbor-books__class">{book.is_own_class ? '⭐ 우리 반' : book.class_name}</span>
                            <strong>{book.title}</strong>
                            <small>{book.number}판 · 방문록 {book.approved_count}{book.is_own_class && Number(book.pending_count) > 0 ? ` · 확인 대기 ${book.pending_count}` : ''}</small>
                        </li>))}</ul>}
            </section>

            {approved.length > 0 && (
                <section className="neighbor-books__card">
                    <header><h3>✅ 우리 반 문집에 올라간 방문록</h3><p>문제가 있으면 내릴 수 있어요.</p></header>
                    <ul className="neighbor-books__guestcards">{approved.map((entry) => renderEntryCard(entry, (
                        <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => review(entry, 'reject')}>내리기</Button>
                    ), 'is-approved'))}</ul>
                </section>
            )}
        </div>
    );
}
