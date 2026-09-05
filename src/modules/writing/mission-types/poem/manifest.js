import { normalizePoemStanzas } from './poemContent.js';

const getWrittenStanzas = (structuredContent, content) => (
    normalizePoemStanzas(structuredContent, content)
);

export const poemMissionType = {
    id: 'poem',
    name: '시 쓰기',
    icon: '🌿',
    description: '제목과 쓴이를 표시하고 연을 나누어 시를 씁니다.',
    teacherEntry: () => import('./PoemMissionForm'),
    studentEditorEntry: () => import('./PoemEditor'),
    reactionProfile: 'standard',
    usesStructuredContent: true,
    exhibition: {
        format: 'poem', label: '시',
        getBlocks: ({ structuredContent, content }) => normalizePoemStanzas(structuredContent, content),
    },
    pdfExport: {
        id: 'poem',
        load: () => import('./poemPdfExport.js').then((module) => module.poemPdfExport),
    },
    supportsEvaluation: true,
    unitLabel: '연 수',
    skipGenericParagraphValidation: true,
    countParagraphs: ({ structuredContent, content }) => (
        getWrittenStanzas(structuredContent, content).length
    ),
    validateSubmission: ({ structuredContent, content, config = {} }) => {
        const writtenStanzas = getWrittenStanzas(structuredContent, content);
        const minStanzas = Math.max(1, Number(config.min_stanzas) || 1);
        if (writtenStanzas.length < minStanzas) {
            return `최소 ${minStanzas}연 이상 써야 해요! 현재 ${writtenStanzas.length}연을 작성했어요. 🌿`;
        }

        const minLines = Math.max(1, Number(config.min_lines_per_stanza) || 1);
        const shortStanzaIndex = writtenStanzas.findIndex((stanza) => (
            stanza.split('\n').filter((line) => line.trim()).length < minLines
        ));
        if (shortStanzaIndex >= 0) {
            return `${shortStanzaIndex + 1}연에 최소 ${minLines}행 이상 써주세요. ✍️`;
        }
        return null;
    },
};
