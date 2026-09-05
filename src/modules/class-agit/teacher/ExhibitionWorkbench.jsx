import { useId, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton.jsx';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import { createExhibitionDraft, createGalleryPresentation, editExhibition } from '../exhibitionDraft.js';
import { getSourceExclusion, presentSource } from '../sourceContract.js';
import { arrangeGalleryRooms } from '../gallery/roomLayout.js';
import GalleryViewer from '../gallery/GalleryViewer.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import '../classAgit.css';
import '../management.css';

function CandidateConfirmation({ onAdd }) {
    const [acknowledged, setAcknowledged] = useState(false);
    const [error, setError] = useState('');
    return <div className="class-agit-confirmation class-agit-management-confirmation">
        <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />이 작품의 학급 전시 수록 의사를 확인했습니다.</label>
        <p>문집 수록과 외부 공개는 별도로 확인합니다.</p>
        {error && <p role="alert">{error}</p>}
        <Button variant="primary" type="button" disabled={!acknowledged} onClick={() => {
            try { onAdd(acknowledged); } catch (reason) { setError(reason.message); }
        }}>전시에 담기</Button>
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

const EXHIBITION_STEPS = [
    { id: 'settings', title: '기본 설정', detail: '이름 · 소개 · 학생 공개' },
    { id: 'works', title: '작품 선택·순서', detail: '작품 담기 · 전시 순서' },
    { id: 'preview', title: '미리보기', detail: '학생의 시선으로 감상' },
    { id: 'share', title: '외부 읽기 공유', detail: '공개 작품 · 주소 관리' },
];

export default function ExhibitionWorkbench({ activeClass, sources = [], students = [], initialDraft, persistence }) {
    const [draft, setDraft] = useState(() => initialDraft || createExhibitionDraft(activeClass?.id));
    const [savedDraft, setSavedDraft] = useState(() => initialDraft || null);
    const [query, setQuery] = useState('');
    const [candidate, setCandidate] = useState(null);
    const [step, setStep] = useState('settings');
    const [previewMode, setPreviewMode] = useState('draft');
    const [externalPreview, setExternalPreview] = useState(false);
    const [shareRevision, setShareRevision] = useState(null);
    const [shareState, setShareState] = useState({ busy: false, dirty: false, hasLink: false });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const tabs = useRef(new Map());
    const stepId = useId();
    const { ask, confirmDialog } = useConfirmDialog();
    const presentation = createGalleryPresentation(draft);
    const rooms = arrangeGalleryRooms(presentation.works);
    const selectedStudents = new Set(draft.items.map((item) => item.studentId));
    const unselectedStudents = students.filter((student) => !selectedStudents.has(student.id));
    const selectedSources = new Set(draft.items.map((item) => item.sourceId));
    const candidateSources = persistence ? sources : sources.filter((source) => `${source.title} ${source.student_name}`.toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR')));
    const candidates = candidateSources.slice(0, limits.maxCandidates).map((source) => ({ source, reason: persistence ? '' : getSourceExclusion(source, activeClass?.id) }));
    const externalCount = draft.items.filter((item) => item.scopes.external).length;
    const dirty = savedDraft?.revision !== draft.revision;
    const locked = busy || persistence?.busy || shareState.busy;
    const stepIndex = EXHIBITION_STEPS.findIndex((entry) => entry.id === step);
    const blockedWorks = draft.items.some((item) => item.sourceChanged || item.unavailable || item.revoked);
    const perform = async (operation) => {
        if (busyRef.current) return null;
        busyRef.current = true; setBusy(true); setError('');
        try { return await operation(); } catch (reason) { setError(reason.message || '전시 요청을 처리하지 못했습니다. 다시 시도해 주세요.'); return null; }
        finally { busyRef.current = false; setBusy(false); }
    };
    const receiveDraft = (next) => { setDraft(next); setSavedDraft(next); };
    const saveDraft = () => perform(async () => {
        if (!draft.title.trim()) throw new Error('전시 이름을 입력해 주세요.');
        const next = persistence ? await persistence.save(draft, savedDraft.revision) : structuredClone(draft);
        receiveDraft(next); setMessage(persistence ? '초안을 저장했습니다. 공개 중인 내용은 공개판 갱신으로 반영합니다.' : '이 화면에 초안을 보관했습니다.');
        return next;
    });
    const selectStep = async (nextStep, saveFirst = false) => {
        if (locked || busyRef.current) return;
        if (nextStep === 'share' && shareRevision !== null && (dirty || shareRevision !== savedDraft?.revision) && (shareState.dirty || shareState.hasLink)) {
            if (!await ask({ title: '수정한 전시로 공유 설정을 다시 준비할까요?', body: '외부 공유의 입력 내용이 초기화됩니다. 새로 발급한 주소가 있다면 먼저 복사해 주세요. 발행된 공개본은 유지됩니다.', confirmLabel: '다시 준비' })) return;
        }
        let current = savedDraft;
        if (dirty && (saveFirst || nextStep === 'share')) { current = await saveDraft(); if (!current) return; }
        if (nextStep === 'share') setShareRevision(current?.revision ?? draft.revision);
        if (nextStep === 'preview') setPreviewMode('draft');
        setStep(nextStep);
        tabs.current.get(EXHIBITION_STEPS.findIndex((entry) => entry.id === nextStep))?.focus({ preventScroll: true });
    };
    const exit = async () => {
        if (dirty || shareState.dirty || shareState.hasLink) {
            if (!await ask({ title: '전시 목록으로 돌아갈까요?', body: '저장하지 않은 편집은 사라집니다. 새 외부 공유 주소가 있다면 먼저 복사해 주세요.', confirmLabel: '목록으로' })) return;
        }
        persistence.exit();
    };
    const readSource = (source) => persistence
        ? perform(async () => setCandidate(await persistence.readSource(source.id || source.sourceId))) : setCandidate(source);
    const runSavedAction = async (action, item) => {
        const titles = { publish: '저장한 전시를 학급에 공개할까요?', unpublish: '학급 공개를 중단할까요?', archive: '전시를 보관할까요?', restore: '전시를 초안으로 돌릴까요?', withdraw: '이 작품의 수록을 철회할까요?' };
        if (!await ask({ title: Reflect.get(titles, action), body: action === 'withdraw' ? '공개판에서도 이 작품의 열람이 중단됩니다. 다시 공개하려면 전문과 수록 의사를 재확인해야 합니다.' : '저장된 전시를 기준으로 처리합니다.', confirmLabel: '진행하기' })) return;
        await perform(async () => { receiveDraft(await persistence.action(action, savedDraft.revision, item)); setMessage('전시 상태를 반영했습니다.'); });
    };
    const changeDraft = (change) => {
        try { setDraft(editExhibition(draft, change)); setMessage(''); setError(''); }
        catch (reason) { setError(reason.message); }
    };
    const publicationActions = persistence && <div className="class-agit-publication-actions">
        <span className="class-agit-tag">{draft.state === 'published' ? `${draft.publicationNo}판 · 학급 공개 중` : draft.state === 'archived' ? '보관한 전시' : '비공개 초안'}</span>
        <Button variant="primary" type="button" disabled={dirty || draft.state === 'archived' || !draft.items.length || !persistence.moduleEnabled || blockedWorks} onClick={() => runSavedAction('publish')}>{draft.publicationNo ? '공개판 갱신' : '학급에 공개'}</Button>
        {draft.state === 'published' && <Button variant="outline" type="button" disabled={dirty} onClick={() => runSavedAction('unpublish')}>공개 중단</Button>}
    </div>;

    return <section className="class-agit class-agit-management class-agit-workbench">
        {confirmDialog}
        <fieldset className="class-agit-edit-body" disabled={locked}>
            <header className="class-agit-workbench__header">
                <div className="class-agit-brand"><span aria-hidden="true">✦</span><div><p>{activeClass?.name || '우리 반'} · 전시 준비</p><h1>{draft.title || '새 전시'}</h1></div></div>
                <div className="class-agit-header-actions"><TeacherGuideButton tabId="class-agit" variant="help" />{persistence && <Button variant="ghost" type="button" onClick={exit}>← 전시 목록</Button>}</div>
            </header>
            <p className="class-agit-workbench-summary">{draft.items.length}편의 작품 · {rooms.length}개 전시실 · {selectedStudents.size}명의 작가</p>
            <div className="class-agit-steps" role="tablist" aria-label="전시 준비 단계">
                {EXHIBITION_STEPS.map((entry, index) => <button key={entry.id} ref={(node) => { tabs.current.set(index, node); }} type="button" role="tab"
                    id={`${stepId}-tab-${entry.id}`} aria-controls={`${stepId}-panel-${entry.id}`} aria-selected={step === entry.id} tabIndex={step === entry.id ? 0 : -1}
                    onClick={() => selectStep(entry.id)} onKeyDown={(event) => {
                        let target;
                        if (event.key === 'ArrowRight') target = (index + 1) % EXHIBITION_STEPS.length;
                        if (event.key === 'ArrowLeft') target = (index + EXHIBITION_STEPS.length - 1) % EXHIBITION_STEPS.length;
                        if (event.key === 'Home') target = 0;
                        if (event.key === 'End') target = EXHIBITION_STEPS.length - 1;
                        if (target !== undefined) { event.preventDefault(); tabs.current.get(target)?.focus(); }
                    }}><span className="class-agit-step-number">{index + 1}</span><span><strong>{entry.title}</strong><small>{entry.detail}</small></span></button>)}
            </div>
            <div className="class-agit-status" role="status">{busy ? '전시를 처리하고 있습니다…' : message || (dirty ? '저장하지 않은 변경이 있습니다.' : '저장된 초안입니다.')}</div>
            {error && <p className="class-agit-error" role="alert">{error}</p>}
            {blockedWorks && <p className="class-agit-error" role="status">상태가 바뀐 작품이 있습니다. 2단계에서 전문을 다시 확인하거나 초안에서 빼 주세요.</p>}

            <div role="tabpanel" id={`${stepId}-panel-settings`} aria-labelledby={`${stepId}-tab-settings`} hidden={step !== 'settings'} className="class-agit-step-panel">
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 01</span><h2>전시의 첫인상을 정해요</h2><p>전시 이름과 소개를 적고, 우리 반 학생에게 보여 줄 준비를 합니다.</p></div>
                <div className="class-agit-settings-layout">
                    <div className="class-agit-settings-card"><h3>이름과 소개</h3><label>전시 제목<input value={draft.title} maxLength={limits.titleLength} onChange={(event) => changeDraft({ type: 'metadata', title: event.target.value, introduction: draft.introduction })} /></label><label>전시 소개<textarea rows={4} value={draft.introduction} maxLength={limits.introductionLength} onChange={(event) => changeDraft({ type: 'metadata', title: draft.title, introduction: event.target.value })} /></label></div>
                    <div className="class-agit-settings-card"><h3>우리 반 학생 공개</h3>
                        {persistence ? <><label className="class-agit-access-toggle"><input type="checkbox" checked={persistence.moduleEnabled} onChange={(event) => perform(() => persistence.setEnabled(event.target.checked))} />학급 학생 공개 켜기</label>
                            <p>이 학급의 전시·문집 학생 입구를 켭니다. 작품을 담고 저장한 뒤 이 전시를 학급에 공개해 주세요.</p>{publicationActions}
                            {dirty && <p>편집 내용을 먼저 저장하면 공개 설정을 반영할 수 있습니다.</p>}
                            {!draft.items.length && <p>2단계에서 작품을 담으면 전시를 공개할 수 있습니다.</p>}
                        </> : <p>시안에서는 학생 화면을 미리 볼 수 있습니다. 실제 공개는 저장·공개 샘플이나 담당 학급에서 설정합니다.</p>}
                        <p>외부 방문자의 읽기 공유는 4단계에서 별도로 설정합니다.</p>
                    </div>
                </div>
                {persistence && <details className="class-agit-exhibition-management"><summary>전시 관리</summary><div className="class-agit-header-actions">
                    <Button variant="outline" type="button" onClick={async () => { if (!dirty || await ask({ title: '편집 중인 내용을 버리고 최신 초안을 불러올까요?', confirmLabel: '최신 초안 불러오기' })) perform(async () => { receiveDraft(await persistence.reload()); setMessage('최신 초안을 불러왔습니다.'); }); }}>최신 초안 불러오기</Button>
                    <Button variant="ghost" type="button" disabled={dirty} onClick={() => runSavedAction(draft.state === 'archived' ? 'restore' : 'archive')}>{draft.state === 'archived' ? '초안으로 복원' : '전시 보관'}</Button>
                </div></details>}
            </div>

            <div role="tabpanel" id={`${stepId}-panel-works`} aria-labelledby={`${stepId}-tab-works`} hidden={step !== 'works'} className="class-agit-step-panel">
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 02</span><h2>이 전시에 담을 작품을 골라요</h2><p>전문을 읽고 수록을 확인한 작품만 담습니다. 위에서부터 {limits.worksPerRoom}편씩 전시실에 배치됩니다.</p></div>
                <div className="class-agit-editor-layout">
                    <aside className="class-agit-candidates"><div className="class-agit-panel-heading"><h3>우리 반의 글</h3><span>{candidates.filter((item) => !item.reason).length}편 선택 가능</span></div>
                        <label className="class-agit-search">작품 찾기<input value={query} maxLength={80} placeholder="제목 또는 학생 이름" onChange={(event) => setQuery(event.target.value)} /></label>
                        {persistence && <Button variant="outline" type="button" onClick={() => perform(() => persistence.search(query))}>검색</Button>}
                        <div className="class-agit-candidates__list">{candidates.map(({ source, reason }) => <article key={source.id}><span className="class-agit-candidate-avatar" aria-hidden="true">{source.student_name.slice(0, 1)}</span><div><strong>{source.title}</strong><small>{source.student_name} · {source.group_title || '글쓰기'}</small><Button variant="outline" type="button" disabled={Boolean(reason) || selectedSources.has(source.id) || draft.items.length >= limits.maxWorks} onClick={() => readSource(source)}>{reason || (selectedSources.has(source.id) ? '✓ 전시에 담음' : '전문 보고 담기 +')}</Button></div></article>)}{!candidates.length && <p>찾는 작품이 없습니다.</p>}</div>
                        {persistence?.hasMore && <Button variant="outline" type="button" onClick={() => perform(() => persistence.more())}>다음 후보 보기</Button>}
                        <details className="class-agit-participation"><summary>아직 선정하지 않은 작가 {unselectedStudents.length}명</summary><p>{unselectedStudents.map((student) => student.name).join(' · ') || '모든 작가의 작품을 담았습니다.'}</p></details>
                    </aside>
                    <div className="class-agit-order-panel"><header><div><h3>선택한 작품 · {draft.items.length}/{limits.maxWorks}편</h3><p>화살표로 순서를 바꾸면 전시실도 함께 바뀝니다.</p></div></header>
                        {!draft.items.length && <p className="class-agit-empty">우리 반의 글에서 첫 작품을 담아 주세요.</p>}
                        <ol>{draft.items.map((item, index) => <li key={item.itemId || item.sourceId}><span className="class-agit-order-number">{String(index + 1).padStart(2, '0')}</span><div className="class-agit-order-info"><strong>{item.title}</strong><small>{item.authorName} · {item.kindLabel} · {Math.floor(index / limits.worksPerRoom) + 1} 전시실</small>{(item.unavailable || item.revoked || item.sourceChanged) && <small className="class-agit-error">{item.unavailable ? '원글을 수록할 수 없음' : item.revoked ? '수록 철회됨' : '원글 내용 바뀜'}</small>}</div>
                            <div className="class-agit-order-controls"><div className="class-agit-order-move"><Button variant="outline" type="button" aria-label={`${item.title} 앞으로`} disabled={index === 0} onClick={() => changeDraft({ type: 'move', sourceId: item.sourceId, itemId: item.itemId, direction: -1 })}>↑</Button><Button variant="outline" type="button" aria-label={`${item.title} 뒤로`} disabled={index === draft.items.length - 1} onClick={() => changeDraft({ type: 'move', sourceId: item.sourceId, itemId: item.itemId, direction: 1 })}>↓</Button></div>
                            {persistence && <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={!item.sourceId} onClick={() => readSource(item)}>전문 다시 확인</Button><Button variant="ghost" type="button" disabled={!item.itemId || item.revoked || dirty} onClick={() => runSavedAction('withdraw', item)}>수록 철회</Button></div>}
                            <Button variant="ghost" type="button" aria-label={`${item.title} 전시에서 빼기`} onClick={() => changeDraft({ type: 'remove', sourceId: item.sourceId, itemId: item.itemId })}>빼기</Button></div>
                        </li>)}</ol>
                        {persistence && <p className="class-agit-canvas-caption">초안에서 빼기는 다음 공개판 갱신에 반영됩니다. 수록 철회는 현재 공개판의 열람도 중단합니다.</p>}
                    </div>
                </div>
            </div>

            <div role="tabpanel" id={`${stepId}-panel-preview`} aria-labelledby={`${stepId}-tab-preview`} hidden={step !== 'preview'} className="class-agit-step-panel">
                {step === 'preview' && <><div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 03</span><h2>학생의 시선으로 둘러봐요</h2><p>전시실과 목록을 넘기며 제목·작품 순서·본문을 확인합니다.</p></div>
                    <div className="class-agit-preview-toolbar"><div className="class-agit-segmented" role="group" aria-label="미리보기 기준"><Button variant={previewMode === 'draft' ? 'primary' : 'ghost'} type="button" aria-pressed={previewMode === 'draft'} onClick={() => setPreviewMode('draft')}>초안 미리보기</Button>{persistence && draft.state === 'published' && <Button variant={previewMode === 'published' ? 'primary' : 'ghost'} type="button" aria-pressed={previewMode === 'published'} disabled={dirty} onClick={() => setPreviewMode('published')}>공개판 확인</Button>}</div>{publicationActions}</div>
                    {previewMode === 'published' && persistence?.renderPublication ? persistence.renderPublication(() => setPreviewMode('draft')) : <GalleryViewer key={draft.revision} exhibition={presentation} embedded onExit={() => selectStep('works')} />}
                </>}
            </div>

            <div role="tabpanel" id={`${stepId}-panel-share`} aria-labelledby={`${stepId}-tab-share`} hidden={step !== 'share'} className="class-agit-step-panel">
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 04</span><h2>외부 읽기 공유를 준비해요</h2><p>외부 공개할 작품과 표시 이름을 확인하고 공유 주소를 관리합니다.</p></div>
                {persistence ? (shareRevision !== null && (persistence.renderShare ? persistence.renderShare({ key: shareRevision, onStateChange: setShareState }) : <p className="class-agit-empty">이 샘플은 저장·학급 공개까지 점검합니다. 문집·외부 공유 통합 샘플에서 주소 설정을 확인할 수 있습니다.</p>))
                    : externalPreview ? <GalleryViewer exhibition={createGalleryPresentation(draft, 'external')} embedded onExit={() => setExternalPreview(false)} /> : <div className="class-agit-order-panel"><p>실제 링크를 만들지 않는 시안입니다. 작품별 외부 수록 확인과 가림 이름을 정해 보세요.</p><ul className="class-agit-book-items">{draft.items.map((item) => <li key={item.sourceId}><strong>{item.title}</strong><ExternalWorkSettings item={item} onChange={changeDraft} /></li>)}</ul><Button variant="outline" type="button" onClick={() => setExternalPreview(true)}>외부 방문자로 미리보기 · {externalCount}편 ↗</Button></div>}
            </div>

            <footer className="class-agit-step-footer"><Button variant="ghost" type="button" disabled={stepIndex === 0} onClick={() => selectStep(EXHIBITION_STEPS[stepIndex - 1].id)}>← 이전 단계</Button>
                <div className="class-agit-header-actions">{step !== 'share' && <Button variant="outline" type="button" disabled={!draft.title.trim()} onClick={saveDraft}>{persistence ? '초안 저장' : '시안 초안 보관'}</Button>}
                    {stepIndex < EXHIBITION_STEPS.length - 1 ? <Button variant="primary" type="button" onClick={() => selectStep(EXHIBITION_STEPS[stepIndex + 1].id, true)}>{dirty ? '저장 후 ' : ''}{EXHIBITION_STEPS[stepIndex + 1].title} →</Button> : persistence && <Button variant="outline" type="button" onClick={exit}>전시 목록으로</Button>}
                </div>
            </footer>
        </fieldset>
        {candidate && <ArtworkReader work={{ id: candidate.id, author: candidate.student_name, ...presentSource(candidate) }} onClose={() => setCandidate(null)} footer={<CandidateConfirmation onAdd={(acknowledged) => {
            setDraft(editExhibition(draft, { type: selectedSources.has(candidate.id) ? 'refresh' : 'add', source: candidate, classAcknowledged: acknowledged }));
            setCandidate(null); setMessage('작품을 전시에 담았습니다. 방과 액자는 자동으로 배치됩니다.');
        }} />} />}
    </section>;
}
