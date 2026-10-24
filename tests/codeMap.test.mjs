import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMapSource, needsEnglishName, needsFullRescan, staleReason } from '../scripts/codeMapPolicy.mjs';

test('코드 지도는 없거나, 파일 수가 달라졌거나, 지도 이후 소스가 바뀌었을 때만 낡은 것으로 본다', () => {
    const fresh = { graphMtimeMs: 1000, newestSourceMtimeMs: 900, recordedFileCount: 10, currentFileCount: 10 };
    assert.equal(staleReason(fresh), '');
    assert.match(staleReason({ ...fresh, graphMtimeMs: null }), /아직 없어요/);
    assert.match(staleReason({ ...fresh, newestSourceMtimeMs: 1001 }), /소스가 바뀌었어요/);
    assert.match(staleReason({ ...fresh, currentFileCount: 9 }), /파일 수가 달라졌어요/);
    assert.match(staleReason({ ...fresh, recordedFileCount: null }), /파일 수/);
});

test('파일 수가 달라졌을 때(지운 파일 포함)만 전체를 다시 훑는다', () => {
    assert.equal(needsFullRescan({ recordedFileCount: 10, currentFileCount: 10 }), false);
    assert.equal(needsFullRescan({ recordedFileCount: 10, currentFileCount: 9 }), true);
    assert.equal(needsFullRescan({ recordedFileCount: null, currentFileCount: 9 }), false);
});

test('영문 이름 없는 질문은 미리 알려 주고, 소스 확장자만 센다', () => {
    assert.equal(needsEnglishName('새 글을 누르면 열리는 흐름'), true);
    assert.equal(needsEnglishName('PlazaPostModal'), false);
    assert.equal(isMapSource('a/b.jsx'), true);
    assert.equal(isMapSource('a/b.css'), false);
    assert.equal(isMapSource('a/b.webp'), false);
});

test('코드 지도는 저장소 밖에 두고, 문서·PDF 는 읽지 않으며, 없어도 작업이 깨지지 않는다', async () => {
    const [tool, pkg] = await Promise.all([readFile('scripts/code-map.mjs', 'utf8'), readFile('package.json', 'utf8')]);
    assert.match(tool, /'--code-only'/, '코드만 로컬 분석(문서·이미지는 외부 전송되므로 넣지 않는다)');
    assert.match(tool, /homedir\(\), 'graphify', 'vibe-agit'/, '결과 파일은 저장소 밖');
    assert.match(tool, /graphify\)가 이 컴퓨터에 없어요/, '도구가 없으면 안내만 하고 끝낸다');
    assert.match(pkg, /"map": "node scripts\/code-map\.mjs"/);
});

test('코드 지도는 쓸 때마다 저장소 밖에 기록하고, 집계·평가 메모 명령이 있다(2주 평가 근거)', async () => {
    const tool = await readFile('scripts/code-map.mjs', 'utf8');
    assert.match(tool, /usage\.jsonl/);
    assert.match(tool, /command === 'usage'/);
    assert.match(tool, /command === 'note'/);
    assert.match(tool, /logUsage\(\{ source: 'recall'/, 'recall 에서 쓴 것도 센다');
    assert.doesNotMatch(tool, /usage\.jsonl[\s\S]{0,40}repo|appendFileSync\(['"]\./, '기록은 저장소 안에 두지 않는다');
});

import { extractBlock, extractSqlFunction, findSqlFunction } from '../scripts/codeMapSource.mjs';

test('show: 함수 하나만 중괄호가 닫힐 때까지 뽑고, 한 줄 화살표 함수도 뽑는다', () => {
    const lines = ['const a = 1;', 'export const f = (x) => {', '  if (x) { return 1; }', '  return "}" + 2;', '};', 'const g = (y) => y + 1;', 'const z = 3;'];
    assert.deepEqual(extractBlock(lines, 2), { from: 2, to: 5, truncated: false });
    assert.deepEqual(extractBlock(lines, 6), { from: 6, to: 6, truncated: false }, '한 줄 함수');
    assert.equal(extractBlock(['f = () => {', ...Array(300).fill('  x;')], 1, 20).truncated, true, '길면 상한에서 자른다');
});

test('rpc: 여러 번 다시 정의된 DB 함수는 최신 정의만, DROP·권한도 알려 준다', () => {
    const migrations = [
        { file: '001_a.sql', text: 'CREATE OR REPLACE FUNCTION public.get_x()\nRETURNS INT AS $$\nSELECT 1;\n$$ LANGUAGE sql;\nGRANT EXECUTE ON FUNCTION public.get_x() TO authenticated;' },
        { file: '002_b.sql', text: '-- 새 판\nCREATE OR REPLACE FUNCTION public.get_x()\nRETURNS INT\nLANGUAGE plpgsql\nAS $fn$\nBEGIN RETURN 2; END;\n$fn$;' },
        { file: '003_c.sql', text: 'DROP FUNCTION IF EXISTS public.get_x();' }
    ];
    const found = findSqlFunction(migrations, 'get_x');
    assert.equal(found.definitions.length, 2);
    assert.deepEqual(found.latest, { file: '002_b.sql', line: 2 });
    assert.equal(found.droppedAfter?.file, '003_c.sql', '정의 뒤에 DROP 이 있으면 알린다');
    assert.deepEqual(found.grants, ['001_a.sql']);
    assert.deepEqual(extractSqlFunction(migrations[1].text, 2), { from: 2, to: 7, truncated: false });
    assert.equal(findSqlFunction(migrations, 'nope').latest, null);
});

test('세션을 열면 코드 지도가 백그라운드로 갱신되고, 갱신 중 조회는 잠금으로 기다린다', async () => {
    const [settings, hook, tool, skill] = await Promise.all([
        readFile('.claude/settings.json', 'utf8'), readFile('.claude/hooks/code-map-refresh.sh', 'utf8'),
        readFile('scripts/code-map.mjs', 'utf8'), readFile('.claude/skills/code-map/SKILL.md', 'utf8')
    ]);
    assert.match(settings, /code-map-refresh\.sh/);
    assert.match(hook, /nohup node scripts\/code-map\.mjs update --quiet/, '세션을 막지 않게 백그라운드');
    assert.match(hook, /exit 0\s*$/, '실패해도 세션을 막지 않는다');
    assert.match(tool, /waitForLock\(\)/);
    assert.match(skill, /^name: code-map/m);
});
