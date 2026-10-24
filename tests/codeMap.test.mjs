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
