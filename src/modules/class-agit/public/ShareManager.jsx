import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import { createShareToken, buildShareUrl } from './publicApi.js';
import PublicGallery from './PublicGallery.jsx';
import { createPublicPreviewApi } from './preview.js';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import '../classAgit.css';
import '../management.css';

function ShareEditor({ data, api, classId, exhibitionId, onClose, onReload, onOpenPublic, archived, embedded, onStateChange }) {
    const [title, setTitle] = useState(data.share?.title || '우리들의 작은 발견');
    const [introduction, setIntroduction] = useState(data.share?.introduction || '우리의 이야기에 귀 기울여 주세요.');
    const [items, setItems] = useState(() => data.candidates.map((item) => ({ ...item, externalConfirmed: false })));
    const [days, setDays] = useState(30);
    const [preview, setPreview] = useState(null);
    const [confirmed, setConfirmed] = useState(false);
    const [url, setUrl] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [current, setCurrent] = useState(data);
    const retryToken = useRef(null);
    const busyRef = useRef(false);
    const { ask, confirmDialog } = useConfirmDialog();
    const hasLink = Boolean(url);
    useEffect(() => { onStateChange?.({ busy, dirty, hasLink }); }, [busy, dirty, hasLink, onStateChange]);
    const selected = items.filter((item) => item.externalConfirmed);
    const run = async (action, extra = {}) => {
        if (busyRef.current) return;
        if (action === 'revoke' && !await ask({ title: '외부 공유 주소를 해지할까요?', body: '이 주소로 다음 내용을 조회할 수 없게 됩니다.' })) return;
        busyRef.current = true; setBusy(true); setError(''); setMessage('');
        try {
            if (['publish', 'rotate'].includes(action)) retryToken.current ||= createShareToken();
            const next = await api.shareAction(classId, exhibitionId, action, { expected_revision: current.share?.revision || 0,
                exhibition_revision: current.exhibition_revision, title, introduction, days, confirmed, token: retryToken.current,
                items: selected.map((item) => ({ itemId: item.itemId, sourceRevision: item.sourceRevision, publicAlias: item.publicAlias, externalConfirmed: true })), ...extra });
            setCurrent(next);
            if (action === 'publish') setDirty(false);
            if (['publish', 'rotate'].includes(action)) { setUrl(buildShareUrl(retryToken.current)); retryToken.current = null; setMessage('새 공유 주소를 만들었습니다. 복사해서 보관해 주세요.'); }
            else { if (action === 'revoke') setUrl(''); setMessage('공유 설정에 반영했습니다.'); }
        } catch (e) { setError(e.message); } finally { busyRef.current = false; setBusy(false); }
    };
    const changeItem = (id, change) => { setItems((values) => values.map((item) => item.itemId === id ? { ...item, ...change } : item)); setDirty(true); setConfirmed(false); retryToken.current = null; };
    const reload = async () => {
        if ((dirty || hasLink) && !await ask({ title: '공유 설정을 다시 불러올까요?', body: '입력 중인 내용이 초기화됩니다. 새 공유 주소가 있다면 먼저 복사해 주세요.', confirmLabel: '다시 불러오기' })) return;
        onReload();
    };
    if (preview) return <PublicGallery api={preview} token="preview" isPreview onExit={() => setPreview(null)} />;
    return <section className="class-agit class-agit-management">{!embedded && <header className="class-agit-project-heading"><h1>외부 읽기 전용 공유</h1><Button variant="outline" type="button" disabled={busy} onClick={onClose}>전시 편집으로</Button></header>}
        <p>학교·학급명과 학생 이름을 자동으로 넣지 않습니다. 제목·본문·소개 속 개인정보와 작품별 외부 공개 의사도 확인해 주세요.</p>
        {archived && <p role="status">보관한 전시의 기존 공유 주소를 관리할 수 있습니다. 새 공개본을 발행하려면 전시를 복원해 주세요.</p>}
        {!data.external_enabled && <p role="status">현재 외부 공유가 중지되어 있습니다. 관리자의 공개 단계 설정에서 허용한 뒤 주소를 만들 수 있습니다.</p>}
        {error && <p className="class-agit-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <fieldset disabled={busy} className="class-agit-book-settings"><legend>외부 공개본</legend><label>외부 전시 제목<input value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); setDirty(true); setConfirmed(false); retryToken.current = null; }} /></label><label>소개<textarea aria-label="외부 전시 소개" value={introduction} maxLength={240} onChange={(e) => { setIntroduction(e.target.value); setDirty(true); setConfirmed(false); retryToken.current = null; }} /></label><label>공유 기간<select value={days} onChange={(e) => { setDays(Number(e.target.value)); setDirty(true); retryToken.current = null; }}>{[1, 7, 14, 30].map((day) => <option key={day} value={day}>{day}일</option>)}</select></label></fieldset>
        <h2>공개할 작품 · {selected.length}편</h2><ul className="class-agit-book-items">{items.map((item) => <li key={item.itemId}><div><strong>{item.title}</strong><p>{item.excerpt}</p>{(item.unavailable || item.sourceChanged) && <span>전시 편집에서 원글을 다시 확인하고 저장해 주세요.</span>}</div><div className="class-agit-book-settings"><label><input type="checkbox" checked={item.externalConfirmed} disabled={busy || item.unavailable || item.sourceChanged} onChange={(e) => changeItem(item.itemId, { externalConfirmed: e.target.checked })} />이 작품의 외부 공개 의사 확인</label><label>가림 이름<input aria-label={`${item.title} 외부 가림 이름`} maxLength={30} value={item.publicAlias} disabled={busy} onChange={(e) => changeItem(item.itemId, { publicAlias: e.target.value })} /></label></div></li>)}</ul>
        <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={!selected.length || busy} onClick={() => setPreview(createPublicPreviewApi({ title, introduction, works: selected.map((item, index) => ({ id: `published-${index + 1}`, title: item.title, author: item.publicAlias, format: item.format, kindLabel: item.kindLabel, excerpt: item.excerpt, blocks: item.blocks })) }))}>외부 방문자 미리보기</Button><Button variant="outline" type="button" disabled={busy} onClick={reload}>최신 공유 설정 불러오기</Button></div>
        <label className="class-agit-confirmation"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => { setConfirmed(e.target.checked); setDirty(true); }} />제목·본문·가림 이름·소개와 외부 공개 의사를 확인했습니다.</label>
        <Button variant="primary" type="button" disabled={busy || archived || !confirmed || !selected.length || !title.trim() || !data.external_enabled} onClick={() => run('publish')}>{current.share ? '공개본 갱신 · 새 주소 발급' : '외부 공유 주소 만들기'}</Button>
        {url && <div className="class-agit-share-link"><label>새 공유 주소<input aria-label="새 공유 주소" readOnly value={url} /></label><Button variant="outline" type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage('공유 주소를 복사했습니다.'); } catch { setMessage('주소 칸을 선택해 직접 복사해 주세요.'); } }}>주소 복사</Button><a href={url} target="_blank" rel="noopener noreferrer" onClick={onOpenPublic ? (event) => { event.preventDefault(); onOpenPublic(new URL(url).hash.slice(1)); } : undefined}>방문자로 열기 ↗</a></div>}
        {current.share && <><h2>발행한 외부 공개본</h2><p>{current.share.publication_no}판 · {current.share.revoked ? '해지됨' : current.share.expired ? '만료됨' : '공유 중'} · 만료 {new Date(current.share.expires_at).toLocaleString('ko-KR')}</p>
            <p>학생 홈 공개 스위치와 외부 공유는 별개입니다. 주소는 원문으로 보관하지 않아 이 화면을 다시 열면 재발급해야 합니다.</p><div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy || current.share.revoked || !data.external_enabled} onClick={() => run('rotate')}>주소 재발급</Button><Button variant="outline" type="button" disabled={busy || current.share.revoked || !data.external_enabled} onClick={() => run('extend')}>선택한 기간으로 만료 변경</Button><Button variant="outline" type="button" disabled={busy || current.share.revoked} onClick={() => run('revoke')}>공유 주소 해지</Button></div>
            <ul className="class-agit-projects">{current.published_items.map((item) => <li key={item.id}><span>{item.title} · {item.author}{item.revoked ? ' · 철회됨' : ''}</span><Button variant="outline" type="button" disabled={busy || item.revoked} onClick={() => run('withdraw', { item_id: item.id })}>이 작품 외부 수록 철회</Button></li>)}</ul></>}
        {confirmDialog}
    </section>;
}
export default function ShareManager({ classId, exhibitionId, api = classAgitReleaseApi, onClose, onOpenPublic, archived = false, embedded = false, onStateChange }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [version, setVersion] = useState(0);
    useEffect(() => { let active = true; api.getShare(classId, exhibitionId).then((value) => { if (active) { setData({ ...value, loadedVersion: version }); setError(''); } }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [api, classId, exhibitionId, version]);
    if (error) return <div className="class-agit class-agit-management"><p role="alert">{error}</p><Button variant="outline" type="button" onClick={() => setVersion((v) => v + 1)}>공유 다시 불러오기</Button>{!embedded && <Button variant="outline" type="button" onClick={onClose}>전시 편집으로</Button>}</div>;
    return data ? <ShareEditor key={data.loadedVersion} data={data} api={api} classId={classId} exhibitionId={exhibitionId} onClose={onClose} onOpenPublic={onOpenPublic} archived={archived} embedded={embedded} onStateChange={onStateChange} onReload={() => setVersion((v) => v + 1)} /> : <p role="status">공유 설정을 불러오고 있습니다…</p>;
}
