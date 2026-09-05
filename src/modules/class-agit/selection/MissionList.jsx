import { useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import useBrowsePage from './useBrowsePage.js';

export function PageControls({ state, label }) {
    return <nav className="class-agit-selection-pages" aria-label={label}>
        <Button variant="ghost" type="button" disabled={state.loading || state.index === 0} onClick={state.previous}>이전</Button>
        <span>{state.index + 1}쪽</span><Button variant="ghost" type="button" disabled={state.loading || !state.page?.has_more} onClick={state.next}>다음</Button>
    </nav>;
}
export function BrowseStatus({ state }) {
    return state.loading ? <p role="status">목록을 불러오고 있습니다…</p> : state.error ? <div role="alert">{state.error}<Button variant="outline" type="button" onClick={state.reload}>다시 불러오기</Button></div> : null;
}
export default function MissionList({ api, classId, selected, onSelect, items }) {
    const rail = useRef(null);
    const choose = (mission) => { onSelect(mission); if (rail.current?.parentElement.clientWidth <= 740) rail.current.open = false; };
    const [input, setInput] = useState('');
    const [query, setQuery] = useState('');
    const [scope, setScope] = useState('all');
    const state = useBrowsePage(api, 'getMissions', classId, { query, scope });
    return <details ref={rail} className="class-agit-mission-rail" open>
        <summary>미션 선택 · {selected?.title || '전체 미션'}</summary>
        <form className="class-agit-selection-search" onSubmit={(event) => { event.preventDefault(); setQuery(input.trim()); }}>
            <label>미션명 찾기<input value={input} maxLength={80} placeholder="오래된 미션도 찾아보세요" onChange={(event) => setInput(event.target.value)} /></label>
            <Button variant="outline" type="submit">미션 검색</Button>
        </form>
        <label>미션 범위<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">전체 미션</option><option value="active">사용 중</option><option value="archived">보관함</option></select></label>
        <Button variant={!selected ? 'primary' : 'ghost'} type="button" aria-pressed={!selected} onClick={() => choose(null)}>전체 미션에서 글 찾기</Button>
        <BrowseStatus state={state} />
        <ul className="class-agit-mission-list">{state.page?.items.map((mission) => <li key={mission.id}>
            <button type="button" aria-pressed={selected?.id === mission.id} disabled={!mission.supported} onClick={() => choose(mission)}>
                <strong>{mission.title}</strong>
                <small>{mission.format === 'poem' ? '시' : mission.format === 'prose' ? '글' : '기타 장르'} · {mission.created_at ? new Date(mission.created_at).toLocaleDateString('ko-KR') : '등록일 없음'}{mission.archived ? ' · 보관함' : ''}</small>
                <span>{mission.supported ? `검토할 글 ${mission.review_count}편 · 담음 ${items.filter((item) => item.missionId === mission.id).length}편` : '전시 지원 준비 중'}</span>
            </button>
        </li>)}</ul>
        {state.page && !state.page.items.length && <p>이 조건에 맞는 미션이 없습니다.</p>}
        <PageControls state={state} label="미션 목록 페이지" />
    </details>;
}
