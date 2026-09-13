import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import SourceBrowser from './SourceBrowser.jsx';
import MissionBulkPicker from './MissionBulkPicker.jsx';
import OrderList from './OrderList.jsx';
import { addExhibitionSources } from './model.js';
import { normalizeRoomDraft, editRooms, orderedRoomItems, assertRoomDraft } from '../rooms.js';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { getRoomVariants } from '../designs.js';

export default function SelectionWorkspace({ draft: input, savedRevision, dirty, api, onDraft, onReadSource, onWithdraw, onBusyChange }) {
    const draft = normalizeRoomDraft(input);
    const [mode, setMode] = useState('find');
    // 담는 방법. 주제째 담기가 기본이다 — 전시실 하나가 미션 하나인 경우가 흔하다.
    const [way, setWay] = useState('mission');
    const [startMission, setStartMission] = useState(null);
    const [active, setActive] = useState(draft.rooms[0]?.id || null);
    const [error, setError] = useState('');
    const { ask, confirmDialog } = useConfirmDialog();
    const room = draft.rooms.find((entry) => entry.id === active);
    const roomId = room?.id || null;
    const items = draft.items.filter((item) => (item.roomId || null) === roomId);
    const unassigned = draft.items.filter((item) => item.roomId == null).length;
    const roomOptions = draft.rooms.map((entry) => ({ ...entry, count: draft.items.filter((item) => item.roomId === entry.id).length }));
    // 지금 자리에 남은 수 — 전시실이면 그 방의 20편, 미배정이면 전시 전체 120편 기준이다.
    const remaining = room ? limits.worksPerRoom - items.length : limits.maxWorks - draft.items.length;
    const change = (operation) => { const next = editRooms(draft, operation); onDraft(next); setError(''); return next; };
    const attempt = (operation) => { try { return change(operation); } catch (reason) { setError(reason.message); return null; } };
    const addRoom = (title = '') => { const next = change({ type: 'room-add', title: title.slice(0, limits.roomTitleLength) }); setActive(next.rooms.at(-1).id); };
    /*
     * 여러 편을 한꺼번에 담는다. `addExhibitionSources` 는 **한 번에 50편**까지라
     * 미배정처럼 자리가 넓은 곳에서는 끊어서 넣는다 — 자리를 50으로 줄이면 덜 담긴다.
     */
    const addSources = (base, sources, target) => {
        let next = base;
        for (let at = 0; at < sources.length; at += limits.selectionBatch) {
            next = addExhibitionSources(next, sources.slice(at, at + limits.selectionBatch), target);
        }
        return next;
    };
    // 미션 이름으로 전시실을 만들고 그 방에 담는다. 전시실은 20편이라 학급 미션이 한 방에 다 들어가지 않는다.
    const addToNewRoom = (sources, mission) => {
        const created = editRooms(draft, { type: 'room-add', title: String(mission.title || '').slice(0, limits.roomTitleLength) });
        const room = created.rooms.at(-1);
        onDraft(addSources(created, sources, room.id));
        setActive(room.id); setError('');
    };
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
        <div hidden={mode !== 'find'}>
            <div className="anthology-ways" role="group" aria-label="담는 방법">
                <Button variant={way === 'mission' ? 'primary' : 'outline'} type="button" aria-pressed={way === 'mission'}
                    onClick={() => { setWay('mission'); setStartMission(null); }}>주제째 담기</Button>
                <Button variant={way === 'work' ? 'primary' : 'outline'} type="button" aria-pressed={way === 'work'}
                    onClick={() => setWay('work')}>작품 골라 담기</Button>
                <p className="anthology-ways__detail">{way === 'mission'
                    ? '미션을 고르면 그 미션의 글을 한 번에 담습니다. 전시실 하나에는 20편까지 들어갑니다.'
                    : '글을 하나씩 보고 고릅니다.'}</p>
            </div>
            {way === 'mission'
                ? <MissionBulkPicker classId={draft.classId} api={api} items={draft.items}
                    capacity={remaining}
                    capacityNote={`${room ? `${room.title} 전시실` : '미배정'}에 남은 자리 ${remaining}편 · 전시 전체 ${draft.items.length}/${limits.maxWorks}편`}
                    addLabel={(count) => `${room ? '이 전시실' : '미배정'}에 ${count}편 담기`}
                    onAdd={(sources) => { try { onDraft(addSources(draft, sources, roomId)); setError(''); } catch (reason) { setError(reason.message); } }}
                    newRoom={draft.rooms.length < limits.maxRooms ? {
                        capacity: Math.min(limits.worksPerRoom, limits.maxWorks - draft.items.length),
                        disabled: draft.items.length >= limits.maxWorks,
                        label: (count) => `새 전시실 만들어 ${count}편 담기`,
                        onAdd: (sources, mission) => { try { addToNewRoom(sources, mission); } catch (reason) { setError(reason.message); } },
                    } : undefined}
                    onPickMission={(mission) => { setStartMission(mission); setWay('work'); }} />
                : <SourceBrowser classId={draft.classId} api={api} items={draft.items}
                    destination={room?.title || '미배정'} remaining={remaining} initialMission={startMission}
                    onCreateRoom={draft.rooms.length < limits.maxRooms ? addRoom : undefined}
                    onAdd={(sources) => onDraft(addExhibitionSources(draft, sources, roomId))} onArrange={() => setMode('order')} onBusyChange={onBusyChange} />}
        </div>
        <div hidden={mode !== 'order'}><OrderList key={roomId || 'unassigned'} items={items} roomTitle={room?.title || '미배정'} roomOptions={roomOptions}
            onAssign={(sourceIds, target) => change({ type: 'room-assign', sourceIds, roomId: target })}
            savedRevision={savedRevision} dirty={dirty} onChange={replaceItems} onRestore={replaceItems}
            onFind={() => setMode('find')} onReadSource={onReadSource} onWithdraw={onWithdraw} /></div>
    </div>;
}
