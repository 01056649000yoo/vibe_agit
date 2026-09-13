import { useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import useBrowsePage from '../selection/useBrowsePage.js';
import { BrowseStatus, PageControls } from '../selection/MissionList.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { collectMissionSources, describeBulkResult } from './bulkAdd.js';

/*
 * 주제(미션)째 담기.
 *
 * 문집은 대부분 "이 미션 글 다 넣기" 다. 그런데 담기 화면이 전시실 큐레이션용이라
 * 글을 한 편씩 고르게 되어 있어, 30편짜리 미션이면 체크를 서른 번 해야 했다(2026-09-14 지적).
 * 여기서는 **작품을 펼치지 않는다** — 미션 한 줄과 담기 단추뿐이다.
 */
export default function MissionBulkPicker({ classId, api, items, onAdd, onPickMission }) {
    const [input, setInput] = useState('');
    const [query, setQuery] = useState('');
    const [scope, setScope] = useState('all');
    const [skipRepresented, setSkipRepresented] = useState(false);
    const [busyMission, setBusyMission] = useState(null);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const busyRef = useRef(false);
    const state = useBrowsePage(api, 'getMissions', classId, { query, scope });
    const added = new Set(items.map((item) => item.sourceId));
    const capacity = Math.max(0, limits.anthologyWorks - items.length);

    const addMission = (mission) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusyMission(mission.id); setError(''); setMessage(''); setProgress(null);
        // 이미 담은 학생은 서버에서 거른다 — 학급 인원이라 서버 한도(100명) 안이다.
        const excludedStudents = skipRepresented
            ? [...new Set(items.map((item) => item.studentId).filter(Boolean))].sort() : [];
        collectMissionSources(api, classId, { missionId: mission.id, capacity, added, excludedStudents,
            onProgress: ({ done, total }) => setProgress({ done, total }) })
            .then(({ sources, skipped, truncated }) => {
                if (!sources.length && !skipped.length) { setMessage('이 미션에서 더 담을 글이 없습니다.'); return; }
                onAdd(sources);
                setMessage(describeBulkResult({ added: sources.length, skipped: skipped.length, truncated }));
            })
            .catch((reason) => setError(reason.message))
            .finally(() => { busyRef.current = false; setBusyMission(null); setProgress(null); });
    };

    return <section className="anthology-bulk" aria-label="주제째 담기">
        {error && <p className="class-agit-error" role="alert">{error}</p>}
        {message && <p className="anthology-bulk__message" role="status">{message}</p>}
        <form className="class-agit-selection-search" onSubmit={(event) => { event.preventDefault(); setQuery(input.trim()); }}>
            <label>미션명 찾기<input value={input} maxLength={80} placeholder="오래된 미션도 찾아보세요" onChange={(event) => setInput(event.target.value)} /></label>
            <Button variant="outline" type="submit">미션 검색</Button>
        </form>
        <div className="anthology-bulk__filters">
            <label>미션 범위<select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="all">전체 미션</option><option value="active">사용 중</option><option value="archived">보관함</option>
            </select></label>
            <label><input type="checkbox" checked={skipRepresented} onChange={(event) => setSkipRepresented(event.target.checked)} />이미 담은 학생은 빼기</label>
            <span className="anthology-bulk__capacity">남은 자리 <strong>{capacity}</strong>편 · 담음 {items.length}/{limits.anthologyWorks}편</span>
        </div>
        <BrowseStatus state={state} />
        <ul className="anthology-bulk__list">{state.page?.items.map((mission) => {
            const mine = items.filter((item) => item.missionId === mission.id).length;
            const left = Math.max(0, mission.review_count - mine);
            const working = busyMission === mission.id;
            return <li key={mission.id}>
                <div className="anthology-bulk__work">
                    <strong>{mission.title}</strong>
                    <small>{mission.format === 'poem' ? '시' : mission.format === 'prose' ? '글' : '기타 장르'}
                        {mission.created_at ? ` · ${new Date(mission.created_at).toLocaleDateString('ko-KR')}` : ''}{mission.archived ? ' · 보관함' : ''}</small>
                    <small>{mission.supported ? `담을 수 있는 글 ${left}편${mine ? ` · 이미 담음 ${mine}편` : ''}` : '문집 지원 준비 중'}</small>
                </div>
                <Button variant="primary" type="button" disabled={!mission.supported || !left || !capacity || busyMission !== null}
                    onClick={() => addMission(mission)}>
                    {working ? (progress ? `${progress.done}/${progress.total}편 확인 중…` : '글을 찾고 있습니다…')
                        : !mission.supported ? '담을 수 없음' : !left ? '다 담았습니다' : !capacity ? '자리 없음' : `${left}편 모두 담기`}
                </Button>
                <Button variant="ghost" type="button" disabled={busyMission !== null} onClick={() => onPickMission(mission)}>글 보기</Button>
            </li>;
        })}</ul>
        {state.page && !state.page.items.length && <p className="class-agit-empty">이 조건에 맞는 미션이 없습니다.</p>}
        <PageControls state={state} label="미션 목록 페이지" />
    </section>;
}
