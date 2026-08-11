export const REPORT_PDF_MODE_GUIDED = 'guided';
export const REPORT_PDF_MODE_FINAL = 'final';

export const isReportPdfMission = (mission) => (
    mission?.input_template === 'report' || mission?.genre === '보고하는 글'
);
