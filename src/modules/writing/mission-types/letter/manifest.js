import { normalizeLetterParts, validateLetterSubmission } from './letterContent.js';
import { getLetterPaperRenderModes } from './letterPapers.js';

export const letterMissionType = {
    id: 'letter',
    name: '편지 쓰기',
    icon: '✉️',
    description: '받는 사람·첫인사·하고 싶은 말·끝인사 칸으로 편지를 씁니다. 계기교육용 편지지로 인쇄할 수 있습니다.',
    teacherEntry: () => import('./LetterMissionForm'),
    studentEditorEntry: () => import('./LetterEditor'),
    reactionProfile: 'standard',
    usesStructuredContent: true,
    pdfExport: {
        id: 'letter',
        load: () => import('./letterPdfExport.js').then((module) => module.letterPdfExport),
        renderModes: getLetterPaperRenderModes(),
    },
    supportsEvaluation: true,
    unitLabel: '칸 수',
    skipGenericParagraphValidation: true,
    countParagraphs: ({ structuredContent, content }) => {
        const parts = normalizeLetterParts(structuredContent, content);
        return [parts.recipient, parts.greeting, parts.body, parts.closing].filter(Boolean).length;
    },
    validateSubmission: validateLetterSubmission,
};
