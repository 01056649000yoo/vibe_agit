import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { choosePanelPlacement } from '../src/guides/tourPanelPlacement.js';

/*
 * 동행 패널이 짚은 자리를 가리지 않는다(2026-09-25 제보).
 * 모두의 아지트 흐름의 문집 도서관 카드는 화면 오른쪽 끝이라 오른쪽 아래 패널에 가려졌고,
 * 접어 두면 테두리까지 사라져 어디를 누를지 몰랐다.
 */
const viewport = { width: 1400, height: 900 };
const panel = { width: 640, height: 420 };

test('안 겹치면 늘 오른쪽 아래', () => {
    assert.equal(choosePanelPlacement({ top: 100, left: 100, width: 200, height: 60 }, panel, viewport), 'bottom-right');
    assert.equal(choosePanelPlacement(null, panel, viewport), 'bottom-right');
});

test('오른쪽 아래 자리를 가리면 왼쪽 아래로, 아래를 다 가리면 위로 비킨다', () => {
    // 문집 도서관 카드처럼 오른쪽 아래에 있는 자리.
    assert.equal(choosePanelPlacement({ top: 600, left: 1000, width: 360, height: 130 }, panel, viewport), 'bottom-left');
    // 아래쪽을 가로지르는 넓은 자리.
    assert.equal(choosePanelPlacement({ top: 600, left: 100, width: 1200, height: 100 }, panel, viewport), 'top-right');
});

test('패널과 접힌 알약이 같은 자리 규칙을 쓰고, 접어도 테두리는 남는다', () => {
    const companion = readFileSync('src/components/teacher/TeacherTourCompanion.jsx', 'utf8');
    const css = readFileSync('src/components/teacher/TeacherTourCompanion.css', 'utf8');
    assert.equal((companion.match(/ref=\{panelRef\}/g) || []).length, 2);
    assert.match(companion, /choosePanelPlacement\(rect, element\.getBoundingClientRect\(\),/);
    assert.match(companion, /element\.dataset\.placement = next/);
    const collapsed = companion.slice(companion.indexOf('if (collapsed) {'), companion.indexOf('const needsAck'));
    assert.match(collapsed, /className="teacher-tour__ring"/);
    assert.doesNotMatch(collapsed, /teacher-tour__dim/);
    assert.match(css, /\.teacher-tour__panel\[data-placement\$='left'\]/);
    assert.match(css, /\.teacher-tour__panel\[data-placement\^='top'\]/);
});
