import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

// 모두의 아지트 세 공간 이름(2026-09-24): 🌳 이웃 글 마당 · 🎪 같이 쓰기 광장 · 🏛️ 문집 도서관.
// 화면 이름표 원본은 activityTypes.js 하나지만, 도움말·안내서·경고창·서버 문구에는 이름이 글로 적힌다.
// 옛 이름이 한 곳이라도 남으면 아이와 교사가 두 이름을 보게 되므로 여기서 한꺼번에 본다.
const OLD_NAMES = ['글 나눔', '함께 쓰는 주제', '문집 나눔'];

const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    }));
    return files.flat();
};

test('앱 코드·교사 도움말·활용 안내서에 옛 공간 이름이 남지 않는다', async () => {
    const files = (await walk('src')).filter((path) => /\.(jsx?|css|md)$/.test(path));
    const leftovers = [];
    for (const path of files) {
        const source = await readFile(path, 'utf8');
        for (const name of OLD_NAMES) {
            if (source.includes(name)) leftovers.push(`${path}: ${name}`);
        }
    }
    assert.deepEqual(leftovers, []);
});

test('이름표 원본은 새 이름·새 아이콘이다', async () => {
    const tabs = await readFile('src/modules/community/neighbor-agit/activityTypes.js', 'utf8');
    assert.match(tabs, /id: 'gallery', icon: '🌳', label: '이웃 글 마당'/);
    assert.match(tabs, /id: 'topic', icon: '🎪', label: '같이 쓰기 광장'/);
    assert.match(tabs, /id: 'books', icon: '🏛️', label: '문집 도서관'/);
});

test('서버 문구와 주제 과제 태그도 새 이름을 쓴다(20261340)', async () => {
    const migration = await readFile('supabase/migrations/20261340_neighbor_security_and_space_names.sql', 'utf8');
    assert.match(migration, /THEN '같이 쓰기 광장' ELSE/);
    assert.match(migration, /이웃 글 마당에 올릴 수 있는 자기 학급 제출 글이 아닙니다/);
    assert.match(migration, /같이 쓰기 광장에 주제를 제안할 수 있습니다/);
    // 이미 만든 주제 과제의 보이는 태그도 바꾸고, 과제를 알아보는 태그 '이웃 아지트' 는 그대로 둔다.
    assert.match(migration, /mission\.tags \? '함께 쓰는 주제'/);
    assert.doesNotMatch(migration, /'"이웃 아지트"'/);
});
