import { buildWritingPdfHtml } from '../../writing/export/writingPdfExport.js';
import { escapePdfHtml } from '../../writing/export/pdfRenderContract.js';
import { assertBookEdition, ANTHOLOGY_PRINT_SETTINGS } from './contract.js';
import { getBookPaper, getBookDesign } from '../designs.js';
import { paginateAnthology } from './pagination.js';

export async function buildAnthologyHtml(edition) {
    assertBookEdition(edition);
    const book = edition.book;
    const paper = getBookPaper(book.print.paper), design = getBookDesign(book.print.design);
    const contentHeight = paper.height - paper.marginTop - paper.marginBottom;
    const contentWidth = paper.width - paper.marginX * 2;
    const small = paper.id === 'A5';
    const editionLabel = edition.draft ? '검토용 초안' : `${edition.number}판`;
    const html = await buildWritingPdfHtml({ title: book.title, items: book.works.map((work) => ({
        학생글제목: work.title, 작성자: work.author, 미션제목: work.group, 내용: work.blocks.join('\n\n'), _inputTemplate: work.format === 'poem' ? 'poem' : 'freeform',
    })) });
    const e = escapePdfHtml;
    const styles = `<style>
@page { size:${paper.width}mm ${paper.height}mm; margin:0; }
html,body{margin:0;background:#e9e7e2;color:#24362f;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;line-height:1.75}
*{box-sizing:border-box} .anthology-toolbar{padding:16px;text-align:center;font:16px sans-serif}.anthology-toolbar button{padding:10px 24px;font:inherit}
.anthology-page{position:relative;width:${paper.width}mm;height:${paper.height}mm;padding:${paper.marginTop}mm ${paper.marginX}mm ${paper.marginBottom}mm;background:white;margin:8mm auto;break-after:page;page-break-after:always;box-shadow:0 3px 15px #0002}
.anthology-page:last-child{break-after:auto;page-break-after:auto}
.anthology-page-content{height:${contentHeight}mm;overflow:hidden;display:flow-root}
.anthology-page-number{position:absolute;bottom:9mm;left:${paper.marginX}mm;right:${paper.marginX}mm;text-align:center;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt}
.anthology-page h1{font-size:24pt;line-height:1.45;margin:0 0 8mm;overflow-wrap:anywhere}
.anthology-page p{font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 5mm}
.anthology-cover{background:#f5f2e8}.anthology-cover [data-cover]{height:100%;border:1mm double #476755;padding:15mm 10mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10mm}
.anthology-cover [data-compact=true]{gap:5mm;padding:10mm}.anthology-cover [data-compact=true] h1{font-size:24pt}.anthology-cover h1{font-size:30pt;margin:0}.anthology-cover .cover-mark{font-size:44pt;color:#476755}.anthology-cover p{margin:0}
[data-toc-row]{display:flex;gap:5mm;align-items:baseline;border-bottom:.2mm solid #ddd;padding:2.5mm 0;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;overflow-wrap:anywhere}
[data-toc-row] span:first-child{flex:1;min-width:0}[data-toc-row] [data-page]{width:14mm;text-align:right;flex:none}
#anthology-source{position:absolute;left:-10000px;width:${contentWidth}mm}
.pdf-entry,.pdf-entry__content,.pdf-poem__content{min-height:0;break-after:auto;page-break-after:auto}
.anthology-work{white-space:normal}.anthology-work>p{white-space:pre-wrap;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;line-height:1.78}
.anthology-work.poem-sheet__body>p,.anthology-work .poem-sheet__stanza{font-size:${ANTHOLOGY_PRINT_SETTINGS.poem_pt}pt;line-height:2.05;white-space:pre-wrap}
.anthology-continuation{font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;color:#64748b;white-space:normal;margin-bottom:6mm;line-height:1.4}
.anthology-work .pdf-entry__header{white-space:normal}.anthology-work .pdf-entry__rule{margin-bottom:5mm}
.anthology-colophon [data-colophon]{padding-top:${small ? 20 : 40}mm;border-top:.4mm solid #476755}
.anthology-cover{background:${design.paper};color:${design.ink};print-color-adjust:exact;-webkit-print-color-adjust:exact}
.anthology-cover [data-cover]{border-color:${design.accent};border-style:${design.border};padding:${small ? 7 : 12}mm ${small ? 4 : 8}mm;gap:${small ? 5 : 8}mm}
.anthology-cover .cover-mark{color:${design.accent};font-size:${small ? 28 : 40}pt}
.anthology-cover h1{font-size:${small ? 24 : 30}pt}
.anthology-cover [data-compact=true]{gap:${small ? 2 : 4}mm;padding:${small ? 4 : 8}mm}
.anthology-cover [data-compact=true] h1{font-size:${small ? 18 : 22}pt;line-height:1.4}
.anthology-cover [data-compact=true] .cover-mark{font-size:24pt;line-height:1}
.anthology-cover[data-design="editorial"] [data-cover]{border:0;border-top:6mm solid ${design.accent};border-bottom:1.5mm solid ${design.accent};text-align:left;align-items:stretch}
.anthology-cover[data-design="notebook"] [data-cover]{border:.3mm solid #adc3d4;border-left:2mm solid ${design.accent};background:repeating-linear-gradient(0deg,transparent 0 7mm,#32648118 7.1mm 7.3mm)}
.anthology-cover[data-design="constellation"]{background-image:radial-gradient(circle at 15% 20%,#d6b577 0 .3mm,transparent .5mm),radial-gradient(circle at 90% 70%,#d6b577 0 .3mm,transparent .5mm);background-size:23mm 29mm,31mm 37mm}
.anthology-page:not(.anthology-cover) h1{color:${design.id === 'constellation' ? '#3b4b68' : design.accent}}
.anthology-page:not(.anthology-cover) .pdf-entry__rule{border-color:${design.id === 'constellation' ? '#8c784e' : design.accent}}
.anthology-cover .anthology-page-number{color:${design.ink};border:0}
.anthology-page-number{border-top:.2mm solid #cbd5e1;padding-top:2mm;color:#475569}
@media print{html,body{background:white}.anthology-toolbar{display:none}.anthology-page{margin:0;box-shadow:none}#anthology-source{display:none}}
</style>`;
    const front = `<div data-cover data-design="${design.id}" data-compact="${[book.title, book.subtitle, book.class_label].join('').length > 180}"><p>우리 반의 이야기</p><h1>${e(book.title)}</h1><p>${e(book.subtitle)}</p><div class="cover-mark">${design.mark}</div><p>${e(book.class_label)}</p><p>${e(book.issue_date)}</p></div>
${book.introduction ? `<section data-introduction><h1>여는 글</h1>${book.introduction.split(/\n\s*\n/u).map((p) => `<p>${e(p)}</p>`).join('')}</section>` : ''}
${book.works.map((w, i) => `<div data-toc-row="${i}"><span>${e(w.title)} · ${e(w.author)}</span><span data-page></span></div>`).join('')}`;
    const back = `<div data-colophon><h1>${e(book.title)}</h1><p>${e(book.class_label)}</p><p>발행일 ${e(book.issue_date)} · ${editionLabel}</p><p>우리 반의 글을 모아 엮었습니다.\n글의 권리는 각 글쓴이에게 있습니다.</p><p>끄적끄적 아지트 · 글꽃 책방</p></div>`;
    return html.replace('</head>', `${styles}</head>`).replace('<body>', `<body><div class="anthology-toolbar" role="status">문집 페이지를 준비하고 있습니다…</div><div id="anthology-pages"></div><div id="anthology-source">${front}`).replace('</body>', `${back}</div></body>`);
}
export async function renderAnthologyWindow(target, edition) {
    const html = await buildAnthologyHtml(edition);
    if (target.closed) throw new Error('문집 인쇄 창이 닫혔습니다. 다시 열어 주세요.');
    target.document.open(); target.document.write(html); target.document.close();
    await target.document.fonts.ready;
    await new Promise((resolve) => target.requestAnimationFrame(() => target.requestAnimationFrame(resolve)));
    const count = paginateAnthology(target.document);
    const toolbar = target.document.querySelector('.anthology-toolbar'); toolbar.textContent = `${edition.draft ? '검토용 초안 · ' : ''}${getBookPaper(edition.book.print.paper).label} · ${count}쪽 · `;
    if (edition.draft) target.document.querySelectorAll('.anthology-page-number').forEach((footer) => { footer.textContent = `검토용 초안 · ${footer.textContent}`; });
    const button = target.document.createElement('button'); button.type = 'button'; button.textContent = '인쇄 · PDF로 저장';
    button.addEventListener('click', () => { target.focus(); target.print(); }); toolbar.append(button);
    target.opener = null;
    return count;
}
