import {
    countFilledReportSections,
    normalizeReportSections,
    REPORT_TEMPLATE_ID,
    validateReportSubmission,
} from './reportContent';

export const reportMissionType = {
    id: REPORT_TEMPLATE_ID,
    name: '보고하는 글쓰기',
    icon: '📋',
    description: '글과 사진을 칸별로 정리하고 순서를 바꾸어 보고서를 만듭니다.',
    teacherEntry: () => import('./ReportMissionForm'),
    studentEditorEntry: () => import('./ReportEditor'),
    supportsEvaluation: true,
    unitLabel: '내용 칸',
    skipGenericParagraphValidation: true,
    performance: {
        home: 'none',
        load: 'on-open',
        writes: 'rpc',
        realtime: 'none',
        maxInitialRows: 12,
    },
    studentLabels: {
        editorHeading: '📋 나의 보고서 만들기',
        previewHeading: '보고서 제출 전 확인',
        previewDescription: '칸 순서와 사진 설명이 알맞은지 마지막으로 살펴보세요.',
        titleLabel: '보고서 제목',
        contentLabel: '완성된 보고서',
        submitLabel: '보고서 제출하기 📋',
        previewSubmitLabel: '이 보고서 제출하기 📋',
        titleRequiredMessage: '무엇을 보고하는 글인지 제목을 적어주세요! 📋',
        submitConfirmMessage: '이 보고서를 제출할까요? 사진과 칸 순서를 한 번 더 확인해주세요.',
    },
    countParagraphs: ({ structuredContent, content, config = {} }) => (
        countFilledReportSections(normalizeReportSections(structuredContent, content, config))
    ),
    validateSubmission: validateReportSubmission,
};
