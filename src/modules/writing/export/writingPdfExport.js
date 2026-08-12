import { getGenreMissionType } from '../mission-types/registry.js';
import { getWritingExportProfile } from './writingExportProfiles.js';
import { escapePdfHtml, renderPdfDocumentHeader } from './pdfRenderContract.js';
import { WRITING_EXPORT_MAX_ENTRIES } from './writingExportLimits.js';

export const WRITING_PDF_MAX_ENTRIES = WRITING_EXPORT_MAX_ENTRIES;

const cleanFileTitle = (value) => String(value || '글 모음')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '글 모음';

const getStructuredContent = (item) => (
    item?._structuredContent ?? item?.structured_content ?? item?.structuredContent ?? null
);
const getInputTemplate = (item) => item?._inputTemplate ?? item?.input_template ?? '';
const resolveInputTemplate = (item, structuredContent) => {
    const explicitTemplate = getInputTemplate(item);
    if (getGenreMissionType(explicitTemplate)) return explicitTemplate;
    const structuredTemplate = structuredContent?.template || '';
    if (getGenreMissionType(structuredTemplate)) return structuredTemplate;
    return explicitTemplate;
};

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
        inputTemplate: resolveInputTemplate(item, structuredContent),
    };
};

const renderNormalEntry = (entry) => `
    <article class="pdf-entry pdf-entry--normal">
        ${renderPdfDocumentHeader(entry, '끄적끄적 글쓰기')}
        <div class="pdf-entry__rule"></div>
        <main class="pdf-entry__content">${escapePdfHtml(entry.content)}</main>
        ${entry.metadata.length > 0 ? `<footer class="pdf-entry__metadata">${entry.metadata.map((line) => `<span>${escapePdfHtml(line)}</span>`).join('')}</footer>` : ''}
    </article>`;

const getEntryPdfExportContract = (entry) => (
    getGenreMissionType(entry.inputTemplate)?.pdfExport ?? null
);

const createPdfExportResolver = () => {
    const cache = new Map();
    return async (entry) => {
        const contract = getEntryPdfExportContract(entry);
        if (!contract?.load) return null;
        if (!cache.has(contract.id)) {
            cache.set(contract.id, Promise.resolve(contract.load()).then((pdfExport) => {
                if (
                    pdfExport?.id !== contract.id
                    || typeof pdfExport?.renderEntry !== 'function'
                    || typeof pdfExport?.styles !== 'string'
                ) {
                    throw new Error(`${contract.id} 장르의 PDF 출력 계약이 올바르지 않습니다.`);
                }
                return pdfExport;
            }));
        }
        return cache.get(contract.id);
    };
};

export const collectWritingPdfImagePaths = async (items, contentType = 'assignment') => {
    const paths = new Set();
    const resolvePdfExport = createPdfExportResolver();
    for (const item of items || []) {
        const entry = normalizeWritingPdfEntry(item, contentType);
        const pdfExport = await resolvePdfExport(entry);
        pdfExport?.collectImagePaths?.(entry).forEach((path) => paths.add(path));
    }
    return [...paths];
};

export const buildWritingPdfHtml = async ({
    items,
    title,
    contentType = 'assignment',
    imageUrls = new Map(),
    renderMode,
}) => {
    const entries = (items || []).map((item) => normalizeWritingPdfEntry(item, contentType));
    const safeTitle = cleanFileTitle(title);
    const resolvePdfExport = createPdfExportResolver();
    const entryPdfExports = await Promise.all(entries.map(resolvePdfExport));
    const genrePdfExports = [...new Set(entryPdfExports.filter(Boolean))];
    const genreStyles = genrePdfExports.map((pdfExport) => pdfExport.styles).join('\n');
    const body = entries.map((entry, index) => {
        const pdfExport = Reflect.get(entryPdfExports, index);
        return pdfExport?.renderEntry
            ? pdfExport.renderEntry(entry, { imageUrls, renderMode })
            : renderNormalEntry(entry);
    }).join('');

    return `<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapePdfHtml(safeTitle)}</title>
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
${genreStyles}
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

const loadWritingPdfImageUrls = async (items, contentType) => {
    const entriesByPdfExport = new Map();
    const resolvePdfExport = createPdfExportResolver();
    for (const item of items || []) {
        const entry = normalizeWritingPdfEntry(item, contentType);
        const pdfExport = await resolvePdfExport(entry);
        if (!pdfExport?.loadImageUrls) continue;
        const entries = entriesByPdfExport.get(pdfExport) || [];
        entries.push(entry);
        entriesByPdfExport.set(pdfExport, entries);
    }

    const urls = new Map();
    for (const [pdfExport, entries] of entriesByPdfExport) {
        const genreUrls = await pdfExport.loadImageUrls(entries);
        genreUrls.forEach((url, path) => urls.set(path, url));
    }
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
    renderMode,
}) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('PDF로 내보낼 글이 없습니다.');
    if (items.length > WRITING_PDF_MAX_ENTRIES) {
        throw new Error(`PDF는 한 번에 ${WRITING_PDF_MAX_ENTRIES}편까지 내보낼 수 있습니다.`);
    }
    const imageUrls = await loadWritingPdfImageUrls(items, contentType);
    const html = await buildWritingPdfHtml({ items, title, contentType, imageUrls, renderMode });
    await printWritingHtml(html);
};
