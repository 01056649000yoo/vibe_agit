import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { moveSelected, sortSelectedWorks, workKey } from './model.js';

export default function OrderList({ items, savedRevision, dirty, onChange, onRestore, onReadSource, onWithdraw, onFind }) {
    const [selected, setSelected] = useState([]);
    const [position, setPosition] = useState('1');
    const [grouping, setGrouping] = useState('mission');
    const [undo, setUndo] = useState(null);
    const [reading, setReading] = useState(null);
    const [error, setError] = useState('');
    const addedOrder = useRef(items.map(workKey));
    useEffect(() => { for (const item of items) if (!addedOrder.current.includes(workKey(item))) addedOrder.current.push(workKey(item)); }, [items]);
    const chosen = selected.filter((id) => items.some((item) => workKey(item) === id));
    const change = (next) => {
        setUndo({ items, revision: savedRevision, after: next }); onChange(next); setError('');
    };
    const move = (target) => { try { change(moveSelected(items, chosen, target)); } catch (reason) { setError(reason.message); } };
    const work = reading === null ? null : items.at(reading);
    return <section className="class-agit-selection-order" aria-label="담은 작품 정리">
        <div className="class-agit-selection-heading"><div><h3>담은 작품 {items.length}/{limits.maxWorks}편</h3><p>{new Set(items.map((item) => item.studentId)).size}명의 작가 · {Math.ceil(items.length / limits.worksPerRoom)}개 전시실 · 한 실에 {limits.worksPerRoom}편</p></div><Button variant="outline" type="button" onClick={onFind}>작품 더 찾기</Button></div>
        <div className="class-agit-order-tools"><label>전체 순서<select value={grouping} onChange={(event) => setGrouping(event.target.value)}><option value="mission">미션별로 모으기</option><option value="student">학생 이름순</option><option value="added">담은 순서</option></select></label><Button variant="outline" type="button" disabled={!items.length} onClick={() => change(sortSelectedWorks(items, grouping, addedOrder.current))}>전체 순서 적용</Button><Button variant="ghost" type="button" disabled={!undo || undo.revision !== savedRevision || undo.after !== items} onClick={() => { onRestore(undo.items); setUndo(null); }}>순서 변경 되돌리기</Button></div>
        <p className="class-agit-selection-hint">전체 순서 적용은 모든 작품을 바꿉니다. 저장 전에는 직전 변경을 되돌릴 수 있습니다.</p>
        <label className="class-agit-selection-check"><input type="checkbox" checked={items.length > 0 && chosen.length === items.length} disabled={!items.length} onChange={(event) => setSelected(event.target.checked ? items.map(workKey) : [])} />전체 선택 · {chosen.length}편 선택됨</label>
        {chosen.length > 0 && <div className="class-agit-order-tools" aria-label="선택 작품 이동 도구">
            <Button variant="outline" type="button" onClick={() => move(1)}>맨 앞</Button><Button variant="outline" type="button" onClick={() => move(items.length)}>맨 뒤</Button>
            <label>이동 순번<input type="number" min="1" max={items.length} value={position} onChange={(event) => setPosition(event.target.value)} /></label><Button variant="outline" type="button" onClick={() => move(Number(position))}>이 순번으로 이동</Button>
            <label>전시실 시작<select defaultValue="" onChange={(event) => { if (event.target.value) { move(Number(event.target.value)); event.target.value = ''; } }}><option value="">전시실 선택</option>{Array.from({ length: Math.ceil(items.length / limits.worksPerRoom) }, (_, index) => <option key={index} value={index * limits.worksPerRoom + 1}>{index + 1}전시실 맨 앞</option>)}</select></label>
            <Button variant="ghost" type="button" onClick={() => { change(items.filter((item) => !chosen.includes(workKey(item)))); setSelected([]); }}>초안에서 {chosen.length}편 빼기</Button>
        </div>}
        {error && <p role="alert">{error}</p>}
        <ol className="class-agit-compact-order">{items.map((item, index) => <li key={workKey(item)} data-room-start={index % limits.worksPerRoom === 0}>
            <label><input type="checkbox" aria-label={`${index + 1}번 ${item.title} 순서 선택`} checked={chosen.includes(workKey(item))} onChange={(event) => setSelected(event.target.checked ? [...chosen, workKey(item)] : chosen.filter((id) => id !== workKey(item)))} /><span>{index + 1}</span></label>
            <button type="button" className="class-agit-compact-title" onClick={() => setReading(index)}><strong>{item.title}</strong>{(item.sourceChanged || item.unavailable || item.revoked) && <small className="class-agit-error">{item.unavailable ? '원글 수록 불가' : item.revoked ? '수록 철회됨' : '원글 변경됨'}</small>}</button>
            <span className="class-agit-compact-author">{item.authorName}<small>{item.groupTitle}</small></span><span className="class-agit-room-label">{Math.floor(index / limits.worksPerRoom) + 1}전시실</span>
        </li>)}</ol>
        {!items.length && <p className="class-agit-empty">작품 찾기에서 첫 작품을 담아 주세요.</p>}
        <p className="class-agit-selection-hint">초안에서 빼기는 다음 공개판 갱신에 반영됩니다. 현재 공개판에서도 철회하려면 작품 제목을 열어 수록 철회를 선택하세요.</p>
        {work && <ArtworkReader work={{ ...work, id: workKey(work), author: work.authorName }} onClose={() => setReading(null)} footer={<div className="class-agit-management-confirmation">
            <nav aria-label="정리 작품 넘기기"><Button variant="outline" type="button" disabled={reading === 0} onClick={() => setReading((index) => index - 1)}>← 이전 작품</Button><Button variant="ghost" type="button" onClick={() => setReading(null)}>목록으로</Button><Button variant="outline" type="button" disabled={reading === items.length - 1} onClick={() => setReading((index) => index + 1)}>다음 작품 →</Button></nav>
            {onReadSource && <Button variant="outline" type="button" disabled={!work.sourceId} onClick={() => { setReading(null); onReadSource(work); }}>원글 전문 다시 확인</Button>}
            {onWithdraw && <Button variant="ghost" type="button" disabled={!work.itemId || work.revoked || dirty} onClick={() => { setReading(null); onWithdraw(work); }}>현재 공개판에서도 수록 철회</Button>}
        </div>} />}
    </section>;
}
