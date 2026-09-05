import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import GalleryRoom from '../gallery/GalleryRoom.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';

export default function PublishedExhibition({ classId, exhibitionId, api, onExit }) {
    const [room, setRoom] = useState(1);
    const [page, setPage] = useState(null);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let active = true;
        api.getPublication(classId, exhibitionId, room).then((result) => {
            if (!active) return;
            if (room > result.room_count) { setRoom(result.room_count); return; }
            setPage(result); setError('');
        }).catch((reason) => { if (active) { setPage(null); setError(reason.message); } });
        return () => { active = false; };
    }, [api, classId, exhibitionId, room, reload]);
    const move = (next) => { setPage(null); setSelected(null); setRoom(next); };
    return <section className="class-agit">
        <div className="class-agit-live-toolbar"><Button type="button" variant="ghost" onClick={onExit}>← 전시 편집으로</Button>
            <strong>저장된 학급 공개판</strong><Button type="button" variant="outline" onClick={() => { setPage(null); setReload((n) => n + 1); }}>공개 상태 다시 확인</Button></div>
        {error && <p className="class-agit-error" role="alert">{error}</p>}
        {!page && !error && <p role="status">공개판을 확인하고 있습니다…</p>}
        {page && <><h1>{page.exhibition.title}</h1><p>{page.exhibition.introduction}</p>
            <div className="class-agit-status">{page.publication_no}판 · {page.total_count}편 공개 중{page.blocked_count ? ` · 열람 중단 ${page.blocked_count}편` : ''}</div>
            {page.total_count ? <GalleryRoom works={page.exhibition.works} roomNumber={room} onOpen={setSelected} />
                : <p className="class-agit-empty">지금 볼 수 있는 작품이 없습니다. 작품의 공개 상태를 확인하고 있습니다.</p>}
            <nav className="class-agit-gallery__footer" aria-label="공개판 전시실 이동"><button type="button" disabled={room <= 1} onClick={() => move(room - 1)}>← 이전 전시실</button><span>{room} / {page.room_count} 전시실</span><button type="button" disabled={room >= page.room_count} onClick={() => move(room + 1)}>다음 전시실 →</button></nav>
        </>}
        {selected && <ArtworkReader work={selected} onClose={() => setSelected(null)} />}
    </section>;
}
