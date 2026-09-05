import { bookCoverStyle, getBookDesign } from '../designs.js';
import './cover.css';
import { useCallback, useState } from 'react';
import StudentBackButton from '../../../components/student/StudentBackButton.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import useGalleryRead from '../student/useGalleryRead.js';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import { classAgitRoute } from '../student/navigation.js';
import { assertStudentBooks } from './studentContract.js';
export default function StudentBooks({ route, onNavigate, onReplace, onBack, api = classAgitReleaseApi }) {
    const [refresh, setRefresh] = useState(0);
    const editionId = route.editionId || null; const workId = route.mode === 'chapter' ? route.workId : null;
    const read = useCallback(async () => assertStudentBooks(await api.getStudentBooks(editionId, workId), editionId, workId), [api, editionId, workId]);
    const state = useGalleryRead(`${editionId}:${workId}`, read, true, refresh);
    const data = state.data;
    const navigate = (params) => { const next = classAgitRoute(params); onNavigate(next.name, next.params); };
    return <main className="class-agit class-agit-student"><header className="class-agit-gallery__header"><StudentBackButton onClick={onBack} /><button type="button" disabled={state.loading} onClick={() => setRefresh((v) => v + 1)}>문집 다시 확인</button></header>
        <span className="class-agit-eyebrow">우리반 아지트 · 문집 서가</span><h1>{data?.book?.title || '우리 반의 책'}</h1>
        {state.error && <p role="alert" className="class-agit-error">{state.error}</p>}{state.loading && <p role="status">문집을 불러오고 있어요…</p>}
        {route.mode === 'books' && data && <><div className="class-agit-student-exhibitions">{data.books.map((book) => <button type="button" className="class-agit-book-cover" data-design={getBookDesign(book.design).id} style={bookCoverStyle(book.design, book.paper)} key={book.id} onClick={() => navigate({ mode: 'book', editionId: book.id })}><small>{book.number}판</small><h2>{book.title}</h2><p>{book.subtitle}</p><span className="class-agit-cover-mark" aria-hidden="true">{getBookDesign(book.design).mark}</span><strong>책 펼치기 ↗</strong></button>)}</div>{!data.books.length && <p className="class-agit-empty">아직 서가에 문집이 없어요. 함께 쓴 책이 곧 찾아올 거예요.</p>}</>}
        {route.mode === 'book' && data && <><p>{data.book.subtitle}</p><div className="class-agit-book-introduction">{data.book.introduction}</div><h2>차례 · {data.works.length}편</h2><ol className="class-agit-book-items">{data.works.map((work) => <li key={work.id}><button type="button" onClick={() => navigate({ mode: 'chapter', editionId, workId: work.id })}>{work.title} · {work.author}</button></li>)}</ol>{!data.works.length && <p>지금 읽을 수 있는 작품이 없어요.</p>}<p>{data.book.class_label} · {data.book.issue_date} · {data.number}판</p></>}
        {route.mode === 'chapter' && <ArtworkReader work={data?.work || null} loading={state.loading} error={state.error} onClose={onBack} footer={<><button type="button" onClick={onBack}>문집 차례로</button>{state.error && <button type="button" onClick={() => onReplace(classAgitRoute({ mode: 'book', editionId }))}>최신 차례 보기</button>}</>} />}
    </main>;
}
