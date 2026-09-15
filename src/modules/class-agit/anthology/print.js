import { buildWritingPdfHtml } from '../../writing/export/writingPdfExport.js';
import { escapePdfHtml, PDF_KICKER_CLASSES } from '../../writing/export/pdfRenderContract.js';
import { assertBookEdition, ANTHOLOGY_PRINT_SETTINGS, bookCoverKicker } from './contract.js';
import { getBookPaper, getBookDesign, getBookPageLayout } from '../designs.js';
import { paginateAnthology } from './pagination.js';

export async function buildAnthologyHtml(edition) {
    assertBookEdition(edition);
    const book = edition.book;
    const paper = getBookPaper(book.print.paper), design = getBookDesign(book.print.design);
    /*
     * 쪽 배치. 이어붙이기(`continuous`)면 주제가 바뀌는 자리마다 간지를 넣고,
     * 목차도 **주제 아래 작품**으로 들여쓴다. 예전 확정판에는 이 값이 없어 기본(작품마다 새 쪽)이다.
     */
    const layout = getBookPageLayout(book.print.layout).id;
    const personal = book.book_type === 'personal';
    const continuous = layout === 'continuous';
    // 주제가 바뀌는 첫 작품의 자리를 미리 표시해 둔다 — 간지와 목차가 같은 기준을 쓴다.
    // 교사가 "여기서 쪽을 넘긴다" 고 정한 작품. 확정판에도 함께 실려 온다.
    const forcedBreaks = new Set((Array.isArray(book.page_breaks) ? book.page_breaks : [])
        .map((id) => book.works.findIndex((work) => work.sourceId === id))
        .filter((index) => index > 0));
    const groupStarts = new Map();
    book.works.forEach((work, index) => {
        const title = String(work.group || '').trim();
        const previous = index > 0 ? String(book.works[index - 1].group || '').trim() : null;
        if (continuous && book.grouping === 'topic' && title && title !== previous) groupStarts.set(index, title);
    });
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
/* 이어붙이기 목차: 주제 줄은 굵게, 그 아래 작품은 들여쓴다 — 어디가 묶음인지 한눈에 보인다. */
[data-toc-group]{font-weight:800;border-bottom-width:.4mm;margin-top:3mm}
[data-toc-work] span:first-child{padding-left:6mm}
/* 간지 = 주제 속표지. 이름과 함께 그 주제의 작품 목록을 싣는다 — 어차피 비는 쪽이라 공짜다. */
.anthology-divider .anthology-page-content{display:flex;flex-direction:column;justify-content:center;text-align:center}
.anthology-divider h1{font-size:26pt;margin:0 0 12mm}
[data-divider-list]{text-align:left;max-width:110mm;margin:0 auto;width:100%}
[data-divider-row]{display:flex;gap:5mm;align-items:baseline;border-bottom:.2mm solid #e2e8f0;padding:2.5mm 0;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;overflow-wrap:anywhere}
[data-divider-row] span:first-child{flex:1;min-width:0}[data-divider-row] [data-page]{width:14mm;text-align:right;flex:none}
#anthology-source{position:absolute;left:-10000px;width:${contentWidth}mm}
.pdf-entry,.pdf-entry__content,.pdf-poem__content{min-height:0;break-after:auto;page-break-after:auto}
.anthology-work{white-space:normal}.anthology-work>p{white-space:pre-wrap;font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;line-height:1.78}
/* 산문은 양쪽을 맞춘다 — 오른쪽 끝이 들쭉날쭉하면 종이에서 더 눈에 띈다.
   시(poem-sheet__body·poem-sheet__stanza)는 줄의 시작과 끝이 작품이라 건드리지 않는다.
   아이가 넣은 줄바꿈은 위의 pre-wrap 이 그대로 지킨다(화면 읽기 창과 같은 원칙). */
.anthology-work.pdf-entry__content>p{text-align:justify}
.anthology-work.poem-sheet__body>p,.anthology-work .poem-sheet__stanza{font-size:${ANTHOLOGY_PRINT_SETTINGS.poem_pt}pt;line-height:2.05;white-space:pre-wrap}
.anthology-continuation{font-size:${ANTHOLOGY_PRINT_SETTINGS.body_pt}pt;color:#64748b;white-space:normal;margin-bottom:6mm;line-height:1.4}
.anthology-work .pdf-entry__header{white-space:normal}.anthology-work .pdf-entry__rule{margin-bottom:5mm}
/* 갈래 딱지는 문집에서 감춘다 — 글마다 같은 말이 되풀이된다. 감춘 자리는 차지하지 않는다. */
${PDF_KICKER_CLASSES.map((name) => `.anthology-work .${name}`).join(',')}{display:none}
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
.anthology-cover[data-design="storybook"] [data-cover]{border-radius:45% 45% 3mm 3mm;box-shadow:inset 0 0 0 1mm #fff8}
.anthology-cover[data-design="ocean"]{background-image:radial-gradient(ellipse at 15% 92%,#fff8 0 9%,transparent 10%),radial-gradient(ellipse at 52% 96%,#fff7 0 13%,transparent 14%),linear-gradient(#eafaff,#94d7e7)}
.anthology-cover[data-design="ocean"] [data-cover]{border:0;border-bottom:5mm solid ${design.accent}}
.anthology-cover[data-design="modern"] [data-cover]{border:0;border-left:10mm solid ${design.accent};text-align:left;align-items:stretch}
.anthology-cover[data-design="hanji"]{background-image:repeating-linear-gradient(8deg,#ffffff10 0 .5mm,#684f3610 .7mm 1mm)}
.anthology-personal .pdf-entry__author,.anthology-personal .poem-sheet__author{display:none}
.anthology-page:not(.anthology-cover) h1{color:${design.id === 'constellation' ? '#3b4b68' : design.accent}}
.anthology-page:not(.anthology-cover) .pdf-entry__rule{border-color:${design.id === 'constellation' ? '#8c784e' : design.accent}}
.anthology-cover .anthology-page-number{color:${design.ink};border:0}
.anthology-page-number{border-top:.2mm solid #cbd5e1;padding-top:2mm;color:#475569}
@media print{html,body{background:white}.anthology-toolbar{display:none}.anthology-page{margin:0;box-shadow:none}#anthology-source{display:none}}
</style>`;
    const kicker = bookCoverKicker(book);
    const front = `<div data-cover data-design="${design.id}" data-compact="${[kicker, book.title, book.subtitle, book.class_label].join('').length > 180}">${kicker ? `<p>${e(kicker)}</p>` : ''}<h1>${e(book.title)}</h1><p>${e(book.subtitle)}</p><div class="cover-mark">${design.mark}</div>${personal ? `<p><strong>${e(book.owner_student_name)} 지음</strong></p>` : ''}<p>${e(book.class_label)}</p><p>${e(book.issue_date)}</p></div>
${book.introduction ? `<section data-introduction><h1>${personal ? '작가의 말' : '여는 글'}</h1>${book.introduction.split(/\n\s*\n/u).map((p) => `<p>${e(p)}</p>`).join('')}</section>` : ''}
${book.works.map((w, i) => {
    /*
     * 이어붙이기의 차례는 **주제만** 싣는다. 작품까지 모두 실으면 주제가 다섯을 넘는 순간
     * 차례가 몇 쪽이 된다(2026-09-13 지적). 작품 목록은 **간지**로 옮겼다 — 간지는 주제
     * 이름 한 줄뿐이라 어차피 비어 있어, 거기 실으면 종이를 한 장도 더 쓰지 않는다.
     */
    if (continuous && book.grouping === 'topic' && !personal) {
        const groupTitle = groupStarts.get(i);
        return groupTitle ? `<div data-toc-row="g${i}" data-toc-group><span>${e(groupTitle)}</span><span data-page></span></div>` : '';
    }
    return `<div data-toc-row="${i}"><span>${e(w.title)}${personal ? '' : ` · ${e(w.author)}`}</span><span data-page></span></div>`;
}).join('')}
${[...forcedBreaks].map((index) => `<div data-forced-break="${index}"></div>`).join('')}
${[...groupStarts.entries()].map(([index, title]) => {
    // 간지 = 주제 이름 + 그 주제에 든 작품 목록. 쪽번호는 쪽을 다 짠 뒤에 채운다.
    const until = [...groupStarts.keys()].find((key) => key > index) ?? book.works.length;
    const rows = book.works.slice(index, until).map((w, offset) => {
        const workIndex = index + offset;
        return `<div data-divider-row="${workIndex}"><span>${e(w.title)}${personal ? '' : ` · ${e(w.author)}`}</span><span data-page></span></div>`;
    }).join('');
    return `<div data-divider="${index}"><h1>${e(title)}</h1><div data-divider-list>${rows}</div></div>`;
}).join('')}`;
    const back = `<div data-colophon><h1>${e(book.title)}</h1>${personal ? `<p>글쓴이 ${e(book.owner_student_name)}</p>` : ''}<p>${e(book.class_label)}</p><p>발행일 ${e(book.issue_date)} · ${editionLabel}</p><p>${personal ? '한 사람의 글을 모아 엮었습니다.' : '우리 반의 글을 모아 엮었습니다.'}\n글의 권리는 각 글쓴이에게 있습니다.</p><p>끄적끄적 아지트 · 글꽃 책방</p></div>`;
    return html.replace('</head>', `${styles}</head>`).replace('<body>', `<body class="${personal ? 'anthology-personal' : 'anthology-class'}"><div class="anthology-toolbar" role="status">문집 페이지를 준비하고 있습니다…</div><div id="anthology-pages"></div><div id="anthology-source" data-layout="${layout}">${front}`).replace('</body>', `${back}</div></body>`);
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
