import { useEffect, useState } from 'react';
import BookPreviewFrame from './BookPreviewFrame.jsx';
import './studentBookReader.css';

// 두 학생 진입점이 같은 읽기 공간과 차례를 사용한다. 작품은 선택할 때만 읽는다.
export default function StudentBookReader({ book, works, loadPrint, loadWork }) {
    const [mode, setMode] = useState('book');
    const [selected, setSelected] = useState(works[0]?.id || null);
    const [result, setResult] = useState(null);
    const [fontSize, setFontSize] = useState(18);
    useEffect(() => {
        if (mode !== 'work' || !selected) return;
        let alive = true;
        loadWork(selected).then((work) => {
            if (alive) setResult({ id: selected, work });
        }).catch(() => {
            if (alive) setResult({ id: selected, error: '이 작품은 지금 읽을 수 없어요. 다른 작품을 골라 주세요.' });
        });
        return () => { alive = false; };
    }, [mode, selected, loadWork]);
    const index = works.findIndex((work) => work.id === selected);
    const current = result?.id === selected ? result : null;
    const choose = (id) => { setSelected(id); setMode('work'); };
    if (!works.length) return <p>지금 읽을 수 있는 작품이 없어요.</p>;
    return <section className="student-book-reader" aria-label={`${book.title} 읽기`}>
        <div className="student-book-reader__modes" role="group" aria-label="읽는 방식">
            <button type="button" aria-pressed={mode === 'book'} onClick={() => setMode('book')}>📖 책으로 펼쳐 읽기</button>
            <button type="button" aria-pressed={mode === 'work'} onClick={() => setMode('work')}>한 편씩 읽기</button>
        </div>
        <div className="student-book-reader__layout">
            <nav className="student-book-reader__toc" aria-label="문집 차례">
                <h3>차례 <small>{works.length}편</small></h3>
                <ol>{works.map((work, position) => <li key={work.id}>
                    {book.grouping === 'author' && book.book_type !== 'personal' && (position === 0 || work.author !== works[position - 1].author) && <strong className="student-book-reader__group">{work.author}</strong>}
                    <button type="button" aria-current={mode === 'work' && selected === work.id ? 'true' : undefined} onClick={() => choose(work.id)}>
                        <span>{position + 1}</span><span><strong>{work.title}</strong>{book.book_type !== 'personal' && <small>{work.author}</small>}</span>
                    </button>
                </li>)}</ol>
            </nav>
            <div className="student-book-reader__content">
                <div hidden={mode !== 'book'}><BookPreviewFrame load={loadPrint} title={book.title} embedded /></div>
                {mode === 'work' && <section aria-label="작품 본문">
                    <div className="student-book-reader__toolbar"><span>{index + 1} / {works.length}편</span><div role="group" aria-label="본문 글자 크기">
                        <button type="button" disabled={fontSize <= 16} onClick={() => setFontSize((size) => size - 2)} aria-label="글자 작게">가−</button>
                        <button type="button" disabled={fontSize >= 26} onClick={() => setFontSize((size) => size + 2)} aria-label="글자 크게">가+</button>
                    </div></div>
                    <article className="student-book-reader__work" style={{ fontSize }}>
                        <h2>{works.at(index)?.title}</h2>
                        {book.book_type !== 'personal' && <p className="student-book-reader__author">{works.at(index)?.author}</p>}
                        {!current ? <p role="status">작품을 불러오고 있어요…</p> : current.error ? <p role="alert">{current.error}</p> : current.work?.blocks.map((block, i) => <p key={i}>{block}</p>)}
                    </article>
                    <nav className="student-book-reader__pager" aria-label="작품 넘기기">
                        <button type="button" disabled={index <= 0} onClick={() => choose(works[index - 1].id)}>← 이전 작품</button>
                        <button type="button" disabled={index >= works.length - 1} onClick={() => choose(works[index + 1].id)}>다음 작품 →</button>
                    </nav>
                </section>}
            </div>
        </div>
    </section>;
}
