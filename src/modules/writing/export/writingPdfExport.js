import { isReportStructuredContent, normalizeReportSections } from '../mission-types/report/reportContent.js';
import { getWritingExportProfile } from './writingExportProfiles.js';

export const WRITING_PDF_MAX_ENTRIES = 100;
export const REPORT_PDF_MODE_GUIDED = 'guided';
export const REPORT_PDF_MODE_FINAL = 'final';
const REPORT_IMAGE_URL_BATCH_SIZE = 50;

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const cleanFileTitle = (value) => String(value || '글 모음')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '글 모음';

const getStructuredContent = (item) => item?._structuredContent ?? item?.structured_content ?? null;
const getInputTemplate = (item) => item?._inputTemplate ?? item?.input_template ?? '';

export const normalizeWritingPdfEntry = (item, contentType = 'assignment') => {
    const profile = getWritingExportProfile(contentType);
    const isLegacyAssignment = Object.hasOwn(item || {}, '학생글제목');
    const title = isLegacyAssignment
        ? item.학생글제목
        : item?.post_title;
    const author = isLegacyAssignment
        ? item.작성자
        : item?.student_name;
    const group = isLegacyAssignment
        ? item.미션제목
        : item?.group_title;
    const content = isLegacyAssignment
        ? item.내용
        : item?.content;
    const structuredContent = getStructuredContent(item);

    return {
        postId: item?._postId ?? item?.post_id ?? '',
        title: title || '제목 없는 글',
        author: author || '이름 없음',
        group: group || profile.label || '글쓰기',
        content: content || '',
        metadata: isLegacyAssignment
            ? [item?.승인일 ? `승인일: ${item.승인일}` : null].filter(Boolean)
            : profile.metadataLines(item || {}).filter(Boolean),
        structuredContent,
        inputTemplate: getInputTemplate(item),
        isReport: getInputTemplate(item) === 'report' || isReportStructuredContent(structuredContent),
    };
};

const renderDocumentHeader = (entry, typeLabel) => `
    <header class="pdf-entry__header">
        <div class="pdf-entry__kicker">${escapeHtml(typeLabel)}</div>
        <h1>${escapeHtml(entry.title)}</h1>
        <div class="pdf-entry__author">글쓴이 <strong>${escapeHtml(entry.author)}</strong></div>
        ${entry.group ? `<div class="pdf-entry__group">${escapeHtml(entry.group)}</div>` : ''}
    </header>`;

const renderNormalEntry = (entry) => `
    <article class="pdf-entry pdf-entry--normal">
        ${renderDocumentHeader(entry, '끄적끄적 글쓰기')}
        <div class="pdf-entry__rule"></div>
        <main class="pdf-entry__content">${escapeHtml(entry.content)}</main>
        ${entry.metadata.length > 0 ? `<footer class="pdf-entry__metadata">${entry.metadata.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</footer>` : ''}
    </article>`;

const renderGuidedReportEntry = (entry, imageUrls) => {
    const sections = normalizeReportSections(entry.structuredContent, entry.content);
    return `
        <article class="pdf-entry pdf-entry--report pdf-entry--report-guided">
            ${renderDocumentHeader(entry, '보고하는 글')}
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
                                        <h2>${escapeHtml(question)}</h2>
                                    </div>` : ''}
                                ${section.image?.path || observation ? `
                                    <div class="report-sheet__response${section.image?.path ? ' report-sheet__response--with-photo' : ''}">
                                        ${section.image?.path ? `
                                            <figure>
                                                <div class="report-sheet__photo-frame">
                                                    ${imageUrl
                                                        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(section.image.caption || `${index + 1}번 보고서 사진`)}">`
                                                        : '<div class="report-sheet__image-missing">사진을 불러오지 못했습니다.</div>'}
                                                </div>
                                            </figure>` : ''}
                                        ${observation ? `
                                        <div class="report-sheet__answer">
                                            <span class="report-sheet__label">보고서 내용</span>
                                            <p>${escapeHtml(observation)}</p>
                                        </div>` : ''}
                                    </div>` : ''}
                            </div>
                        </section>`;
                }).join('')}
            </main>
        </article>`;
};

