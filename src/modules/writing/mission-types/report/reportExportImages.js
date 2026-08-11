import { normalizeReportSections } from './reportContent.js';

const REPORT_IMAGE_URL_BATCH_SIZE = 50;

const getStructuredContent = (entry) => (
    entry?.structuredContent ?? entry?._structuredContent ?? entry?.structured_content ?? null
);

const getContent = (entry) => entry?.content ?? entry?.내용 ?? '';

export const collectReportExportImages = (entry) => (
    normalizeReportSections(getStructuredContent(entry), getContent(entry))
        .map((section, index) => section.image?.path ? ({
            path: section.image.path,
            caption: section.image.caption || section.body || `${index + 1}번 보고서 사진`,
            width: section.image.width,
            height: section.image.height,
            mimeType: section.image.mimeType,
        }) : null)
        .filter(Boolean)
);

export const collectReportImagePaths = (entry) => (
    collectReportExportImages(entry).map((image) => image.path)
);

export const loadReportImageUrls = async (entries) => {
    const paths = [...new Set((entries || []).flatMap(collectReportImagePaths))];
    if (paths.length === 0) return new Map();
    const { getReportImageUrls } = await import('./reportImageApi.js');
    const urls = new Map();
    for (let index = 0; index < paths.length; index += REPORT_IMAGE_URL_BATCH_SIZE) {
        const batch = paths.slice(index, index + REPORT_IMAGE_URL_BATCH_SIZE);
        const batchUrls = await getReportImageUrls(batch);
        batchUrls.forEach((url, path) => urls.set(path, url));
    }
    const missing = paths.filter((path) => !urls.has(path));
    if (missing.length > 0) throw new Error(`보고서 사진 ${missing.length}장을 불러오지 못했습니다.`);
    return urls;
};

export const reportImageExport = {
    id: 'report',
    collectImages: collectReportExportImages,
    loadImageUrls: loadReportImageUrls,
};
