import { useEffect, useMemo, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal.jsx';
import Button from '../../../components/common/Button.jsx';
import { registerPhotoGate } from '../photoGate.js';
import { confirmPhotoUse, copyConfirmedPhotos, loadPhotosForReview } from '../api/photoApi.js';
import { TEACHER_PHOTO_CHECK_STATEMENT } from '../../writing/mission-types/report/reportPhotoRules.js';
import './photoConfirm.css';

/*
 * 보고서 사진을 담기 전의 선생님 확인 화면(2026-10-20, 설계 docs/CLASS_AGIT_PHOTOS_PLAN.md 2c).
 *
 * 글을 담는 길(작품 찾기·미션별·학생별)이 `classAgitApi.getSources` 로 글을 받을 때 확인하지 않은 사진이 든 보고서가 있으면
 * `photoGate` 가 이 화면을 연다. 선생님이 사진을 직접 보고 문구에 체크하고 **담을 사진을 골라야** 사진이 담긴다.
 *   - 고르지 않은 사진은 빼고 글만 담긴다. `사진 없이 글만 담기` 는 사진을 하나도 고르지 않은 것과 같다.
 *   - 확인한 사진은 서버가 기록하고(확인한 선생님·시각) Edge 함수가 복사본을 고정한 뒤, 글을 다시 받아 사진이 든 모습으로 담는다.
 *   - 취소하면 아무것도 담지 않는다.
 */
const photoKey = (postId, sectionId) => `${postId}:${sectionId}`;

/** `request.initialPhotos`(Map)를 주면 사진을 불러오지 않는다 — 개발 미리보기·시험용. */
export function PhotoConfirmDialog({ request, onDone, onCancel }) {
    const { classId, sources, reloadSources } = request;
    const [photos, setPhotos] = useState(request.initialPhotos ?? null);
    const [loadError, setLoadError] = useState('');
    const [checked, setChecked] = useState(false);
    const [picked, setPicked] = useState(() => new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        if (request.initialPhotos) return undefined;
        let alive = true;
        loadPhotosForReview(sources).then((map) => { if (alive) setPhotos(map); })
            .catch((reason) => { if (alive) setLoadError(reason.message || '확인할 사진을 불러오지 못했어요.'); });
        return () => { alive = false; };
    }, [sources, request.initialPhotos]);

    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape' && !busy) onCancel(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onCancel]);

    const totalPhotos = useMemo(() => sources.reduce((sum, source) => sum + (photos?.get(source.id)?.length ?? source.photo_sections.length), 0), [sources, photos]);
    const toggle = (key) => setPicked((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    const pickAll = () => setPicked(new Set(sources.flatMap((source) => (photos?.get(source.id) ?? []).filter((item) => item.url).map((item) => photoKey(source.id, item.sectionId)))));

    const submit = async () => {
        setBusy(true); setError('');
        try {
            const photoIds = [];
            const targetIds = [];
            for (const source of sources) {
                const sections = (photos?.get(source.id) ?? []).map((item) => item.sectionId).filter((sectionId) => picked.has(photoKey(source.id, sectionId)));
                if (!sections.length) continue;
                const rows = await confirmPhotoUse(classId, source.id, sections);
                photoIds.push(...rows.map((row) => row.id)); targetIds.push(source.id);
            }
            if (!photoIds.length) { onDone(new Map()); return; }
            const copied = await copyConfirmedPhotos(classId, photoIds);
            const reloaded = await reloadSources(classId, targetIds);
            const refreshed = new Map(reloaded.map((item) => [item.id, item]));
            if (copied.length < photoIds.length) { setSummary({ refreshed, copied: copied.length, total: photoIds.length }); setBusy(false); return; }
            onDone(refreshed);
        } catch (reason) {
            setError(reason.message || '사진을 담지 못했어요. 잠시 뒤 다시 해 주세요.');
            setBusy(false);
        }
    };

    const canSubmit = checked && picked.size > 0 && !busy;
    return <ModalPortal>
        <div className="class-agit-photo-confirm__backdrop" role="presentation">
            <section className="class-agit-photo-confirm" role="dialog" aria-modal="true" aria-labelledby="class-agit-photo-confirm-title">
                <header>
                    <h2 id="class-agit-photo-confirm-title">📷 사진을 보고 확인해요</h2>
                    <p>사진이 든 보고서 {sources.length}편(사진 {totalPhotos}장)입니다. 개인을 알아볼 수 있는 사진은 고르지 마세요 — 고르지 않은 사진은 빼고 글만 담겨요.</p>
                </header>
                {loadError && <p className="class-agit-error" role="alert">{loadError}</p>}
                {!photos && !loadError && <p role="status">사진을 불러오고 있어요…</p>}
                {photos && <>
                    <fieldset className="class-agit-photo-confirm__statement" disabled={busy || Boolean(summary)}>
                        <label><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>{TEACHER_PHOTO_CHECK_STATEMENT}</span></label>
                    </fieldset>
                    <div className="class-agit-photo-confirm__list">
                        {sources.map((source) => <section key={source.id} className="class-agit-photo-confirm__post">
                            <h3>{source.student_name} · {source.title}</h3>
                            <div className="class-agit-photo-confirm__grid">
                                {(photos.get(source.id) ?? []).map((item) => <figure key={item.sectionId}>
                                    {item.url ? <img src={item.url} alt={item.caption || '보고서 사진'} width={item.width} height={item.height} /> : <div className="class-agit-photo-confirm__missing">사진을 불러오지 못했어요.</div>}
                                    <figcaption>
                                        {item.caption && <span>{item.caption}</span>}
                                        <label><input type="checkbox" checked={picked.has(photoKey(source.id, item.sectionId))} disabled={!checked || !item.url || busy || Boolean(summary)} onChange={() => toggle(photoKey(source.id, item.sectionId))} />이 사진 담기</label>
                                    </figcaption>
                                </figure>)}
                            </div>
                        </section>)}
                    </div>
                </>}
                {error && <p className="class-agit-error" role="alert">{error}</p>}
                {summary && <p role="status">사진 {summary.total}장 중 {summary.copied}장만 담았어요. 나머지는 글만 담깁니다.</p>}
                <footer>
                    {summary
                        ? <Button variant="primary" type="button" onClick={() => onDone(summary.refreshed)}>계속</Button>
                        : <>
                            <Button variant="outline" type="button" disabled={busy} onClick={onCancel}>취소</Button>
                            <Button variant="outline" type="button" disabled={busy} onClick={() => onDone(new Map())}>사진 없이 글만 담기</Button>
                            {photos && <Button variant="ghost" type="button" disabled={!checked || busy} onClick={pickAll}>사진 모두 고르기</Button>}
                            <Button variant="primary" type="button" disabled={!canSubmit} onClick={submit}>{busy ? '사진을 담는 중…' : `선택한 사진 ${picked.size}장과 함께 담기`}</Button>
                        </>}
                </footer>
            </section>
        </div>
    </ModalPortal>;
}

/** 교사 입구에 한 번 놓아 두면 담기 흐름이 필요할 때 확인 화면을 연다. */
export default function PhotoConfirmHost() {
    const [request, setRequest] = useState(null);
    useEffect(() => registerPhotoGate((payload) => new Promise((resolve, reject) => {
        setRequest((previous) => { previous?.reject(new Error('사진 확인이 다른 요청으로 바뀌었어요.')); return { ...payload, resolve, reject }; });
    })), []);
    if (!request) return null;
    return <PhotoConfirmDialog
        request={request}
        onDone={(refreshed) => { request.resolve(refreshed); setRequest(null); }}
        onCancel={() => { request.reject(new Error('사진 확인을 취소했어요. 아무것도 담지 않았어요.')); setRequest(null); }}
    />;
}
