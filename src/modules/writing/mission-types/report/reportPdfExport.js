import { escapePdfHtml, renderPdfDocumentHeader } from '../../export/pdfRenderContract.js';
import { normalizeReportSections } from './reportContent.js';
import { REPORT_PDF_MODE_FINAL, REPORT_PDF_MODE_GUIDED } from './reportPdfModes.js';
const REPORT_IMAGE_URL_BATCH_SIZE = 50;

const getReportSections = (entry) => (
    normalizeReportSections(entry.structuredContent, entry.content)
);

const collectImagePaths = (entry) => (
    getReportSections(entry)
        .map((section) => section.image?.path)
        .filter(Boolean)
);

const loadImageUrls = async (entries) => {
    const paths = [...new Set(entries.flatMap(collectImagePaths))];
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

const renderGuidedReportEntry = (entry, imageUrls) => {
    const sections = getReportSections(entry);
    return `
        <article class="pdf-entry pdf-entry--report pdf-entry--report-guided">
            ${renderPdfDocumentHeader(entry, '보고하는 글')}
            <div class="pdf-entry__rule"></div>
            <main class="report-sheet">
                ${sections.map((section, index) => {
                    const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                    const question = section.heading?.trim() || '';
                    const observation = section.body?.trim() || section.image?.caption?.trim() || '';
                    return `
                        <section class="report-sheet__section">
                            <div class="report-sheet__number">${index + 1}</div>
                            <div class="report-sheet__section-body">
                                ${question ? `
                                    <div class="report-sheet__question">
                                        <span class="report-sheet__question-label">교사의 질문</span>
                                        <h2>${escapePdfHtml(question)}</h2>
                                    </div>` : ''}
                                ${section.image?.path || observation ? `
                                    <div class="report-sheet__response${section.image?.path ? ' report-sheet__response--with-photo' : ''}">
                                        ${section.image?.path ? `
                                            <figure>
                                                <div class="report-sheet__photo-frame">
                                                    ${imageUrl
                                                        ? `<img src="${escapePdfHtml(imageUrl)}" alt="${escapePdfHtml(section.image.caption || `${index + 1}번 보고서 사진`)}">`
                                                        : '<div class="report-sheet__image-missing">사진을 불러오지 못했습니다.</div>'}
                                                </div>
                                            </figure>` : ''}
                                        ${observation ? `
                                            <div class="report-sheet__answer">
                                                <span class="report-sheet__label">보고서 내용</span>
                                                <p>${escapePdfHtml(observation)}</p>
                                            </div>` : ''}
                                    </div>` : ''}
                            </div>
                        </section>`;
                }).join('')}
            </main>
        </article>`;
};

const renderFinalReportEntry = (entry, imageUrls) => {
    const sections = getReportSections(entry)
        .filter((section) => section.image?.path || section.body?.trim() || section.image?.caption?.trim());
    return `
        <article class="pdf-entry pdf-entry--report pdf-entry--report-final">
            ${renderPdfDocumentHeader(entry, '완성 보고서')}
            <div class="pdf-entry__rule"></div>
            <main class="final-report">
                ${sections.map((section, index) => {
                    const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                    const observation = section.body?.trim() || section.image?.caption?.trim() || '';
                    return `
                        <section class="final-report__section${section.image?.path ? ' final-report__section--with-photo' : ''}">
                            ${section.image?.path ? `
                                <figure>
                                    <div class="final-report__photo-frame">
                                        ${imageUrl
                                            ? `<img src="${escapePdfHtml(imageUrl)}" alt="${escapePdfHtml(section.image.caption || `${index + 1}번째 보고서 사진`)}">`
                                            : '<div class="report-sheet__image-missing">사진을 불러오지 못했습니다.</div>'}
                                    </div>
                                </figure>` : ''}
                            ${observation ? `
                                <div class="final-report__body">
                                    <p>${escapePdfHtml(observation)}</p>
                                </div>` : ''}
                        </section>`;
                }).join('')}
            </main>
        </article>`;
};

const REPORT_PDF_STYLES = `
        .report-sheet { display: block; }
        .report-sheet__section {
            display: grid;
            grid-template-columns: 10mm minmax(0, 1fr);
            gap: 4mm;
            padding: 4.5mm 0;
            border-top: .35mm solid #CBD5E1;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .report-sheet__section:first-child { border-top: 0; padding-top: 0; }
        .report-sheet__number {
            display: grid;
            width: 8mm;
            height: 8mm;
            place-items: center;
            border-radius: 50%;
            background: #CCFBF1;
            color: #0F766E;
            font-size: 12pt;
            font-weight: 900;
        }
        .report-sheet__section-body, .report-sheet__response { min-width: 0; }
        .report-sheet__response--with-photo {
            display: grid;
            grid-template-columns: 52mm minmax(0, 1fr);
            align-items: stretch;
            gap: 5mm;
        }
        .report-sheet__question {
            display: flex;
            align-items: center;
            gap: 3mm;
            width: 100%;
            margin-bottom: 3.5mm;
            padding: 2.4mm 3.5mm;
            border-left: 1.2mm solid #14B8A6;
            border-radius: 0 2.5mm 2.5mm 0;
            background: #F0FDFA;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .report-sheet__question h2 {
            flex: 1;
            min-width: 0;
            margin: 0;
            color: #134E4A;
            font-size: 12pt;
            line-height: 1.4;
            overflow-wrap: anywhere;
        }
        .report-sheet__question-label {
            flex: 0 0 auto;
            padding: .6mm 2mm;
            border-radius: 999px;
            background: #CCFBF1;
            color: #0F766E;
            font-size: 12pt;
            font-weight: 800;
            line-height: 1.35;
            white-space: nowrap;
        }
        .report-sheet__label {
            display: block;
            margin-bottom: 1mm;
            color: #0F766E;
            font-size: 12pt;
            font-weight: 800;
        }
        .report-sheet__answer {
            min-width: 0;
            min-height: 41.6mm;
            padding: 3mm 4mm;
            border: .3mm solid #E2E8F0;
            border-radius: 2.5mm;
            background: #FAFCFC;
        }
        .report-sheet p {
            margin: 0;
            color: #1F2937;
            font-size: 12pt;
            line-height: 1.72;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
            orphans: 3;
            widows: 3;
        }
        .report-sheet figure {
            min-width: 0;
            margin: 0;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .report-sheet__photo-frame {
            width: 52mm;
            aspect-ratio: 5 / 4;
            overflow: hidden;
            border: .35mm solid #D8E4E2;
            border-radius: 3mm;
            background: #F1F5F9;
        }
        .report-sheet__photo-frame img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
        }
        .report-sheet__image-missing {
            display: grid;
            width: 100%;
            height: 100%;
            place-items: center;
            color: #64748B;
            font-size: 12pt;
            text-align: center;
        }
        .final-report { display: block; }
        .final-report__section {
            padding: 6mm 0;
            border-top: .35mm solid #CBD5E1;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .final-report__section:first-child { padding-top: 0; border-top: 0; }
        .final-report__section--with-photo {
            display: grid;
            grid-template-columns: 58mm minmax(0, 1fr);
            align-items: stretch;
            gap: 7mm;
        }
        .final-report figure { min-width: 0; margin: 0; }
        .final-report__photo-frame {
            width: 58mm;
            aspect-ratio: 5 / 4;
            overflow: hidden;
            border: .35mm solid #D8E4E2;
            border-radius: 3mm;
            background: #F1F5F9;
        }
        .final-report__photo-frame img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
        }
        .final-report__body {
            min-width: 0;
            padding: 3.5mm 4.5mm;
            border-left: 1.2mm solid #14B8A6;
            border-radius: 0 2.5mm 2.5mm 0;
            background: #F8FAFC;
        }
        .final-report__body p {
            margin: 0;
            color: #1F2937;
            font-size: 12pt;
            line-height: 1.78;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
            orphans: 3;
            widows: 3;
        }
`;

export const reportPdfExport = {
    id: 'report',
    renderEntry: (entry, { imageUrls = new Map(), reportMode = REPORT_PDF_MODE_GUIDED } = {}) => (
        reportMode === REPORT_PDF_MODE_FINAL
            ? renderFinalReportEntry(entry, imageUrls)
            : renderGuidedReportEntry(entry, imageUrls)
    ),
    styles: REPORT_PDF_STYLES,
    collectImagePaths,
    loadImageUrls,
};
