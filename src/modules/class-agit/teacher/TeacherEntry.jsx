import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton.jsx';
import { resolveEnabledModuleIds } from '../../registry.js';
import { classAgitApi } from '../api/classAgitApi.js';
import ExhibitionWorkbench from './ExhibitionWorkbench.jsx';
import AnthologyManager from '../anthology/AnthologyManager.jsx';
import ShareManager from '../public/ShareManager.jsx';
import RolloutManager from './RolloutManager.jsx';
import { classAgitReleaseApi } from '../api/releaseApi.js';
import PublishedExhibition from './PublishedExhibition.jsx';
import '../classAgit.css';
import '../management.css';

function TeacherWorkspace({ activeClass, api = classAgitApi, isSample = false, releaseApi = classAgitReleaseApi, isAdmin = false, onOpenPublic }) {
    const classId = activeClass.id;
    const releasesEnabled = !isSample || releaseApi !== classAgitReleaseApi;
    const [area, setArea] = useState('exhibitions');
    const [workspace, setWorkspace] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loadVersion, setLoadVersion] = useState(0);
    const busyRef = useRef(false);
    const createId = useRef(null);
    useEffect(() => {
        let active = true;
        api.getWorkspace(classId).then((data) => { if (active) { setWorkspace(data); setError(''); } })
            .catch((reason) => { if (active) setError(reason.message); });
        return () => { active = false; };
    }, [api, classId, loadVersion]);

    const operation = async (task) => {
        if (busyRef.current) throw new Error('앞선 전시 요청을 처리하고 있습니다.');
        busyRef.current = true; setBusy(true); setError('');
        try { return await task(); } finally { busyRef.current = false; setBusy(false); }
    };
    const open = async (id) => {
        try { await operation(async () => {
            setWorkspace(await api.getWorkspace(classId, id));
        }); } catch (reason) { setError(reason.message); }
    };
    const create = async () => {
        try { await operation(async () => {
            createId.current ||= crypto.randomUUID();
            const data = await api.runAction(classId, 'create', { exhibition_id: createId.current });
            createId.current = null; setWorkspace(data);
        }); } catch (reason) { setError(reason.message); }
    };
    const changeAccess = async (enabled) => {
        try { await operation(async () => setWorkspace(await api.runAction(classId, 'set_enabled', {
            enabled, expected_enabled: workspace.class.module_enabled,
            initial_modules: resolveEnabledModuleIds(workspace.class.enabled_modules, workspace.class),
            initial_vocab_tower_enabled: workspace.class.vocab_tower_enabled ?? null, exhibition_id: workspace.draft?.id || null,
        }))); } catch (reason) { setError(reason.message); }
    };
    if (area === 'books') return <AnthologyManager activeClass={activeClass} api={releaseApi} sourceApi={api} onExit={() => setArea('exhibitions')} />;
    if (area === 'rollout') return <RolloutManager api={releaseApi} onExit={() => { setArea('exhibitions'); setLoadVersion((v) => v + 1); }} />;
    return <div className="class-agit-management-shell">
        {!workspace?.draft && <div className="class-agit-live-access">
            <span>{isSample ? '샘플 운영' : '우리반 아지트 · 제한 운영'}</span>
            {workspace && <label><input type="checkbox" disabled={busy} checked={workspace.class.module_enabled} onChange={(event) => changeAccess(event.target.checked)} />학급 학생 공개 켜기</label>}
        </div>}
        {!workspace?.draft && releasesEnabled && <div className="class-agit-header-actions"><Button variant="outline" type="button" onClick={() => setArea('books')}>학급 문집 만들기</Button>{isAdmin && <Button variant="outline" type="button" onClick={() => setArea('rollout')}>공개 단계 관리</Button>}</div>}
        {error && <div className="class-agit-error" role="alert">{error}{!workspace?.draft && <Button variant="outline" type="button" onClick={() => setLoadVersion((version) => version + 1)}>작업공간 다시 불러오기</Button>}</div>}
        {!workspace && !error && <p role="status">전시 작업공간을 불러오고 있습니다…</p>}
        {workspace?.draft ? <ExhibitionWorkbench key={`${classId}:${workspace.draft.id}`} activeClass={activeClass} initialDraft={workspace.draft}
            students={workspace.students} sourceApi={api} persistence={{
                busy, isSample, moduleEnabled: workspace.class.module_enabled, setEnabled: changeAccess,
                save: (draft, revision) => operation(async () => { const data = await api.save(classId, draft, revision); setWorkspace(data); return data.draft; }),
                action: (action, revision, item) => operation(async () => { const data = await api.runAction(classId, action, {
                    exhibition_id: workspace.draft.id, expected_revision: revision, confirmed: true, item_id: item?.itemId,
                }); setWorkspace(data); return data.draft; }),
                readSource: (postId) => api.getSource(classId, postId),
                reload: async () => { const data = await api.getWorkspace(classId, workspace.draft.id); setWorkspace(data); return data.draft; },
                exit: () => setWorkspace((data) => ({ ...data, draft: null })),
                renderPublication: (onExit) => <PublishedExhibition classId={classId} exhibitionId={workspace.draft.id} api={api} onExit={onExit} />,
                renderShare: releasesEnabled ? ({ key, onStateChange }) => <ShareManager key={key} classId={classId} exhibitionId={workspace.draft.id} api={releaseApi}
                    archived={workspace.draft.state === 'archived'} onOpenPublic={onOpenPublic} embedded onStateChange={onStateChange} /> : undefined,
            }} /> : workspace && <section className="class-agit class-agit-management">
                <div className="class-agit-project-heading"><div><span className="class-agit-eyebrow">{activeClass.name}</span><h1>우리 반의 글 전시</h1><p>초안을 준비하고 확인한 내용으로 학급 공개판을 만듭니다.</p></div>
                    <div className="class-agit-header-actions"><TeacherGuideButton tabId="class-agit" variant="help" /><Button variant="primary" type="button" disabled={busy || workspace.projects.length >= 20} onClick={create}>새 전시 만들기</Button></div></div>
                {isSample && <p className="class-agit-prototype-note">샘플 저장·공개는 이 화면에서만 동작합니다. 실제 DB에는 반영하지 않습니다.</p>}
                {!workspace.projects.length && <p className="class-agit-empty">첫 전시를 만들어 우리 반의 글을 담아 보세요.</p>}
                <ul className="class-agit-projects">{workspace.projects.map((project) => <li key={project.id}><div><strong>{project.title}</strong><p>{project.state === 'published' ? `${project.publication_no}판 공개 중` : project.state === 'archived' ? '보관함' : '비공개 초안'}</p></div><Button variant="outline" type="button" disabled={busy} onClick={() => open(project.id)}>전시 열기</Button></li>)}</ul>
                <p className="class-agit-canvas-caption">학생 공개를 꺼도 초안을 편집할 수 있습니다. 공개한 전시는 학생 홈의 우리반 아지트에서 읽을 수 있습니다. 학급 문집을 만들거나 저장한 전시에서 외부 읽기 전용 공유를 준비할 수 있습니다.</p>
        </section>}
    </div>;
}

export default function ClassAgitTeacherEntry(props) {
    return <TeacherWorkspace key={props.activeClass.id} {...props} />;
}
