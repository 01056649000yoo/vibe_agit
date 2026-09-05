import { useCallback, useEffect, useRef, useState } from 'react';
import StudentBackButton from '../../../components/student/StudentBackButton.jsx';
import GuideInfoButton from '../../../components/common/GuideInfoButton.jsx';
import Modal from '../../../components/common/Modal.jsx';
import { classAgitStudentApi } from '../api/studentApi.js';
import { classAgitRoute, normalizeClassAgitParams } from './navigation.js';
import useGalleryRead from './useGalleryRead.js';
import GalleryRoom from '../gallery/GalleryRoom.jsx';
import StudentBooks from '../anthology/StudentBooks.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import '../classAgit.css';

export default function ClassAgitStudentEntry({ params, onNavigate, onReplace, onBack, api = classAgitStudentApi, releaseApi }) {
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
    const list = useGalleryRead('exhibitions', readList, mode === 'list', refresh);
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
    const activeRoom = roomData?.rooms.find((item) => item.number === room);
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
            <span className="class-agit-eyebrow">우리반 아지트</span><h1 tabIndex={-1}>우리 반의 글 전시</h1><p>우리 반 작가들의 문장을 천천히 만나 보세요.</p><button type="button" className="class-agit-primary" onClick={() => navigate({ mode: 'books' })}>우리 반 문집 서가 ↗</button>
            {list.data && <div className="class-agit-student-exhibitions">{list.data.exhibitions.map((exhibition) => <button type="button" className="class-agit-exhibition-card" key={exhibition.id} onClick={() => navigate({ exhibitionId: exhibition.id })}>
                <span aria-hidden="true">✦</span><small>{exhibition.publication_no}판</small><h2>{exhibition.title}</h2><p>{exhibition.introduction}</p><strong>전시 둘러보기 ↗</strong>
            </button>)}</div>}
            {list.data?.exhibitions.length === 0 && <p className="class-agit-empty">아직 열린 전시가 없어요. 선생님이 전시를 준비하면 여기에서 만날 수 있어요.</p>}
        </> : roomData && <>
            {mode === 'lobby' ? <div className="class-agit-lobby">
                <div className="class-agit-lobby__copy"><span className="class-agit-eyebrow">우리반 아지트 · 글 전시관</span><h1 tabIndex={-1}>{roomData.title}</h1><p>{roomData.introduction}</p>
                    <div className="class-agit-lobby__numbers"><span><b>{roomData.total_count}</b>편의 이야기</span><span><b>{roomData.rooms.length}</b>개의 전시실</span></div>
                    <button type="button" className="class-agit-primary" disabled={!roomData.total_count} onClick={() => navigate({ ...route, mode: 'room', room: 1 })}>전시관 입장하기 ↗</button>
                </div>
                <div className="class-agit-lobby-art" aria-hidden="true"><span>✦</span><p>작은 글이 모여<br />우리의 이야기가 됩니다.</p><i /></div>
            </div> : <>
                <div className="class-agit-gallery__title"><div><span className="class-agit-eyebrow">우리반 아지트 · {roomData.publication_no}판</span><h1 tabIndex={-1}>{roomData.title}</h1></div>
                    <div className="class-agit-segmented" role="group" aria-label="전시 보기 방식"><button type="button" aria-pressed={route.view === 'room'} onClick={() => replace({ ...route, view: 'room' })}>전시실 보기</button><button type="button" aria-pressed={route.view === 'list'} onClick={() => replace({ ...route, view: 'list' })}>목록 보기</button></div>
                </div>
                <nav className="class-agit-room-nav" aria-label="전시실 이동">{roomData.rooms.map((entry) => <button type="button" key={entry.number} aria-current={entry.number === room ? 'page' : undefined} onClick={() => moveRoom(entry.number)}>{entry.number} 전시실 <small>{entry.count}편</small></button>)}</nav>
                {activeRoom && (route.view === 'list' ? <ol className="class-agit-work-list">{roomData.items.map((work, index) => <li key={work.id}><button type="button" data-work-id={work.id} onClick={() => openWork(work)}><span>{index + 1}</span><div><strong>{work.title}</strong><p>{work.excerpt}</p><small>{work.kindLabel} · {work.author}</small></div><b aria-hidden="true">↗</b></button></li>)}</ol>
                    : <GalleryRoom key={room} works={roomData.items} roomNumber={room} onOpen={openWork} />)}
                {roomData.total_count > 0 && !activeRoom && <p role="status">전시실 구성이 바뀌었어요. 위에서 볼 전시실을 골라 주세요.</p>}
                <footer className="class-agit-gallery__footer"><button type="button" disabled={room <= 1} onClick={() => moveRoom(room - 1)}>← 이전 방</button><span>{room} / {roomData.rooms.length || 1} 전시실</span><button type="button" disabled={room >= roomData.rooms.length} onClick={() => moveRoom(room + 1)}>다음 방 →</button></footer>
            </>}
            {!roomData.total_count && <p className="class-agit-empty">지금 읽을 수 있는 작품이 없어요. 다른 전시를 둘러보거나 나중에 다시 와 주세요.</p>}
        </>}
        {mode === 'work' && <ArtworkReader work={detail.data?.work} loading={detail.loading} error={detail.error} onClose={onBack}
            onPrevious={detail.data?.previous_id ? () => replace({ ...route, workId: detail.data.previous_id }) : undefined}
            onNext={detail.data?.next_id ? () => replace({ ...route, workId: detail.data.next_id }) : undefined} />}
        <Modal isOpen={help} onClose={() => setHelp(false)} title="우리반 전시관 사용법" maxWidth="520px"><p>전시를 골라 들어간 뒤 액자를 누르면 글을 읽을 수 있어요. 목록 보기에서도 같은 작품을 만날 수 있어요.</p><p>작품을 닫으면 보던 전시실로 돌아와요. 글자가 작으면 ‘글자 크게’를 눌러 보세요.</p></Modal>
    </main>;
}
