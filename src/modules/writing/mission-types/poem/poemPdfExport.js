import { escapePdfHtml } from '../../export/pdfRenderContract.js';
import { normalizePoemStanzas } from './poemContent.js';

const renderPoemStanza = (stanza) => (
    escapePdfHtml(stanza).replaceAll('\n', '<br>\n')
);

const renderPoemEntry = (entry) => {
    const stanzas = normalizePoemStanzas(entry.structuredContent, entry.content);
    return `
        <article class="pdf-entry pdf-entry--poem">
            <header class="poem-sheet__header">
                <div class="poem-sheet__kicker">시 쓰기</div>
                <h1 class="poem-sheet__title">${escapePdfHtml(entry.title)}</h1>
                <div class="poem-sheet__author">지은이 <strong>${escapePdfHtml(entry.author)}</strong></div>
                ${entry.group ? `<div class="poem-sheet__prompt">${escapePdfHtml(entry.group)}</div>` : ''}
                <div class="poem-sheet__ornament" aria-hidden="true"></div>
            </header>
            <main class="poem-sheet__body">
                ${stanzas.map((stanza) => `<section class="poem-sheet__stanza">${renderPoemStanza(stanza)}</section>`).join('')}
            </main>
        </article>`;
};

const POEM_PDF_STYLES = `
        .pdf-entry--poem {
            position: relative;
            padding-top: 7mm;
            color: #1F2937;
        }
        .poem-sheet__header {
            text-align: center;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .poem-sheet__kicker {
            display: inline-block;
            padding: 1mm 3mm;
            border-radius: 999px;
            background: #ECFDF5;
            color: #047857;
            font-size: 12pt;
            font-weight: 800;
            letter-spacing: .08em;
        }
        .poem-sheet__title {
            margin: 5mm 0 0;
            color: #172033;
            font-size: 23pt;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
        .poem-sheet__author {
            width: min(125mm, 100%);
            margin: 5mm auto 0;
            color: #475569;
            font-size: 12pt;
            text-align: right;
        }
        .poem-sheet__prompt {
            width: min(125mm, 100%);
            margin: 4mm auto 0;
            color: #64748B;
            font-size: 12pt;
            line-height: 1.5;
            text-align: center;
        }
        .poem-sheet__ornament {
            width: 25mm;
            height: .8mm;
            margin: 5mm auto 0;
            border-radius: 999px;
            background: #6EE7B7;
        }
        .poem-sheet__body {
            width: min(125mm, 100%);
            margin: 0 auto;
            padding-top: 12mm;
        }
        .poem-sheet__stanza {
            margin: 0 0 8mm;
            color: #1F2937;
            font-size: 14pt;
            line-height: 2.05;
            overflow-wrap: anywhere;
            break-inside: avoid;
            page-break-inside: avoid;
            orphans: 2;
            widows: 2;
        }
`;

export const poemPdfExport = {
    id: 'poem',
    renderEntry: renderPoemEntry,
    styles: POEM_PDF_STYLES,
};
