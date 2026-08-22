import { escapePdfHtml } from '../../export/pdfRenderContract.js';
import { normalizeLetterParts } from './letterContent.js';
import {
    DEFAULT_LETTER_PAPER,
    getLetterBlankPaperStyles,
    getLetterPaper,
    getLetterPaperStyles,
} from './letterPapers.js';

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
            <div class="letter-sheet__blank-recipient">
                <span class="letter-sheet__blank-recipient-label">받는 사람</span>
                <span class="letter-sheet__blank-recipient-line" aria-hidden="true"></span>
                <span class="letter-sheet__blank-recipient-suffix">에게</span>
            </div>
            <div class="letter-sheet__blank">${renderBlankLines(15)}</div>
            <div class="letter-sheet__blank-footer">
                <span>______년 ____월 ____일</span>
                <span class="letter-sheet__blank-writer">
                    <span>쓴 사람</span>
                    <span class="letter-sheet__blank-writer-line" aria-hidden="true"></span>
                </span>
            </div>`
        : `
            <div class="letter-sheet__row letter-sheet__row--to">${escapePdfHtml(parts.recipient)}에게</div>
            ${parts.greeting ? `<p class="letter-sheet__part">${renderParagraphs(parts.greeting)}</p>` : ''}
            <p class="letter-sheet__part letter-sheet__part--body">${renderParagraphs(parts.body)}</p>
            ${parts.closing ? `<p class="letter-sheet__part">${renderParagraphs(parts.closing)}</p>` : ''}
            <div class="letter-sheet__row letter-sheet__row--from">${escapePdfHtml(entry.author)} 올림</div>`;

    return `
        <article class="pdf-entry pdf-entry--letter pdf-entry--letter-${escapePdfHtml(paper.value)}${isBlank ? ' pdf-entry--letter-blank' : ''}">
            <div class="letter-sheet${isBlank ? ' letter-sheet--blank' : ''}">
                <span class="letter-sheet__deco letter-sheet__deco--tl" aria-hidden="true"></span>
                <span class="letter-sheet__deco letter-sheet__deco--tr" aria-hidden="true"></span>
                <span class="letter-sheet__deco letter-sheet__deco--bl" aria-hidden="true"></span>
                <span class="letter-sheet__deco letter-sheet__deco--br" aria-hidden="true"></span>
                <header class="letter-sheet__band">
                    <span class="letter-sheet__emoji" aria-hidden="true">${paper.emoji}</span>
                    <span class="letter-sheet__band-label">${escapePdfHtml(isBlank ? paper.label : entry.title)}</span>
                </header>
                <main class="letter-sheet__body">
                    ${paper.watermark ? `<span class="letter-sheet__mark" aria-hidden="true">${paper.watermark}</span>` : ''}
                    ${inner}
                </main>
            </div>
        </article>`;
};

/*
 * 공용 뼈대는 자리만 잡는다. 테두리 모양·바탕 무늬·머리 띠 모양은 편지지마다 `letterPapers.js`가 정한다.
 *
 * 편지지는 종이 가장자리까지 채워야 예쁘다. 그렇다고 전역 인쇄 여백을 0으로 바꾸면 같은 인쇄에 섞인
 * 시·보고서 페이지까지 여백이 날아간다. 그래서 전역 규칙은 두고 편지 칸만 음수 여백으로 넓힌다.
 */
const LETTER_BASE_STYLES = `
        .pdf-entry--letter {
            min-height: 297mm;
            margin: -15mm -16mm -17mm;
            padding: 8mm;
        }
        .pdf-entry--letter + .pdf-entry--letter { margin-top: 0; }
        .letter-sheet {
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 281mm;
            overflow: hidden;
        }
        .letter-sheet__deco {
            display: none;
            position: absolute;
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
        .letter-sheet__band-label { overflow-wrap: anywhere; }
        .letter-sheet__body {
            flex: 1;
            padding: 8mm 12mm 12mm;
            font-size: 13pt;
            line-height: 2.0;
        }
        .letter-sheet__mark {
            display: none;
            position: absolute;
            line-height: 1;
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
`;

/*
 * 빈 편지지는 머리 띠 모양과 관계없이 같은 좌표에서 쓰기 시작한다.
 * 각 편지지의 장식은 이 고정된 쓰기 영역 바깥을 꾸미며, blankCss에서만 달라진다.
 */
const LETTER_BLANK_BASE_STYLES = `
        .pdf-entry--letter-blank .letter-sheet__band {
            position: absolute;
            z-index: 3;
            top: var(--letter-blank-band-top, 8mm);
            left: var(--letter-blank-band-side, 12mm);
            right: var(--letter-blank-band-side, 12mm);
            display: flex;
            width: auto;
            max-width: none;
            height: 20mm;
            margin: 0;
            padding: 3mm 7mm;
        }
        .pdf-entry--letter-blank .letter-sheet__body {
            position: absolute;
            z-index: 2;
            top: var(--letter-blank-body-top, 36mm);
            right: var(--letter-blank-body-side, 14mm);
            bottom: 12mm;
            left: var(--letter-blank-body-side, 14mm);
            display: flex;
            flex-direction: column;
            margin: 0;
            padding: 0;
            border: 0;
            background: none;
        }
        .letter-sheet__blank-recipient {
            display: flex;
            flex: 0 0 11mm;
            align-items: flex-end;
            gap: 3mm;
            width: 100%;
            padding: 0 2mm 2.2mm;
            color: inherit;
            font-size: 13pt;
            font-weight: 800;
            line-height: 1;
        }
        .letter-sheet__blank-recipient-line {
            flex: 0 0 92mm;
            border-bottom: .35mm solid currentColor;
            opacity: .58;
        }
        .letter-sheet__blank-recipient-suffix { font-weight: 700; }
        .pdf-entry--letter-blank .letter-sheet__blank {
            display: grid;
            flex: 1;
            grid-template-rows: repeat(15, minmax(0, 1fr));
            min-height: 0;
            margin: 3mm 0 6mm;
        }
        .pdf-entry--letter-blank .letter-sheet__blank-line {
            height: auto;
            min-height: 0;
            border-bottom-width: .28mm;
            border-bottom-style: solid;
            opacity: .66;
        }
        .letter-sheet__blank-footer {
            display: flex;
            flex: 0 0 10mm;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8mm;
            padding: 1mm 2mm 0;
            color: inherit;
            font-size: 12pt;
            font-weight: 700;
            line-height: 1.4;
        }
        .letter-sheet__blank-writer {
            display: flex;
            align-items: baseline;
            gap: 3mm;
        }
        .letter-sheet__blank-writer-line {
            display: inline-block;
            width: 48mm;
            border-bottom: .35mm solid currentColor;
            opacity: .58;
        }
`;

export const letterPdfExport = {
    id: 'letter',
    renderEntry: renderLetterEntry,
    styles: `${LETTER_BASE_STYLES}\n${getLetterPaperStyles()}\n${LETTER_BLANK_BASE_STYLES}\n${getLetterBlankPaperStyles()}`,
};