const renderFinalReportEntry = (entry, imageUrls) => {
    const sections = normalizeReportSections(entry.structuredContent, entry.content)
        .filter((section) => section.image?.path || section.body?.trim() || section.image?.caption?.trim());
    return `
        <article class="pdf-entry pdf-entry--report pdf-entry--report-final">
            ${renderDocumentHeader(entry, '완성 보고서')}
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
                                            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(section.image.caption || `${index + 1}번째 보고서 사진`)}">`
                                            : '<div class="report-sheet__image-missing">사진을 불러오지 못했습니다.</div>'}
                                    </div>
                                </figure>` : ''}
                            ${observation ? `
                                <div class="final-report__body">
                                    <p>${escapeHtml(observation)}</p>
                                </div>` : ''}
                        </section>`;
                }).join('')}
            </main>
        </article>`;
};

export const collectWritingPdfImagePaths = (items, contentType = 'assignment') => {
    const paths = new Set();
    (items || []).forEach((item) => {
        const entry = normalizeWritingPdfEntry(item, contentType);
        if (!entry.isReport) return;
        normalizeReportSections(entry.structuredContent, entry.content).forEach((section) => {
            if (section.image?.path) paths.add(section.image.path);
        });
    });
    return [...paths];
};

export const buildWritingPdfHtml = ({
    items,
    title,
    contentType = 'assignment',
    imageUrls = new Map(),
    reportMode = REPORT_PDF_MODE_GUIDED,
}) => {
    const entries = (items || []).map((item) => normalizeWritingPdfEntry(item, contentType));
    const safeTitle = cleanFileTitle(title);
    const safeReportMode = reportMode === REPORT_PDF_MODE_FINAL
        ? REPORT_PDF_MODE_FINAL
        : REPORT_PDF_MODE_GUIDED;
    const body = entries.map((entry) => {
        if (!entry.isReport) return renderNormalEntry(entry);
        return safeReportMode === REPORT_PDF_MODE_FINAL
            ? renderFinalReportEntry(entry, imageUrls)
            : renderGuidedReportEntry(entry, imageUrls);
    }).join('');

    return `<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(safeTitle)}</title>
    <style>
        @page { size: A4 portrait; margin: 15mm 16mm 17mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: white; color: #172033; }
        body {
            font-family: "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
            font-size: 12pt;
            line-height: 1.72;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .pdf-entry {
            min-height: 265mm;
            break-after: page;
            page-break-after: always;
        }
        .pdf-entry:last-child { break-after: auto; page-break-after: auto; }
        .pdf-entry__header { break-inside: avoid; page-break-inside: avoid; padding: 1mm 0 4mm; }
        .pdf-entry__kicker {
            margin-bottom: 2mm;
            color: #5B43D6;
            font-size: 12pt;
            font-weight: 800;
            letter-spacing: .04em;
        }
        .pdf-entry--report .pdf-entry__kicker { color: #0F766E; }
        .pdf-entry h1 {
            margin: 0;
            color: #172033;
            font-size: 21pt;
            line-height: 1.3;
            overflow-wrap: anywhere;
        }
        .pdf-entry__author, .pdf-entry__group {
            margin-top: 2.5mm;
            color: #475569;
            font-size: 12pt;
        }
        .pdf-entry__group { margin-top: 1mm; color: #64748B; }
        .pdf-entry__rule { height: 1.2mm; margin: 2mm 0 7mm; border-radius: 999px; background: #6D4AFF; }
        .pdf-entry--report .pdf-entry__rule { background: #14B8A6; }
        .pdf-entry__content {
            min-height: 190mm;
            color: #1F2937;
            font-size: 12pt;
            line-height: 1.78;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
            orphans: 3;
            widows: 3;
        }
        .pdf-entry__metadata {
            display: flex;
            flex-wrap: wrap;
            gap: 2mm 7mm;
            margin-top: 8mm;
            padding-top: 4mm;
            border-top: .3mm solid #CBD5E1;
            color: #64748B;
            font-size: 12pt;
        }
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
    </style>
</head>
<body>${body}</body>
</html>`;
};

const waitForPrintImages = async (printDocument) => {
    const images = [...printDocument.images];
    await Promise.all(images.map((image) => {
        if (image.complete) {
            return image.naturalWidth > 0
                ? Promise.resolve()
                : Promise.reject(new Error('보고서 사진을 PDF에 불러오지 못했습니다.'));
        }
        return new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', () => reject(new Error('보고서 사진을 PDF에 불러오지 못했습니다.')), { once: true });
        });
    }));
};

const loadReportImageUrls = async (items, contentType) => {
    const paths = collectWritingPdfImagePaths(items, contentType);
    if (paths.length === 0) return new Map();
    const { getReportImageUrls } = await import('../mission-types/report/reportImageApi.js');
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

const printWritingHtml = async (html) => {
    if (typeof document === 'undefined') throw new Error('이 기기에서는 PDF 출력을 열 수 없습니다.');
    const frame = document.createElement('iframe');
    frame.setAttribute('title', '글 PDF 출력');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, {
        position: 'fixed',
        left: '-10000px',
        bottom: '0',
        width: '210mm',
        height: '297mm',
        border: '0',
        opacity: '0',
        pointerEvents: 'none',
    });
    document.body.appendChild(frame);

    const cleanup = () => frame.remove();
    try {
        const printDocument = frame.contentDocument;
        const printWindow = frame.contentWindow;
        if (!printDocument || !printWindow) throw new Error('PDF 출력 화면을 만들지 못했습니다.');
        printDocument.open();
        printDocument.write(html);
        printDocument.close();
        if (printDocument.fonts?.ready) await printDocument.fonts.ready;
        await waitForPrintImages(printDocument);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        printWindow.addEventListener('afterprint', cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
        globalThis.setTimeout(cleanup, 120000);
    } catch (error) {
        cleanup();
        throw error;
    }
};

export const exportWritingEntriesToPdf = async ({
    items,
    title,
    contentType = 'assignment',
    reportMode = REPORT_PDF_MODE_GUIDED,
}) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('PDF로 내보낼 글이 없습니다.');
    if (items.length > WRITING_PDF_MAX_ENTRIES) {
        throw new Error(`PDF는 한 번에 ${WRITING_PDF_MAX_ENTRIES}편까지 내보낼 수 있습니다.`);
    }
    const imageUrls = await loadReportImageUrls(items, contentType);
    const html = buildWritingPdfHtml({ items, title, contentType, imageUrls, reportMode });
    await printWritingHtml(html);
};
