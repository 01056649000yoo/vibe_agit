import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TEACHER_NAV_GROUPS } from '../src/constants/teacherNav.js';
import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';
import { STUDENT_GUIDE_ITEMS } from '../src/components/student/studentGuide.js';

// FEATURE_MAP.md(v1 기능 지도)는 기능을 바꿀 때 같은 커밋에서 고친다. 메뉴·도움말이 늘었는데
// 지도에 없으면 여기서 멈춘다(2026-09-24 v1 확정).
const map = await readFile('FEATURE_MAP.md', 'utf8');

test('교사 메뉴의 모든 화면이 기능 지도에 있다', () => {
    const missing = TEACHER_NAV_GROUPS.flatMap((group) => group.tabs)
        .map((tab) => tab.label.replace(/\((제작 중|Beta)\)/, '').trim())
        .filter((label) => !map.includes(label));
    assert.deepEqual(missing, []);
});

test('교사 도움말 키마다 기능 지도의 한 줄이 가리킨다', () => {
    const missing = Object.keys(TEACHER_GUIDES).filter((key) => !map.includes(`\`${key}\``));
    assert.deepEqual(missing, []);
});

test('학생 도움말의 기능마다 기능 지도에 있다', () => {
    const missing = STUDENT_GUIDE_ITEMS.map((item) => item.title).filter((title) => !map.includes(title));
    assert.deepEqual(missing, []);
});

test('기능 지도는 버전과 변경 기록을 가진다', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const major = pkg.version.split('.').slice(0, 2).join('.');
    assert.match(map, /^# 끄적끄적 아지트 기능 지도 — v1/m);
    assert.match(map, /## 변경 기록/);
    assert.ok(map.includes(`| v${major} |`), `변경 기록에 v${major} 줄이 없습니다`);
});
