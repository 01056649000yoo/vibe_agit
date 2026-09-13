import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PDF_KICKER_CLASSES } from '../src/modules/writing/export/pdfRenderContract.js';
import { buildAnthologyHtml } from '../src/modules/class-agit/anthology/print.js';

const read = (file) => readFileSync(file, 'utf8');

const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
});

const edition = {
    version: 1, id: 'e1', draft: true, number: 1,
    book: {
        title: '우리 반 문집', subtitle: '', class_label: '3학년 1반', issue_date: '2026-09-14',
        introduction: '', page_breaks: [],
        print: { paper: 'A4', design: 'botanical', layout: 'continuous', body_pt: 12, poem_pt: 14, version: 2 },
        works: [
            { sourceId: 's1', title: '가을', author: '학생 1', group: '가을 이야기', format: 'prose', blocks: ['첫 마당입니다.'] },
            { sourceId: 's2', title: '단풍', author: '학생 2', group: '가을 이야기', format: 'poem', blocks: ['붉은 잎'] },
        ],
    },
};

test('문집은 글마다 되풀이되는 갈래 딱지를 감춘다', async () => {
    /*
     * 2026-09-14 지적: 책에서 학생 글마다 "끄적끄적 글쓰기" 가 되풀이된다.
     *
     * 문집은 글쓰기 쪽의 출력 판을 그대로 가져다 쓰므로, 글 한 편을 따로 내려받을 때
     * 표지 구실을 하던 딱지가 책에서는 그냥 같은 말의 반복이 된다. 책에서만 감춘다 —
     * 낱장 내려받기에는 그대로 둔다.
     */
    const html = await buildAnthologyHtml(edition);
    assert.ok(PDF_KICKER_CLASSES.length > 0);
    PDF_KICKER_CLASSES.forEach((name) => {
        assert.ok(html.includes(`.anthology-work .${name}`), `${name} 을 감추는 규칙이 없습니다.`);
        // 딱지 자체는 그대로 만든다 — 낱장 PDF 는 딱지를 쓴다.
        assert.ok(html.includes(`class="${name}"`), `${name} 딱지가 아예 사라졌습니다.`);
    });
    const rule = PDF_KICKER_CLASSES.map((name) => `.anthology-work .${name}`).join(',');
    assert.ok(html.includes(`${rule}{display:none}`), '딱지를 한꺼번에 감추는 규칙이 없습니다.');
});

test('새로 만든 갈래 딱지가 목록에서 빠지지 않는다', () => {
    /*
     * 딱지는 갈래마다 제 이름을 쓴다(`pdf-entry__kicker`, `poem-sheet__kicker`).
     * 한 곳에 모을 수 없으니 **한꺼번에 보는 검사**를 둔다 — 글쓰기 출력 코드를 훑어
     * 목록에 없는 딱지가 있으면 여기서 걸린다. 그대로 두면 그 갈래만 책에서 딱지가 남는다.
     */
    const used = new Set();
    walk('src/modules/writing').forEach((file) => {
        if (!/\.jsx?$/u.test(file)) return;
        for (const match of read(file).matchAll(/class="([a-z-]+__kicker)"/gu)) used.add(match[1]);
    });
    assert.ok(used.size > 0, '딱지를 하나도 못 찾았습니다 — 검사가 헛돌고 있습니다.');
    assert.deepEqual([...used].sort(), [...PDF_KICKER_CLASSES].sort());
});
