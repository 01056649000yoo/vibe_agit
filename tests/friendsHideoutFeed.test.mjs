/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('자율 글 모듈은 친구 아지트 피드 표시 정보를 매니페스트로 선언한다', async () => {
    const [registry, types, readingLog, diary] = await Promise.all([
        read('src/modules/registry.js'),
        read('src/modules/types.js'),
        read('src/modules/writing/reading-log/manifest.js'),
        read('src/modules/writing/diary/manifest.js'),
    ]);

    assert.match(registry, /getCommunityFeedSelfTypes/);
    assert.match(registry, /manifest\.communityFeed\?\.group === 'self'/);
    assert.match(registry, /id: manifest\.writingPolicy\.type/);
    assert.match(types, /communityFeed\.group은 self여야 함/);
    assert.match(readingLog, /communityFeed:\s*\{[\s\S]*?label: '독서록'/);
    assert.match(diary, /communityFeed:\s*\{[\s\S]*?label: '일기'/);
});

test('우리 반 새 글은 전체·과제·자율 글과 매니페스트 기반 세부 필터를 제공한다', async () => {
    const source = await read('src/modules/community/friends-hideout/FriendsHideout.jsx');

    assert.match(source, /id: 'all'[\s\S]*?title: '전체 새 글'/);
    assert.match(source, /id: 'assignment'[\s\S]*?title: '선생님 과제'/);
    assert.match(source, /id: 'self'[\s\S]*?title: '자율 글'/);
    assert.match(source, /getCommunityFeedSelfTypes\(\)/);
    assert.match(source, /SELF_FEED_TYPES\.map/);
    assert.match(source, /handleSelfFeedTypeChange\(type\.id\)/);
    assert.doesNotMatch(source, /const FEED_TABS =|id: 'reading_log'[\s\S]*?독서록 최신글/);
});

test('친구 공개 글 목록은 직접 테이블 조합 없이 단일 커서 RPC를 사용한다', async () => {
    const source = await read('src/modules/community/friends-hideout/useFriendsHideout.js');
    const start = source.indexOf('const fetchFeed');
    const end = source.indexOf('const loadMore', start);
    const fetchSection = source.slice(start, end);

    assert.match(fetchSection, /get_class_public_writing_feed_v1/);
    assert.match(fetchSection, /p_cursor_at/);
    assert.match(fetchSection, /p_cursor_id/);
    assert.doesNotMatch(fetchSection, /\.from\(|Promise\.all|\.range\(/);
    assert.match(source, /postsRequestIdRef/);
    assert.match(source, /feedSelectionRef/);
    assert.match(source, /pendingFeedRequestsRef/);
});

test('친구 아지트 기본 진입은 피드 한 번만 읽고 과제·친구 명단은 탭을 열 때 지연 조회한다', async () => {
    const [hook, screen] = await Promise.all([
        read('src/modules/community/friends-hideout/useFriendsHideout.js'),
        read('src/modules/community/friends-hideout/FriendsHideout.jsx'),
    ]);
    const initialStart = hook.indexOf('// 기본 진입은 공개 글 RPC 한 번만 사용한다.');
    const initialEnd = hook.indexOf('}, [fetchFeed', initialStart);
    const initialSection = hook.slice(initialStart, initialEnd);

    assert.ok(initialStart >= 0 && initialEnd > initialStart);
    assert.match(initialSection, /lastHideoutRefreshAtRef\.current = Date\.now\(\)/);
    assert.match(initialSection, /void fetchFeed\(feedSelectionRef\.current\)/);
    assert.match(initialSection, /if \(initialMissionId\)[\s\S]*void fetchMissions\(\)/);
    assert.doesNotMatch(initialSection, /fetchClassmates/);
    assert.match(hook, /normalizedGroup === 'assignment'[\s\S]*void fetchMissions\(\)/);
    assert.match(screen, /tabId === 'hideouts'[\s\S]*void loadClassmates\(\)/);
    assert.match(screen, /onClick=\{\(\) => handleMainTabChange\(tab\.id\)\}/);
});

test('공개 글 RPC는 학생의 실제 학급·공개 상태·목록 상한·안정 커서를 검증한다', async () => {
    const [migration, smoke] = await Promise.all([
        read('supabase/migrations/20261025_class_public_writing_feed.sql'),
        read('tests/sql/20261025_class_public_writing_feed.smoke.sql'),
    ]);

    assert.match(migration, /public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(migration, /post\.class_id = v_class_id/);
    assert.match(migration, /post\.is_submitted IS TRUE[\s\S]*post\.visibility = 'class'/);
    assert.match(migration, /item\.class_id = page\.class_id[\s\S]*item\.post_id = page\.id/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit, 10\), 1\), 50\)/);
    assert.match(migration, /post\.id\s*\) < \(p_cursor_at, p_cursor_id\)/);
    assert.match(migration, /LIMIT v_limit \+ 1/);
    assert.match(migration, /idx_student_posts_class_public_feed/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_class_public_writing_feed_v1[\s\S]*PUBLIC, anon/);
    assert.doesNotMatch(migration, /auth\.jwt|app_metadata/);
    assert.match(smoke, /비공개 일기가 학급 공개 피드에 노출되었습니다/);
    assert.match(smoke, /다음 커서 페이지가 이어지지 않습니다/);
});
