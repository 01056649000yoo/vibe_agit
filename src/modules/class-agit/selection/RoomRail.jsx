import { CLASS_AGIT_LIMITS as limits } from '../policy.js';

/**
 * 작품 담기 단계의 왼쪽 "전시실별 현황"(2026-10-20 — 전시실마다 어떤 글이 담겼는지 한눈에 보이게).
 * 고른 전시실은 담긴 글을 모두 펼치고, 나머지는 앞의 몇 편만 보여 준다. 누르면 그 전시실이 담을 곳이 된다.
 */
const PEEK = 3;

export default function RoomRail({ rooms, items, activeId, onPick }) {
    const byRoom = (roomId) => items.filter((item) => (item.roomId || null) === roomId);
    const unassigned = byRoom(null);
    const card = ({ id, title, index }) => {
        const works = byRoom(id);
        const active = (activeId || null) === id;
        const shown = active ? works : works.slice(0, PEEK);
        const capacity = id === null ? null : limits.worksPerRoom;
        return (
            <li key={id ?? 'unassigned'} className={`class-agit-room-card${active ? ' is-active' : ''}`}>
                <button type="button" className="class-agit-room-card__head" aria-current={active ? 'true' : undefined} onClick={() => onPick(id)}>
                    <span className="class-agit-room-card__title">{id === null ? title : `${index}. ${title}`}</span>
                    <span className="class-agit-room-card__count">{capacity ? `${works.length}/${capacity}편` : `${works.length}편`}</span>
                    {capacity && <span className="class-agit-room-card__bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (works.length / capacity) * 100)}%` }} /></span>}
                </button>
                {works.length === 0
                    ? <p className="class-agit-room-card__empty">{active ? '아직 담은 글이 없어요. 오른쪽에서 담아 보세요.' : '비어 있어요'}</p>
                    : <ol className="class-agit-room-card__works">
                        {shown.map((item) => <li key={item.sourceId || item.itemId}><strong>{item.title}</strong><small>{item.authorName}</small></li>)}
                        {!active && works.length > shown.length && <li className="class-agit-room-card__more">외 {works.length - shown.length}편</li>}
                    </ol>}
            </li>
        );
    };
    return (
        <aside className="class-agit-room-rail" aria-label="전시실별 담은 작품">
            <h3>전시실별 현황</h3>
            <ul>
                {rooms.map((entry, index) => card({ id: entry.id, title: entry.title, index: index + 1 }))}
                {unassigned.length > 0 && card({ id: null, title: '미배정', index: 0 })}
            </ul>
        </aside>
    );
}
