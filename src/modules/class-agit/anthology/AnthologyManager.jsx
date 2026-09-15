import { useEffect, useId, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton.jsx';
import useConfirmDialog from '../../../components/common/useConfirmDialog.jsx';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import { classAgitApi } from '../api/classAgitApi.js';
import { addBookItems, bookCoverKicker, bookItemFromSource, sortBookItems, normalizeBookPageBreaks, toggleBookPageBreak } from './contract.js';
import { prepareAnthologyWindow } from './printWindow.js';
import { useDataExport } from '../../../hooks/useDataExport.js';
import { BOOK_PAPERS, BOOK_DESIGNS, getBookPaper, getBookDesign, getBookPageLayout } from '../designs.js';
import PageTuner from './PageTuner.jsx';
import DesignPicker from '../teacher/DesignPicker.jsx';
import BookCover from './BookCover.jsx';
import SourcePicker from './SourcePicker.jsx';
import BookOrderEditor from './BookOrderEditor.jsx';
import ArtworkReader from '../gallery/ArtworkReader.jsx';
import { collectStudentSources, describeBulkResult } from './bulkAdd.js';
import { CLASS_AGIT_LIMITS } from '../policy.js';
import '../classAgit.css';
import '../management.css';

/*
 * 다섯 단계. 작품을 담을수록 한 화면이 길어지던 것을 3단계 안으로 모았고(2026-09-06),
 * 2026-09-15 에 차례를 4단계로 떼어 냈다 — 담기와 순서 정하기가 한 화면에 있으면 100편의 차례가
 * 담기 단추 아래에 늘어져 안쪽 상자에서 따로 스크롤됐다.
 */
const BOOK_STEPS = [
    { id: 'cover', title: '표지 · 여는 글', detail: '제목 · 학급명 · 여는 글' },
    { id: 'design', title: '판형 · 디자인', detail: '실제 출력 크기 · 표지' },
    { id: 'works', title: '작품 담기', detail: '학생 글 · 전시 작품' },
    { id: 'order', title: '목차 정하기', detail: '순서 · 묶기 · 쪽 배치' },
    { id: 'publish', title: '확정 · 보관함', detail: '미리보기 · 새 판 · 학생 서가' },
];

export default function AnthologyManager({ activeClass, api = classAgitReleaseApi, sourceApi = classAgitApi, onExit }) {
    const { authorizeGoogleExport, isGapiLoaded } = useDataExport(activeClass?.id);
    const [workspace, setWorkspace] = useState(null);
    const [book, setBook] = useState(null);
    const [step, setStep] = useState('cover');
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    // 쪽 다듬기 창. 초안 스냅샷을 받아 앱 안에서 쪽을 그려 보여 준다.
    const [tuner, setTuner] = useState(null);
    const [busy, setBusy] = useState(false);
    const [picker, setPicker] = useState(false);
    const [source, setSource] = useState(null);
    const [projects, setProjects] = useState(null);
    const [creatingPersonal, setCreatingPersonal] = useState(false);
    const [newOwnerId, setNewOwnerId] = useState('');
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
    const kindIssue = () => {
        if (book?.book_type !== 'personal') return '';
        if (!book.owner_student_id) return '개인 문집에 담을 학생을 먼저 선택해 주세요.';
        const otherCount = book.items.filter((item) => item.studentId !== book.owner_student_id).length;
        return otherCount ? `선택한 학생이 아닌 다른 학생의 글 ${otherCount}편을 먼저 빼 주세요.` : '';
    };
    const leave = async (next) => { if (!dirty || await ask({ title: '저장하지 않은 문집 편집을 닫을까요?', body: '저장된 초안과 확정판은 보관됩니다.' })) { setDirty(false); next(); } };
    // 저장 성공 여부를 돌려줘야 다음 단계로 넘길지 판단할 수 있다.
    const saveDraft = async () => {
        if (busyRef.current) return null;
        const issue = kindIssue();
        if (issue) { setError(issue); setStep('cover'); return null; }
        busyRef.current = true; setBusy(true); setError(''); setMessage('');
        try { const data = await api.saveBook(classId, book); receive(data); setMessage('문집 초안을 저장했습니다.'); return data; }
        catch (e) { setError(e.message || '문집을 처리하지 못했습니다.'); return null; }
        finally { busyRef.current = false; setBusy(false); }
    };
    const stepIndex = BOOK_STEPS.findIndex((entry) => entry.id === step);
    const selectStep = async (nextStep, saveFirst = false) => {
        if (busyRef.current) return;
        const issue = step !== nextStep ? kindIssue() : '';
        if (issue) { setError(issue); return; }
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
    /*
     * 쪽 다듬기 창을 연다.
     *
     * 초안 스냅샷(`getBookPreview`)을 그대로 쓴다 — 인쇄본과 **같은 것**을 보여 줘야
     * 다듬은 결과가 인쇄물과 어긋나지 않는다.
     */
    const openTuner = () => run(async () => {
        setTuner(await api.getBookPreview(classId, book.id, book.revision));
    });

    /*
     * 쪽 나누기를 바꾸면 **바로 저장**한다. 저장해야 미리보기에 쓰는 스냅샷이 따라오고,
     * 창을 닫았다 다시 열어도 남는다. 목차는 다시 그릴 때 저절로 맞춰진다.
     */
    const toggleTunerBreak = (sourceId) => run(async () => {
        const next = toggleBookPageBreak(book, sourceId);
        const saved = await api.saveBook(classId, next);
        receive(saved);
        setTuner(await api.getBookPreview(classId, book.id, saved?.book?.revision ?? book.revision));
    });

    const printEdition = (edition = null) => run(async () => {
        const target = prepareAnthologyWindow();
        try { const [{ renderAnthologyWindow }, snapshot] = await Promise.all([import('./print.js'), edition ? api.getEdition(classId, edition.id) : api.getBookPreview(classId, book.id, book.revision)]); await renderAnthologyWindow(target, snapshot); setMessage('인쇄용 문집을 열었습니다. 인쇄 창에서 PDF로 저장할 수 있습니다.'); }
        catch (e) { target.close(); throw e; }
    });
    // 구글 문서는 표지·여는 글·목차·본문·판권지를 한 문서로 옮긴다. 쪽수와 목차 쪽번호는
    // Docs API 가 넣어 줄 수 없어(요청 자체가 없다) 문서 첫머리 안내로 대신한다 — googleDocExport.js 참고.
    const exportEditionToGoogleDoc = (edition = null) => run(async () => {
        const accessToken = await authorizeGoogleExport();
        const [{ exportAnthologyToGoogleDoc }, snapshot] = await Promise.all([
            import('./googleDocExport.js'),
            edition ? api.getEdition(classId, edition.id) : api.getBookPreview(classId, book.id, book.revision)
        ]);
        const created = await exportAnthologyToGoogleDoc(snapshot, accessToken);
        window.open(created.url, '_blank', 'noopener');
        setMessage('구글 문서를 만들었습니다. 문서에서 `삽입 → 목차`와 `삽입 → 페이지 번호`를 누르면 쪽수가 채워집니다.');
    });
    const selected = new Set(book?.items.map((item) => item.studentId));
    const ownerStudent = book?.book_type === 'personal' && book.owner_student_id ? workspace?.students.find((student) => student.id === book.owner_student_id) || { id: book.owner_student_id, name: book.owner_student_name } : null;
    const locked = busy || book?.archived;
    const kindLocked = locked || Boolean(book?.editions.length);
    const unavailableOwnerIds = new Set(workspace?.books.filter((entry) => entry.id !== book?.id && entry.book_type === 'personal').map((entry) => entry.owner_student_id));
    const chooseBookType = (bookType) => {
        const personal = bookType === 'personal';
        const preservedOwner = personal && book.book_type === 'personal' ? book.owner_student_id : null;
        const preservedOwnerName = personal && book.book_type === 'personal' ? book.owner_student_name : null;
        const isDefaultTitle = !book.title || book.title === '우리 반의 책' || book.title.endsWith('의 글 모음') || book.title === '나의 글 모음';
        const isDefaultSubtitle = !book.subtitle || book.subtitle === '한 편 한 편 자라난 우리의 이야기' || book.subtitle === '한 편 한 편 자라난 나의 이야기';
        const nextTitle = isDefaultTitle ? (personal ? (preservedOwnerName ? `${preservedOwnerName}의 글 모음` : '나의 글 모음') : '우리 반의 책') : book.title;
        const nextSubtitle = isDefaultSubtitle ? (personal ? '한 편 한 편 자라난 나의 이야기' : '한 편 한 편 자라난 우리의 이야기') : book.subtitle;
        edit({
            ...book,
            book_type: bookType,
            owner_student_id: preservedOwner,
            owner_student_name: preservedOwnerName,
            cover_kicker: personal && book.cover_kicker === '우리 반의 이야기' ? '나의 글 모음' : !personal && book.cover_kicker === '나의 글 모음' ? '우리 반의 이야기' : book.cover_kicker,
            title: nextTitle,
            subtitle: nextSubtitle,
        });
        setPicker(false); setProjects(null); setError('');
    };
    const chooseOwnerStudent = (studentId) => {
        if (!studentId) {
            edit({
                ...book,
                owner_student_id: null,
                owner_student_name: null,
                title: book.title.endsWith('의 글 모음') ? '나의 글 모음' : book.title,
            });
            setPicker(false); setError('');
            return;
        }
        const student = workspace.students.find((entry) => entry.id === studentId);
        if (!student) return;

        const isDefaultTitle = !book.title || book.title === '우리 반의 책' || book.title.endsWith('의 글 모음') || book.title === '나의 글 모음';
        const isDefaultSubtitle = !book.subtitle || book.subtitle === '한 편 한 편 자라난 우리의 이야기' || book.subtitle === '한 편 한 편 자라난 나의 이야기';
        const nextTitle = isDefaultTitle ? `${student.name}의 글 모음` : book.title;
        const nextSubtitle = isDefaultSubtitle ? '한 편 한 편 자라난 나의 이야기' : book.subtitle;
        const nextKicker = (!book.cover_kicker || book.cover_kicker === '우리 반의 이야기') ? '나의 글 모음' : book.cover_kicker;

        const baseBook = {
            ...book,
            book_type: 'personal',
            owner_student_id: student.id,
            owner_student_name: student.name,
            title: nextTitle,
            subtitle: nextSubtitle,
            cover_kicker: nextKicker,
        };
        edit(baseBook);
        setPicker(false);
        setError('');

        run(async () => {
            setMessage(`${student.name} 학생의 글을 찾고 있습니다…`);
            const { sources, skipped, truncated } = await collectStudentSources(sourceApi, classId, {
                studentId: student.id,
                capacity: CLASS_AGIT_LIMITS.anthologyWorks
            });
            if (!sources.length) {
                edit({ ...baseBook, items: [] });
                setMessage(skipped.length ? `${student.name} 학생의 글 중 현재 문집에 담을 수 있는 글이 없습니다.` : `${student.name} 학생은 아직 문집에 담을 수 있는 글(승인된 과제 글)이 없습니다.`);
                return;
            }
            const nextItems = sources.map((source) => bookItemFromSource(source, classId));
            edit({
                ...baseBook,
                items: sortBookItems(nextItems, baseBook.grouping),
            });
            setMessage(`${student.name} · ${describeBulkResult({ added: sources.length, skipped: skipped.length, truncated })}`);
        });
    };
    const panel = (id) => ({ role: 'tabpanel', id: `${stepId}-panel-${id}`, 'aria-labelledby': `${stepId}-tab-${id}`, hidden: step !== id, className: 'class-agit-step-panel' });
    return <section className="class-agit class-agit-management class-agit-books">
        <header className="class-agit-project-heading"><div><span className="class-agit-eyebrow">우리반 아지트 · 글꽃 책방</span><h1>{book ? book.title : '우리 반의 책 만들기'}</h1></div>
            <div className="class-agit-header-actions"><TeacherGuideButton tabId="class-agit-books" variant="help" />{(book || onExit) && <Button variant="outline" type="button" disabled={busy} onClick={() => leave(() => { if (book) { setBook(null); setPicker(false); setProjects(null); setStep('cover'); } else onExit(); })}>{book ? '문집 목록' : '전시 관리로'}</Button>}</div></header>
        {error && <p className="class-agit-error" role="alert">{error}</p>}
        {!workspace && !error && <p role="status">문집을 불러오고 있습니다…</p>}
        {!book && workspace && <><p>학급의 글을 함께 묶거나, 한 학생의 작품만 모은 개인 문집을 만들 수 있습니다.</p>{message && <p role="status">{message}</p>}
            <div className="class-agit-header-actions"><Button variant="primary" type="button" disabled={busy} onClick={() => run(async () => { createId.current ||= crypto.randomUUID(); openBook(await api.bookAction(classId, 'create', { book_id: createId.current, book_type: 'class' })); createId.current = null; })}>우리 반 문집 만들기</Button>
                <Button variant="outline" type="button" disabled={busy} onClick={() => setCreatingPersonal((value) => !value)}>학생 개인 문집 만들기</Button></div>
            {creatingPersonal && <div className="class-agit-book-picker"><label>학생 선택<select value={newOwnerId} onChange={(event) => setNewOwnerId(event.target.value)}><option value="">학생을 선택하세요</option>{workspace.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><Button variant="primary" type="button" disabled={busy || !newOwnerId} onClick={() => run(async () => {
                createId.current ||= crypto.randomUUID();
                const created = await api.bookAction(classId, 'create', { book_id: createId.current, book_type: 'personal', owner_student_id: newOwnerId });
                createId.current = null; openBook(created);
                const { sources, skipped, truncated } = await collectStudentSources(sourceApi, classId, { studentId: newOwnerId, capacity: CLASS_AGIT_LIMITS.anthologyWorks });
                if (!sources.length) { setStep('works'); setMessage(skipped.length ? '현재 문집에 담을 수 있는 글이 없습니다.' : '이 학생은 아직 문집에 담을 수 있는 글이 없습니다.'); return; }
                const next = { ...created.book, items: sources.map((source) => bookItemFromSource(source, classId)) };
                receive(await api.saveBook(classId, next)); setStep('works');
                setMessage(describeBulkResult({ added: sources.length, skipped: skipped.length, truncated }));
            })}>학생 글을 담아 개인 문집 만들기</Button></div>}
            <ul className="class-agit-projects">{workspace.books.map((entry) => <li key={entry.id}><strong>{entry.book_type === 'personal' ? `개인 문집 · ${entry.owner_student_name} · ` : ''}{entry.title}{entry.archived ? ' · 보관함' : ''}</strong><div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy} onClick={() => run(async () => openBook(await api.getBooks(classId, entry.id)))}>문집 열기</Button><Button variant="ghost" type="button" disabled={busy} onClick={() => removeFromList(entry)} aria-label={`${entry.title} 문집 삭제`}>삭제</Button></div></li>)}</ul></>}
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
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 01</span><h2>책의 첫인상을 정해요</h2><p>{ownerStudent ? `${ownerStudent.name} 학생의 이름은 표지에 자동으로 들어갑니다. 책을 여는 작가의 말을 남겨 보세요.` : '먼저 우리 반 문집과 개인 문집 중 고르고, 표지에 들어갈 제목과 책을 여는 인사말을 남깁니다.'}</p></div>
                <fieldset className="anthology-book-kind" disabled={kindLocked}><legend>먼저 문집 종류를 정해 주세요</legend>
                    <div className="anthology-kind-options">
                        <label className={book.book_type === 'class' ? 'is-selected' : ''}><input type="radio" name="문집 종류" checked={book.book_type === 'class'} onChange={() => chooseBookType('class')} /><span><strong>우리 반 문집</strong><small>여러 학생의 글을 담고, 목차와 각 작품에 글쓴이를 표시해요.</small></span></label>
                        <label className={book.book_type === 'personal' ? 'is-selected' : ''}><input type="radio" name="문집 종류" checked={book.book_type === 'personal'} onChange={() => chooseBookType('personal')} /><span><strong>개인 문집</strong><small>한 학생의 글만 담고, 지은이는 표지에 한 번만 표시해요.</small></span></label>
                    </div>
                    {book.book_type === 'personal' && <label className="anthology-owner-select">학생 선택<select value={book.owner_student_id || ''} onChange={(event) => chooseOwnerStudent(event.target.value)}><option value="">학생을 선택하세요</option>{workspace.students.map((student) => <option key={student.id} value={student.id} disabled={unavailableOwnerIds.has(student.id)}>{student.name}{unavailableOwnerIds.has(student.id) ? ' · 개인 문집 있음' : ''}</option>)}</select></label>}
                    {book.editions.length > 0 && <p>확정판이 있는 문집은 공개 범위가 달라질 수 있어 종류를 바꿀 수 없습니다.</p>}
                    {kindIssue() && <p className="anthology-kind-error" role="alert">{kindIssue()}</p>}
                </fieldset>
                <div className="class-agit-book-layout"><BookCover book={book} />
                    <fieldset className="class-agit-book-settings" disabled={locked}><legend>표지 · 여는 글</legend>
                        <label>표지 윗문구<input value={bookCoverKicker(book)} maxLength={60} placeholder="비워 두면 표지에서 숨깁니다" onChange={(e) => edit({ ...book, cover_kicker: e.target.value })} /></label>
                        {[['title', '문집 제목', 80], ['subtitle', '부제', 120], ['class_label', '표시 학급명', 80]].map(([key, label, max]) => <label key={key}>{label}<input value={Reflect.get(book, key)} maxLength={max} onChange={(e) => edit({ ...book, [key]: e.target.value })} /></label>)}
                        <label>발행일<input type="date" value={book.issue_date} onChange={(e) => edit({ ...book, issue_date: e.target.value })} /></label>
                        <label>{ownerStudent ? '작가의 말' : '여는 글'}<textarea value={book.introduction} maxLength={2000} rows={5} onChange={(e) => edit({ ...book, introduction: e.target.value })} /></label>
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
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 03</span><h2>책에 담을 글을 모아요</h2><p>{ownerStudent ? `${ownerStudent.name} 학생의 글만 담긴 개인 문집입니다. 글을 확인하거나 더 담거나 뺄 수 있습니다.` : '학생 글에서 바로 담거나 만들어 둔 전시의 작품을 가져옵니다. 순서는 다음 단계 `목차 정하기`에서 정합니다.'}</p></div>
                <div className="anthology-kind-summary" role="status">
                    <span>{book.book_type === 'personal' ? (ownerStudent ? `개인 문집 · ${ownerStudent.name} 학생의 글만 수록` : '개인 문집') : '우리 반 문집 · 여러 학생의 글 수록'}</span>
                    {!kindLocked && <Button variant="ghost" type="button" disabled={busy} onClick={() => selectStep('cover')}>문집 종류 변경 (1단계) →</Button>}
                </div>
                {kindIssue() && <p className="anthology-kind-error" role="alert">{kindIssue()}</p>}
                <div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={locked || (book.book_type === 'personal' && !ownerStudent)} onClick={() => setPicker(!picker)}>
                    {book.book_type === 'personal' && ownerStudent ? `${ownerStudent.name} 학생 글에서 담기` : '학생 글에서 담기'}
                </Button>
                    {book.book_type === 'class' && <Button variant="outline" type="button" disabled={locked} onClick={() => run(async () => setProjects((await sourceApi.getWorkspace(classId)).projects))}>전시 작품 가져오기</Button>}</div>
                {projects && <div className="class-agit-book-picker"><h3>가져올 전시</h3>{projects.length === 0 && <p>아직 전시가 없습니다. 학생 글에서 바로 담을 수 있습니다.</p>}{projects.map((project) => <Button variant="outline" type="button" key={project.id} disabled={busy} onClick={() => run(async () => {
                    const data = await sourceApi.getWorkspace(classId, project.id);
                    const items = data.draft.items.filter((item) => !item.unavailable && !item.revoked).map((item) => ({ ...item, author: item.authorName, group: item.groupTitle || '' }));
                    const next = addBookItems(book, items); edit({ ...next, items: sortBookItems(next.items, next.grouping) }); setProjects(null); setMessage('전시 작품을 가져왔습니다.');
                })}>{project.title} 가져오기</Button>)}<Button variant="outline" type="button" onClick={() => setProjects(null)}>가져오기 닫기</Button></div>}
                {picker && <SourcePicker key={`${classId}:${book.id}`} items={book.items} classId={classId} api={sourceApi} ownerStudent={ownerStudent} onClose={() => setPicker(false)} onAdd={(values) => { const next = addBookItems(book, values.map((value) => bookItemFromSource(value, classId))); edit({ ...next, items: sortBookItems(next.items, next.grouping) }); }} />}
                {/* 담은 것을 확인하는 짧은 요약. 순서는 4단계에서 정하니 여기서는 몇 편·누구 글인지만 본다. */}
                <div className="class-agit-project-heading"><h3>담은 글 · {book.items.length}편</h3>
                    {book.items.length > 0 && <Button variant="outline" type="button" disabled={busy} onClick={() => selectStep('order')}>목차 정하기 →</Button>}</div>
                {book.items.length === 0
                    ? <p className="class-agit-empty">아직 담은 작품이 없습니다. {ownerStudent ? '위에서 학생 글을 더 찾아보거나 과제 확인 상태를 점검해 주세요.' : '위에서 학생 글이나 전시 작품을 담아 주세요.'}</p>
                    : <p className="anthology-hint">{ownerStudent ? `${ownerStudent.name} 학생의 글 ${book.items.length}편` : `${[...new Set(book.items.map((item) => item.author).filter(Boolean))].length}명의 글 · 주제 ${[...new Set(book.items.map((item) => item.group).filter(Boolean))].length}가지`}</p>}
                {!ownerStudent && <details className="class-agit-participation"><summary>아직 작품이 없는 학생 {workspace.students.filter((student) => !selected.has(student.id)).length}명</summary><p>{workspace.students.filter((student) => !selected.has(student.id)).map((student) => student.name).join(' · ') || '모두 수록했습니다.'}</p></details>}
            </div>

            <div {...panel('order')}>
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 04</span><h2>차례를 정해요</h2><p>끌어서 놓거나 번호로 옮겨 순서를 정하고, 학생별·주제별로 묶거나 쪽 배치를 고릅니다.</p></div>
                <BookOrderEditor book={book} locked={locked} busy={busy} dirty={dirty} onEdit={edit}
                    onRead={(item) => setSource({ ...item, id: item.itemId || item.sourceId })}
                    onRefresh={(item) => run(async () => { const current = await sourceApi.getSource(classId, item.sourceId); setSource({ ...bookItemFromSource(current, classId), id: item.sourceId, refreshing: true }); })}
                    onWithdraw={(item) => act('withdraw', { item_id: item.itemId })} />
            </div>

            <div {...panel('publish')}>
                <div className="class-agit-step-heading"><span className="class-agit-eyebrow">STEP 05</span><h2>인쇄하고 한 판으로 확정해요</h2><p>초안을 미리 출력해 보고 새 판을 확정합니다. 확정판은 이후 편집과 원글 수정으로 바뀌지 않습니다.</p></div>
                <div className="class-agit-header-actions">
                    <Button variant="outline" type="button" disabled={busy || dirty || !book.items.length || book.archived} onClick={() => printEdition()}>초안 {getBookPaper(book.paper_format).label} 미리보기</Button>
                    {/*
                      * 쪽 다듬기는 **이어붙이기에서만** 뜻이 있다 — 작품마다 새 쪽인 문집은
                      * 이미 작품마다 쪽이 나뉘어 있어 더 정할 것이 없다.
                      */}
                    {getBookPageLayout(book.page_layout).id === 'continuous' && (
                        <Button variant="outline" type="button" disabled={busy || dirty || !book.items.length || book.archived} onClick={() => openTuner()}>쪽 다듬기</Button>
                    )}
                    <Button variant="outline" type="button" disabled={busy || dirty || !book.items.length || book.archived || !isGapiLoaded} onClick={() => exportEditionToGoogleDoc()}>초안 구글 문서로 보내기</Button>
                    <Button variant="primary" type="button" disabled={busy || dirty || !book.items.length || book.archived} onClick={() => act('finalize')}>새 판 확정</Button></div>
                {dirty && <p>편집 내용을 먼저 저장하면 미리보기와 확정을 할 수 있습니다.</p>}
                {!book.items.length && <p>3단계에서 작품을 담으면 확정할 수 있습니다.</p>}
                <h3>확정판 보관함</h3><p>확정판의 내용과 설정을 보관합니다. PDF 파일은 인쇄 창에서 직접 저장합니다. 구글 문서로 보내면 표지 · 여는 글 · 목차 · 본문 · 판권지가 한 문서로 만들어지며, 문서에서 <strong>삽입 → 목차</strong>와 <strong>삽입 → 페이지 번호</strong>를 누르면 쪽수가 채워집니다. 한글(hwp)로 옮기려면 구글 문서에서 <strong>파일 → 다운로드 → Microsoft Word(.docx)</strong>로 내려받아 한글에서 열면 됩니다.</p>
                <p>학생 서가는 <strong>글꽃 전시관 → 1 기본 설정 → 학급 학생 공개 켜기</strong>가 켜져 있어야 학생 화면에 나타납니다.</p>
                <ul className="class-agit-projects">{book.editions.map((edition) => <li key={edition.id}><div><strong>{edition.number}판 · {edition.title}</strong><p>{edition.student_visible ? '학생 서가 공개 중' : '교사 보관'} · {new Date(edition.created_at).toLocaleDateString('ko-KR')}</p></div><div className="class-agit-header-actions"><Button variant="outline" type="button" disabled={busy} onClick={() => printEdition(edition)}>{getBookPaper(edition.print?.paper).label} 미리보기 · PDF 저장</Button><Button variant="outline" type="button" disabled={busy || !isGapiLoaded} onClick={() => exportEditionToGoogleDoc(edition)}>구글 문서로 보내기</Button><Button variant="outline" type="button" disabled={busy || dirty || book.archived} onClick={() => act(edition.student_visible ? 'hide' : 'show', { edition_id: edition.id })}>{edition.student_visible ? '학생 서가에서 숨기기' : '학생 서가에 공개'}</Button></div></li>)}</ul>
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
        {tuner && <PageTuner edition={tuner} breaks={normalizeBookPageBreaks(book.page_breaks, book.items)} saving={busy} onToggle={toggleTunerBreak} onClose={() => setTuner(null)} />}
        {confirmDialog}
    </section>;
}
