import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getGenreMissionTypes } from '../src/modules/writing/mission-types/registry.js';
import {
    buildWritingPdfHtml,
    normalizeWritingPdfEntry,
} from '../src/modules/writing/export/writingPdfExport.js';
import { isReportPdfMission } from '../src/modules/writing/mission-types/report/reportPdfModes.js';

const POEM_ITEM = {
    작성자: '김하늘',
    미션제목: '비 오는 날의 마음을 시로 써 봅시다.',
    학생글제목: '빗방울 우체부',
    내용: '창문에 톡톡\n편지를 놓고 갑니다.\n\n골목마다 반짝이는\n작은 우체국이 열립니다.\n\n나는 답장을 쓰듯\n우산을 활짝 폅니다.',
    _inputTemplate: 'poem',
    _structuredContent: {
        template: 'poem',
        version: 1,
        stanzas: [
            '창문에 톡톡\n편지를 놓고 갑니다.',
            '골목마다 반짝이는\n작은 우체국이 열립니다.',
            '나는 답장을 쓰듯\n우산을 활짝 폅니다.',
        ],
    },
};

test('별도 학생 편집기를 가진 장르는 전용 PDF 출력 계약을 반드시 선언한다', async () => {
    const customEditorTypes = getGenreMissionTypes().filter((type) => type.studentEditorEntry);
    assert.ok(customEditorTypes.length > 0);

    for (const type of customEditorTypes) {
        assert.equal(type.usesStructuredContent, true, `${type.id} 장르에 구조화 콘텐츠 선언이 없습니다.`);
        assert.equal(type.pdfExport?.id, type.id, `${type.id} 장르에 전용 PDF ID가 없습니다.`);
        assert.equal(typeof type.pdfExport?.load, 'function', `${type.id} 장르에 PDF 지연 로더가 없습니다.`);
        const pdfExport = await type.pdfExport.load();
        assert.equal(pdfExport?.id, type.id, `${type.id} 장르 PDF 렌더러 ID가 다릅니다.`);
        assert.equal(typeof pdfExport?.renderEntry, 'function', `${type.id} 장르에 PDF 렌더러가 없습니다.`);
        assert.equal(typeof pdfExport?.styles, 'string', `${type.id} 장르에 PDF 스타일이 없습니다.`);
        assert.ok(pdfExport.styles.trim(), `${type.id} 장르의 PDF 스타일이 비어 있습니다.`);
        assert.doesNotMatch(
            pdfExport.styles,
            /font-size: (?:[0-9]|1[01])pt/,
            `${type.id} 장르 PDF에 12pt보다 작은 글자가 있습니다.`,
        );
    }
});

test('공용 PDF 출력기는 장르 이름을 하드코딩하지 않고 매니페스트 렌더러를 사용한다', async () => {
    const source = await readFile('src/modules/writing/export/writingPdfExport.js', 'utf8');
    assert.match(source, /getGenreMissionType\(entry\.inputTemplate\)\?\.pdfExport/);
    assert.match(source, /pdfExport\.renderEntry/);
    assert.doesNotMatch(source, /entry\.inputTemplate === ['"](?:poem|report)['"]/);
});

test('시 과제는 보고서 양식 선택 대상이 아니며 보고서만 두 양식을 고른다', () => {
    assert.equal(isReportPdfMission({ input_template: 'poem', genre: '시' }), false);
    assert.equal(isReportPdfMission({ input_template: 'report', genre: '보고하는 글' }), true);
    assert.equal(isReportPdfMission({ genre: '보고하는 글' }), true);
});

test('시 PDF는 제목·지은이와 연 단위 시구를 시 형식으로 정렬한다', async () => {
    const entry = normalizeWritingPdfEntry(POEM_ITEM);
    const html = await buildWritingPdfHtml({ items: [POEM_ITEM], title: '우리 반 시 모음' });

    assert.equal(entry.inputTemplate, 'poem');
    assert.match(html, /pdf-entry--poem/);
    assert.match(html, /poem-sheet__title[^>]*>빗방울 우체부</);
    assert.match(html, /poem-sheet__author[^>]*>지은이 <strong>김하늘<\/strong>/);
    assert.equal((html.match(/class="poem-sheet__stanza"/g) || []).length, 3);
    assert.match(html, /창문에 톡톡<br>\s*편지를 놓고 갑니다\./);
    assert.match(html, /골목마다 반짝이는<br>\s*작은 우체국이 열립니다\./);
    assert.match(html, /나는 답장을 쓰듯<br>\s*우산을 활짝 폅니다\./);
    assert.match(html, /\.poem-sheet__body \{[\s\S]*?width: min\(125mm, 100%\);[\s\S]*?margin: 0 auto;/);
    assert.match(html, /\.poem-sheet__stanza \{[\s\S]*?font-size: 14pt;[\s\S]*?line-height: 2\.05;/);
    assert.doesNotMatch(html, /pdf-entry--normal/);
    assert.doesNotMatch(html, /font-size: (?:[0-9]|1[01])pt/);
});

test('과거 시도 빈 줄 기준 연 구분을 유지해 전용 PDF로 내보낸다', async () => {
    const legacyPoem = {
        ...POEM_ITEM,
        내용: '첫째 연 첫 행\n첫째 연 둘째 행\n\n둘째 연 첫 행',
        _structuredContent: null,
    };
    const html = await buildWritingPdfHtml({ items: [legacyPoem], title: '과거 시' });

    assert.equal((html.match(/class="poem-sheet__stanza"/g) || []).length, 2);
    assert.match(html, /첫째 연 첫 행<br>\s*첫째 연 둘째 행/);
    assert.match(html, /둘째 연 첫 행/);
});

test('장르 글쓰기 내보내기 지침은 새 전용 틀의 PDF 계약과 검증 절차를 명시한다', async () => {
    const readme = await readFile('src/modules/writing/export/README.md', 'utf8');
    assert.match(readme, /studentEditorEntry/);
    assert.match(readme, /pdfExport/);
    assert.match(readme, /renderEntry/);
    assert.match(readme, /실제 A4 PDF/);
    assert.match(readme, /tests\/genreWritingPdf\.test\.mjs/);
});
