/**
 * 문집을 구글 문서로 내보낸다.
 *
 * PDF(`print.js`)와 무엇이 다른가:
 *   PDF 는 브라우저가 mm 단위로 실제 조판을 해서 **쪽수를 세어** 목차에 채운다.
 *   구글 문서는 여는 기기·글꼴·여백에 따라 쪽이 다시 나뉘므로 그 숫자를 그대로 넣으면
 *   **틀린 쪽수**가 된다. 게다가 Docs API 에는 목차 삽입 요청도, 자동 쪽번호 요청도 없다
 *   (2026-09-09 공식 문서 확인).
 *
 *   그래서 숫자를 흉내 내지 않고 **구글 문서가 스스로 세게** 만든다:
 *     - 글 제목을 `HEADING_1` 로 넣는다 → 교사가 `삽입 → 목차` 를 누르면 쪽수·링크가 붙은
 *       진짜 목차가 만들어지고, 편집해도 갱신된다.
 *     - 쪽번호는 `삽입 → 페이지 번호` 한 번이면 된다.
 *   두 가지를 문서 첫머리 안내에 적어 둔다. PDF 가 필요하면 기존 인쇄 창을 그대로 쓴다.
 *
 * 이 파일은 **화면도 네트워크도 모른다.** `buildAnthologyDocRequests` 는 순수 함수라
 * 검사에서 그대로 부를 수 있다. 실제 전송은 `exportAnthologyToGoogleDoc` 한 곳뿐이다.
 */

import { assertBookEdition } from './contract.js';
import { createGoogleDocument, applyGoogleDocRequests, googleDocEditUrl } from '../../writing/export/googleDocsApi.js';

/** 구글 문서 편집기가 감당할 만한 크기로 제한한다. PDF 와 같은 상한을 쓴다. */
export const ANTHOLOGY_DOC_GUIDE = '이 문서는 쪽수를 비워 두었습니다. 상단 메뉴에서 `삽입 → 목차`를 누르면 쪽수와 링크가 붙은 목차가 자동으로 만들어지고, `삽입 → 페이지 번호`로 쪽번호를 넣을 수 있습니다. 한글(hwp)로 옮기려면 `파일 → 다운로드 → Microsoft Word(.docx)`로 내려받아 한글에서 열면 됩니다.';

const documentTitle = (edition) => {
    const label = edition.draft ? '검토용 초안' : `${edition.number}판`;
    return `${edition.book.title} (${label})`;
};

/**
 * 문집 확정판을 Docs `batchUpdate` 요청 목록으로 바꾼다.
 *
 * 요청은 **앞에서부터 차례로** 적용되므로 `cursor` 를 직접 옮기며 쌓는다.
 * 삽입 위치를 뒤에서부터 계산하는 방식으로 바꾸지 않는다 — 순서가 곧 문서 내용이다.
 */
export function buildAnthologyDocRequests(edition) {
    assertBookEdition(edition);
    const book = edition.book;
    const requests = [];
    let cursor = 1;

    const write = (text, { style = 'NORMAL_TEXT', alignment = 'START', bold = null } = {}) => {
        if (!text) return;
        requests.push({ insertText: { location: { index: cursor }, text } });
        requests.push({
            updateParagraphStyle: {
                range: { startIndex: cursor, endIndex: cursor + text.length },
                paragraphStyle: { namedStyleType: style, alignment },
                fields: 'namedStyleType,alignment'
            }
        });
        if (bold !== null) {
            requests.push({
                updateTextStyle: {
                    range: { startIndex: cursor, endIndex: cursor + text.length },
                    textStyle: { bold },
                    fields: 'bold'
                }
            });
        }
        cursor += text.length;
    };

    const pageBreak = () => {
        requests.push({ insertPageBreak: { location: { index: cursor } } });
        cursor += 1;
    };

    // ── 표지 ──────────────────────────────────────────────────────────────
    write('우리 반의 이야기\n', { alignment: 'CENTER' });
    write(`${book.title}\n`, { style: 'TITLE', alignment: 'CENTER' });
    if (book.subtitle) write(`${book.subtitle}\n`, { alignment: 'CENTER' });
    write('\n', { alignment: 'CENTER' });
    if (book.class_label) write(`${book.class_label}\n`, { alignment: 'CENTER' });
    if (book.issue_date) write(`${book.issue_date}\n`, { alignment: 'CENTER' });
    write(`${edition.draft ? '검토용 초안' : `${edition.number}판`}\n`, { alignment: 'CENTER' });
    pageBreak();

    // ── 여는 글 ───────────────────────────────────────────────────────────
    if (book.introduction) {
        write('여는 글\n', { style: 'HEADING_1' });
        book.introduction.split(/\n\s*\n/u).forEach((paragraph) => write(`${paragraph}\n`));
        pageBreak();
    }

    // ── 목차 ──────────────────────────────────────────────────────────────
    // 안내는 목차 바로 위에 둔다 — 설명하는 대상 옆에 있어야 읽고 바로 따라 할 수 있고,
    // 다 따라 한 교사가 이 문단만 지우면 목차가 그 쪽의 첫 줄이 된다.
    write('문집을 완성하는 방법\n', { bold: true });
    write(`${ANTHOLOGY_DOC_GUIDE}\n`);
    write('\n');
    // 제목을 `HEADING_1` 로 쓰지 않는다. 그러면 자동 목차가 목차 자신을 포함해 버린다.
    write('목차\n', { bold: true });
    book.works.forEach((work, index) => write(`${index + 1}. ${work.title} · ${work.author}\n`));
    pageBreak();

    // ── 본문 ──────────────────────────────────────────────────────────────
    book.works.forEach((work, index) => {
        if (index > 0) pageBreak();
        // 자동 목차가 잡는 것은 이 `HEADING_1` 뿐이다.
        write(`${work.title}\n`, { style: 'HEADING_1' });
        const byline = [work.author, work.group].filter(Boolean).join(' · ');
        if (byline) write(`${byline}\n`);
        write('\n');
        work.blocks.forEach((block) => write(`${block}\n`));
    });
    pageBreak();

    // ── 판권지 ────────────────────────────────────────────────────────────
    write('판권지\n', { bold: true });
    write(`${book.title}\n`, { alignment: 'CENTER' });
    if (book.class_label) write(`${book.class_label}\n`, { alignment: 'CENTER' });
    write(`발행일 ${book.issue_date || '-'} · ${edition.draft ? '검토용 초안' : `${edition.number}판`}\n`, { alignment: 'CENTER' });
    write('우리 반의 글을 모아 엮었습니다.\n', { alignment: 'CENTER' });
    write('글의 권리는 각 글쓴이에게 있습니다.\n', { alignment: 'CENTER' });
    write('끄적끄적 아지트 · 글꽃 책방\n', { alignment: 'CENTER' });

    return { title: documentTitle(edition), requests };
}

/** 실제 전송. 토큰은 화면 훅(`useDataExport`)이 얻어서 넘긴다. */
export async function exportAnthologyToGoogleDoc(edition, accessToken) {
    const { title, requests } = buildAnthologyDocRequests(edition);
    const documentId = await createGoogleDocument(title, accessToken);
    await applyGoogleDocRequests(documentId, requests, accessToken);
    return { documentId, title, url: googleDocEditUrl(documentId) };
}
