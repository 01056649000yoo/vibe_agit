import { useState } from 'react';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { hasBlockedShareWorks, moveShareWork } from './sharingPolicy.js';

export default function ShareWorkTable({ draft, onChange, disabled, onError }) {
    const [query, setQuery] = useState('');
    const [topic, setTopic] = useState('all');
    const updateItem = (id, patch) => onChange({ ...draft, items: draft.items.map((item) => item.itemId === id ? { ...item, ...patch } : item) });
    const search = query.trim().toLocaleLowerCase('ko-KR');
    const groups = [...draft.rooms, ...(draft.items.some((item) => !item.roomId) ? [{ id: null, title: '미배정' }] : [])];
    const visible = groups.filter((room) => topic === 'all' || room.id === topic).map((room) => ({ ...room,
        works: draft.items.filter((item) => item.roomId === room.id && (!search || `${item.title} ${item.author} ${room.title}`.toLocaleLowerCase('ko-KR').includes(search))),
        count: draft.items.filter((item) => item.roomId === room.id).length,
    }));
    return <section className="class-agit-share-works" aria-label="주제별 공개 작품 편집">
        <div className="class-agit-share-filters"><label>작품 찾기<input type="search" placeholder="제목 · 지은이 · 주제" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <label>주제별 보기<select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="all">전체 주제 · {draft.items.length}편</option>{draft.rooms.map((room) => <option key={room.id} value={room.id}>{room.title} · {draft.items.filter((item) => item.roomId === room.id).length}편</option>)}</select></label></div>
        <p>제목·지은이·주제를 수정한 뒤 공개본을 발행하면 반영됩니다. 학생 원글과 학급 전시는 바뀌지 않습니다.</p>
        <fieldset disabled={disabled} className="class-agit-share-work-groups"><legend className="sr-only">공개 작품과 주제 수정</legend>
            {visible.map((room) => <section className="class-agit-share-topic" key={room.id || 'unassigned'}>
                <div className="class-agit-share-topic-heading">{room.id ? <label><span>주제</span><input aria-label={`${room.title || '전시실'} 주제 이름`} value={room.title} maxLength={limits.roomTitleLength} onChange={(e) => onChange({ ...draft, rooms: draft.rooms.map((r) => r.id === room.id ? { ...r, title: e.target.value } : r) })} /></label> : <h3>미배정</h3>}<span>{room.count} / {limits.worksPerRoom}편</span></div>
                <div className="class-agit-share-table-scroll"><table><caption className="sr-only">{room.title} 작품 목록</caption><thead><tr><th scope="col">번호</th><th scope="col">작품 제목</th><th scope="col">지은이</th><th scope="col">전시 주제</th></tr></thead><tbody>
                    {room.works.map((item, index) => <tr key={item.itemId}><td>{index + 1}</td><td><input aria-label={`${item.title || '작품'} 제목`} value={item.title} maxLength={limits.titleLength} onChange={(e) => updateItem(item.itemId, { title: e.target.value })} />{hasBlockedShareWorks([item]) && <small className="class-agit-error">원글을 다시 확인해 주세요.</small>}</td>
                        <td><input aria-label={`${item.title || '작품'} 지은이`} value={item.author} maxLength={limits.authorLength} onChange={(e) => updateItem(item.itemId, { author: e.target.value })} /></td>
                        <td><select aria-label={`${item.title || '작품'} 전시 주제`} value={item.roomId || ''} onChange={(e) => { try { onChange(moveShareWork(draft, item.itemId, e.target.value)); } catch (error) { onError(error.message); } }}>{!item.roomId && <option value="">미배정</option>}{draft.rooms.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></td></tr>)}
                </tbody></table></div>{!room.works.length && <p>{search ? '검색 결과가 없습니다.' : '아직 담은 작품이 없습니다.'}</p>}
            </section>)}
        </fieldset>
    </section>;
}
