import { CLASS_AGIT_LIMITS as limits } from './policy.js';
import { getSourceExclusion, presentSource } from './sourceContract.js';

export function createExhibitionDraft(classId, title = '우리의 작은 발견') {
    return { classId, title, introduction: '평범한 하루에서 발견한 특별한 순간들. 우리 반 작가들의 이야기를 만나 보세요.', revision: 1, items: [] };
}

export function editExhibition(draft, change, expectedRevision = draft.revision) {
    if (draft.revision !== expectedRevision) throw new Error('전시가 변경되었습니다. 최신 내용을 다시 확인해 주세요.');
    let next = draft;
    const matches = (item) => change.itemId ? item.itemId === change.itemId : item.sourceId === change.sourceId;
    if (change.type === 'metadata') {
        if (change.title.length > limits.titleLength || change.introduction.length > limits.introductionLength) throw new Error('전시 제목이나 소개가 너무 깁니다.');
        next = { ...draft, title: change.title, introduction: change.introduction };
    } else if (change.type === 'add') {
        const reason = getSourceExclusion(change.source, draft.classId);
        if (reason) throw new Error(reason);
        if (!change.classAcknowledged) throw new Error('학급 전시 수록 의사를 확인해 주세요.');
        if (draft.items.some((item) => item.sourceId === change.source.id)) throw new Error('이미 전시에 담은 글입니다.');
        if (draft.items.length >= limits.maxWorks) throw new Error(`한 전시는 ${limits.maxWorks}편까지 담을 수 있습니다.`);
        const previousAuthor = draft.items.find((item) => item.studentId === change.source.student_id);
        const authorNumber = previousAuthor?.authorNumber ?? Math.max(0, ...draft.items.map((item) => item.authorNumber)) + 1;
        next = { ...draft, items: [...draft.items, {
            ...presentSource(change.source), sourceId: change.source.id, studentId: change.source.student_id,
            sourceRevision: change.source.source_revision, authorName: change.source.student_name, groupTitle: change.source.group_title || '',
            authorNumber, publicAlias: previousAuthor?.publicAlias || `새싹 작가 ${String(authorNumber).padStart(2, '0')}`,
            scopes: { class: true, anthology: false, external: false },
        }] };
    } else if (change.type === 'refresh') {
        const reason = getSourceExclusion(change.source, draft.classId);
        if (reason) throw new Error(reason);
        if (!change.classAcknowledged) throw new Error('학급 전시 수록 의사를 다시 확인해 주세요.');
        next = { ...draft, items: draft.items.map((item) => item.sourceId === change.source.id ? {
            ...item, ...presentSource(change.source), sourceRevision: change.source.source_revision,
            authorName: change.source.student_name, groupTitle: change.source.group_title || '', sourceChanged: false, unavailable: false, revoked: false,
            scopes: { ...item.scopes, class: true },
        } : item) };
    } else if (change.type === 'remove') {
        next = { ...draft, items: draft.items.filter((item) => !matches(item)) };
    } else if (change.type === 'move') {
        const index = draft.items.findIndex(matches);
        const target = index + change.direction;
        if (index < 0 || ![-1, 1].includes(change.direction) || target < 0 || target >= draft.items.length) return draft;
        const items = [...draft.items];
        const original = items.at(index);
        items.splice(index, 1, items.at(target));
        items.splice(target, 1, original);
        next = { ...draft, items };
    } else if (change.type === 'external') {
        const alias = change.alias.trim();
        if (!alias || alias.length > limits.authorLength) throw new Error('외부에 표시할 가림 이름을 1~30자로 적어 주세요.');
        next = { ...draft, items: draft.items.map((item) => item.sourceId === change.sourceId
            ? { ...item, publicAlias: alias, scopes: { ...item.scopes, external: change.enabled === true } } : item) };
    } else {
        throw new Error('지원하지 않는 전시 편집입니다.');
    }
    return { ...next, revision: draft.revision + 1 };
}

// 표시 필드만 명시적으로 복사한다. 외부 보기는 원글/학생 ID나 등록 이름을 받지 않는다.
export function createGalleryPresentation(draft, audience = 'class') {
    if (!['class', 'external'].includes(audience)) throw new Error('잘못된 전시 열람 범위입니다.');
    const works = draft.items.filter((item) => audience === 'external' ? item.scopes.external : item.scopes.class).map((item, index) => ({
        id: `work-${index + 1}`, title: item.title,
        author: audience === 'external' ? item.publicAlias : item.authorName,
        format: item.format, kindLabel: item.kindLabel, excerpt: item.excerpt, blocks: [...item.blocks],
    }));
    return { title: draft.title.trim() || '제목 없는 전시', introduction: draft.introduction, audience, works };
}
