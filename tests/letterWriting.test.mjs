import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getGenreMissionType, getPdfRenderModes } from '../src/modules/writing/mission-types/registry.js';
import { getFreeformGenreCategories, getGenreMissionTypeId } from '../src/modules/writing/mission-types/genreCatalog.js';
import {
    buildLetterContent,
    createLetterStructuredContent,
    normalizeLetterParts,
    validateLetterSubmission,
} from '../src/modules/writing/mission-types/letter/letterContent.js';
import { LETTER_PAPERS, getLetterPaper } from '../src/modules/writing/mission-types/letter/letterPapers.js';
import { letterPdfExport } from '../src/modules/writing/mission-types/letter/letterPdfExport.js';

const [letterForm, letterEditor] = await Promise.all([
    readFile('src/modules/writing/mission-types/letter/LetterMissionForm.jsx', 'utf8'),
    readFile('src/modules/writing/mission-types/letter/LetterEditor.jsx', 'utf8'),
]);

const FULL_LETTER = createLetterStructuredContent({
    recipient: '어머니',
    greeting: '어머니, 안녕하세요.',
    body: '오늘 학교에서 있었던 일을 이야기하고 싶었어요.',
    closing: '항상 고맙습니다.',
});

test('편지는 글 종류 목록에서 전용 틀로 열리고 폼 선택칸에는 없다', () => {
    assert.equal(getGenreMissionTypeId('편지'), 'letter');
    const freeformIds = getFreeformGenreCategories().flatMap((category) => category.entries.map((entry) => entry.id));
    assert.ok(!freeformIds.includes('편지'), '편지가 자유 글쓰기 선택칸에 남아 있다');

    const missionType = getGenreMissionType('letter');
    assert.ok(missionType, '편지 장르가 레지스트리에 없다');
    assert.equal(missionType.usesStructuredContent, true);
    assert.equal(missionType.pdfExport.id, 'letter');
});

test('네 칸을 저장하고 되읽으며 옛 글은 하고 싶은 말로 받는다', () => {
    const parts = normalizeLetterParts(FULL_LETTER);
    assert.equal(parts.recipient, '어머니');
    assert.equal(parts.closing, '항상 고맙습니다.');

    // 본문 글은 목록 미리보기와 글자 수에 쓰이므로 네 칸이 순서대로 이어져야 한다.
    const joined = buildLetterContent(parts);
    assert.match(joined, /^어머니에게/);
    assert.ok(joined.includes('오늘 학교에서 있었던 일'));

    // 구조가 없던 시절의 글은 사라지지 않고 하고 싶은 말로 들어온다.
    const legacy = normalizeLetterParts(null, '예전에 자유 글로 쓴 편지입니다.');
    assert.equal(legacy.body, '예전에 자유 글로 쓴 편지입니다.');
    assert.equal(legacy.recipient, '');
});

test('받는 사람·인사가 비면 제출을 막고 하고 싶은 말은 글자 수를 센다', () => {
    assert.match(validateLetterSubmission({ structuredContent: { template: 'letter', body: '내용' } }), /받는 사람/);
    assert.match(
        validateLetterSubmission({ structuredContent: { ...FULL_LETTER, greeting: '' } }),
        /첫인사/,
    );
    assert.match(
        validateLetterSubmission({ structuredContent: { ...FULL_LETTER, closing: '' } }),
        /끝인사/,
    );
    assert.match(
        validateLetterSubmission({ structuredContent: FULL_LETTER, config: { min_body_chars: 500 } }),
        /하고 싶은 말을 500자 이상/,
    );
    assert.equal(validateLetterSubmission({ structuredContent: FULL_LETTER, config: { min_body_chars: 10 } }), null);
});

test('편지지는 계기교육용으로 여러 벌이고 출력 화면에서 고를 수 있다', () => {
    assert.ok(LETTER_PAPERS.length >= 6, '편지지가 너무 적다');
    const modes = getPdfRenderModes({ input_template: 'letter' });
    assert.equal(modes.length, LETTER_PAPERS.length);
    assert.deepEqual(modes.map((mode) => mode.value), LETTER_PAPERS.map((paper) => paper.value));
    for (const paper of LETTER_PAPERS) {
        assert.ok(paper.label.trim(), '편지지 이름이 비어 있다');
        assert.ok(paper.description.trim(), `${paper.label} 설명이 비어 있다`);
        assert.match(paper.tint, /^#[0-9A-Fa-f]{6}$/, `${paper.label} 바탕색이 색 값이 아니다`);
    }
    // 없는 값을 넘겨도 첫 편지지로 안전하게 떨어진다.
    assert.equal(getLetterPaper('없는편지지').value, LETTER_PAPERS[0].value);
});

test('편지지는 전역 인쇄 여백을 건드리지 않는다', () => {
    // @page 여백을 바꾸면 같은 인쇄에 섞인 시·보고서 페이지까지 여백이 날아간다.
    assert.ok(!/@page\s*\{/.test(letterPdfExport.styles), '편지 스타일이 전역 인쇄 규칙을 바꾸고 있다');
    // 대신 편지 칸 안에서만 음수 여백으로 종이 끝까지 넓힌다.
    assert.match(letterPdfExport.styles, /\.pdf-entry--letter \{[\s\S]*?margin: -15mm -16mm -17mm;/);
    // 배경색은 편지지마다 따로 정의한다.
    for (const paper of LETTER_PAPERS) {
        assert.ok(
            letterPdfExport.styles.includes(`.pdf-entry--letter-${paper.value} .letter-sheet`),
            `${paper.label} 배경 규칙이 없다`,
        );
    }
});

test('편지 PDF는 고른 편지지로 그리고 빈 편지지는 줄만 뽑는다', () => {
    const entry = {
        title: '어머니께',
        author: '김하늘',
        content: '',
        structuredContent: FULL_LETTER,
    };
    const html = letterPdfExport.renderEntry(entry, { renderMode: 'parents' });
    assert.match(html, /pdf-entry--letter-parents/);
    assert.match(html, /어머니에게/);
    assert.match(html, /김하늘 올림/);

    const blank = letterPdfExport.renderEntry(
        { title: '', author: '', content: '', structuredContent: { template: 'letter', blank: true } },
        { renderMode: 'teacher' },
    );
    assert.match(blank, /pdf-entry--letter-teacher/);
    assert.match(blank, /letter-sheet__blank-line/);
    assert.ok(!blank.includes('올림'), '빈 편지지에 이름이 찍혔다');

    // 편지지를 지정하지 않아도 기본 편지지로 나온다.
    assert.match(letterPdfExport.renderEntry(entry, {}), /pdf-entry--letter-plain/);
});

test('교사는 글 없이 편지지만 인쇄할 수 있다', () => {
    // 지금까지 내보내기는 학생 글이 있어야만 돌아갔다. 빈 항목 한 장으로 그 길을 연다.
    assert.match(letterForm, /handlePrintBlankPaper/);
    assert.match(letterForm, /blank: true/);
    assert.match(letterForm, /빈 편지지 인쇄하기/);
});

test('학생 편집기는 맞춤법 입력창을 쓰고 받는 사람을 따로 담는다', () => {
    assert.match(letterEditor, /SpellingUnderlineInput/);
    assert.match(letterEditor, /SpellingUnderlineTextarea/);
    assert.match(letterEditor, /createLetterStructuredContent/);
    // 받는 사람이 본문 속 문장이 아니라 칸이어야 나중에 편지를 전할 수 있다.
    assert.match(letterEditor, /받는 사람을 적어 두면/);
});
