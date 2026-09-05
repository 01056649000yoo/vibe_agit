import { createClassAgitBrowseFixture } from './classAgitBrowseFixture.js';
import { createExhibitionDraft, editExhibition } from '../../modules/class-agit/exhibitionDraft.js';
import { getSourceExclusion } from '../../modules/class-agit/sourceContract.js';
import { buildClassAgitSavePayload } from '../../modules/class-agit/api/contract.js';
import { previewClass, previewSources, previewStudents } from './classAgitFixtures.js';

// 화면 점검 전용 메모리 서버. 실제 권한 검증은 SQL 역할 스모크가 담당한다.
export function createClassAgitPersistenceFixture(initialSources = previewSources, missions) {
    const sources = new Map(initialSources.map((source) => [source.id, structuredClone(source)]));
    const projects = new Map();
    let enabled = false;
    let readFailure = false;
    const requireProject = (id) => {
        const project = projects.get(id);
        if (!project) throw new Error('전시를 찾을 수 없습니다.');
        return project;
    };
    const readSource = (id) => {
        const source = sources.get(id);
        if (!source || getSourceExclusion(source, previewClass.id)) throw new Error('전시에 담을 수 없는 글입니다. 원글 상태를 확인해 주세요.');
        return structuredClone(source);
    };
    const workspace = (id = null) => {
        const draft = id ? structuredClone(requireProject(id).draft) : null;
        if (draft) draft.items = draft.items.map((item) => {
            const source = sources.get(item.sourceId);
            return { ...item, sourceChanged: source?.source_revision !== item.sourceRevision,
                unavailable: !source || Boolean(getSourceExclusion(source, previewClass.id)) };
        });
        return { version: 1, rollout: 'internal', class: { id: previewClass.id, module_enabled: enabled },
            projects: [...projects.values()].map(({ draft: d }) => ({ id: d.id, title: d.title, state: d.state, revision: d.revision, publication_no: d.publicationNo })),
            students: structuredClone(previewStudents), draft };
    };
    const api = {
        async getWorkspace(_classId, id) { return workspace(id); },
        ...createClassAgitBrowseFixture(sources, previewClass.id, missions),
        async getSource(_classId, id) { return readSource(id); },
        async save(classId, draft, revision) { return api.runAction(classId, 'save', buildClassAgitSavePayload(draft, revision)); },
        async runAction(_classId, action, payload) {
            const id = payload.exhibition_id;
            if (action === 'set_enabled') {
                if (enabled !== payload.expected_enabled) throw new Error('학급 공개 설정이 변경되었습니다. 다시 불러와 주세요.');
                enabled = payload.enabled;
                return workspace(id);
            }
            if (action === 'create') {
                if (!projects.has(id)) projects.set(id, { draft: { ...createExhibitionDraft(previewClass.id), id, state: 'draft', publicationNo: 0 }, history: new Map(), publication: null });
                return workspace(id);
            }
            const project = requireProject(id);
            const current = project.draft;
            if (payload.expected_revision !== current.revision) throw new Error('다른 화면에서 전시가 변경되었습니다. 현재 편집은 남겨 두고 최신 전시를 다시 불러와 주세요.');
            if (action === 'save') {
                let next = { ...current, title: payload.title.trim(), introduction: payload.introduction, items: [] };
                for (const item of payload.items) {
                    const source = readSource(item.sourceId);
                    if (source.source_revision !== item.sourceRevision) throw new Error('원글 내용이 바뀌었습니다. 전문을 다시 확인해 주세요.');
                    next = editExhibition(next, { type: 'add', source, classAcknowledged: item.classAcknowledged });
                    const previous = project.history.get(item.sourceId);
                    const saved = { ...next.items.at(-1), itemId: previous?.itemId || crypto.randomUUID(),
                        consentId: previous && !previous.revoked ? previous.consentId : crypto.randomUUID(), publicAlias: item.publicAlias, revoked: false };
                    next.items[next.items.length - 1] = saved;
                }
                project.draft = { ...next, revision: current.revision + 1 };
                for (const item of project.draft.items) project.history.set(item.sourceId, item);
                return workspace(id);
            }
            if (action === 'publish') {
                if (!enabled || !current.items.length) throw new Error('학급 공개 설정과 작품을 확인해 주세요.');
                for (const item of current.items) {
                    if (item.revoked || readSource(item.sourceId).source_revision !== item.sourceRevision) throw new Error('원글 상태가 바뀌었습니다. 전문을 다시 확인해 주세요.');
                }
                current.publicationNo += 1; current.state = 'published';
                project.publication = structuredClone(current);
            } else if (action === 'withdraw') {
                const item = current.items.find((work) => work.itemId === payload.item_id);
                item.revoked = true; item.scopes.class = false;
            } else if (action === 'archive') current.state = 'archived';
            else if (['restore', 'unpublish'].includes(action)) current.state = 'draft';
            else throw new Error('지원하지 않는 전시 요청입니다.');
            current.revision += 1;
            return workspace(id);
        },
        async getPublication(_classId, id, room = 1) {
            if (readFailure) { readFailure = false; throw new Error('공개 상태를 불러오지 못했습니다. 다시 확인해 주세요.'); }
            const project = requireProject(id);
            if (!enabled || project.draft.state !== 'published') throw new Error('현재 열람할 수 없는 전시입니다.');
            const published = project.publication;
            const visible = published.items.filter((item) => {
                const latest = project.history.get(item.sourceId);
                try { readSource(item.sourceId); } catch { return false; }
                return !latest.revoked && latest.consentId === item.consentId;
            });
            return { version: 1, publication_no: published.publicationNo, room, room_count: Math.max(1, Math.ceil(visible.length / 12)),
                total_count: visible.length, blocked_count: published.items.length - visible.length,
                exhibition: { title: published.title, introduction: published.introduction, audience: 'class',
                    works: visible.slice((room - 1) * 12, room * 12).map((item, index) => ({ id: `published-${room}-${index}`,
                        title: item.title, author: item.authorName, format: item.format, kindLabel: item.kindLabel, excerpt: item.excerpt, blocks: [...item.blocks] })) } };
        },
    };
    return { api, controls: {
        conflict() { for (const { draft } of projects.values()) { draft.title = '다른 화면에서 저장한 제목'; draft.revision += 1; } },
        changeSource() { const source = sources.get('sample-post-1'); source.content = '원글을 새로 고쳤습니다. 다시 읽고 수록 의사를 확인해 주세요.'; source.source_revision += '-changed'; },
        recallSource() { sources.get('sample-post-1').is_submitted = false; for (const project of projects.values()) { const item = project.history.get('sample-post-1'); if (item) { item.revoked = true; item.scopes.class = false; } } },
        failRead() { readFailure = true; },
    } };
}
