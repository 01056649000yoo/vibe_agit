import { useEffect, useRef, useState } from 'react';
import { arrangeGalleryRooms } from './roomLayout.js';
import GalleryRoom from './GalleryRoom.jsx';
import ArtworkReader from './ArtworkReader.jsx';
import '../classAgit.css';

export default function GalleryViewer({ exhibition, onExit, initialWorkId, embedded = false }) {
    const rooms = arrangeGalleryRooms(exhibition.works);
    const [inGallery, setInGallery] = useState(Boolean(initialWorkId));
    const [roomIndex, setRoomIndex] = useState(() => Math.max(0, rooms.findIndex((room) => room.works.some((work) => work.id === initialWorkId))));
    const [view, setView] = useState('room');
    const [selectedId, setSelectedId] = useState(initialWorkId || null);
    const opener = useRef(null);
    const viewer = useRef(null);
    useEffect(() => { if (!embedded) viewer.current?.scrollIntoView({ block: 'start' }); }, [inGallery, embedded]);
    useEffect(() => {
        if (selectedId) return;
        // dialog가 닫혀 배경의 inert 상태가 해제된 뒤 원래 액자에 초점을 돌린다.
        const frame = opener.current || viewer.current?.querySelector(`[data-work-id="${initialWorkId}"]`);
        frame?.focus({ preventScroll: true });
    }, [selectedId, initialWorkId]);
    const currentRoom = rooms.at(roomIndex);
    const selected = exhibition.works.find((work) => work.id === selectedId);
    const selectedIndex = exhibition.works.findIndex((work) => work.id === selectedId);
    const openWork = (work, element) => { opener.current = element; setSelectedId(work.id); };
    const closeWork = () => {
        setSelectedId(null);
        // 이전/다음 작품을 읽어도 출발했던 액자와 방으로 돌아간다.
    };
    return <section ref={viewer} className="class-agit class-agit-gallery">
        <header className="class-agit-gallery__header">
            <button type="button" className="class-agit-text-button" onClick={inGallery ? () => setInGallery(false) : onExit}>← {inGallery ? '전시 로비' : embedded && exhibition.audience === 'class' ? '작품 선택·순서' : '전시 편집으로'}</button>
            <span className="class-agit-eyebrow">{exhibition.audience === 'external' ? '외부 방문자 미리보기 · 읽기 전용' : '학생 미리보기'}</span>
        </header>
        {!inGallery ? <div className="class-agit-lobby">
            <div className="class-agit-lobby__copy"><span className="class-agit-eyebrow">우리반 아지트 · 글 전시관</span>
                <h1>{exhibition.title}</h1><p>{exhibition.introduction}</p>
                <div className="class-agit-lobby__numbers"><span><b>{exhibition.works.length}</b>편의 이야기</span><span><b>{rooms.length}</b>개의 전시실</span></div>
                <button type="button" className="class-agit-primary" disabled={!exhibition.works.length} onClick={() => setInGallery(true)}>전시관 입장하기 <span aria-hidden="true">↗</span></button>
                {!exhibition.works.length && <p>공개 범위에 맞게 선택한 작품이 아직 없습니다.</p>}
            </div>
            <div className="class-agit-lobby__window"><GalleryRoom works={exhibition.works.slice(0, 4)} onOpen={openWork} /><span>작은 발견이 모여, 한 권의 계절이 됩니다.</span></div>
        </div> : <>
            <div className="class-agit-gallery__title"><div><span className="class-agit-eyebrow">OUR LITTLE GALLERY</span><h1>{exhibition.title}</h1></div>
                <div className="class-agit-segmented" role="group" aria-label="전시 보기 방식"><button type="button" aria-pressed={view === 'room'} onClick={() => setView('room')}>전시실 보기</button><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>목록 보기</button></div>
            </div>
            <nav className="class-agit-room-nav" aria-label="전시실 이동">
                {rooms.map((room, index) => <button key={room.id} type="button" aria-current={roomIndex === index ? 'page' : undefined} onClick={() => setRoomIndex(index)}>{String(room.number).padStart(2, '0')} 전시실 <small>{room.works.length}편</small></button>)}
            </nav>
            {view === 'room' ? <GalleryRoom key={currentRoom.id} works={currentRoom.works} onOpen={openWork} roomNumber={currentRoom.number} /> : (
                <ol className="class-agit-work-list">{currentRoom.works.map((work, index) => <li key={work.id}><button type="button" onClick={(event) => openWork(work, event.currentTarget)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{work.title}</strong><p>{work.excerpt}</p><small>{work.kindLabel} · {work.author}</small></div><b aria-hidden="true">↗</b></button></li>)}</ol>
            )}
            <footer className="class-agit-gallery__footer"><button type="button" disabled={roomIndex === 0} onClick={() => setRoomIndex((index) => index - 1)}>← 이전 방</button><span>{roomIndex + 1} / {rooms.length} 전시실 · 액자를 눌러 글을 읽어 보세요.</span><button type="button" disabled={roomIndex >= rooms.length - 1} onClick={() => setRoomIndex((index) => index + 1)}>다음 방 →</button></footer>
        </>}
        {selected && <ArtworkReader work={selected} onClose={closeWork}
            onPrevious={selectedIndex > 0 ? () => setSelectedId(exhibition.works[selectedIndex - 1].id) : undefined}
            onNext={selectedIndex < exhibition.works.length - 1 ? () => setSelectedId(exhibition.works[selectedIndex + 1].id) : undefined} />}
    </section>;
}
