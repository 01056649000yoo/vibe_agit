import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildBacklog, MAX_ROADMAP_LINES, mergeArchive, planArchive, rebaseToArchive } from '../scripts/roadmapArchive.mjs';

/*
 * ROADMAP 줄이기(2026-09-28): 4,305줄이던 ROADMAP 을 "앞으로 할 일" 크기로 되돌리고, 기준을 코드 한 곳에 둔다.
 */

const sample = [
    '# ROADMAP',
    '',
    '## 🧭 현재 위치',
    '',
    '- [x] **새 일** (2026-10-20). 설명',
    '  이어짐',
    '- [x] **옛 일** (2026-10-01).',
    '',
    '### 기능 A (2026-09-15)',
    '- [x] 끝',
    '- [ ] 실기기 확인',
    '',
    '## Stage 0 — 끝남',
    '- [x] 하나',
    '',
    '## Stage 4 — 진행',
    '### 4a. 끝난 절',
    '- [x] 다',
    '### 4b. 남은 절',
    '- [ ] 할 일',
    '#### 4b-1. 끝난 하위',
    '- [x] 됨',
    '',
    '## 📝 결정 기록',
    '',
    '- **2026-10-20**: 새 결정',
    '- 2026-09-01: 옛 결정 [계획](PLAN.md)',
    ''
].join('\n');

test('현재 위치 절·오래된 머리 항목·끝난 Stage·오래된 결정을 옮기고 남은 것은 둔다', () => {
    const { roadmap, moves, counts } = planArchive(sample);
    assert.deepEqual(counts, { currentSections: 1, currentBullets: 1, stages: 1, stageSections: 2, decisions: 1 });
    assert.match(roadmap, /\*\*새 일\*\*/);
    assert.doesNotMatch(roadmap, /옛 일|기능 A|Stage 0|4a\.|4b-1|옛 결정/);
    assert.match(roadmap, /### 4b\. 남은 절\n- \[ \] 할 일/, '[ ] 가 있는 절은 남는다');
    assert.deepEqual(Object.keys(moves).sort(), ['2026-09.md', '2026-10.md', 'decisions-2026-09.md', 'stages-done.md']);
});

test('두 번 돌려도 더 옮기지 않고 안내문도 한 번만 넣는다', () => {
    const first = planArchive(sample).roadmap;
    const second = planArchive(first);
    assert.equal(Object.values(second.counts).reduce((a, b) => a + b, 0), 0);
    assert.equal(second.roadmap, first);
    assert.equal((first.match(/> 지난 `현재 위치` 절/g) || []).length, 1);
});

test('보관 파일은 새 것을 위에 쌓고 링크를 docs/roadmap/ 기준으로 바꾸며, BACKLOG 는 [ ] 만 모은다', () => {
    assert.equal(rebaseToArchive('[a](PLAN.md) [b](https://x) [c](#h)'), '[a](../../PLAN.md) [b](https://x) [c](#h)');
    const once = mergeArchive('2026-09.md', null, ['### 옛 절\n- [ ] 확인']);
    const twice = mergeArchive('2026-09.md', once, ['### 새 절\n- [x] 됨']);
    assert.ok(twice.indexOf('### 새 절') < twice.indexOf('### 옛 절'));
    assert.equal((twice.match(/^# ROADMAP/gm) || []).length, 1, '머리말은 한 번만');
    const backlog = buildBacklog({ '2026-09.md': twice });
    assert.match(backlog, /전체 1건/);
    assert.match(backlog, /- \*\*옛 절\*\*\n {2}- \[ \] 확인/);
});

// 윈도우 체크아웃은 줄 끝이 CRLF 다. 생성본(LF)과 견주기 전에 맞춘다(내용이 같은데 줄 끝만 달라 실패하던 것).
const readLf = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

test('실제 ROADMAP 은 상한 안이고 더 옮길 것이 없으며, BACKLOG 가 보관 파일과 맞다', () => {
    const roadmap = readLf('ROADMAP.md');
    const lines = roadmap.split('\n').length;
    assert.ok(lines <= MAX_ROADMAP_LINES, `ROADMAP 이 ${lines}줄(상한 ${MAX_ROADMAP_LINES}). \`npm run roadmap:archive\``);
    const { counts } = planArchive(roadmap);
    assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 0, '옮길 것이 남았다. `npm run roadmap:archive` 를 돌리세요.');
    if (!existsSync('docs/roadmap')) return;
    const archives = Object.fromEntries(readdirSync('docs/roadmap').filter((f) => f.endsWith('.md') && f !== 'BACKLOG.md')
        .map((f) => [f, readLf(`docs/roadmap/${f}`)]));
    assert.equal(readLf('docs/roadmap/BACKLOG.md'), buildBacklog(archives),
        'BACKLOG.md 를 직접 고쳤거나 보관 파일이 바뀌었다. `npm run roadmap:archive` 를 돌리세요.');
});

test('가장 아래 결정을 옮겨도 안내 줄(`> 14일보다 오래된 결정은`)은 ROADMAP 에 남고 보관 파일로 딸려 가지 않는다', async () => {
    const { planArchive } = await import('../scripts/roadmapArchive.mjs');
    const roadmap = [
        '# ROADMAP', '', '## 📝 결정 기록', '',
        '- **2026-10-03**: 새 결정.',
        '- **2026-09-01**: 오래된 결정 첫 줄', '  이어지는 줄',
        '', '> 14일보다 오래된 결정은 [docs/roadmap/](docs/roadmap/) 의 `decisions-YYYY-MM.md` 에 있다. `grep -n "말" docs/roadmap/decisions-*.md`.',
        ''
    ].join('\n');
    const { roadmap: next, moves } = planArchive(roadmap);
    const moved = Object.values(moves).flat().join('\n');
    assert.match(moved, /오래된 결정 첫 줄/);
    assert.doesNotMatch(moved, /일보다 오래된 결정은/, '안내 줄이 보관 파일로 딸려 갔습니다.');
    assert.equal((next.match(/일보다 오래된 결정은/g) || []).length, 1);
});
