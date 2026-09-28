import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
    globToRegExp, lessonsFor, lintOpenItems, parseOpenItems, parsePitfalls, staleOpenItems
} from '../scripts/workMemory.mjs';

/*
 * 열린 일 장부와 PITFALLS 경로 꼬리표(2026-09-28).
 * 열린 일이 WORKLOG `남은 것` 71곳에 흩어져 아무도 모아 보지 않았고, 교훈은 고치는 순간에 떠오르지 않았다.
 */

const row = (id, kind, text = '할 일', source = 'WORKLOG', since = '2026-10-01') => `| ${id} | ${kind} | ${text} | ${source} | ${since} |`;

test('열린 일 형식: 번호 오름차순·종류·날짜·출처, 제보는 재현 조건', () => {
    const good = parseOpenItems([row('OI-001', '결정'), row('OI-002', '제보', '언제: 확대할 때, 기기: 태블릿')].join('\n'));
    assert.deepEqual(lintOpenItems(good), []);

    const bad = parseOpenItems([row('OI-002', '결정'), row('OI-001', '아무거나', '', '', '어제'), row('OI-003', '제보', '화면이 이상함')].join('\n'));
    const problems = lintOpenItems(bad).join('\n');
    assert.match(problems, /오름차순/);
    assert.match(problems, /종류/);
    assert.match(problems, /생긴 날/);
    assert.match(problems, /출처/);
    assert.match(problems, /재현 조건/);
});

test('30일 넘은 열린 일을 골라낸다', () => {
    const items = parseOpenItems([row('OI-001', '후속', 'a', 's', '2026-08-01'), row('OI-002', '후속', 'b', 's', '2026-09-20')].join('\n'));
    assert.deepEqual(staleOpenItems(items, '2026-09-28').map((i) => i.id), ['OI-001']);
});

test('경로 꼬리표: ** 는 폴더를 건너고, 폴더 없는 패턴은 이름만 본다', () => {
    assert.ok(globToRegExp('supabase/migrations/**').test('supabase/migrations/20261400_x.sql'));
    assert.ok(globToRegExp('src/**/*.jsx').test('src/components/a/B.jsx'));
    assert.ok(!globToRegExp('src/**/*.jsx').test('src/lib/a.js'));
    assert.ok(globToRegExp('*.sql').test('tests/sql/a.smoke.sql'));
    assert.ok(globToRegExp('Caddyfile*').test('Caddyfile.container'));

    const lessons = parsePitfalls('## DB\n- **마이그레이션 먼저** 설명\n  이어짐 [경로: supabase/migrations/**]\n- **화면** [경로: src/**/*.jsx] [검사: tests/x.test.mjs]\n');
    assert.deepEqual(lessons.map((l) => l.paths), [['supabase/migrations/**'], ['src/**/*.jsx']]);
    assert.deepEqual(lessons[1].guards, ['tests/x.test.mjs']);
    assert.deepEqual(lessonsFor(lessons, ['supabase/migrations/1.sql']).map((l) => l.headline), ['마이그레이션 먼저']);
});

test('실제 장부와 PITFALLS: 형식이 맞고, 모든 교훈에 경로 꼬리표가 있으며, 적힌 검사 파일이 실제로 있다', () => {
    assert.deepEqual(lintOpenItems(parseOpenItems(readFileSync('docs/OPEN_ITEMS.md', 'utf8'))), []);

    const lessons = parsePitfalls(readFileSync('docs/wiki/PITFALLS.md', 'utf8'));
    assert.ok(lessons.length > 0);
    const untagged = lessons.filter((l) => l.paths.length === 0).map((l) => l.headline);
    assert.deepEqual(untagged, [], '새 교훈에 `[경로: …]` 를 다세요 — 어느 파일을 고칠 때 떠올릴지');
    for (const guard of lessons.flatMap((l) => l.guards)) {
        if (guard.startsWith('npm run ')) {
            const script = guard.slice('npm run '.length);
            assert.ok(JSON.parse(readFileSync('package.json', 'utf8')).scripts[script], `[검사: ${guard}] 명령이 없다`);
        } else assert.ok(existsSync(guard), `[검사: ${guard}] 파일이 없다 — 검사를 지웠다면 교훈을 되살리거나 꼬리표를 고치세요`);
    }
});
