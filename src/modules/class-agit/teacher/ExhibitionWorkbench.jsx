import { useEffect, useRef, useState } from 'react';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton.jsx';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { createExhibitionDraft, createGalleryPresentation, editExhibition } from '../exhibitionDraft.js';
import { getSourceExclusion, presentSource } from '../sourceContract.js';
import { arrangeGalleryRooms } from '../gallery/roomLayout.js';
import GalleryRoom from '../gallery/GalleryRoom.jsx';
import GalleryViewer from '../gallery/GalleryViewer.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import '../classAgit.css';

function CandidateConfirmation({ onAdd }) {
    const [acknowledged, setAcknowledged] = useState(false);
    const [error, setError] = useState('');
    return <div className="class-agit-confirmation">
        <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />이 작품의 학급 전시 수록 의사를 확인했습니다.</label>
        <p>문집 수록과 외부 공개는 별도로 확인합니다.</p>
        {error && <p role="alert">{error}</p>}
        <button type="button" className="class-agit-primary" disabled={!acknowledged} onClick={() => {
            try { onAdd(acknowledged); } catch (reason) { setError(reason.message); }
        }}>전시에 담기</button>
    </div>;
}

function ExternalWorkSettings({ item, onChange }) {
    const [alias, setAlias] = useState(item.publicAlias);
    const [error, setError] = useState('');
    const commit = (enabled) => {
        try {
            onChange({ type: 'external', sourceId: item.sourceId, enabled, alias });
            setAlias(alias.trim()); setError('');
        } catch (reason) { setAlias(item.publicAlias); setError(reason.message); }
    };
    return <div className="class-agit-external-fields">
        <label><input type="checkbox" checked={item.scopes.external} onChange={(event) => commit(event.target.checked)} />외부 수록 확인</label>
        <label>가림 이름<input aria-label={`${item.title} 가림 이름`} value={alias} maxLength={limits.authorLength} onChange={(event) => setAlias(event.target.value)} onBlur={() => commit(item.scopes.external)} /></label>
        {error && <span role="alert">{error}</span>}
    </div>;
}

