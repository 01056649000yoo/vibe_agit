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
import {
    LETTER_PAPERS,
    getLetterBlankPaperStyles,
    getLetterPaper,
} from '../src/modules/writing/mission-types/letter/letterPapers.js';
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
        assert.ok(paper.printTitle.trim(), `${paper.label}의 인쇄 문구가 비어 있다`);
        assert.ok(!paper.printTitle.includes('편지지'), `${paper.label}의 관리용 이름이 그대로 인쇄된다`);
        assert.ok(paper.description.trim(), `${paper.label} 설명이 비어 있다`);
        assert.match(paper.tint, /^#[0-9A-Fa-f]{6}$/, `${paper.label} 바탕색이 색 값이 아니다`);
        assert.ok(paper.blankCss.trim(), `${paper.label}의 빈 편지지 전용 디자인이 비어 있다`);
    }
    // 없는 값을 넘겨도 첫 편지지로 안전하게 떨어진다.
    assert.equal(getLetterPaper('없는편지지').value, LETTER_PAPERS[0].value);
});

test('편지지는 색만 다른 것이 아니라 모양이 서로 다르다', () => {
    // 색 값만 갈아 끼운 편지지는 인쇄했을 때 다 비슷해 보인다.
    // 색을 지운 뒤에도 규칙이 서로 달라야 진짜 다른 편지지다.
    const shapeOf = (paper) => paper.css
        .replaceAll(`--letter-${paper.value}`, '--letter-X')
        .replace(/#[0-9A-Fa-f]{3,8}/g, 'COLOR')
        .replace(/\s+/g, ' ')
        .trim();

    const shapes = new Map();
    for (const paper of LETTER_PAPERS) {
        const shape = shapeOf(paper);
        const twin = shapes.get(shape);
        assert.ok(!twin, `${paper.label}과 ${twin}은 색만 다른 같은 편지지다`);
        shapes.set(shape, paper.label);
    }

    // 모양을 한 줄로 설명하는 말도 편지지마다 달라야 교사가 고를 수 있다.
    const shapeLabels = LETTER_PAPERS.map((paper) => paper.shape);
    assert.equal(new Set(shapeLabels).size, LETTER_PAPERS.length, '편지지 모양 설명이 겹친다');
    for (const paper of LETTER_PAPERS) {
        assert.ok(paper.shape?.trim(), `${paper.label}에 모양 설명이 없다`);
    }

    const blankShapes = new Set(LETTER_PAPERS.map((paper) => paper.blankCss
        .replaceAll(`--letter-${paper.value}`, '--letter-X')
        .replace(/#[0-9A-Fa-f]{3,8}/g, 'COLOR')
        .replace(/\s+/g, ' ')
        .trim()));
    assert.equal(blankShapes.size, LETTER_PAPERS.length, '빈 편지지가 색만 다른 같은 디자인이다');
});

test('스승의 날 편지지는 거슬리는 세로줄 없이 칠판과 연필로 교실 분위기를 낸다', () => {
    const teacherPaper = getLetterPaper('teacher');
    const teacherStyles = `${teacherPaper.css}\n${teacherPaper.blankCss}`;

    assert.match(teacherPaper.shape, /칠판/);
    assert.match(teacherPaper.shape, /연필/);
    assert.doesNotMatch(teacherPaper.description, /공책|세로선/);
    assert.doesNotMatch(teacherStyles, /border-left|linear-gradient\(90deg, transparent 0 24mm/);
    assert.match(teacherPaper.blankCss, /letter-sheet__deco--bl/);
    assert.match(teacherPaper.blankCss, /letter-sheet__deco--br/);
});

test('나라사랑 편지지는 KR로 풀리는 국기 이모지 없이 태극색과 무궁화로 꾸민다', () => {
    const soldierPaper = getLetterPaper('soldier');
    const soldierStyles = `${soldierPaper.css}\n${soldierPaper.blankCss}`;

    assert.equal(soldierPaper.emoji, '✿');
    assert.match(soldierPaper.shape, /태극색/);
    assert.match(soldierPaper.shape, /무궁화/);
    assert.doesNotMatch(soldierPaper.description, /항공우편|사선 테두리/);
    assert.doesNotMatch(soldierStyles, /border-image|repeating-linear-gradient\(\s*45deg/);
    assert.match(soldierPaper.css, /radial-gradient\(circle at 50% 25%, #003478/);
    assert.match(soldierPaper.blankCss, /border-top: \.5mm solid #C8102E/);
    assert.match(soldierPaper.blankCss, /border-bottom: \.5mm solid #003478/);
});

test('편지 본문을 가리던 반복 도트는 없애고 주제 장식만 남긴다', () => {
    const parentsPaper = getLetterPaper('parents');
    const friendPaper = getLetterPaper('friend');
    const farewellPaper = getLetterPaper('farewell');

    for (const paper of [parentsPaper, friendPaper, farewellPaper]) {
        assert.doesNotMatch(paper.css, /radial-gradient/, `${paper.label} 작성본에 반복 도트가 남아 있다`);
        assert.doesNotMatch(paper.description, /점무늬|도트|하트 무늬|별 무늬/);
        assert.doesNotMatch(paper.shape, /점무늬|도트|하트 무늬|별 무늬/);
    }

    assert.match(parentsPaper.css, /linear-gradient\(145deg, #FFF9FB, #FFF1F5\)/);
    assert.doesNotMatch(friendPaper.blankCss, /radial-gradient/);
    assert.match(friendPaper.blankCss, /linear-gradient\(145deg, #FAFEFF, #EEF9FF\)/);
    assert.doesNotMatch(farewellPaper.blankCss, /radial-gradient|letter-sheet__deco\s*\{/);
    assert.match(farewellPaper.shape, /별 장식/);
});

test('빈 편지지는 일곱 종류 모두 같은 좌표에서 쓰기 시작한다', () => {
    assert.match(
        letterPdfExport.styles,
        /\.pdf-entry--letter-blank \.letter-sheet__body \{[\s\S]*?top: var\(--letter-blank-body-top, 36mm\);[\s\S]*?right: var\(--letter-blank-body-side, 14mm\);[\s\S]*?left: var\(--letter-blank-body-side, 14mm\);/,
    );
    assert.match(letterPdfExport.styles, /\.letter-sheet__blank-recipient \{/);
    assert.match(
        letterPdfExport.styles,
        /\.letter-sheet__blank-recipient-line \{[\s\S]*?flex: 0 0 68mm;/,
    );
    assert.doesNotMatch(letterPdfExport.styles, /flex: 0 0 92mm;/);
    assert.match(letterPdfExport.styles, /\.letter-sheet__blank-footer \{/);

    // 주제별 장식이 공용 쓰기 좌표를 다시 움직이면 받는 사람 위치가 또 제각각이 된다.
    assert.doesNotMatch(getLetterBlankPaperStyles(), /letter-sheet__body\s*\{/);
    for (const paper of LETTER_PAPERS) {
        assert.ok(
            paper.blankCss.includes(`pdf-entry--letter-${paper.value}.pdf-entry--letter-blank`),
            `${paper.label} 빈 편지지 전용 선택자가 없다`,
        );
    }
});

test('작성 편지는 일곱 종류 모두 밑줄 없이 읽고 빈 편지지만 손글씨 줄을 유지한다', () => {
    for (const paper of LETTER_PAPERS) {
        assert.doesNotMatch(
            paper.css,
            /background:\s*repeating-linear-gradient\(\s*to bottom/,
            `${paper.label} 작성 편지에 줄 배경이 남아 있다`,
        );

        const writtenHtml = letterPdfExport.renderEntry(
            { title: '마음을 담은 편지', author: '김하늘', content: '', structuredContent: FULL_LETTER },
            { renderMode: paper.value },
        );
        assert.ok(!writtenHtml.includes('letter-sheet__blank-line'), `${paper.label} 작성 편지에 빈 줄 요소가 있다`);

        const blankHtml = letterPdfExport.renderEntry(
            { title: '', author: '', content: '', structuredContent: { template: 'letter', blank: true } },
            { renderMode: paper.value },
        );
        assert.equal(
            blankHtml.match(/class="letter-sheet__blank-line"/g)?.length,
            15,
            `${paper.label} 빈 편지지의 손글씨 줄이 15개가 아니다`,
        );
    }
});

test('편지지는 전역 인쇄 여백을 건드리지 않고 위아래 빈 여백을 같게 맞춘다', () => {
    // @page 여백을 바꾸면 같은 인쇄에 섞인 시·보고서 페이지까지 여백이 날아간다.
    assert.ok(!/@page\s*\{/.test(letterPdfExport.styles), '편지 스타일이 전역 인쇄 규칙을 바꾸고 있다');
    // 공용 A4 위 15mm·아래 17mm에 편지 안쪽 위 5mm·아래 3mm를 더하면 양쪽 모두 20mm다.
    assert.match(
        letterPdfExport.styles,
        /\.pdf-entry--letter \{[\s\S]*?min-height: 265mm;[\s\S]*?margin: 0;[\s\S]*?padding: 5mm 0 3mm;/,
    );
    assert.match(letterPdfExport.styles, /\.letter-sheet \{[\s\S]*?min-height: 257mm;/);
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
    assert.match(html, /<span class="letter-sheet__band-label">어머니께<\/span>/);
    assert.match(html, /어머니에게/);
    assert.match(html, /김하늘 올림/);

    const blank = letterPdfExport.renderEntry(
        { title: '', author: '', content: '', structuredContent: { template: 'letter', blank: true } },
        { renderMode: 'teacher' },
    );
    assert.match(blank, /pdf-entry--letter-teacher/);
    assert.match(blank, /pdf-entry--letter-blank/);
    assert.match(blank, /letter-sheet--blank/);
    assert.match(blank, /letter-sheet__blank-recipient-line/);
    assert.match(blank, /letter-sheet__blank-footer/);
    assert.match(blank, /letter-sheet__blank-line/);
    assert.match(blank, /선생님, 감사합니다/);
    assert.ok(!blank.includes('스승의 날 편지지'), '빈 편지지에 선택용 이름이 찍혔다');
    assert.ok(!blank.includes('올림'), '빈 편지지에 이름이 찍혔다');

    for (const paper of LETTER_PAPERS) {
        const paperHtml = letterPdfExport.renderEntry(
            { title: '', author: '', content: '', structuredContent: { template: 'letter', blank: true } },
            { renderMode: paper.value },
        );
        assert.ok(paperHtml.includes(paper.printTitle), `${paper.label}의 인쇄 문구가 나오지 않는다`);
        assert.ok(!paperHtml.includes(paper.label), `${paper.label}의 선택용 이름이 빈 편지지에 찍힌다`);
    }

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
