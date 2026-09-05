import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import { createShareToken, buildShareUrl } from './publicApi.js';
import { buildSharePeriod, localDateTime, MAX_SHARE_PERIOD_MS } from './sharePeriod.js';
import PublicGallery from './PublicGallery.jsx';
import { createPublicPreviewApi } from './preview.js';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import '../classAgit.css';
import '../management.css';

function ShareEditor({ data, api, classId, exhibitionId, onClose, onReload, onOpenPublic, archived, embedded, onStateChange }) {
    const [title, setTitle] = useState(data.share?.title || '우리들의 작은 발견');
    const [introduction, setIntroduction] = useState(data.share?.introduction || '우리의 이야기에 귀 기울여 주세요.');
    const [items, setItems] = useState(() => data.candidates.map((item) => ({ ...item, included: false })));
    const [startNow, setStartNow] = useState(true);
    const [startsAt, setStartsAt] = useState(() => localDateTime(Date.now()));
    const [expiresAt, setExpiresAt] = useState(() => localDateTime(Date.now() + MAX_SHARE_PERIOD_MS));
    const [publishedExpiresAt, setPublishedExpiresAt] = useState(() => data.share ? localDateTime(data.share.expires_at) : '');
    const [preview, setPreview] = useState(null);
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
    const selected = items.filter((item) => item.included);
    const run = async (action, extra = {}) => {
        if (busyRef.current) return;
        if (action === 'revoke' && !await ask({ title: '외부 공유 주소를 해지할까요?', body: '이 주소로 다음 내용을 조회할 수 없게 됩니다.' })) return;
        busyRef.current = true; setBusy(true); setError(''); setMessage('');
        try {
            const period = action === 'publish' ? buildSharePeriod(startNow ? Date.now() : startsAt, expiresAt)
                : action === 'extend' ? buildSharePeriod(current.share.starts_at, publishedExpiresAt) : {};
            if (['publish', 'rotate'].includes(action)) retryToken.current ||= createShareToken();
            const next = await api.shareAction(classId, exhibitionId, action, { expected_revision: current.share?.revision || 0,
                exhibition_revision: current.exhibition_revision, title, introduction, ...period, token: retryToken.current,
                items: selected.map((item) => ({ itemId: item.itemId, sourceRevision: item.sourceRevision, publicAlias: item.publicAlias })), ...extra });
            setCurrent(next);
            if (next.share) setPublishedExpiresAt(localDateTime(next.share.expires_at));
            if (action === 'publish') setDirty(false);
            if (['publish', 'rotate'].includes(action)) { setUrl(buildShareUrl(retryToken.current)); retryToken.current = null; setMessage('새 공유 주소를 만들었습니다. 복사해서 보관해 주세요.'); }
            else { if (action === 'revoke') setUrl(''); setMessage('공유 설정에 반영했습니다.'); }
        } catch (e) { setError(e.message); } finally { busyRef.current = false; setBusy(false); }
    };
    const changeItem = (id, change) => { setItems((values) => values.map((item) => item.itemId === id ? { ...item, ...change } : item)); setDirty(true); retryToken.current = null; };
    const reload = async () => {
        if ((dirty || hasLink) && !await ask({ title: '공유 설정을 다시 불러올까요?', body: '입력 중인 내용이 초기화됩니다. 새 공유 주소가 있다면 먼저 복사해 주세요.', confirmLabel: '다시 불러오기' })) return;
        onReload();
    };
    if (preview) return <PublicGallery api={preview} token="preview" isPreview onExit={() => setPreview(null)} />;
    return <section className="class-agit class-agit-management">{!embedded && <header className="class-agit-project-heading"><h1>외부 읽기 전용 공유</h1><Button variant="outline" type="button" disabled={busy} onClick={onClose}>전시 편집으로</Button></header>}
        <p>학교·학급명과 학생 이름을 자동으로 넣지 않습니다. 공개할 작품과 가림 이름을 선택하고 전시기간을 정해 주세요.</p>
        {archived && <p role="status">보관한 전시의 기존 공유 주소를 관리할 수 있습니다. 새 공개본을 발행하려면 전시를 복원해 주세요.</p>}
        {!data.external_enabled && <p role="status">현재 외부 공유가 중지되어 있습니다. 관리자의 공개 단계 설정에서 허용한 뒤 주소를 만들 수 있습니다.</p>}
        {error && <p className="class-agit-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <fieldset disabled={busy} className="class-agit-book-settings"><legend>외부 공개본</legend><label>외부 전시 제목<input value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); setDirty(true); retryToken.current = null; }} /></label><label>소개<textarea aria-label="외부 전시 소개" value={introduction} maxLength={240} onChange={(e) => { setIntroduction(e.target.value); setDirty(true); retryToken.current = null; }} /></label><label><input type="checkbox" checked={startNow} onChange={(e) => { setStartNow(e.target.checked); setDirty(true); retryToken.current = null; }} />발행하면 바로 시작</label>
            {!startNow && <label>전시 시작<input type="datetime-local" value={startsAt} onChange={(e) => { setStartsAt(e.target.value); setDirty(true); retryToken.current = null; }} /></label>}
            <label>전시 종료<input type="datetime-local" value={expiresAt} max={startNow || startsAt ? localDateTime(new Date(startNow ? Date.now() : startsAt).getTime() + MAX_SHARE_PERIOD_MS) : undefined} onChange={(e) => { setExpiresAt(e.target.value); setDirty(true); retryToken.current = null; }} /></label>
            <p>최대 30일 동안 전시합니다. 종료 시각부터 외부 열람이 자동으로 차단됩니다. 원글을 수정해도 발행한 전시본은 유지됩니다.</p></fieldset>
        <h2>공개할 작품 · {selected.length}편</h2><ul className="class-agit-book-items">{items.map((item) => <li key={item.itemId}><div><strong>{item.title}</strong><p>{item.excerpt}</p>{(item.unavailable || item.sourceChanged) && <span>전시 편집에서 원글을 다시 확인하고 저장해 주세요.</span>}</div><div className="class-agit-book-settings"><label><input type="checkbox" checked={item.included} disabled={busy || item.unavailable || item.sourceChanged} onChange={(e) => changeItem(item.itemId, { included: e.target.checked })} />외부 공개에 포함</label><label>가림 이름<input aria-label={`${item.title} 외부 가림 이름`} maxLength={30} value={item.publicAlias} disabled={busy} onChange={(e) => changeItem(item.itemId, { publicAlias: e.target.value })} /></label></div></li>)}</ul>
        <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={!selected.length || busy} onClick={() => setPreview(createPublicPreviewApi({ title, introduction, works: selected.map((item, index) => ({ id: `published-${index + 1}`, title: item.title, author: item.publicAlias, format: item.format, kindLabel: item.kindLabel, excerpt: item.excerpt, blocks: item.blocks })) }))}>외부 방문자 미리보기</Button><Button variant="outline" type="button" disabled={busy} onClick={reload}>최신 공유 설정 불러오기</Button></div>
        <Button variant="primary" type="button" disabled={busy || archived || !selected.length || !title.trim() || !data.external_enabled} onClick={() => run('publish')}>{current.share ? '공개본 갱신 · 새 주소 발급' : '외부 공유 주소 만들기'}</Button>
        {url && <div className="class-agit-share-link"><label>새 공유 주소<input aria-label="새 공유 주소" readOnly value={url} /></label><Button variant="outline" type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage('공유 주소를 복사했습니다.'); } catch { setMessage('주소 칸을 선택해 직접 복사해 주세요.'); } }}>주소 복사</Button><a href={url} target="_blank" rel="noopener noreferrer" onClick={onOpenPublic ? (event) => { event.preventDefault(); onOpenPublic(new URL(url).hash.slice(1)); } : undefined}>방문자로 열기 ↗</a></div>}
        {current.share && <><h2>발행한 외부 공개본</h2><p>{current.share.publication_no}판 · {current.share.revoked ? '해지됨' : current.share.expired ? '만료됨' : current.share.scheduled ? '시작 예정' : '공유 중'} · 시작 {new Date(current.share.starts_at).toLocaleString('ko-KR')} · 종료 {new Date(current.share.expires_at).toLocaleString('ko-KR')}</p>
            <p>주소를 재발급해도 전시 기간은 유지됩니다. 만료 후에는 작품을 다시 확인하고 새 공개본을 발행해 주세요. 학생 홈 공개 스위치와 외부 공유는 별개입니다. 주소는 원문으로 보관하지 않아 이 화면을 다시 열면 재발급해야 합니다.</p>
            <div className="class-agit-book-settings"><label>발행한 공개본의 종료 시각<input type="datetime-local" value={publishedExpiresAt} min={localDateTime(current.share.starts_at)} max={localDateTime(Date.parse(current.share.starts_at) + MAX_SHARE_PERIOD_MS)} disabled={busy || current.share.revoked || current.share.expired || !data.external_enabled} onChange={(e) => { setPublishedExpiresAt(e.target.value); setDirty(true); }} /></label></div>
            <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy || current.share.revoked || current.share.expired || !data.external_enabled} onClick={() => run('rotate')}>주소 재발급</Button><Button variant="outline" type="button" disabled={busy || current.share.revoked || current.share.expired || !data.external_enabled} onClick={() => run('extend')}>종료 시각 변경 (기존 시작부터 30일 이내)</Button><Button variant="outline" type="button" disabled={busy || current.share.revoked} onClick={() => run('revoke')}>공유 주소 해지</Button></div>
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
