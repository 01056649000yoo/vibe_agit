/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('작품 감상 모달은 화면 전체에서 글자 크기를 단계별로 조절한다', async () => {
    const [modal, styles] = await Promise.all([
        read('src/modules/writing/presentation/WritingPresentationModal.jsx'),
        read('src/modules/writing/presentation/writingPresentationModal.css')
    ]);

    assert.match(modal, /WRITING_PRESENTATION_FONT_SIZES = Object\.freeze\(\[20, 24, 28, 34, 40, 48\]\)/);
    assert.match(modal, /<ModalPortal>/);
    assert.match(modal, /role="dialog"[\s\S]*aria-modal="true"[\s\S]*aria-labelledby/);
    assert.match(modal, /aria-label="글자 작게"[\s\S]*aria-live="polite"[\s\S]*aria-label="글자 크게"/);
    assert.match(styles, /\.writing-presentation-modal\s*\{[\s\S]*width: 100vw;[\s\S]*height: 100dvh;/);
    assert.match(styles, /font-size: var\(--writing-presentation-font-size\)/);
});

test('작품 감상 모달은 수업 중 키보드 닫기와 초점 복귀를 지원한다', async () => {
    const modal = await read('src/modules/writing/presentation/WritingPresentationModal.jsx');

    assert.match(modal, /event\.key === 'Escape'[\s\S]*onCloseRef\.current/);
    assert.match(modal, /event\.key !== 'Tab'[\s\S]*focusable/);
    assert.match(modal, /document\.body\.style\.overflow = 'hidden'/);
    assert.match(modal, /document\.body\.style\.overflow = previousOverflow/);
    assert.match(modal, /previousFocusRef\.current\?\.focus/);
});

test('교사 비교 화면의 최초글과 최종글을 각각 감상 모달로 연다', async () => {
    const viewer = await read('src/components/teacher/PostDetailViewer.jsx');

    assert.match(viewer, /import WritingPresentationModal/);
    assert.match(viewer, /aria-label="최초 제출 글 전체 화면으로 보기"[\s\S]*setPresentationVersion\('original'\)/);
    assert.match(viewer, /aria-label="최종 제출 글 전체 화면으로 보기"[\s\S]*setPresentationVersion\('final'\)/);
    assert.match(viewer, /role="button"[\s\S]*tabIndex="0"[\s\S]*handlePresentationKeyDown/);
    assert.match(viewer, /전체 화면으로 읽기/);
    assert.match(viewer, /<WritingPresentationModal[\s\S]*versionLabel=[\s\S]*<ReportDocument/);
});
