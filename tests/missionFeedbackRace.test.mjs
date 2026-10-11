import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 2026-10-11 보안 점검: AI 피드백이 오는 사이 다른 학생 글로 옮기면 그 글 편집칸에 피드백이 붙어 저장될 수 있었다.
test('글 하나 AI 피드백은 요청한 글 번호에만 붙고, 다른 글을 보고 있으면 화면을 건드리지 않는다', async () => {
    const source = await readFile('src/hooks/useMissionManager.js', 'utf8');
    const start = source.indexOf('const handleGenerateSingleAI = async');
    const body = source.slice(start, source.indexOf('};', source.indexOf('finally', start)));
    assert.match(body, /const targetPostId = selectedPost\.id;/);
    assert.match(body, /\.eq\('id', targetPostId\)/);
    assert.doesNotMatch(body, /\.eq\('id', selectedPost\.id\)/);
    assert.match(body, /selectedPostIdRef\.current === targetPostId/);
    assert.match(body, /prev && prev\.id === targetPostId/);
});
