export const escapePdfHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const renderPdfDocumentHeader = (entry, typeLabel) => `
    <header class="pdf-entry__header">
        <div class="pdf-entry__kicker">${escapePdfHtml(typeLabel)}</div>
        <h1>${escapePdfHtml(entry.title)}</h1>
        <div class="pdf-entry__author">글쓴이 <strong>${escapePdfHtml(entry.author)}</strong></div>
        ${entry.group ? `<div class="pdf-entry__group">${escapePdfHtml(entry.group)}</div>` : ''}
    </header>`;
