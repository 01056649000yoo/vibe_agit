import { escapePdfHtml } from '../../export/pdfRenderContract.js';
import { normalizeLetterParts } from './letterContent.js';
import { DEFAULT_LETTER_PAPER, LETTER_PAPERS, getLetterPaper } from './letterPapers.js';

const renderParagraphs = (value) => escapePdfHtml(value).replaceAll('\n', '<br>\n');

// 손으로 옮겨 쓰라고 뽑는 빈 편지지. 글 대신 줄만 그린다.
const renderBlankLines = (count) => (
    Array.from({ length: count }, () => '<div class="letter-sheet__blank-line"></div>').join('')
);

const renderLetterEntry = (entry, { renderMode = DEFAULT_LETTER_PAPER } = {}) => {
    const paper = getLetterPaper(renderMode);
    const isBlank = entry.structuredContent?.blank === true;
    const parts = normalizeLetterParts(entry.structuredContent, entry.content);

    const inner = isBlank
        ? `
            <div class="letter-sheet__row letter-sheet__row--to">받는 사람 ______________________</div>
            <div class="letter-sheet__blank">${renderBlankLines(16)}</div>
            <div class="letter-sheet__row letter-sheet__row--from">______년 ____월 ____일 &nbsp; 쓴 사람 ______________________</div>`
        : `
            <div class="letter-sheet__row letter-sheet__row--to">${escapePdfHtml(parts.recipient)}에게</div>
            ${parts.greeting ? `<p class="letter-sheet__part">${renderParagraphs(parts.greeting)}</p>` : ''}
            <p class="letter-sheet__part letter-sheet__part--body">${renderParagraphs(parts.body)}</p>
            ${parts.closing ? `<p class="letter-sheet__part">${renderParagraphs(parts.closing)}</p>` : ''}
            <div class="letter-sheet__row letter-sheet__row--from">${escapePdfHtml(entry.author)} 올림</div>`;

    return `
        <article class="pdf-entry pdf-entry--letter pdf-entry--letter-${escapePdfHtml(paper.value)}">
            <div class="letter-sheet">
                <header class="letter-sheet__band">
                    <span class="letter-sheet__emoji" aria-hidden="true">${paper.emoji}</span>
                    <span class="letter-sheet__band-label">${escapePdfHtml(isBlank ? paper.label : entry.title)}</span>
                </header>
                <main class="letter-sheet__body">${inner}</main>
            </div>
        </article>`;
};

// 편지지마다 달라지는 것은 색뿐이라 한 벌의 규칙에 색만 갈아 끼운다.
const paperStyles = LETTER_PAPERS.map((paper) => `
        .pdf-entry--letter-${paper.value} .letter-sheet {
            border-color: ${paper.edge};
            background: ${paper.tint};
        }
        .pdf-entry--letter-${paper.value} .letter-sheet__band {
            background: ${paper.band};
            color: ${paper.ink};
        }
        .pdf-entry--letter-${paper.value} .letter-sheet__row {
            color: ${paper.ink};
        }
        .pdf-entry--letter-${paper.value} .letter-sheet__blank-line {
            border-bottom-color: ${paper.edge};
        }
`).join('');

const LETTER_PDF_STYLES = `
        /*
         * 편지지는 종이 가장자리까지 채워야 예쁘다. 그렇다고 @page 여백을 0으로 바꾸면
         * 같은 인쇄에 섞인 시·보고서 페이지까지 여백이 날아간다. 그래서 전역 규칙은 두고
         * 편지 칸만 음수 여백으로 넓힌 뒤 안쪽에서 같은 만큼 되돌린다.
         */
        .pdf-entry--letter {
            min-height: 297mm;
            margin: -15mm -16mm -17mm;
            padding: 8mm;
        }
        .pdf-entry--letter + .pdf-entry--letter { margin-top: 0; }
        .letter-sheet {
            display: flex;
            flex-direction: column;
            min-height: 281mm;
            border: .7mm solid #CBD5E1;
            border-radius: 6mm;
            overflow: hidden;
        }
        .letter-sheet__band {
            display: flex;
            align-items: center;
            gap: 3mm;
            padding: 5mm 8mm;
            font-size: 14pt;
            font-weight: 800;
        }
        .letter-sheet__emoji { font-size: 16pt; }
        .letter-sheet__band-label {
            overflow-wrap: anywhere;
        }
        .letter-sheet__body {
            flex: 1;
            padding: 10mm 12mm 12mm;
            font-size: 13pt;
            line-height: 2.0;
        }
        .letter-sheet__row {
            font-size: 13pt;
            font-weight: 700;
            overflow-wrap: anywhere;
        }
        .letter-sheet__row--to { margin-bottom: 6mm; }
        .letter-sheet__row--from {
            margin-top: 8mm;
            text-align: right;
        }
        .letter-sheet__part {
            margin: 0 0 6mm;
            color: #1F2937;
            font-size: 13pt;
            line-height: 2.0;
            overflow-wrap: anywhere;
        }
        .letter-sheet__part--body { margin-bottom: 8mm; }
        .letter-sheet__blank { margin: 4mm 0 0; }
        .letter-sheet__blank-line {
            height: 11mm;
            border-bottom: .3mm dashed #CBD5E1;
        }
${paperStyles}`;

export const letterPdfExport = {
    id: 'letter',
    renderEntry: renderLetterEntry,
    styles: LETTER_PDF_STYLES,
};
