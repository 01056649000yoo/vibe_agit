import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';

// Only shown when some selected sources became unavailable before adding.
export default function BulkReview({ results, selected, scope, onAdd, onCancel }) {
    const [error, setError] = useState('');
    const valid = results.filter((item) => item.source);
    const excluded = results.filter((item) => !item.source);
    return <section className="class-agit-bulk-review" aria-label={`${scope} 수록 불가 작품`}>
        <div className="class-agit-selection-heading"><div><h3>담을 수 없는 작품이 {excluded.length}편 있습니다</h3><p>선택한 뒤 원글의 제출·공개 상태가 바뀌었을 수 있습니다.</p></div><Button variant="ghost" type="button" onClick={onCancel}>선택 화면으로</Button></div>
        <ul className="class-agit-review-list">{excluded.map((item) => {
            const row = selected.find((entry) => entry.id === item.id);
            return <li key={item.id}><div><strong>{row?.title || '선택 작품'}</strong><small>{row?.student_name} · {row?.group_title}</small><p className="class-agit-error">{item.reason}</p></div></li>;
        })}</ul>
        {error && <p role="alert">{error}</p>}
        <div className="class-agit-selection-summary"><span>담을 수 있음 {valid.length}편 · 수록 불가 {excluded.length}편</span>
            <Button variant="primary" type="button" disabled={!valid.length} onClick={() => {
                try { onAdd(valid.map((item) => item.source)); } catch (reason) { setError(reason.message); }
            }}>문제없는 {valid.length}편만 담기</Button></div>
    </section>;
}
