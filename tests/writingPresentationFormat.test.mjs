import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WRITING_FORMAT, getWritingFormat } from '../src/modules/writing/presentation/writingFormat.js';

const read = (file) => readFileSync(file, 'utf8');
const css = read('src/modules/writing/presentation/writingPresentationModal.css');

test('확대해서 보는 산문은 오른쪽 끝을 맞춘다', () => {
    /*
     * 2026-09-13 제보: 학생 글을 전체 화면으로 확대하면 오른쪽이 우둘투둘했다.
     * 전시관과 문집은 고쳤는데 **확대 보기 창만 빠져 있었다.**
     */
    assert.match(css, /\.writing-presentation-modal__content\[data-format='prose'\] \{ text-align: justify; \}/);
});

test('줄바꿈은 글쓴이의 것이라 지우지 않는다', () => {
    /*
     * 전에 정렬을 맞추겠다고 `white-space` 를 없앴다가 학생 글의 줄바꿈이 통째로
     * 사라진 적이 있다(같은 날 되돌렸다). 정렬 규칙이 이것을 건드리면 안 된다.
     */
    assert.match(css, /\.writing-presentation-modal__content \{[^}]*white-space: pre-wrap;/s);
    assert.doesNotMatch(css, /\[data-format='prose'\][^\n]*white-space/);
});

test('시는 정렬을 건드리지 않는다', () => {
    // 줄의 시작과 끝이 작품 그 자체다. 양쪽으로 늘리면 글쓴이가 고른 자리가 무너진다.
    assert.doesNotMatch(css, /\[data-format='poem'\][^\n]*text-align/);
    assert.equal(getWritingFormat({ mission_type: 'poem' }), WRITING_FORMAT.poem);
    assert.equal(getWritingFormat({ genre: '시' }), WRITING_FORMAT.poem);
    assert.equal(getWritingFormat({ genre: '동시' }), WRITING_FORMAT.poem);
    assert.equal(getWritingFormat({ genre: '생활문' }), WRITING_FORMAT.prose);
    assert.equal(getWritingFormat(null), WRITING_FORMAT.prose);
});

test('확대 보기를 쓰는 화면은 모두 갈래를 넘겨 준다', () => {
    /*
     * 넘기지 않으면 기본값(산문)이라 **시까지 양쪽 정렬된다.** 화면마다 따로 만들지 않고
     * 같은 모듈을 쓰되, 갈래는 부르는 쪽이 알려 줘야 한다.
     */
    ['src/components/teacher/PostDetailViewer.jsx',
     'src/components/teacher/SubmissionStatusModal.jsx',
     'src/components/teacher/ArchiveManager.jsx'].forEach((file) => {
        const source = read(file);
        assert.match(source, /<WritingPresentationModal/, `${file}: 확대 보기 창이 없습니다.`);
        assert.match(source, /format=\{getWritingFormat\(/, `${file}: 갈래를 넘기지 않아 시까지 정렬됩니다.`);
    });
});
