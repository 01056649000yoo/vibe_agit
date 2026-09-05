import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import { presentSource } from '../sourceContract.js';

export default function BulkReview({ results, selected, scope, onAdd, onCancel }) {
    const [confirmed, setConfirmed] = useState([]);
    const [reading, setReading] = useState(null);
    const [error, setError] = useState('');
    const valid = results.filter((item) => item.source);
    const all = valid.length > 0 && valid.every((item) => confirmed.includes(item.id));
    const change = (id, checked) => setConfirmed((previous) => checked ? [...new Set([...previous, id])] : previous.filter((value) => value !== id));
    const source = reading === null ? null : valid.at(reading)?.source;
    return <section className="class-agit-bulk-review" aria-label={`${scope} 수록 확인`}>
        <div className="class-agit-selection-heading"><div><h3>선택한 {results.length}편의 수록 의사를 확인해 주세요</h3><p>{scope} 수록 확인입니다. 외부 공개는 별도로 확인합니다.</p></div><Button variant="ghost" type="button" onClick={onCancel}>선택 화면으로</Button></div>
        <label className="class-agit-selection-check"><input type="checkbox" checked={all} disabled={!valid.length} onChange={(event) => setConfirmed(event.target.checked ? valid.map((item) => item.id) : [])} />문제없는 {valid.length}편의 {scope} 수록 의사를 모두 확인했습니다.</label>
        <ul className="class-agit-review-list">{results.map((item) => {
            const row = item.source || selected.find((entry) => entry.id === item.id);
            return <li key={item.id}><label><input type="checkbox" disabled={!item.source} checked={confirmed.includes(item.id)} onChange={(event) => change(item.id, event.target.checked)} /><span><strong>{row?.title || '선택 작품'}</strong><small>{row?.student_name} · {row?.group_title}</small>{item.reason && <span className="class-agit-error">{item.reason}</span>}</span></label>
                {item.source && <Button variant="outline" type="button" onClick={() => setReading(valid.findIndex((entry) => entry.id === item.id))}>읽기</Button>}</li>;
        })}</ul>
        {error && <p role="alert">{error}</p>}
        <div className="class-agit-selection-summary"><span>확인 {confirmed.length}/{valid.length}편{valid.length !== results.length && ` · 수록 불가 ${results.length - valid.length}편`}</span>
            <Button variant="primary" type="button" disabled={!confirmed.length} onClick={() => {
                try { onAdd(valid.filter((item) => confirmed.includes(item.id)).map((item) => item.source)); } catch (reason) { setError(reason.message); }
            }}>{confirmed.length < valid.length ? `확인한 ${confirmed.length}편만 담기` : valid.length !== results.length ? `문제없는 ${valid.length}편만 담기` : `확인한 ${valid.length}편 담기`}</Button></div>
        {source && <ArtworkReader work={{ ...presentSource(source), id: source.id, author: source.student_name }} onClose={() => setReading(null)} footer={<div className="class-agit-management-confirmation">
            <label><input type="checkbox" checked={confirmed.includes(source.id)} onChange={(event) => change(source.id, event.target.checked)} />이 작품의 {scope} 수록 의사를 확인했습니다.</label>
            <nav aria-label="검토 작품 넘기기"><Button variant="outline" type="button" disabled={reading === 0} onClick={() => setReading((index) => index - 1)}>← 이전 작품</Button><Button variant="ghost" type="button" onClick={() => setReading(null)}>확인 목록으로</Button><Button variant="outline" type="button" disabled={reading === valid.length - 1} onClick={() => setReading((index) => index + 1)}>다음 작품 →</Button></nav>
        </div>} />}
    </section>;
}
