import { buildWritingPdfHtml } from '../../writing/export/writingPdfExport.js';
import { escapePdfHtml } from '../../writing/export/pdfRenderContract.js';
import { assertBookEdition, ANTHOLOGY_PRINT_SETTINGS } from './contract.js';
import { paginateAnthology } from './pagination.js';

export async function buildAnthologyHtml(edition) {
    assertBookEdition(edition);
    const book = edition.book;
    const editionLabel = edition.draft ? '검토용 초안' : `${edition.number}판`;
    const html = await buildWritingPdfHtml({ title: book.title, items: book.works.map((work) => ({
        학생글제목: work.title, 작성자: work.author, 미션제목: work.group, 내용: work.blocks.join('\n\n'), _inputTemplate: work.format === 'poem' ? 'poem' : 'freeform',
    })) });
    const e = escapePdfHtml;
    const styles = `<style>
@page { size:A4 portrait; margin:0; }
html,body{margin:0;background:#e9e7e2;color:#24362f;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;line-height:1.75}
*{box-sizing:border-box} .anthology-toolbar{padding:16px;text-align:center;font:16px sans-serif}.anthology-toolbar button{padding:10px 24px;font:inherit}
.anthology-page{position:relative;width:210mm;height:297mm;padding:18mm 18mm 20mm;background:white;margin:8mm auto;break-after:page;page-break-after:always;box-shadow:0 3px 15px #0002}
.anthology-page:last-child{break-after:auto;page-break-after:auto}
.anthology-page-content{height:259mm;overflow:hidden;display:flow-root}
.anthology-page-number{position:absolute;bottom:9mm;left:18mm;right:18mm;text-align:center;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt}
.anthology-page h1{font-size:24pt;line-height:1.45;margin:0 0 8mm;overflow-wrap:anywhere}
.anthology-page p{font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 5mm}
.anthology-cover{background:#f5f2e8}.anthology-cover [data-cover]{height:100%;border:1mm double #476755;padding:15mm 10mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10mm}
.anthology-cover [data-compact=true]{gap:5mm;padding:10mm}.anthology-cover [data-compact=true] h1{font-size:24pt}.anthology-cover h1{font-size:30pt;margin:0}.anthology-cover .cover-mark{font-size:44pt;color:#476755}.anthology-cover p{margin:0}
[data-toc-row]{display:flex;gap:5mm;align-items:baseline;border-bottom:.2mm solid #ddd;padding:2.5mm 0;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;overflow-wrap:anywhere}
[data-toc-row] span:first-child{flex:1;min-width:0}[data-toc-row] [data-page]{width:14mm;text-align:right;flex:none}
#anthology-source{position:absolute;left:-10000px;width:174mm}
.pdf-entry,.pdf-entry__content,.pdf-poem__content{min-height:0;break-after:auto;page-break-after:auto}
.anthology-work{white-space:normal}.anthology-work>p{white-space:pre-wrap;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;line-height:1.78}
.anthology-work.poem-sheet__body>p,.anthology-work .poem-sheet__stanza{font-size:${ANTHOLOGY_PRINT_SETTINGS.poem_pt}pt;line-height:2.05;white-space:pre-wrap}
.anthology-continuation{font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;color:#64748b;white-space:normal;margin-bottom:6mm;line-height:1.4}
.anthology-work .pdf-entry__header{white-space:normal}.anthology-work .pdf-entry__rule{margin-bottom:5mm}
.anthology-colophon [data-colophon]{padding-top:50mm;border-top:.4mm solid #476755}
@media print{html,body{background:white}.anthology-toolbar{display:none}.anthology-page{margin:0;box-shadow:none}#anthology-source{display:none}}
</style>`;
    const front = `<div data-cover data-compact="${[book.title, book.subtitle, book.class_label, book.term].join('').length > 180}"><p>${e(book.term)}</p><h1>${e(book.title)}</h1><p>${e(book.subtitle)}</p><div class="cover-mark">✦</div><p>${e(book.class_label)}</p><p>${e(book.issue_date)}</p></div>
${book.introduction ? `<section data-introduction><h1>여는 글</h1>${book.introduction.split(/\n\s*\n/u).map((p) => `<p>${e(p)}</p>`).join('')}</section>` : ''}
${book.works.map((w, i) => `<div data-toc-row="${i}"><span>${e(w.title)} · ${e(w.author)}</span><span data-page></span></div>`).join('')}`;
    const back = `<div data-colophon><h1>${e(book.title)}</h1><p>${e(book.class_label)} · ${e(book.term)}</p><p>발행일 ${e(book.issue_date)} · ${editionLabel}</p><p>우리 반의 글을 모아 엮었습니다.\n글의 권리는 각 글쓴이에게 있습니다.</p><p>끄적끄적 아지트 · 학급 문집</p></div>`;
    return html.replace('</head>', `${styles}</head>`).replace('<body>', `<body><div class="anthology-toolbar" role="status">문집 페이지를 준비하고 있습니다…</div><div id="anthology-pages"></div><div id="anthology-source">${front}`).replace('</body>', `${back}</div></body>`);
}
export async function renderAnthologyWindow(target, edition) {
    const html = await buildAnthologyHtml(edition);
    if (target.closed) throw new Error('문집 인쇄 창이 닫혔습니다. 다시 열어 주세요.');
    target.document.open(); target.document.write(html); target.document.close();
    await target.document.fonts.ready;
    await new Promise((resolve) => target.requestAnimationFrame(() => target.requestAnimationFrame(resolve)));
    const count = paginateAnthology(target.document);
    const toolbar = target.document.querySelector('.anthology-toolbar'); toolbar.textContent = `${edition.draft ? '검토용 초안 · ' : ''}A4 · ${count}쪽 · `;
    if (edition.draft) target.document.querySelectorAll('.anthology-page-number').forEach((footer) => { footer.textContent = `검토용 초안 · ${footer.textContent}`; });
    const button = target.document.createElement('button'); button.type = 'button'; button.textContent = '인쇄 · PDF로 저장';
    button.addEventListener('click', () => { target.focus(); target.print(); }); toolbar.append(button);
    target.opener = null;
    return count;
}
