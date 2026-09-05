import { useEffect, useId, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton.jsx';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import { classAgitApi } from '../api/classAgitApi.js';
import { addBookItems, bookItemFromSource, sortBookItems } from './contract.js';
import { prepareAnthologyWindow } from './printWindow.js';
import { BOOK_PAPERS, BOOK_DESIGNS, getBookPaper, getBookDesign } from '../designs.js';
import DesignPicker from '../teacher/DesignPicker.jsx';
import BookCover from './BookCover.jsx';
import SourcePicker from './SourcePicker.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import '../classAgit.css';
import '../management.css';

// 전시 준비와 같은 네 단계로 나눈다. 작품을 담을수록 한 화면이 길어지던 것을 3단계 안으로 모았다.
const BOOK_STEPS = [
    { id: 'cover', title: '표지 · 여는 글', detail: '제목 · 학급명 · 여는 글' },
    { id: 'design', title: '판형 · 디자인', detail: '실제 출력 크기 · 표지' },
    { id: 'works', title: '작품 담기', detail: '학생 글 · 전시 작품 · 차례' },
    { id: 'publish', title: '확정 · 보관함', detail: '미리보기 · 새 판 · 학생 서가' },
];

export default function AnthologyManager({ activeClass, api = classAgitReleaseApi, sourceApi = classAgitApi, onExit }) {
    const [workspace, setWorkspace] = useState(null);
    const [book, setBook] = useState(null);
    const [step, setStep] = useState('cover');
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [picker, setPicker] = useState(false);
    const [source, setSource] = useState(null);
    const [projects, setProjects] = useState(null);
    const busyRef = useRef(false);
    const createId = useRef(null);
    const tabs = useRef(new Map());
    const stepId = useId();
    const { ask, confirmDialog } = useConfirmDialog();
    const classId = activeClass.id;
    useEffect(() => { let active = true; api.getBooks(classId).then((data) => { if (active) setWorkspace(data); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [api, classId]);
    const receive = (data) => { setWorkspace(data); setBook(data.book); setDirty(false); if (!data.book) { setPicker(false); setProjects(null); setSource(null); } };
    const openBook = (data) => { receive(data); setStep('cover'); };
    const run = async (task) => {
        if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); setMessage('');
        try { await task(); } catch (e) { setError(e.message || '문집을 처리하지 못했습니다.'); } finally { busyRef.current = false; setBusy(false); }
    };
    const edit = (next) => { setBook(next); setDirty(true); };
    const leave = async (next) => { if (!dirty || await ask({ title: '저장하지 않은 문집 편집을 닫을까요?', body: '저장된 초안과 확정판은 보관됩니다.' })) { setDirty(false); next(); } };
    // 저장 성공 여부를 돌려줘야 다음 단계로 넘길지 판단할 수 있다.
    const saveDraft = async () => {
        if (busyRef.current) return null;
        busyRef.current = true; setBusy(true); setError(''); setMessage('');
        try { const data = await api.saveBook(classId, book); receive(data); setMessage('문집 초안을 저장했습니다.'); return data; }
        catch (e) { setError(e.message || '문집을 처리하지 못했습니다.'); return null; }
        finally { busyRef.current = false; setBusy(false); }
    };
    const stepIndex = BOOK_STEPS.findIndex((entry) => entry.id === step);
    const selectStep = async (nextStep, saveFirst = false) => {
        if (busyRef.current) return;
        if (dirty && saveFirst && !await saveDraft()) return;
        setStep(nextStep);
        tabs.current.get(BOOK_STEPS.findIndex((entry) => entry.id === nextStep))?.focus({ preventScroll: true });
    };
    const act = async (action, extra = {}) => {
        if (dirty && action !== 'delete') { setError('편집 중인 내용을 먼저 저장해 주세요.'); return; }
        const labels = { delete: '이 문집을 삭제할까요?', finalize: '문집 새 판을 확정할까요?', archive: '이 문집을 보관할까요?', withdraw: '이 작품의 문집 수록을 철회할까요?', show: '이 확정판을 학생 서가에 공개할까요?' };
        if (Reflect.has(labels, action) && !await ask({ title: Reflect.get(labels, action), body: action === 'delete' ? '문집 초안과 모든 확정판이 삭제되고 학생 서가에서도 내려갑니다. 학생 원글과 전시관은 남습니다. 이미 내려받은 PDF는 남으며 삭제한 문집은 복구할 수 없습니다.' : action === 'withdraw' ? '이 작품을 담은 기존 확정판에서도 온라인 열람과 새 출력이 제한됩니다. 이미 내려받은 PDF는 회수되지 않습니다.' : '확정판의 내용은 이후 초안 편집과 원글 수정으로 바뀌지 않습니다.' })) return;
        run(async () => { receive(await api.bookAction(classId, action, { book_id: book.id, expected_revision: book.revision, confirmed: true, ...extra })); setMessage('문집에 반영했습니다.'); });
    };
    const removeFromList = async (entry) => {
        if (!await ask({ title: `“${entry.title}” 문집을 삭제할까요?`, body: '초안과 모든 확정판이 삭제되고 학생 서가에서도 내려갑니다. 학생 원글과 전시관은 남습니다. 삭제한 문집은 복구할 수 없습니다.', confirmLabel: '문집 삭제' })) return;
        run(async () => receive(await api.bookAction(classId, 'delete', { book_id: entry.id, expected_revision: entry.revision, confirmed: true })));
    };
    const printEdition = (edition = null) => run(async () => {
        const target = prepareAnthologyWindow();
        try { const [{ renderAnthologyWindow }, snapshot] = await Promise.all([import('./print.js'), edition ? api.getEdition(classId, edition.id) : api.getBookPreview(classId, book.id, book.revision)]); await renderAnthologyWindow(target, snapshot); setMessage('인쇄용 문집을 열었습니다. 인쇄 창에서 PDF로 저장할 수 있습니다.'); }
        catch (e) { target.close(); throw e; }
    });
    const move = (index, delta) => { const items = [...book.items]; const target = index + delta; if (target < 0 || target >= items.length) return; const item = items.splice(index, 1)[0]; items.splice(target, 0, item); edit({ ...book, grouping: 'custom', items }); };
    const selected = new Set(book?.items.map((item) => item.studentId));
    const locked = busy || book?.archived;
    const panel = (id) => ({ role: 'tabpanel', id: `${stepId}-panel-${id}`, 'aria-labelledby': `${stepId}-tab-${id}`, hidden: step !== id, className: 'class-agit-step-panel' });
    return <section className="class-agit class-agit-management class-agit-books">
        <header className="class-agit-project-heading"><div><span className="class-agit-eyebrow">우리반 아지트 · 학급 문집</span><h1>{book ? book.title : '우리 반의 책 만들기'}</h1></div>
            <div className="class-agit-header-actions"><TeacherGuideButton tabId="class-agit-books" variant="help" />{(book || onExit) && <Button variant="outline" type="button" disabled={busy} onClick={() => leave(() => { if (book) { setBook(null); setPicker(false); setProjects(null); setStep('cover'); } else onExit(); })}>{book ? '문집 목록' : '전시 관리로'}</Button>}</div></header>
        {error && <p className="class-agit-error" role="alert">{error}</p>}
        {!workspace && !error && <p role="status">문집을 불러오고 있습니다…</p>}
        {!book && workspace && <><p>표지와 차례를 꾸미고 우리 반의 글을 한 권의 책으로 모아 보세요.</p>{message && <p role="status">{message}</p>}<Button variant="primary" type="button" disabled={busy || workspace.books.length >= 20} onClick={() => run(async () => { createId.current ||= crypto.randomUUID(); openBook(await api.bookAction(classId, 'create', { book_id: createId.current })); createId.current = null; })}>새 문집 만들기</Button>
            <ul className="class-agit-projects">{workspace.books.map((entry) => <li key={entry.id}><strong>{entry.title}{entry.archived ? ' · 보관함' : ''}</strong><div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy} onClick={() => run(async () => openBook(await api.getBooks(classId, entry.id)))}>문집 열기</Button><Button variant="ghost" type="button" disabled={busy} onClick={() => removeFromList(entry)} aria-label={`${entry.title} 문집 삭제`}>삭제</Button></div></li>)}</ul></>}
        {book && <>
            <p className="class-agit-workbench-summary">{book.items.length}편의 작품 · {getBookPaper(book.paper_format).label} · {book.editions.length}개 확정판{book.archived ? ' · 보관함' : ''}</p>
            <div className="class-agit-steps" role="tablist" aria-label="문집 제작 단계">
                {BOOK_STEPS.map((entry, index) => <button key={entry.id} ref={(node) => { tabs.current.set(index, node); }} type="button" role="tab"
                    id={`${stepId}-tab-${entry.id}`} aria-controls={`${stepId}-panel-${entry.id}`} aria-selected={step === entry.id} tabIndex={step === entry.id ? 0 : -1}
                    onClick={() => selectStep(entry.id)} onKeyDown={(event) => {
                        let target;
                        if (event.key === 'ArrowRight') target = (index + 1) % BOOK_STEPS.length;
                        if (event.key === 'ArrowLeft') target = (index + BOOK_STEPS.length - 1) % BOOK_STEPS.length;
                        if (event.key === 'Home') target = 0;
                        if (event.key === 'End') target = BOOK_STEPS.length - 1;
                        if (target !== undefined) { event.preventDefault(); tabs.current.get(target)?.focus(); }
                    }}><span className="class-agit-step-number">{index + 1}</span><span><strong>{entry.title}</strong><small>{entry.detail}</small></span></button>)}
            </div>
            <div className="class-agit-status" role="status">{busy ? '문집을 처리하고 있습니다…' : message || (dirty ? '저장하지 않은 변경이 있습니다.' : '저장된 초안입니다.')}</div>
            {book.archived && <p className="class-agit-error" role="status">보관한 문집입니다. 4단계에서 복원하면 다시 편집할 수 있습니다.</p>}

            <div {...panel('cover')}>
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 01</span><h2>책의 첫인상을 정해요</h2><p>표지에 들어갈 제목과 학급명을 적고, 책을 여는 인사말을 남깁니다.</p></div>
                <div className="class-agit-book-layout"><BookCover book={book} />
                    <fieldset className="class-agit-book-settings" disabled={locked}><legend>표지 · 여는 글</legend>
                        {[['title', '문집 제목', 80], ['subtitle', '부제', 120], ['class_label', '표시 학급명', 80]].map(([key, label, max]) => <label key={key}>{label}<input value={Reflect.get(book, key)} maxLength={max} onChange={(e) => edit({ ...book, [key]: e.target.value })} /></label>)}
                        <label>발행일<input type="date" value={book.issue_date} onChange={(e) => edit({ ...book, issue_date: e.target.value })} /></label>
                        <label>여는 글<textarea value={book.introduction} maxLength={2000} rows={5} onChange={(e) => edit({ ...book, introduction: e.target.value })} /></label>
                    </fieldset></div>
            </div>

            <div {...panel('design')}>
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 02</span><h2>어떤 책으로 인쇄할지 골라요</h2><p>판형과 표지 디자인을 고르면 표지 미리보기가 바로 바뀝니다.</p></div>
                <div className="class-agit-book-layout"><BookCover book={book} />
                    <fieldset className="class-agit-design-picker" disabled={locked}><legend>판형 · 실제 출력 크기</legend><div className="class-agit-paper-options">
                        {BOOK_PAPERS.map((paper) => <label key={paper.id} className={`class-agit-paper-option${getBookPaper(book.paper_format).id === paper.id ? ' is-selected' : ''}`}>
                            <input type="radio" name="문집 판형" checked={getBookPaper(book.paper_format).id === paper.id} onChange={() => edit({ ...book, paper_format: paper.id })} />
                            <strong>{paper.label}</strong><span>{paper.width} × {paper.height} mm</span><small>{paper.description}</small>
                        </label>)}
                    </div><p className="class-agit-canvas-caption">판형에 맞춰 여백과 쪽 나눔을 조정합니다. 본문은 12pt, 시는 14pt를 유지합니다. 인쇄할 때 같은 용지 크기와 실제 크기(100%)를 선택해 주세요.</p></fieldset></div>
                <DesignPicker label="문집 디자인" type="book" options={BOOK_DESIGNS} value={getBookDesign(book.design_id).id} onChange={(design_id) => edit({ ...book, design_id })} disabled={locked} />
            </div>

            <div {...panel('works')}>
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 03</span><h2>책에 담을 글을 모아요</h2><p>학생 글에서 바로 담거나 만들어 둔 전시의 작품을 가져옵니다. 차례의 순서는 여기서 정합니다.</p></div>
                <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={locked} onClick={() => setPicker(!picker)}>학생 글에서 담기</Button>
                    <Button variant="outline" type="button" disabled={locked} onClick={() => run(async () => setProjects((await sourceApi.getWorkspace(classId)).projects))}>전시 작품 가져오기</Button>
                    <label>작품 묶기<select value={book.grouping} disabled={locked} onChange={(e) => edit({ ...book, grouping: e.target.value, items: sortBookItems(book.items, e.target.value) })}><option value="custom">직접 정한 순서</option><option value="author">학생별</option><option value="topic">주제별</option></select></label></div>
                {projects && <div className="class-agit-book-picker"><h3>가져올 전시</h3>{projects.length === 0 && <p>아직 전시가 없습니다. 학생 글에서 바로 담을 수 있습니다.</p>}{projects.map((project) => <Button variant="outline" type="button" key={project.id} disabled={busy} onClick={() => run(async () => {
                    const data = await sourceApi.getWorkspace(classId, project.id);
                    const items = data.draft.items.filter((item) => !item.unavailable && !item.revoked).map((item) => ({ ...item, author: item.authorName, group: item.groupTitle || '' }));
                    const next = addBookItems(book, items); edit({ ...next, items: sortBookItems(next.items, next.grouping) }); setProjects(null); setMessage('전시 작품을 가져왔습니다.');
                })}>{project.title} 가져오기</Button>)}<Button variant="outline" type="button" onClick={() => setProjects(null)}>가져오기 닫기</Button></div>}
                {picker && <SourcePicker key={`${classId}:${book.id}`} items={book.items} classId={classId} api={sourceApi} onClose={() => setPicker(false)} onAdd={(values) => { const next = addBookItems(book, values.map((value) => bookItemFromSource(value, classId))); edit({ ...next, items: sortBookItems(next.items, next.grouping) }); }} />}
                <div className="class-agit-project-heading"><h3>차례 · {book.items.length}편</h3></div>
                <div className="class-agit-order-panel"><ol className="class-agit-book-items">{book.items.map((item, index) => <li key={item.itemId || item.sourceId}><div><strong>{item.title}</strong><p>{item.author} · {item.group}</p>{(item.sourceChanged || item.unavailable || item.revoked) && <span className="class-agit-error">원글 재확인 필요</span>}</div>
                    <div className="class-agit-header-actions"><Button variant="outline" type="button" onClick={() => setSource({ ...item, id: item.itemId || item.sourceId })}>읽기</Button>
                        <Button variant="outline" type="button" disabled={locked || !item.sourceId} onClick={() => run(async () => { const current = await sourceApi.getSource(classId, item.sourceId); setSource({ ...bookItemFromSource(current, classId), id: item.sourceId, refreshing: true }); })}>원글 재확인</Button>
                        <Button variant="outline" type="button" aria-label={`${item.title} 위로`} disabled={locked || index === 0} onClick={() => move(index, -1)}>↑</Button><Button variant="outline" type="button" aria-label={`${item.title} 아래로`} disabled={locked || index === book.items.length - 1} onClick={() => move(index, 1)}>↓</Button>
                        <Button variant="outline" type="button" disabled={locked} onClick={() => edit({ ...book, items: book.items.filter((_, i) => i !== index) })}>초안에서 빼기</Button>
                        {item.itemId && <Button variant="outline" type="button" disabled={busy || dirty || item.revoked} onClick={() => act('withdraw', { item_id: item.itemId })}>수록 철회</Button>}</div></li>)}</ol>
                    {!book.items.length && <p className="class-agit-empty">아직 담은 작품이 없습니다. 위에서 학생 글이나 전시 작품을 담아 주세요.</p>}</div>
                <details className="class-agit-participation"><summary>아직 작품이 없는 학생 {workspace.students.filter((student) => !selected.has(student.id)).length}명</summary><p>{workspace.students.filter((student) => !selected.has(student.id)).map((student) => student.name).join(' · ') || '모두 수록했습니다.'}</p></details>
            </div>

            <div {...panel('publish')}>
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 04</span><h2>인쇄하고 한 판으로 확정해요</h2><p>초안을 미리 출력해 보고 새 판을 확정합니다. 확정판은 이후 편집과 원글 수정으로 바뀌지 않습니다.</p></div>
                <div className="class-agit-header-actions">
                    <Button variant="outline" type="button" disabled={busy || dirty || !book.items.length || book.archived} onClick={() => printEdition()}>초안 {getBookPaper(book.paper_format).label} 미리보기</Button>
                    <Button variant="primary" type="button" disabled={busy || dirty || !book.items.length || book.archived} onClick={() => act('finalize')}>새 판 확정</Button></div>
                {dirty && <p>편집 내용을 먼저 저장하면 미리보기와 확정을 할 수 있습니다.</p>}
                {!book.items.length && <p>3단계에서 작품을 담으면 확정할 수 있습니다.</p>}
                <h3>확정판 보관함</h3><p>확정판의 내용과 설정을 보관합니다. PDF 파일은 인쇄 창에서 직접 저장합니다.</p>
                <ul className="class-agit-projects">{book.editions.map((edition) => <li key={edition.id}><div><strong>{edition.number}판 · {edition.title}</strong><p>{edition.student_visible ? '학생 서가 공개 중' : '교사 보관'} · {new Date(edition.created_at).toLocaleDateString('ko-KR')}</p></div><div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy} onClick={() => printEdition(edition)}>{getBookPaper(edition.print?.paper).label} 미리보기 · PDF 저장</Button><Button variant="outline" type="button" disabled={busy || dirty || book.archived} onClick={() => act(edition.student_visible ? 'hide' : 'show', { edition_id: edition.id })}>{edition.student_visible ? '학생 서가에서 숨기기' : '학생 서가에 공개'}</Button></div></li>)}</ul>
                {!book.editions.length && <p className="class-agit-empty">아직 확정한 판이 없습니다.</p>}
                <details className="class-agit-exhibition-management"><summary>문집 관리</summary><div className="class-agit-header-actions">
                    <Button variant="outline" type="button" disabled={busy} onClick={() => leave(() => run(async () => receive(await api.getBooks(classId, book.id))))}>최신 문집 불러오기</Button>
                    <Button variant="ghost" type="button" disabled={busy || dirty} onClick={() => act(book.archived ? 'restore' : 'archive')}>{book.archived ? '문집 복원' : '문집 보관'}</Button>
                    <Button variant="ghost" type="button" disabled={busy} onClick={() => act('delete')}>문집 삭제</Button>
                </div></details>
            </div>

            <footer className="class-agit-step-footer"><Button variant="ghost" type="button" disabled={busy || stepIndex === 0} onClick={() => selectStep(BOOK_STEPS[stepIndex - 1].id)}>← 이전 단계</Button>
                <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy || !dirty || book.archived} onClick={saveDraft}>문집 초안 저장</Button>
                    {stepIndex < BOOK_STEPS.length - 1 ? <Button variant="primary" type="button" disabled={busy} onClick={() => selectStep(BOOK_STEPS[stepIndex + 1].id, true)}>{dirty && !book.archived ? '저장 후 ' : ''}{BOOK_STEPS[stepIndex + 1].title} →</Button>
                        : <Button variant="outline" type="button" disabled={busy} onClick={() => leave(() => { setBook(null); setPicker(false); setProjects(null); setStep('cover'); })}>문집 목록으로</Button>}
                </div>
            </footer>
        </>}
        {source && <ArtworkReader work={source} onClose={() => setSource(null)} footer={source.refreshing ? <Button variant="primary" type="button" onClick={() => { edit({ ...book, items: book.items.map((item) => item.sourceId === source.sourceId ? { ...source, itemId: item.itemId } : item) }); setSource(null); }}>이 내용으로 반영</Button> : <Button variant="outline" type="button" onClick={() => setSource(null)}>읽기 닫기</Button>} />}
        {confirmDialog}
    </section>;
}
