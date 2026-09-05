import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import { presentSource } from '../sourceContract.js';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import MissionList, { BrowseStatus, PageControls } from './MissionList.jsx';
import useBrowsePage from './useBrowsePage.js';
import BulkReview from './BulkReview.jsx';
import { toggleSelection } from './model.js';
import './selection.css';

export default function SourceBrowser({ classId, api, items, maximum = limits.maxWorks, scope = '학급 전시', onAdd, onArrange, onBusyChange }) {
    const [mission, setMission] = useState(null);
    const [input, setInput] = useState('');
    const [query, setQuery] = useState('');
    const [searchAll, setSearchAll] = useState(false);
    const [unrepresented, setUnrepresented] = useState(false);
    const [selected, setSelected] = useState([]);
    const [review, setReview] = useState(null);
    const [reading, setReading] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const busyRef = useRef(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
    const added = new Set(items.map((item) => item.sourceId));
    const pending = selected.filter((item) => !added.has(item.id));
    const capacity = Math.max(0, maximum - items.length);
    const filteredMission = searchAll ? null : mission;
    const state = useBrowsePage(api, 'getCandidates', classId, { mission_id: filteredMission?.id || null, query,
        sort: filteredMission ? 'student' : 'recent', excluded_students: unrepresented ? [...new Set(items.map((item) => item.studentId).filter(Boolean))].sort() : [] });
    const run = async (task) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setError('');
        try { await task(); } catch (reason) { if (alive.current) setError(reason.message); }
        finally { busyRef.current = false; if (alive.current) setBusy(false); }
    };
    const toggle = (row) => {
        try { setSelected(toggleSelection(pending, row, capacity)); setError(''); }
        catch (reason) { setError(reason.message); }
    };
    const addSources = (sources) => {
        if (sources.length > capacity) throw new Error(`남은 자리는 ${capacity}편입니다. 선택을 줄여 주세요.`);
        onAdd(sources);
        const ids = new Set(sources.map((source) => source.id));
        setSelected((previous) => previous.filter((item) => !ids.has(item.id)));
        setReview(null); setMessage(`${sources.length}편을 초안에 담았습니다.`);
    };
    const pageRows = state.page?.items || [];
    const available = pageRows.filter((item) => !added.has(item.id));
    const pageSelected = available.length > 0 && available.every((item) => pending.some((entry) => entry.id === item.id));
    const selectPage = () => {
        try {
            let next = pending;
            for (const row of available) if (pageSelected || !next.some((item) => item.id === row.id)) next = toggleSelection(next, row, capacity);
            setSelected(next); setError('');
        } catch (reason) { setError(reason.message); }
    };
    return <section className="class-agit-source-browser" aria-label="미션별 작품 찾기">
        {error && <p className="class-agit-error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div hidden={Boolean(review)}>
            <fieldset disabled={busy} className="class-agit-selection-fieldset">
                <div className="class-agit-selection-layout">
                    <MissionList api={api} classId={classId} items={items} selected={mission} onSelect={(next) => { setMission(next); setSearchAll(false); }} />
                    <div className="class-agit-selection-results">
                        <div className="class-agit-selection-heading"><div><h3>{filteredMission?.title || '전체 미션의 글'}</h3><p>{filteredMission ? '학생 이름순' : '최근 수정순'} · 학급에 공개하고 제출·확인한 글</p></div></div>
                        <form className="class-agit-selection-search" onSubmit={(event) => { event.preventDefault(); setQuery(input.trim()); }}>
                            <label>글 제목·학생 이름<input value={input} maxLength={80} placeholder="학급 전체에서 검색할 수 있어요" onChange={(event) => setInput(event.target.value)} /></label><Button variant="outline" type="submit">글 검색</Button>
                        </form>
                        <div className="class-agit-selection-filters"><label><input type="checkbox" checked={searchAll} onChange={(event) => setSearchAll(event.target.checked)} />전체 미션에서 검색</label><label><input type="checkbox" checked={unrepresented} onChange={(event) => setUnrepresented(event.target.checked)} />아직 작품을 담지 않은 학생</label></div>
                        <BrowseStatus state={state} />
                        {state.page && <><label className="class-agit-selection-check"><input type="checkbox" checked={pageSelected} disabled={!available.length} onChange={selectPage} />이 페이지 선택 · {pageRows.length}편</label>
                            <ul className="class-agit-source-rows">{pageRows.map((row) => <li key={row.id} data-added={added.has(row.id)}>
                                <label><input type="checkbox" checked={pending.some((item) => item.id === row.id)} disabled={added.has(row.id)} onChange={() => toggle(row)} aria-label={`${row.student_name} · ${row.title} 선택`} /><span className="class-agit-source-student">{row.student_name}</span><span className="class-agit-source-title"><strong>{row.title}</strong><small>{row.excerpt || row.group_title}</small>{!filteredMission && <small>{row.group_title}</small>}</span></label>
                                <span className="class-agit-source-state">{added.has(row.id) ? '담음' : pending.some((item) => item.id === row.id) ? '선택' : ''}</span>
                                <Button variant="ghost" type="button" aria-label={`${row.title} 읽기`} onClick={() => run(async () => { const source = await api.getSource(classId, row.id); if (alive.current) setReading(source); })}>읽기</Button>
                            </li>)}</ul>{!pageRows.length && <p className="class-agit-empty">이 조건에 맞는 글이 없습니다. 미션이나 검색 조건을 바꿔 주세요.</p>}</>}
                        <PageControls state={state} label="작품 목록 페이지" />
                    </div>
                </div>
                {pending.length > 0 && <details className="class-agit-pending-selection"><summary>선택 내역 {pending.length}편 · 미션을 바꿔도 유지됩니다</summary><ul>{pending.map((row) => <li key={row.id}><span>{row.student_name} · {row.title}<small>{row.group_title}</small></span><Button variant="ghost" type="button" onClick={() => toggle(row)}>선택 해제</Button></li>)}</ul><Button variant="outline" type="button" onClick={() => setSelected([])}>선택 모두 해제</Button></details>}
                <div className="class-agit-selection-summary"><span>선택 <strong>{pending.length}</strong>편 · 담음 <strong>{items.length}/{maximum}</strong>편</span><div className="class-agit-header-actions">
                    {onArrange && <Button variant="outline" type="button" onClick={onArrange}>담은 작품 정리</Button>}
                    <Button variant="primary" type="button" disabled={!pending.length || pending.length > capacity} onClick={() => run(async () => {
                        const results = await api.getSources(classId, pending.map((item) => item.id));
                        if (!alive.current) return;
                        if (results.some((item) => !item.source)) { setReview(results); setMessage(''); }
                        else addSources(results.map((item) => item.source));
                    })}>{busy ? '작품 확인 중…' : '선택 작품 담기'}</Button></div></div>
            </fieldset>
        </div>
        {review && <BulkReview results={review} selected={pending} scope={scope} onCancel={() => setReview(null)} onAdd={addSources} />}
        {reading && <ArtworkReader work={{ ...presentSource(reading), id: reading.id, author: reading.student_name }} onClose={() => setReading(null)} footer={<Button variant="outline" type="button" onClick={() => setReading(null)}>글 목록으로</Button>} />}
    </section>;
}
