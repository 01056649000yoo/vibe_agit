import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton.jsx';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import { classAgitApi } from '../api/classAgitApi.js';
import { addBookItems, bookItemFromSource, sortBookItems } from './contract.js';
import { prepareAnthologyWindow } from './printWindow.js';
import SourcePicker from './SourcePicker.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import '../classAgit.css';
import '../management.css';

export default function AnthologyManager({ activeClass, api = classAgitReleaseApi, sourceApi = classAgitApi, onExit }) {
    const [workspace, setWorkspace] = useState(null);
    const [book, setBook] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [picker, setPicker] = useState(false);
    const [source, setSource] = useState(null);
    const [projects, setProjects] = useState(null);
    const busyRef = useRef(false);
    const createId = useRef(null);
    const { ask, confirmDialog } = useConfirmDialog();
    const classId = activeClass.id;
    useEffect(() => { let active = true; api.getBooks(classId).then((data) => { if (active) setWorkspace(data); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [api, classId]);
    const receive = (data) => { setWorkspace(data); setBook(data.book); setDirty(false); };
    const run = async (task) => {
        if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); setMessage('');
        try { await task(); } catch (e) { setError(e.message || '문집을 처리하지 못했습니다.'); } finally { busyRef.current = false; setBusy(false); }
    };
    const edit = (next) => { setBook(next); setDirty(true); };
    const leave = async (next) => { if (!dirty || await ask({ title: '저장하지 않은 문집 편집을 닫을까요?', body: '저장된 초안과 확정판은 보관됩니다.' })) { setDirty(false); next(); } };
    const act = async (action, extra = {}) => {
        if (dirty) { setError('편집 중인 내용을 먼저 저장해 주세요.'); return; }
        const labels = { finalize: '문집 새 판을 확정할까요?', archive: '이 문집을 보관할까요?', withdraw: '이 작품의 문집 수록을 철회할까요?', show: '이 확정판을 학생 서가에 공개할까요?' };
        if (Reflect.has(labels, action) && !await ask({ title: Reflect.get(labels, action), body: action === 'withdraw' ? '이 작품을 담은 기존 확정판에서도 온라인 열람과 새 출력이 제한됩니다. 이미 내려받은 PDF는 회수되지 않습니다.' : '확정판의 내용은 이후 초안 편집과 원글 수정으로 바뀌지 않습니다.' })) return;
        run(async () => { receive(await api.bookAction(classId, action, { book_id: book.id, expected_revision: book.revision, confirmed: true, ...extra })); setMessage('문집에 반영했습니다.'); });
    };
    const printEdition = (edition = null) => run(async () => {
        const target = prepareAnthologyWindow();
        try { const [{ renderAnthologyWindow }, snapshot] = await Promise.all([import('./print.js'), edition ? api.getEdition(classId, edition.id) : api.getBookPreview(classId, book.id, book.revision)]); await renderAnthologyWindow(target, snapshot); setMessage('인쇄용 문집을 열었습니다. 인쇄 창에서 PDF로 저장할 수 있습니다.'); }
        catch (e) { target.close(); throw e; }
    });
    const move = (index, delta) => { const items = [...book.items]; const target = index + delta; if (target < 0 || target >= items.length) return; const item = items.splice(index, 1)[0]; items.splice(target, 0, item); edit({ ...book, grouping: 'custom', items }); };
    const selected = new Set(book?.items.map((item) => item.studentId));
    return <section className="class-agit class-agit-management class-agit-books">
        <header className="class-agit-project-heading"><div><span className="class-agit-eyebrow">우리반 아지트 · 학급 문집</span><h1>{book ? book.title : '우리 반의 책 만들기'}</h1></div>
            <div className="class-agit-header-actions"><TeacherGuideButton tabId="class-agit" variant="help" /><Button variant="outline" type="button" disabled={busy} onClick={() => leave(() => { if (book) { setBook(null); setPicker(false); setProjects(null); } else onExit(); })}>{book ? '문집 목록' : '전시 관리로'}</Button></div></header>
        {error && <p className="class-agit-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        {!workspace && !error && <p role="status">문집을 불러오고 있습니다…</p>}
        {!book && workspace && <><p>표지와 차례를 꾸미고 우리 반의 글을 한 권의 책으로 모아 보세요.</p><Button variant="primary" type="button" disabled={busy || workspace.books.length >= 20} onClick={() => run(async () => { createId.current ||= crypto.randomUUID(); receive(await api.bookAction(classId, 'create', { book_id: createId.current })); createId.current = null; })}>새 문집 만들기</Button>
            <ul className="class-agit-projects">{workspace.books.map((entry) => <li key={entry.id}><strong>{entry.title}{entry.archived ? ' · 보관함' : ''}</strong><Button variant="outline" type="button" disabled={busy} onClick={() => run(async () => receive(await api.getBooks(classId, entry.id)))}>문집 열기</Button></li>)}</ul></>}
        {book && <>
            <div className="class-agit-book-layout"><div className="class-agit-book-cover" aria-label="문집 표지 미리보기"><span>{book.term || '우리 반의 이야기'}</span><h2>{book.title}</h2><p>{book.subtitle}</p><div aria-hidden="true">✦</div><p>{book.class_label}</p><small>{book.issue_date}</small></div>
                <fieldset className="class-agit-book-settings" disabled={busy || book.archived}><legend>표지 · 여는 글</legend>
                    {[['title', '문집 제목', 80], ['subtitle', '부제', 120], ['class_label', '표시 학급명', 80], ['term', '학기', 40]].map(([key, label, max]) => <label key={key}>{label}<input value={Reflect.get(book, key)} maxLength={max} onChange={(e) => edit({ ...book, [key]: e.target.value })} /></label>)}
                    <label>발행일<input type="date" value={book.issue_date} onChange={(e) => edit({ ...book, issue_date: e.target.value })} /></label>
                    <label>여는 글<textarea value={book.introduction} maxLength={2000} rows={5} onChange={(e) => edit({ ...book, introduction: e.target.value })} /></label>
                </fieldset></div>
            <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy || book.archived} onClick={() => setPicker(!picker)}>학생 글에서 담기</Button>
                <Button variant="outline" type="button" disabled={busy || book.archived} onClick={() => run(async () => setProjects((await sourceApi.getWorkspace(classId)).projects))}>전시 작품 가져오기</Button>
                <label>작품 묶기<select value={book.grouping} disabled={busy || book.archived} onChange={(e) => edit({ ...book, grouping: e.target.value, items: sortBookItems(book.items, e.target.value) })}><option value="custom">직접 정한 순서</option><option value="author">학생별</option><option value="topic">주제별</option></select></label></div>
            {projects && <div className="class-agit-book-picker"><h2>가져올 전시</h2>{projects.length === 0 && <p>아직 전시가 없습니다. 학생 글에서 바로 담을 수 있습니다.</p>}{projects.map((project) => <Button variant="outline" type="button" key={project.id} disabled={busy} onClick={() => run(async () => {
                const data = await sourceApi.getWorkspace(classId, project.id);
                const items = data.draft.items.filter((item) => !item.unavailable && !item.revoked).map((item) => ({ ...item, author: item.authorName, group: item.groupTitle || '' }));
                const next = addBookItems(book, items); edit({ ...next, items: sortBookItems(next.items, next.grouping) }); setProjects(null); setMessage('전시 작품을 가져왔습니다.');
            })}>{project.title} 가져오기</Button>)}<Button variant="outline" type="button" onClick={() => setProjects(null)}>가져오기 닫기</Button></div>}
            {picker && <SourcePicker key={`${classId}:${book.id}`} items={book.items} classId={classId} api={sourceApi} onClose={() => setPicker(false)} onAdd={(values) => { const next = addBookItems(book, values.map((value) => bookItemFromSource(value, classId))); edit({ ...next, items: sortBookItems(next.items, next.grouping) }); }} />}
            <div className="class-agit-project-heading"><h2>차례 · {book.items.length}편</h2></div>
            <ol className="class-agit-book-items">{book.items.map((item, index) => <li key={item.itemId || item.sourceId}><div><strong>{item.title}</strong><p>{item.author} · {item.group}</p>{(item.sourceChanged || item.unavailable || item.revoked) && <span className="class-agit-error">원글 재확인 필요</span>}</div>
                <div className="class-agit-header-actions"><Button variant="outline" type="button" onClick={() => setSource({ ...item, id: item.itemId || item.sourceId })}>읽기</Button>
                    <Button variant="outline" type="button" disabled={busy || !item.sourceId || book.archived} onClick={() => run(async () => { const current = await sourceApi.getSource(classId, item.sourceId); setSource({ ...bookItemFromSource(current, classId), id: item.sourceId, refreshing: true }); })}>원글 재확인</Button>
                    <Button variant="outline" type="button" aria-label={`${item.title} 위로`} disabled={busy || book.archived || index === 0} onClick={() => move(index, -1)}>↑</Button><Button variant="outline" type="button" aria-label={`${item.title} 아래로`} disabled={busy || book.archived || index === book.items.length - 1} onClick={() => move(index, 1)}>↓</Button>
                    <Button variant="outline" type="button" disabled={busy || book.archived} onClick={() => edit({ ...book, items: book.items.filter((_, i) => i !== index) })}>초안에서 빼기</Button>
                    {item.itemId && <Button variant="outline" type="button" disabled={busy || dirty || item.revoked} onClick={() => act('withdraw', { item_id: item.itemId })}>수록 철회</Button>}</div></li>)}</ol>
            <p>아직 작품이 없는 학생: {workspace.students.filter((student) => !selected.has(student.id)).map((student) => student.name).join(', ') || '모두 수록했습니다.'}</p>
            <div className="class-agit-header-actions"><Button variant="primary" type="button" disabled={busy || !dirty || book.archived} onClick={() => run(async () => { receive(await api.saveBook(classId, book)); setMessage('문집 초안을 저장했습니다.'); })}>문집 초안 저장</Button>
                <Button variant="outline" type="button" disabled={busy || dirty || !book.items.length || book.archived} onClick={() => printEdition()}>초안 A4 미리보기</Button>
                <Button variant="outline" type="button" disabled={busy || dirty || !book.items.length || book.archived} onClick={() => act('finalize')}>새 판 확정</Button>
                <Button variant="outline" type="button" disabled={busy} onClick={() => leave(() => run(async () => receive(await api.getBooks(classId, book.id))))}>최신 문집 불러오기</Button>
                <Button variant="outline" type="button" disabled={busy || dirty} onClick={() => act(book.archived ? 'restore' : 'archive')}>{book.archived ? '문집 복원' : '문집 보관'}</Button></div>
            <h2>확정판 보관함</h2><p>확정판의 내용과 설정을 보관합니다. PDF 파일은 인쇄 창에서 직접 저장합니다.</p>
            <ul className="class-agit-projects">{book.editions.map((edition) => <li key={edition.id}><div><strong>{edition.number}판 · {edition.title}</strong><p>{edition.student_visible ? '학생 서가 공개 중' : '교사 보관'} · {new Date(edition.created_at).toLocaleDateString('ko-KR')}</p></div><div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy} onClick={() => printEdition(edition)}>A4 미리보기 · PDF 저장</Button><Button variant="outline" type="button" disabled={busy || dirty || book.archived} onClick={() => act(edition.student_visible ? 'hide' : 'show', { edition_id: edition.id })}>{edition.student_visible ? '학생 서가에서 숨기기' : '학생 서가에 공개'}</Button></div></li>)}</ul>
        </>}
        {source && <ArtworkReader work={source} onClose={() => setSource(null)} footer={source.refreshing ? <Button variant="primary" type="button" onClick={() => { edit({ ...book, items: book.items.map((item) => item.sourceId === source.sourceId ? { ...source, itemId: item.itemId } : item) }); setSource(null); }}>이 내용으로 반영</Button> : <Button variant="outline" type="button" onClick={() => setSource(null)}>읽기 닫기</Button>} />}
        {confirmDialog}
    </section>;
}