export default function ExhibitionWorkbench({ activeClass, sources = [], students = [], initialDraft, persistence }) {
    const [draft, setDraft] = useState(() => initialDraft || createExhibitionDraft(activeClass?.id));
    const [savedDraft, setSavedDraft] = useState(() => initialDraft || null);
    const [query, setQuery] = useState('');
    const [candidate, setCandidate] = useState(null);
    const [preview, setPreview] = useState(null);
    const [panel, setPanel] = useState('gallery');
    const [roomIndex, setRoomIndex] = useState(0);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const { ask, confirmDialog } = useConfirmDialog();
    const previewTrigger = useRef(null);
    const previousPreview = useRef(null);
    useEffect(() => {
        if (!preview && previousPreview.current) previewTrigger.current?.focus({ preventScroll: true });
        previousPreview.current = preview;
    }, [preview]);

    const presentation = createGalleryPresentation(draft);
    const rooms = arrangeGalleryRooms(presentation.works);
    const safeRoomIndex = Math.min(roomIndex, Math.max(rooms.length - 1, 0));
    const selectedStudents = new Set(draft.items.map((item) => item.studentId));
    const unselectedStudents = students.filter((student) => !selectedStudents.has(student.id));
    const selectedSources = new Set(draft.items.map((item) => item.sourceId));
    const candidates = sources.slice(0, limits.maxCandidates).map((source) => ({ source, reason: persistence ? '' : getSourceExclusion(source, activeClass?.id) }));
    const visibleCandidates = persistence ? candidates : candidates.filter(({ source }) => `${source.title} ${source.student_name}`.toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR')));
    const externalCount = draft.items.filter((item) => item.scopes.external).length;
    const dirty = savedDraft?.revision !== draft.revision;
    const perform = async (operation) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setError('');
        try { await operation(); } catch (reason) { setError(reason.message || '전시 요청을 처리하지 못했습니다. 다시 시도해 주세요.'); }
        finally { busyRef.current = false; setBusy(false); }
    };
    const receiveDraft = (next) => { setDraft(next); setSavedDraft(next); };
    const readSource = (source) => persistence
        ? perform(async () => setCandidate(await persistence.readSource(source.id || source.sourceId)))
        : setCandidate(source);
    const runSavedAction = async (action, item) => {
        const titles = { publish: '저장한 전시를 학급에 공개할까요?', unpublish: '학급 공개를 중단할까요?', archive: '전시를 보관할까요?', restore: '전시를 초안으로 돌릴까요?', withdraw: '이 작품의 수록을 철회할까요?' };
        if (!await ask({ title: Reflect.get(titles, action), body: action === 'withdraw' ? '공개판에서도 이 작품의 열람이 중단됩니다. 다시 공개하려면 전문과 수록 의사를 재확인해야 합니다.' : '저장된 전시를 기준으로 처리합니다.', confirmLabel: '진행하기' })) return;
        await perform(async () => { receiveDraft(await persistence.action(action, savedDraft.revision, item)); setMessage('전시 상태를 반영했습니다.'); });
    };

    const changeDraft = (change) => {
        try { setDraft(editExhibition(draft, change)); setMessage(''); setError(''); }
        catch (reason) { setError(reason.message); }
    };
    const startPreview = (audience, initialWorkId) => setPreview({ exhibition: createGalleryPresentation(draft, audience), initialWorkId });
    if (preview) return <GalleryViewer exhibition={preview.exhibition} initialWorkId={preview.initialWorkId} onExit={() => setPreview(null)} />;

    return <section className="class-agit class-agit-workbench">
        {confirmDialog}
        <fieldset className="class-agit-edit-body" disabled={busy || persistence?.busy}>
        <header className="class-agit-workbench__header">
            <div className="class-agit-brand"><span aria-hidden="true">✦</span><div><p>우리반 아지트</p><h1>작은 글, 하나의 전시</h1></div></div>
            <div className="class-agit-header-actions"><TeacherGuideButton tabId="class-agit" variant="help" /><span className="class-agit-tag">{persistence ? '관리자 내부 운영' : '전시실 시안'}</span></div>
        </header>
        <div className="class-agit-prototype-note">{persistence
            ? (persistence.isSample ? '저장·공개 흐름을 점검하는 샘플 작업공간입니다. 새로고침하면 초기화됩니다.' : '허용된 학급에서 제한 운영 중입니다. 초안 편집은 공개판을 바꾸지 않으며, 공개판 갱신은 별도로 진행합니다.')
            : '샘플 작품으로 구성한 시안입니다. 편집 내용은 이 화면에만 보관되며 실제 학급에 공개되지 않습니다.'}</div>
        {persistence && <div className="class-agit-live-toolbar">
            <button type="button" className="class-agit-text-button" onClick={async () => { if (!dirty || await ask({ title: '저장하지 않은 편집을 두고 전시 목록으로 갈까요?', confirmLabel: '목록으로' })) persistence.exit(); }}>← 전시 목록</button>
            <span>{draft.state === 'published' ? `${draft.publicationNo}판 공개 중` : draft.state === 'archived' ? '보관한 전시' : '비공개 초안'}</span>
            <button type="button" className="class-agit-secondary" onClick={async () => { if (!dirty || await ask({ title: '편집 중인 내용을 버리고 최신 초안을 불러올까요?', confirmLabel: '최신 초안 불러오기' })) perform(async () => { receiveDraft(await persistence.reload()); setMessage('최신 초안을 불러왔습니다.'); }); }}>최신 초안 불러오기</button>
            <button type="button" className="class-agit-primary" disabled={dirty || draft.state === 'archived' || !draft.items.length || !persistence.moduleEnabled || draft.items.some((item) => item.sourceChanged || item.unavailable || item.revoked)} onClick={() => runSavedAction('publish')}>{draft.publicationNo ? '공개판 갱신' : '학급에 공개'}</button>
            {draft.state === 'published' && <><button type="button" className="class-agit-secondary" disabled={dirty} onClick={() => persistence.openPublication()}>공개판 확인</button><button type="button" className="class-agit-text-button" disabled={dirty} onClick={() => runSavedAction('unpublish')}>공개 중단</button></>}
            {persistence.openShare && <button type="button" className="class-agit-secondary" disabled={dirty} onClick={persistence.openShare}>외부 읽기 전용 공유</button>}
            <button type="button" className="class-agit-text-button" disabled={dirty} onClick={() => runSavedAction(draft.state === 'archived' ? 'restore' : 'archive')}>{draft.state === 'archived' ? '초안으로 복원' : '전시 보관'}</button>
        </div>}
        <div className="class-agit-project-heading">
            <div><span className="class-agit-eyebrow">{activeClass?.name || '우리 반'}의 전시 준비</span><h2>{draft.title || '제목 없는 전시'}</h2><p>{draft.items.length}편의 작품 · {rooms.length}개 전시실 · {selectedStudents.size}명의 작가</p></div>
            <div className="class-agit-header-actions">
                <button type="button" className="class-agit-secondary" disabled={!draft.title.trim()} onClick={() => persistence
                    ? perform(async () => { receiveDraft(await persistence.save(draft, savedDraft.revision)); setMessage('초안을 저장했습니다. 공개판은 학급 공개 또는 공개판 갱신을 눌러 반영합니다.'); })
                    : (setSavedDraft(structuredClone(draft)), setMessage('이 화면에 초안을 보관했습니다. 새로고침하면 샘플 상태로 돌아갑니다.'))}>{persistence ? '초안 저장' : '시안 초안 보관'}</button>
                <button type="button" ref={previewTrigger} className="class-agit-primary" onClick={() => startPreview('class')}>학생으로 미리보기 ↗</button>
            </div>
        </div>
        <div className="class-agit-status" role="status">{busy ? '전시를 처리하고 있습니다…' : message || (!dirty ? (persistence ? '저장된 초안입니다.' : '이 화면에 초안이 보관되어 있습니다.') : '편집 중 · 아직 초안에 반영하지 않은 변경이 있습니다.')}</div>
        {persistence && draft.items.some((item) => item.sourceChanged || item.unavailable || item.revoked) && <p className="class-agit-error" role="status">상태가 바뀐 작품이 있습니다. 작품 순서 탭에서 전문을 다시 확인하거나 초안에서 빼 주세요.</p>}
        {error && <p className="class-agit-error" role="alert">{error}</p>}
        <div className="class-agit-editor-tabs" role="group" aria-label="전시 편집 영역">
            <button type="button" aria-pressed={panel === 'gallery'} onClick={() => setPanel('gallery')}>01 전시 꾸미기</button>
            <button type="button" aria-pressed={panel === 'order'} onClick={() => setPanel('order')}>{persistence ? '02 작품 순서 · 수록 확인' : '02 작품 순서 · 외부 표시'}</button>
        </div>
        {panel === 'gallery' ? <div className="class-agit-editor-layout">
            <aside className="class-agit-candidates">
                <div className="class-agit-panel-heading"><h3>우리 반의 글</h3><span>{candidates.filter((item) => !item.reason).length}편 선택 가능</span></div>
                <label className="class-agit-search">작품 찾기<input value={query} maxLength={80} placeholder="제목 또는 학생 이름" onChange={(event) => setQuery(event.target.value)} /></label>
                {persistence && <button type="button" className="class-agit-secondary" onClick={() => perform(() => persistence.search(query))}>검색</button>}
                <div className="class-agit-candidates__list">
                    {visibleCandidates.map(({ source, reason }) => <article key={source.id}>
                        <span className="class-agit-candidate-avatar" aria-hidden="true">{source.student_name.slice(0, 1)}</span>
                        <div><strong>{source.title}</strong><small>{source.student_name} · {source.group_title || '글쓰기'}</small>
                            <button type="button" disabled={Boolean(reason) || selectedSources.has(source.id) || draft.items.length >= limits.maxWorks} onClick={() => readSource(source)}>
                                {reason || (selectedSources.has(source.id) ? '✓ 전시에 담음' : '전문 보고 담기 +')}
                            </button>
                        </div>
                    </article>)}
                    {!visibleCandidates.length && <p>찾는 작품이 없습니다.</p>}
                </div>
                {persistence?.hasMore && <button type="button" className="class-agit-secondary" onClick={() => perform(() => persistence.more())}>다음 후보 보기</button>}
                <details className="class-agit-participation"><summary>아직 선정하지 않은 작가 {unselectedStudents.length}명</summary><p>{unselectedStudents.map((student) => student.name).join(' · ') || '모든 작가의 작품을 담았습니다.'}</p></details>
            </aside>
            <section className="class-agit-canvas-panel" aria-label="전시 꾸미기">
                <div className="class-agit-exhibition-fields"><label>전시 제목<input value={draft.title} maxLength={limits.titleLength} onChange={(event) => changeDraft({ type: 'metadata', title: event.target.value, introduction: draft.introduction })} /></label><label>전시 소개<textarea value={draft.introduction} maxLength={limits.introductionLength} onChange={(event) => changeDraft({ type: 'metadata', title: draft.title, introduction: event.target.value })} /></label></div>
                <div className="class-agit-canvas-heading"><div><span className="class-agit-eyebrow">밝은 작은 미술관</span><h3>{safeRoomIndex + 1} 전시실</h3></div><span>방마다 최대 {limits.worksPerRoom}편 · 자동 배치</span></div>
                <GalleryRoom works={rooms.at(safeRoomIndex)?.works || []} roomNumber={safeRoomIndex + 1} onOpen={(work) => startPreview('class', work.id)} />
                <nav className="class-agit-room-nav" aria-label="편집할 전시실">{rooms.map((room, index) => <button key={room.id} type="button" aria-current={index === safeRoomIndex ? 'page' : undefined} onClick={() => setRoomIndex(index)}>{room.number} 전시실 <small>{room.works.length}편</small></button>)}</nav>
                <p className="class-agit-canvas-caption">아이들의 문장이 주인공이 되는 공간. 액자를 눌러 학생의 시선으로 둘러보세요.</p>
            </section>
        </div> : <div className="class-agit-order-panel">
            <header><div><h3>{persistence ? '작품 순서와 수록 확인' : '작품 순서와 외부에 보일 이름'}</h3><p>{persistence ? '초안에서 빼기는 다음 공개판 갱신에 반영됩니다. 수록 철회는 현재 공개판에서도 즉시 열람을 중단합니다. 외부 공개는 별도 공유 화면에서 작품별로 확인합니다.' : '외부 공개본은 포함 여부를 따로 고릅니다. 제목·본문 속 이름도 전문에서 확인해 주세요.'}</p></div>{!persistence && <button type="button" className="class-agit-secondary" onClick={() => startPreview('external')}>외부 방문자로 미리보기 · {externalCount}편 ↗</button>}</header>
            {!draft.items.length && <p className="class-agit-empty">먼저 전시에 작품을 담아 주세요.</p>}
            <ol>{draft.items.map((item, index) => <li key={item.itemId || item.sourceId}>
                <span className="class-agit-order-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="class-agit-order-info"><strong>{item.title}</strong><small>{item.authorName} · {item.kindLabel} · {Math.floor(index / limits.worksPerRoom) + 1} 전시실</small>{(item.unavailable || item.revoked || item.sourceChanged) && <small className="class-agit-error">{item.unavailable ? '원글을 수록할 수 없음' : item.revoked ? '수록 철회됨' : '원글 내용 바뀜'}</small>}</div>
                <div className="class-agit-order-move"><button type="button" aria-label={`${item.title} 앞으로`} disabled={index === 0} onClick={() => changeDraft({ type: 'move', sourceId: item.sourceId, itemId: item.itemId, direction: -1 })}>↑</button><button type="button" aria-label={`${item.title} 뒤로`} disabled={index === draft.items.length - 1} onClick={() => changeDraft({ type: 'move', sourceId: item.sourceId, itemId: item.itemId, direction: 1 })}>↓</button></div>
                {persistence ? <div className="class-agit-header-actions"><button type="button" className="class-agit-secondary" disabled={!item.sourceId} onClick={() => readSource(item)}>전문 다시 확인</button><button type="button" className="class-agit-text-button" disabled={!item.itemId || item.revoked || dirty} onClick={() => runSavedAction('withdraw', item)}>수록 철회</button></div>
                    : <ExternalWorkSettings item={item} onChange={(change) => { setDraft(editExhibition(draft, change)); setMessage(''); }} />}
                <button type="button" className="class-agit-text-button" aria-label={`${item.title} 전시에서 빼기`} onClick={() => changeDraft({ type: 'remove', sourceId: item.sourceId, itemId: item.itemId })}>빼기</button>
            </li>)}</ol>
        </div>}
        </fieldset>
        {candidate && <ArtworkReader work={{ id: candidate.id, author: candidate.student_name, ...presentSource(candidate) }} onClose={() => setCandidate(null)}
            footer={<CandidateConfirmation onAdd={(acknowledged) => {
                setDraft(editExhibition(draft, { type: selectedSources.has(candidate.id) ? 'refresh' : 'add', source: candidate, classAcknowledged: acknowledged }));
                setCandidate(null); setMessage('작품을 전시에 담았습니다. 방과 액자는 자동으로 배치됩니다.');
            }} />} />}
    </section>;
}
