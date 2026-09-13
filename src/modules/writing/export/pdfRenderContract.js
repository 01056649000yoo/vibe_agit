export const escapePdfHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

/*
 * 글 제목 위에 붙는 작은 갈래 딱지("끄적끄적 글쓰기", "시 쓰기")의 클래스 이름.
 *
 * 글 한 편을 따로 내려받을 때는 표지 구실을 하지만, **문집에서는 글마다 같은 말이
 * 되풀이돼** 읽는 데 방해가 된다(2026-09-14 지적). 그래서 문집만 이 딱지를 감춘다.
 * 새 갈래가 제 딱지를 만들면 여기에 더한다 — `tests/anthologyKicker.test.mjs` 가
 * 글쓰기 쪽 코드를 훑어 빠진 딱지가 없는지 대조한다.
 */
export const PDF_KICKER_CLASSES = ['pdf-entry__kicker', 'poem-sheet__kicker'];

export const renderPdfDocumentHeader = (entry, typeLabel) => `
    <header class="pdf-entry__header">
        <div class="pdf-entry__kicker">${escapePdfHtml(typeLabel)}</div>
        <h1>${escapePdfHtml(entry.title)}</h1>
        <div class="pdf-entry__author">글쓴이 <strong>${escapePdfHtml(entry.author)}</strong></div>
        ${entry.group ? `<div class="pdf-entry__group">${escapePdfHtml(entry.group)}</div>` : ''}
    </header>`;
