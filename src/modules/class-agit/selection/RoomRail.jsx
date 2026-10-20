import { CLASS_AGIT_LIMITS as limits } from '../policy.js';

/**
 * 작품 담기 단계의 왼쪽 "전시실별 현황".
 *
 * 전시실마다 **어떤 주제(미션)의 글이 몇 편 담겼는지**만 보여 준다(2026-10-20 — 글 제목을 모두 늘어놓으면
 * 정신이 없다는 지적). 글 하나하나는 `순서·이동 정리`에서 본다. 카드를 누르면 그 전시실이 담을 곳이 된다.
 */
const MAX_TOPICS = 5;

const topicsOf = (works) => {
    const byTopic = new Map();
    for (const item of works) {
        const key = item.missionId || item.groupTitle || '기타';
        const entry = byTopic.get(key) || { title: item.groupTitle || '주제 없음', count: 0 };
        entry.count += 1;
        byTopic.set(key, entry);
    }
    return [...byTopic.values()];
};

export default function RoomRail({ rooms, items, activeId, onPick }) {
    const byRoom = (roomId) => items.filter((item) => (item.roomId || null) === roomId);
    const unassigned = byRoom(null);
    const card = ({ id, title, index }) => {
        const works = byRoom(id);
        const topics = topicsOf(works);
        const shown = topics.slice(0, MAX_TOPICS);
        const active = (activeId || null) === id;
        const capacity = id === null ? null : limits.worksPerRoom;
        return (
            <li key={id ?? 'unassigned'} className={`class-agit-room-card${active ? ' is-active' : ''}`}>
                <button type="button" className="class-agit-room-card__head" aria-current={active ? 'true' : undefined} onClick={() => onPick(id)}>
                    <span className="class-agit-room-card__title">{id === null ? title : `${index}. ${title}`}</span>
                    <span className="class-agit-room-card__count"><b>{works.length}</b>{capacity ? `/${capacity}편` : '편'}</span>
                    {capacity && <span className="class-agit-room-card__bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (works.length / capacity) * 100)}%` }} /></span>}
                </button>
                {works.length === 0
                    ? <p className="class-agit-room-card__empty">{active ? '아직 담은 주제가 없어요. 오른쪽에서 담아 보세요.' : '비어 있어요'}</p>
                    : <ul className="class-agit-room-card__topics">
                        {shown.map((topic) => <li key={topic.title}><span>{topic.title}</span><b>{topic.count}편</b></li>)}
                        {topics.length > shown.length && <li className="class-agit-room-card__more">외 {topics.length - shown.length}개 주제</li>}
                    </ul>}
            </li>
        );
    };
    return (
        <aside className="class-agit-room-rail" aria-label="전시실별 담은 주제">
            <h3>전시실별 현황</h3>
            <ul>
                {rooms.map((entry, index) => card({ id: entry.id, title: entry.title, index: index + 1 }))}
                {unassigned.length > 0 && card({ id: null, title: '미배정', index: 0 })}
            </ul>
        </aside>
    );
}
