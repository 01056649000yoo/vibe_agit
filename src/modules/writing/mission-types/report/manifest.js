import {
    countFilledReportSections,
    normalizeReportSections,
    REPORT_TEMPLATE_ID,
    validateReportSubmission,
} from './reportContent.js';
import { REPORT_PDF_MODE_FINAL, REPORT_PDF_MODE_GUIDED } from './reportPdfModes.js';

export const reportMissionType = {
    id: REPORT_TEMPLATE_ID,
    name: '보고하는 글쓰기',
    icon: '📋',
    description: '글과 사진을 칸별로 정리하고 순서를 바꾸어 보고서를 만듭니다.',
    teacherEntry: () => import('./ReportMissionForm'),
    studentEditorEntry: () => import('./ReportEditor'),
    usesStructuredContent: true,
    pdfExport: {
        id: REPORT_TEMPLATE_ID,
        load: () => import('./reportPdfExport.js').then((module) => module.reportPdfExport),
        renderModes: [
            {
                value: REPORT_PDF_MODE_GUIDED,
                label: '질문 포함 지도형',
                description: '교사의 질문과 학생 답변을 함께 정리합니다.',
            },
            {
                value: REPORT_PDF_MODE_FINAL,
                label: '질문 없는 완성본',
                description: '교사 질문을 빼고 사진과 학생 글만 보여줍니다.',
            },
        ],
    },
    imageExport: {
        id: REPORT_TEMPLATE_ID,
        load: () => import('./reportExportImages.js').then((module) => module.reportImageExport),
    },
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
