import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isChunkLoadError, reloadOnceForNewDeploy } from '../src/utils/chunkReload.js';

// 새 배포 뒤 옛 화면 조각을 못 받는 오류를 한 번 새로고침으로 푼다(2026-09-23 학생 모두의 아지트 진입 오류).
const memoryStorage = () => {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};

test('브라우저마다 다른 청크 오류 문구를 알아본다', () => {
    assert.ok(isChunkLoadError(new TypeError('Importing a module script failed.')));
    assert.ok(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a-1.js')));
    assert.ok(isChunkLoadError(new Error('error loading dynamically imported module')));
    assert.ok(!isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')")));
});

test('짧은 시간 안에는 한 번만 새로고침한다(무한 새로고침 방지)', () => {
    const storage = memoryStorage();
    let reloads = 0;
    const reload = () => { reloads += 1; };
    assert.equal(reloadOnceForNewDeploy({ storage, now: 1_000, reload }), true);
    assert.equal(reloadOnceForNewDeploy({ storage, now: 5_000, reload }), false);
    assert.equal(reloadOnceForNewDeploy({ storage, now: 40_000, reload }), true);
    assert.equal(reloads, 2);
});

test('저장소를 못 쓰면 새로고침하지 않는다', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    let reloads = 0;
    assert.equal(reloadOnceForNewDeploy({ storage: broken, now: 1, reload: () => { reloads += 1; } }), false);
    assert.equal(reloads, 0);
});

test('앱 입구와 전역 오류 방어막이 이 처리에 연결돼 있다', async () => {
    const [main, boundary] = await Promise.all([
        readFile('src/main.jsx', 'utf8'),
        readFile('src/components/common/ErrorBoundary.jsx', 'utf8')
    ]);
    assert.match(main, /addEventListener\('vite:preloadError'/);
    assert.match(boundary, /if \(isChunkLoadError\(error\)\) reloadOnceForNewDeploy\(\)/);
});
