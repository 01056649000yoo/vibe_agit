import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import '../classAgit.css';
import '../management.css';
export default function RolloutManager({ api = classAgitReleaseApi, onExit }) {
    const [data, setData] = useState(null); const [draft, setDraft] = useState(null);
    const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
    const { ask, confirmDialog } = useConfirmDialog();
    const receive = (value) => { setData(value); setDraft({ ...value.settings, class_ids: value.class_ids }); };
    useEffect(() => { let active = true; api.manageRollout().then((value) => { if (active) receive(value); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [api]);
    const save = async () => {
        if (lock.current || !await ask({ title: '우리반 아지트 공개 단계를 변경할까요?', body: `학생과 외부 방문자의 다음 조회부터 이 설정이 적용됩니다. 전체 중지는 교사 편집도 제한합니다.${draft.mode === 'open' ? ' 전체 교사 공개는 승인된 모든 교사에게 이 기능을 엽니다.' : ''}`, confirmLabel: '설정 반영' })) return;
        lock.current = true; setBusy(true); setError('');
        try { receive(await api.manageRollout({ mode: draft.mode, external_enabled: draft.external_enabled, class_ids: draft.class_ids, expected_revision: data.settings.revision })); }
        catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
    };
    return <section className="class-agit class-agit-management"><header className="class-agit-project-heading"><h1>우리반 아지트 공개 단계</h1>{onExit && <Button variant="outline" type="button" disabled={busy} onClick={onExit}>관리 화면으로</Button>}</header>
        <p>관리자 내부 검증 → 최대 두 학급 시범 운영 → 전체 교사 공개 순서로 넓힙니다. 각 학급의 학생 공개와 외부 공유 허용은 별도로 관리합니다.</p>
        {error && <p role="alert" className="class-agit-error">{error}</p>}
        {!draft ? <p role="status">공개 설정을 확인하고 있습니다…</p> : <fieldset className="class-agit-book-settings" disabled={busy}><legend>공개 범위</legend>
            <label>운영 단계<select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value })}><option value="internal">관리자 본인 학급</option><option value="pilot">지정 학급 시범 운영</option><option value="open">전체 교사 공개</option><option value="disabled">전체 중지</option></select></label>
            {draft.mode === 'open' && <p>승인된 모든 교사가 자기 학급에서 쓸 수 있습니다. 학생에게 열리는 것은 교사가 학급 모듈을 켜고 전시를 공개했을 때뿐입니다. 지정 학급 목록은 그대로 두므로 `지정 학급 시범 운영`으로 되돌릴 수 있습니다.</p>}
            {draft.mode === 'pilot' && <div><p>시범 학급 · {draft.class_ids.length}/2</p>{data.classes.map((c) => <label key={c.id}><input type="checkbox" checked={draft.class_ids.includes(c.id)} disabled={!draft.class_ids.includes(c.id) && draft.class_ids.length >= 2} onChange={(e) => setDraft({ ...draft, class_ids: e.target.checked ? [...draft.class_ids, c.id] : draft.class_ids.filter((id) => id !== c.id) })} />{c.name}{c.teacher_name ? ` · ${c.teacher_name}` : ''}{c.school_name ? ` · ${c.school_name}` : ''}</label>)}</div>}
            <label><input type="checkbox" checked={draft.external_enabled} onChange={(e) => setDraft({ ...draft, external_enabled: e.target.checked })} />외부 읽기 전용 공유 허용</label>
            <p>외부 공유를 켜면 허용된 교사가 전시를 인터넷 주소로 낼 수 있습니다. 학급 공개와는 별개이며, 끄면 새 주소 발급과 기간 연장이 막힙니다(이미 낸 주소는 각 전시에서 해지합니다).</p>
            <Button variant="primary" type="button" disabled={draft.mode === 'pilot' && !draft.class_ids.length} onClick={save}>공개 설정 저장</Button>
        </fieldset>}
        <Button variant="outline" type="button" disabled={busy} onClick={async () => { try { receive(await api.manageRollout()); setError(''); } catch (e) { setError(e.message); } }}>최신 공개 설정 불러오기</Button>{confirmDialog}
    </section>;
}
