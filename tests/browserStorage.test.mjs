import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocalStorageJson } from '../src/lib/browserStorage.js';

test('브라우저가 없으면 기본값을 반환한다', () => {
    assert.deepEqual(readLocalStorageJson('missing', { safe: true }), { safe: true });
});

test('정상 JSON은 저장값을 반환한다', () => {
    globalThis.window = {
        localStorage: { getItem: () => '{"columns":3}' }
    };
    assert.deepEqual(readLocalStorageJson('layout', {}), { columns: 3 });
    delete globalThis.window;
});

test('손상된 JSON은 화면을 중단하지 않고 기본값을 반환한다', () => {
    globalThis.window = {
        localStorage: { getItem: () => '{broken' }
    };
    assert.deepEqual(readLocalStorageJson('layout', { columns: 2 }), { columns: 2 });
    delete globalThis.window;
});
