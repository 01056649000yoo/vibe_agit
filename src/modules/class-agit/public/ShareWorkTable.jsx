import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import Modal from '../../../components/common/Modal.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { hasBlockedShareWorks, moveShareWork, moveShareWorkOrder } from './sharingPolicy.js';

const UNASSIGNED = '__unassigned';

export default function ShareWorkTable({ draft, onChange, disabled, onError }) {
    const [openKey, setOpenKey] = useState(null);
    const [query, setQuery] = useState('');
    const search = query.trim().toLocaleLowerCase('ko-KR');
    const groups = [...draft.rooms, ...(draft.items.some((item) => !item.roomId) ? [{ id: null, title: '미배정' }] : [])]
        .map((room) => {
            const works = draft.items.filter((item) => (item.roomId ?? null) === room.id);
            return { ...room, key: room.id || UNASSIGNED, works,
                matched: search ? works.filter((item) => `${item.title} ${item.author} ${room.title}`.toLocaleLowerCase('ko-KR').includes(search)) : works };
        });
    const open = groups.find((room) => room.key === openKey) || null;
    const apply = (next) => { onChange(next); onError(''); };
    const attempt = (build) => { try { apply(build()); } catch (reason) { onError(reason.message); } };
    const updateItem = (id, patch) => apply({ ...draft, items: draft.items.map((item) => item.itemId === id ? { ...item, ...patch } : item) });
    const found = search ? groups.reduce((total, room) => total + room.matched.length, 0) : draft.items.length;
    return <section className="class-agit-share-works" aria-label="주제별 공개 작품 편집">
        <div className="class-agit-share-filters"><label>작품 찾기<input type="search" placeholder="제목 · 지은이 · 주제" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <p className="class-agit-share-found">{search ? `찾은 작품 ${found}편` : `전체 ${draft.items.length}편 · ${draft.rooms.length}개 전시실`}</p></div>
        <p>전시실 카드를 누르면 작품 제목·지은이를 고치고 순서를 바꿀 수 있습니다. 학생 원글과 학급 전시는 바뀌지 않습니다.</p>
        <ul className="class-agit-share-room-cards">
            {groups.map((room, index) => <li key={room.key}>
                <button type="button" className="class-agit-share-room-card" aria-haspopup="dialog" onClick={() => setOpenKey(room.key)}>
                    <span className="class-agit-share-room-no">{room.id ? `${index + 1} 전시실` : '미배정'}</span>
                    <strong>{room.title}</strong>
                    <span className="class-agit-share-room-count">{room.works.length} / {limits.worksPerRoom}편</span>
                    <small className="class-agit-share-room-peek">{room.works.length
                        ? `${room.works.slice(0, 3).map((item) => item.title).join(' · ')}${room.works.length > 3 ? ` 외 ${room.works.length - 3}편` : ''}`
                        : '아직 담은 작품이 없습니다.'}</small>
                    {search && <small className="class-agit-share-room-hit">찾은 작품 {room.matched.length}편</small>}
                    {hasBlockedShareWorks(room.works) && <small className="class-agit-error">확인이 필요한 작품이 있습니다.</small>}
                    <span className="class-agit-share-room-open">작품 확인 · 순서 조절 →</span>
                </button>
            </li>)}
        </ul>
        <Modal isOpen={!!open} onClose={() => setOpenKey(null)} title={open ? `${open.title} · ${open.works.length}편` : ''} maxWidth="880px">
            {open && <fieldset disabled={disabled} className="class-agit-share-room-editor">
                <legend className="sr-only">{open.title} 작품과 주제 수정</legend>
                {open.id ? <label className="class-agit-share-room-title">전시 주제<input value={open.title} maxLength={limits.roomTitleLength}
                    onChange={(event) => apply({ ...draft, rooms: draft.rooms.map((room) => room.id === open.id ? { ...room, title: event.target.value } : room) })} /></label>
                    : <p>전시실을 정하지 않은 작품입니다. 전시 주제를 골라 옮겨 주세요.</p>}
                <div className="class-agit-share-table-scroll"><table>
                    <caption className="sr-only">{open.title} 작품 목록</caption>
                    <thead><tr><th scope="col">순서</th><th scope="col">작품 제목</th><th scope="col">지은이</th><th scope="col">전시 주제</th></tr></thead>
                    <tbody>{open.works.map((item, index) => <tr key={item.itemId}>
                        <td className="class-agit-share-order"><span>{index + 1}</span>
                            <Button variant="ghost" type="button" aria-label={`${item.title || '작품'} 앞으로`} disabled={index === 0} onClick={() => apply(moveShareWorkOrder(draft, item.itemId, index))}>▲</Button>
                            <Button variant="ghost" type="button" aria-label={`${item.title || '작품'} 뒤로`} disabled={index === open.works.length - 1} onClick={() => apply(moveShareWorkOrder(draft, item.itemId, index + 2))}>▼</Button></td>
                        <td><input aria-label={`${item.title || '작품'} 제목`} value={item.title} maxLength={limits.titleLength} onChange={(event) => updateItem(item.itemId, { title: event.target.value })} />
                            {hasBlockedShareWorks([item]) && <small className="class-agit-error">원글을 다시 확인해 주세요.</small>}</td>
                        <td><input aria-label={`${item.title || '작품'} 지은이`} value={item.author} maxLength={limits.authorLength} onChange={(event) => updateItem(item.itemId, { author: event.target.value })} /></td>
                        <td><select aria-label={`${item.title || '작품'} 전시 주제`} value={item.roomId || ''} onChange={(event) => attempt(() => moveShareWork(draft, item.itemId, event.target.value))}>
                            {!item.roomId && <option value="">미배정</option>}
                            {draft.rooms.map((room) => <option key={room.id} value={room.id}>{room.title}</option>)}</select></td>
                    </tr>)}</tbody>
                </table></div>
                {!open.works.length && <p>이 전시실에는 담은 작품이 없습니다.</p>}
                <p className="class-agit-share-room-note">순서는 이 전시실 안에서만 바뀝니다. 공개 순번은 전시실 차례대로 다시 매깁니다.</p>
            </fieldset>}
        </Modal>
    </section>;
}
