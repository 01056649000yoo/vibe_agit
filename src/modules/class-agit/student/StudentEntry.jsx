import ExhibitionRightsNotice from '../gallery/ExhibitionRightsNotice.jsx';
import { EXHIBITION_RIGHTS } from '../gallery/rightsNotice.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import StudentBackButton from '../../../components/student/StudentBackButton.jsx';
import GuideInfoButton from '../../../components/common/GuideInfoButton.jsx';
import Modal from '../../../components/common/Modal.jsx';
import { classAgitStudentApi } from '../api/studentApi.js';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import { assertStudentBooks } from '../anthology/studentContract.js';
import { bookCoverStyle, galleryCoverStyle, getBookDesign } from '../designs.js';
import { classAgitRoute, normalizeClassAgitParams } from './navigation.js';
import useGalleryRead from './useGalleryRead.js';
import GalleryRoom from '../gallery/GalleryRoom.jsx';
import StudentBooks from '../anthology/StudentBooks.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import '../classAgit.css';

export default function ClassAgitStudentEntry({ params, onNavigate, onReplace, onBack, api = classAgitStudentApi, releaseApi = classAgitReleaseApi }) {
    const route = normalizeClassAgitParams(params);
    const mode = route.mode || 'list';
    const room = mode === 'lobby' ? 0 : Number(route.room || 1);
    const [refresh, setRefresh] = useState(0);
    const [help, setHelp] = useState(false);
    const root = useRef(null);
    const opener = useRef(null);
    const previousMode = useRef(mode);
    const restoreFocus = useRef(false);
    const publicationNo = Number(route.publicationNo || 0);
    const id = String(route.exhibitionId || '');
    const workId = String(route.workId || '');
    const readList = useCallback(() => api.getExhibitions(), [api]);
    const readRoom = useCallback(() => api.getRoom(id, room), [api, id, room]);
    const readWork = useCallback(() => api.getWork(id, publicationNo, workId), [api, id, publicationNo, workId]);
    // 서가로 한 번 더 들어가지 않고 첫 화면에서 문집 표지를 바로 고른다.
    const readBooks = useCallback(async () => assertStudentBooks(await releaseApi.getStudentBooks()), [releaseApi]);
    const list = useGalleryRead('exhibitions', readList, mode === 'list', refresh);
    const books = useGalleryRead('books', readBooks, mode === 'list', refresh);
    const page = useGalleryRead(`${id}:${room}`, readRoom, mode === 'lobby' || mode === 'room', refresh, true);
    const detail = useGalleryRead(`${id}:${publicationNo}:${workId}`, readWork, mode === 'work');
    const current = mode === 'list' ? list : page;
    const navigate = (next) => { const target = classAgitRoute(next); onNavigate(target.name, target.params); };
    const replace = (next) => onReplace(classAgitRoute(next));

    useEffect(() => {
        if (previousMode.current === 'work' && mode === 'room') {
            restoreFocus.current = true;
        } else if (previousMode.current !== mode && mode !== 'work') {
            root.current?.scrollIntoView({ block: 'start' });
        }
        previousMode.current = mode;
    }, [mode]);
    useEffect(() => {
        if (mode !== 'room' || !restoreFocus.current || page.loading) return;
        const frame = Array.from(root.current?.querySelectorAll('[data-work-id]') || []).find((element) => element.dataset.workId === opener.current?.id);
        const wall = root.current?.querySelector('.class-agit-room__works');
        if (wall) wall.scrollLeft = opener.current?.scrollLeft || 0;
        (frame || root.current?.querySelector('h1') || root.current?.querySelector('button'))?.focus({ preventScroll: true });
        restoreFocus.current = false;
    }, [mode, page.loading, page.data]);

    const openWork = (work) => {
        opener.current = { id: work.id, scrollLeft: root.current?.querySelector('.class-agit-room__works')?.scrollLeft || 0 };
        navigate({ ...route, mode: 'work', workId: work.id, publicationNo: page.data.publication_no });
    };
    const moveRoom = (number) => replace({ ...route, mode: 'room', room: number });
    const roomData = page.data;
    const roomIndex = roomData?.rooms.findIndex((item) => item.number === room) ?? -1;
    const activeRoom = roomIndex >= 0 ? roomData?.rooms.at(roomIndex) : null;
    if (['books', 'book', 'chapter'].includes(mode)) return <StudentBooks route={route} onNavigate={onNavigate} onReplace={onReplace} onBack={onBack} api={releaseApi} />;
    return <main className="class-agit class-agit-student" ref={root}>
        <header className="class-agit-gallery__header">
            <StudentBackButton onClick={onBack} />
            <div className="class-agit-header-actions"><GuideInfoButton label="우리반 전시관 사용법 보기" onClick={() => setHelp(true)} />
                <button type="button" className="class-agit-secondary" disabled={current.loading} onClick={() => setRefresh((value) => value + 1)}>전시 다시 확인</button></div>
        </header>
        {current.error && <p className="class-agit-error" role="alert">{current.error}</p>}
        {current.loading && <p role="status">전시를 확인하고 있어요…</p>}
        {mode === 'list' ? <>
            <span className="class-agit-eyebrow">우리반 아지트</span><h1 tabIndex={-1}>우리 반의 글</h1><p>선생님이 열어 준 전시관과 서가에서 우리 반 작가들의 문장을 만나 보세요.</p>
            {/* 전시관은 선생님이 다시 꾸미면 바뀌고, 문집은 확정한 판이 그대로 남는다. 학생에게도 그 차이를 말로 알려 준다. */}
            <section className="class-agit-student-shelf" aria-labelledby="class-agit-gallery-heading">
                <h2 id="class-agit-gallery-heading">🖼 글 전시관</h2>
                <p>선생님이 고른 글을 전시실에 걸어 둔 곳이에요. 선생님이 새로 꾸미면 걸린 글도 바뀌어요.</p>
                {list.data && <div className="class-agit-student-exhibitions">{list.data.exhibitions.map((exhibition) => <button type="button" className="class-agit-exhibition-card" style={galleryCoverStyle(exhibition.theme)} key={exhibition.id} onClick={() => navigate({ exhibitionId: exhibition.id })}>
                    <small>{exhibition.publication_no}판</small><h3>{exhibition.title}</h3>{exhibition.introduction && <p>{exhibition.introduction}</p>}<span className="class-agit-cover-mark" aria-hidden="true">✦</span><strong>전시 둘러보기 ↗</strong>
                </button>)}</div>}
                {list.data?.exhibitions.length === 0 && <p className="class-agit-empty">아직 열린 전시가 없어요. 선생님이 전시를 준비하면 여기에서 만날 수 있어요.</p>}
            </section>
            <section className="class-agit-student-shelf" aria-labelledby="class-agit-books-heading">
                <h2 id="class-agit-books-heading">📚 문집 서가</h2>
                <p>우리 반의 글을 한 권으로 묶어 확정한 책이에요. 한번 나온 판은 그대로 남아서 언제든 같은 내용을 다시 읽을 수 있어요.</p>
                {books.error && <p className="class-agit-error" role="alert">{books.error}</p>}
                {books.data && <div className="class-agit-student-exhibitions">{books.data.books.map((book) => <button type="button" className="class-agit-book-cover" data-design={getBookDesign(book.design).id} style={bookCoverStyle(book.design, book.paper)} key={book.id} onClick={() => navigate({ mode: 'book', editionId: book.id })}>
                    <small>{book.number}판</small><h3>{book.title}</h3>{book.subtitle && <p>{book.subtitle}</p>}<span className="class-agit-cover-mark" aria-hidden="true">{getBookDesign(book.design).mark}</span><strong>책 펼치기 ↗</strong>
                </button>)}</div>}
                {books.data?.books.length === 0 && <p className="class-agit-empty">아직 서가에 문집이 없어요. 함께 쓴 책이 곧 찾아올 거예요.</p>}
            </section>
        </> : roomData && <>
            {mode === 'lobby' ? <div className="class-agit-lobby">
                <div className="class-agit-lobby__copy"><span className="class-agit-eyebrow">우리반 아지트 · 글 전시관</span><h1 tabIndex={-1}>{roomData.title}</h1><p>{roomData.introduction}</p>
                    <div className="class-agit-lobby__numbers"><span><b>{roomData.total_count}</b>편의 이야기</span><span><b>{roomData.rooms.length}</b>개의 전시실</span></div>
                    <ExhibitionRightsNotice /><nav className="class-agit-room-nav" aria-label="주제별 입장">{roomData.rooms.map((entry) => <button type="button" key={entry.number} onClick={() => navigate({ ...route, mode: 'room', room: entry.number })}>{entry.title || `${entry.number} 전시실`} · {entry.count}편 ↗</button>)}</nav><button type="button" className="class-agit-primary" disabled={!roomData.total_count} onClick={() => navigate({ ...route, mode: 'room', room: roomData.rooms[0]?.number })}>{EXHIBITION_RIGHTS.enter}</button>
                </div>
                <div className="class-agit-lobby-art" aria-hidden="true"><span>✦</span><p>작은 글이 모여<br />우리의 이야기가 됩니다.</p><i /></div>
            </div> : <>
                <div className="class-agit-gallery__title"><div><span className="class-agit-eyebrow">우리반 아지트 · {roomData.publication_no}판</span><h1 tabIndex={-1}>{roomData.title}</h1></div>
                    <div className="class-agit-segmented" role="group" aria-label="전시 보기 방식"><button type="button" aria-pressed={route.view === 'room'} onClick={() => replace({ ...route, view: 'room' })}>전시실 보기</button><button type="button" aria-pressed={route.view === 'list'} onClick={() => replace({ ...route, view: 'list' })}>목록 보기</button></div>
                </div>
                <nav className="class-agit-room-nav" aria-label="전시실 이동">{roomData.rooms.map((entry) => <button type="button" key={entry.number} aria-current={entry.number === room ? 'page' : undefined} onClick={() => moveRoom(entry.number)}>{entry.title || `${entry.number} 전시실`} <small>{entry.count}편</small></button>)}</nav>
                {activeRoom && <><h2>{activeRoom.title || `${room} 전시실`}</h2><p>{activeRoom.introduction}</p></>}
                {activeRoom && (route.view === 'list' ? <ol className="class-agit-work-list">{roomData.items.map((work, index) => <li key={work.id}><button type="button" data-work-id={work.id} onClick={() => openWork(work)}><span>{index + 1}</span><div><strong>{work.title}</strong><p>{work.excerpt}</p><small>{work.kindLabel} · {work.author}</small></div><b aria-hidden="true">↗</b></button></li>)}</ol>
                    : <GalleryRoom theme={roomData.theme} variant={activeRoom.variant} roomTitle={activeRoom.title} key={room} works={roomData.items} roomNumber={room} onOpen={openWork} />)}
                {roomData.total_count > 0 && !activeRoom && <p role="status">전시실 구성이 바뀌었어요. 위에서 볼 전시실을 골라 주세요.</p>}
                <footer className="class-agit-gallery__footer"><button type="button" disabled={roomIndex <= 0} onClick={() => moveRoom(roomData.rooms[roomIndex - 1].number)}>← 이전 방</button><span>{roomIndex + 1} / {roomData.rooms.length || 1} 전시실</span><button type="button" disabled={roomIndex < 0 || roomIndex >= roomData.rooms.length - 1} onClick={() => moveRoom(roomData.rooms[roomIndex + 1].number)}>다음 방 →</button></footer>
            </>}
            {!roomData.total_count && <p className="class-agit-empty">지금 읽을 수 있는 작품이 없어요. 다른 전시를 둘러보거나 나중에 다시 와 주세요.</p>}
        </>}
        {mode === 'work' && <ArtworkReader work={detail.data?.work} roomTitle={detail.data?.room_title} loading={detail.loading} error={detail.error} onClose={onBack}
            onPrevious={detail.data?.previous_id ? () => replace({ ...route, workId: detail.data.previous_id }) : undefined}
            onNext={detail.data?.next_id ? () => replace({ ...route, workId: detail.data.next_id }) : undefined} />}
        <Modal isOpen={help} onClose={() => setHelp(false)} title="우리반 전시관 사용법" maxWidth="520px"><p>전시를 골라 들어간 뒤 액자를 누르면 글을 읽을 수 있어요. 목록 보기에서도 같은 작품을 만날 수 있어요.</p><p>작품을 닫으면 보던 전시실로 돌아와요. 글자가 작으면 ‘글자 크게’를 눌러 보세요.</p></Modal>
    </main>;
}
