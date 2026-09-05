import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import { presentSource } from '../sourceContract.js';
import ArtworkReader from '../gallery/ArtworkReader.jsx';

function Consent({ onConfirm }) {
    const [checked, setChecked] = useState(false);
    return <div className="class-agit-confirmation class-agit-management-confirmation"><label><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />이 작품의 문집 수록 의사를 확인했습니다.</label>
        <Button variant="primary" type="button" disabled={!checked} onClick={onConfirm}>문집에 담기</Button></div>;
}
export default function SourcePicker({ classId, api, onAdd, onClose }) {
    const [page, setPage] = useState(null);
    const [query, setQuery] = useState('');
    const [source, setSource] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { let active = true; api.getCandidates(classId).then((data) => { if (active) setPage(data); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [api, classId]);
    const run = async (task) => { if (busy) return; setBusy(true); setError(''); try { await task(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
    return <section className="class-agit-book-picker"><header><h2>수록할 글 찾기</h2><Button variant="outline" type="button" onClick={onClose}>찾기 닫기</Button></header>
        <form onSubmit={(e) => { e.preventDefault(); run(async () => setPage(await api.getCandidates(classId, query))); }}><label>작품 제목·학생 이름<input value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} /></label><Button variant="outline" type="submit" disabled={busy}>검색</Button></form>
        {error && <p role="alert">{error}</p>}{!page && !error && <p role="status">수록 후보를 불러오고 있습니다…</p>}
        <ul className="class-agit-projects">{page?.items.map((item) => <li key={item.id}><div><strong>{item.title}</strong><p>{item.student_name}</p></div><Button variant="outline" type="button" disabled={busy} onClick={() => run(async () => setSource(await api.getSource(classId, item.id)))}>전문 확인</Button></li>)}</ul>
        {page?.has_more && <Button variant="outline" type="button" disabled={busy} onClick={() => run(async () => { const next = await api.getCandidates(classId, query, page.next_cursor); setPage(next); })}>다음 후보</Button>}
        {source && <ArtworkReader work={{ ...presentSource(source), id: source.id, author: source.student_name }} onClose={() => setSource(null)} footer={<Consent key={source.id} onConfirm={() => { try { onAdd(source); setSource(null); } catch (e) { setError(e.message); setSource(null); } }} />} />}
    </section>;
}
