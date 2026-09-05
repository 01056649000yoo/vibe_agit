import { getGenreMissionType } from '../writing/mission-types/registry.js';

const plainText = Object.freeze({
    format: 'prose', label: '글',
    getBlocks: ({ content }) => String(content || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean),
});

export function getExhibitionWritingContract(source) {
    const inputTemplate = source.input_template === 'freeform' ? '' : source.input_template;
    if (inputTemplate && source.structured_content?.template && inputTemplate !== source.structured_content.template) return null;
    const template = inputTemplate || source.structured_content?.template
        || getGenreMissionType(source.mission_type)?.id || '';
    if (template) return getGenreMissionType(template)?.exhibition || null;
    if (source.structured_content && Object.keys(source.structured_content).length) return null;
    return plainText;
}

// 화면 사전 검사. C1의 실제 권한·자격·본문은 DB가 매 동작마다 다시 검증한다.
export function getSourceExclusion(source, classId) {
    if (source.class_id !== classId) return '다른 학급의 글';
    if (!source.is_submitted || source.recalled_at || source.deleted_at) return '미제출 또는 회수한 글';
    if (source.visibility === 'private') return '나만 보는 글';
    if (source.writing_context !== 'assignment') return source.visibility === 'private' ? '나만 보는 글' : '자율 글은 후속 지원';
    if (!source.is_confirmed || source.is_returned) return '선생님 확인을 기다리는 글';
    const contract = getExhibitionWritingContract(source);
    if (!contract || source.has_images) return '전시 표현을 준비 중인 장르';
    if (!contract.getBlocks({ content: source.content, structuredContent: source.structured_content }).length) return '내용이 없는 글';
    if (!source.source_revision) return '원글 버전 확인 필요';
    return '';
}

export function presentSource(source) {
    const contract = getExhibitionWritingContract(source);
    if (!contract) throw new Error('아직 전시할 수 없는 장르입니다.');
    const blocks = contract.getBlocks({ content: source.content, structuredContent: source.structured_content });
    return {
        title: source.title || '제목 없는 글', format: contract.format,
        kindLabel: contract.label, blocks,
        excerpt: Array.from(blocks.join(' ').replace(/\s+/g, ' ').trim()).slice(0, 96).join(''),
    };
}
// Saving metadata must not silently reselect a withdrawn or unavailable work.
export function assertDraftSources(items) {
    if (items.some((item) => item.revoked || item.unavailable)) {
        throw new Error('철회되었거나 사용할 수 없는 작품이 있습니다. 해당 작품을 빼거나 원글을 다시 불러와 반영해 주세요.');
    }
}
