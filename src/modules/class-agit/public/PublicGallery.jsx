import { useCallback, useEffect, useRef, useState } from 'react';
import { publicClassAgitApi } from './publicApi.js';
import useExhibitionExpiry from './useExhibitionExpiry.js';
import useGalleryRead from '../student/useGalleryRead.js';
import GalleryRoom from '../gallery/GalleryRoom.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import '../classAgit.css';

export default function PublicGallery({ token, api = publicClassAgitApi, isPreview = false, onExit }) {
    const [route, setRoute] = useState({ room: 0, workId: null, view: 'room' });
    const [refresh, setRefresh] = useState(0);
    const root = useRef(null);
    const opener = useRef(null);
    const historyId = useRef(crypto.randomUUID());
    const room = route.room;
    const workId = route.workId;
    const publicationNo = route.publicationNo;
    const readRoom = useCallback(() => api.read(token, room), [api, token, room]);
    const readWork = useCallback(() => api.read(token, room, workId, publicationNo), [api, token, room, workId, publicationNo]);
    const page = useGalleryRead(`public:${token}:${room}`, readRoom, !workId, refresh, true);
    const detail = useGalleryRead(`public:${token}:${publicationNo}:${workId}`, readWork, Boolean(workId));
    useEffect(() => {
        if (isPreview) return undefined;
        const id = historyId.current;
        window.history.replaceState({ publicGallery: id, room: 0, view: 'room', workId: null }, '');
        const pop = (event) => { const next = event.state; setRoute(next?.publicGallery === id ? { room: next.room, workId: next.workId, view: next.view, publicationNo: next.publicationNo } : { room: 0, workId: null, view: 'room' }); };
        window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
    }, [isPreview]);
    useEffect(() => {
        if (workId || page.loading || !opener.current) return;
        const item = Array.from(root.current?.querySelectorAll('[data-work-id]') || []).find((node) => node.dataset.workId === opener.current.id);
        const wall = root.current?.querySelector('.class-agit-room__works'); if (wall) wall.scrollLeft = opener.current.scrollLeft;
        (item || root.current?.querySelector('h1'))?.focus({ preventScroll: true }); opener.current = null;
    }, [page.loading, workId]);
    const go = (next, replace = false) => {
        if (!isPreview) window.history[replace ? 'replaceState' : 'pushState']({ ...next, publicGallery: historyId.current }, '');
        setRoute(next);
    };
    const close = () => { if (isPreview) setRoute({ ...route, workId: null }); else window.history.back(); };
    const expired = useExhibitionExpiry(detail.data || page.data);
    const data = expired ? null : page.data;
    const openWork = (work) => {
        opener.current = { id: work.id, scrollLeft: root.current?.querySelector('.class-agit-room__works')?.scrollLeft || 0 };
        go({ ...route, workId: work.id, publicationNo: data.publication_no });
    };
    return <main ref={root} className="class-agit class-agit-public">
        <header className="class-agit-gallery__header"><span className="class-agit-eyebrow">우리들의 글 전시 · 읽기 전용{isPreview ? ' 미리보기' : ''}</span><div className="class-agit-header-actions">{onExit && <button type="button" onClick={onExit}>미리보기 닫기</button>}{room > 0 && <button type="button" onClick={() => isPreview ? go({ room: 0, workId: null, view: route.view }) : window.history.back()}>전시 입구로</button>}<button type="button" disabled={page.loading} onClick={() => setRefresh((value) => value + 1)}>전시 다시 확인</button></div></header>
        {expired && <p role="status">전시 기간이 끝나 외부 공개가 종료되었습니다.</p>}{page.error && <p className="class-agit-error" role="alert">{page.error}</p>}{page.loading && <p role="status">전시를 불러오고 있습니다…</p>}
        {data && <><h1 tabIndex={-1}>{data.title}</h1>{room === 0 ? <div className="class-agit-lobby"><div><p>{data.introduction}</p><p>{data.total_count}편의 이야기 · {data.rooms.length}개의 전시실</p><button type="button" className="class-agit-primary" disabled={!data.total_count} onClick={() => go({ room: 1, workId: null, view: 'room' })}>전시관 입장하기 ↗</button></div><div className="class-agit-lobby-art" aria-hidden="true"><span>✦</span><p>작은 글이 모여<br />우리의 이야기가 됩니다.</p></div></div> : <>
            <div className="class-agit-segmented" role="group" aria-label="전시 보기 방식"><button type="button" aria-pressed={route.view === 'room'} onClick={() => go({ ...route, view: 'room' }, true)}>전시실 보기</button><button type="button" aria-pressed={route.view === 'list'} onClick={() => go({ ...route, view: 'list' }, true)}>목록 보기</button></div>
            <nav className="class-agit-room-nav" aria-label="전시실 이동">{data.rooms.map((entry) => <button type="button" key={entry.number} aria-current={room === entry.number ? 'page' : undefined} onClick={() => go({ room: entry.number, workId: null, view: route.view }, true)}>{entry.number} 전시실 · {entry.count}편</button>)}</nav>
            {route.view === 'room' ? <GalleryRoom key={room} roomNumber={room} works={data.items} onOpen={openWork} /> : <ol className="class-agit-work-list">{data.items.map((work) => <li key={work.id}><button type="button" data-work-id={work.id} onClick={() => openWork(work)}><div><strong>{work.title}</strong><p>{work.excerpt}</p><small>{work.author}</small></div></button></li>)}</ol>}
            {!data.items.length && <p>지금 읽을 수 있는 작품이 없습니다. 다른 전시실을 골라 주세요.</p>}
        </>}</>}
        {workId && !expired && <ArtworkReader work={detail.data?.work} loading={detail.loading} error={detail.error} onClose={close} />}
        <footer className="class-agit-public-footer">글을 나누는 작은 전시관 · 끄적끄적 아지트</footer>
    </main>;
}
