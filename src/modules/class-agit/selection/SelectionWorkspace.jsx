import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import SourceBrowser from './SourceBrowser.jsx';
import OrderList from './OrderList.jsx';
import { addExhibitionSources } from './model.js';
import { normalizeRoomDraft, editRooms, orderedRoomItems, assertRoomDraft } from '../rooms.js';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { getRoomVariants } from '../designs.js';

export default function SelectionWorkspace({ draft: input, savedRevision, dirty, api, onDraft, onReadSource, onWithdraw, onBusyChange }) {
    const draft = normalizeRoomDraft(input);
    const [mode, setMode] = useState('find');
    const [active, setActive] = useState(draft.rooms[0]?.id || null);
    const [error, setError] = useState('');
    const { ask, confirmDialog } = useConfirmDialog();
    const room = draft.rooms.find((entry) => entry.id === active);
    const roomId = room?.id || null;
    const items = draft.items.filter((item) => (item.roomId || null) === roomId);
    const unassigned = draft.items.filter((item) => item.roomId == null).length;
    const roomOptions = draft.rooms.map((entry) => ({ ...entry, count: draft.items.filter((item) => item.roomId === entry.id).length }));
    const change = (operation) => { const next = editRooms(draft, operation); onDraft(next); setError(''); return next; };
    const attempt = (operation) => { try { return change(operation); } catch (reason) { setError(reason.message); return null; } };
    const addRoom = (title = '') => { const next = change({ type: 'room-add', title: title.slice(0, limits.roomTitleLength) }); setActive(next.rooms.at(-1).id); };
    const replaceItems = (nextItems) => {
        const next = assertRoomDraft({ ...draft, items: [...draft.items.filter((item) => (item.roomId || null) !== roomId), ...nextItems], revision: draft.revision + 1 });
        onDraft({ ...next, items: orderedRoomItems(next) });
    };
    return <div className="class-agit-selection-workspace">
        {confirmDialog}
        <div className="class-agit-selection-heading"><strong>전시 전체 {draft.items.length}/{limits.maxWorks}편 · {draft.rooms.length}/{limits.maxRooms}개 전시실</strong><Button variant="outline" type="button" disabled={draft.rooms.length >= limits.maxRooms} onClick={() => { try { addRoom(); } catch (reason) { setError(reason.message); } }}>+ 전시실</Button></div>
        <nav className="class-agit-room-nav" aria-label="편집할 전시실">
            {roomOptions.map((entry, index) => <button key={entry.id} type="button" aria-current={roomId === entry.id ? 'page' : undefined} onClick={() => setActive(entry.id)}>{index + 1}. {entry.title}<small>{entry.count}/{limits.worksPerRoom}편</small></button>)}
            <button type="button" aria-current={!room ? 'page' : undefined} onClick={() => setActive(null)}>미배정 <small>{unassigned}편</small></button>
        </nav>
        {error && <p role="alert" className="class-agit-error">{error}</p>}
        {room ? <div className="class-agit-room-settings">
            <label>전시실 주제<input value={room.title} maxLength={limits.roomTitleLength} onChange={(event) => attempt({ type: 'room-edit', id: room.id, patch: { title: event.target.value } })} /></label>
            <label>전시실 소개<input value={room.introduction} maxLength={limits.roomIntroductionLength} onChange={(event) => attempt({ type: 'room-edit', id: room.id, patch: { introduction: event.target.value } })} /></label>
            <label>전시실 배경<select value={room.variant} onChange={(event) => attempt({ type: 'room-edit', id: room.id, patch: { variant: Number(event.target.value) } })}>{getRoomVariants(draft.theme).map((variant, index) => <option key={index} value={index}>{variant.label}</option>)}</select></label>
            <div className="class-agit-header-actions"><Button variant="ghost" type="button" disabled={draft.rooms[0].id === room.id} onClick={() => attempt({ type: 'room-move', id: room.id, direction: -1 })}>전시실 앞으로</Button><Button variant="ghost" type="button" disabled={draft.rooms.at(-1).id === room.id} onClick={() => attempt({ type: 'room-move', id: room.id, direction: 1 })}>전시실 뒤로</Button><Button variant="ghost" type="button" onClick={async () => { if (await ask({ title: '이 전시실을 삭제할까요?', body: `${items.length}편의 작품은 미배정으로 옮깁니다. 학생 원글은 유지됩니다.`, confirmLabel: '미배정으로 옮기고 삭제' })) { if (attempt({ type: 'room-delete', id: room.id })) setActive(null); } }}>전시실 삭제</Button></div>
        </div> : <p>방을 정하지 않은 작품입니다. 담은 작품 정리에서 여러 편을 골라 전시실로 이동하세요.</p>}
        <div className="class-agit-selection-modes" role="group" aria-label="작품 선택 작업">
            <Button variant={mode === 'find' ? 'primary' : 'outline'} type="button" aria-pressed={mode === 'find'} onClick={() => setMode('find')}>작품 찾기</Button>
            <Button variant={mode === 'order' ? 'primary' : 'outline'} type="button" aria-pressed={mode === 'order'} onClick={() => setMode('order')}>담은 작품 정리 · {items.length}편</Button>
        </div>
        <div hidden={mode !== 'find'}><SourceBrowser classId={draft.classId} api={api} items={draft.items}
            destination={room?.title || '미배정'} remaining={room ? limits.worksPerRoom - items.length : limits.maxWorks - draft.items.length}
            onCreateRoom={draft.rooms.length < limits.maxRooms ? addRoom : undefined}
            onAdd={(sources) => onDraft(addExhibitionSources(draft, sources, roomId))} onArrange={() => setMode('order')} onBusyChange={onBusyChange} /></div>
        <div hidden={mode !== 'order'}><OrderList key={roomId || 'unassigned'} items={items} roomTitle={room?.title || '미배정'} roomOptions={roomOptions}
            onAssign={(sourceIds, target) => change({ type: 'room-assign', sourceIds, roomId: target })}
            savedRevision={savedRevision} dirty={dirty} onChange={replaceItems} onRestore={replaceItems}
            onFind={() => setMode('find')} onReadSource={onReadSource} onWithdraw={onWithdraw} /></div>
    </div>;
}
