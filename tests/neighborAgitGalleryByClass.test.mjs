import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { groupByTopic } from '../src/modules/community/neighbor-agit/gallery/groupByTopic.js';

/*
 * 이웃 글 마당 반별 보기(학생) · ③ 댓글·반응 반별 보기(교사) — 2026-09-23 `20261336`.
 * 동작은 `npm run simulate:neighbor-agit` G1~G8 이 실제 역할로 확인한다.
 */
const [sql, studentEntry, teacherEntry, studentPanel, teacherPanel, api, teacherApi, studentCss, teacherCss] = await Promise.all([
    readFile('supabase/migrations/20261336_neighbor_gallery_by_class.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/gallery/StudentGalleryPanel.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/gallery/TeacherEngagementPanel.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/api.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.css', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8')
]);

test('주제별 묶음: 주제 없는 글은 자율 글, 최근 글이 올라온 주제가 앞', () => {
    const groups = groupByTopic([
        { topic: '가을 운동회', published_at: '2026-09-20T00:00:00Z' },
        { topic: '', published_at: '2026-09-22T00:00:00Z' },
        { topic: '우리 동네', published_at: '2026-09-21T00:00:00Z' },
        { topic: '가을 운동회', published_at: '2026-09-23T00:00:00Z' }
    ]);
    assert.deepEqual(groups.map((group) => [group.topic, group.posts.length]), [['가을 운동회', 2], ['자율 글', 1], ['우리 동네', 1]]);
});

test('반 열쇠는 참여 행 id — 원본 학급 id 를 학생에게 내보내지 않는다', () => {
    assert.match(sql, /'class_key', membership\.id/);
    assert.doesNotMatch(sql, /'class_id', membership\.class_id/);
    assert.match(sql, /WHERE membership\.id = p_class_key AND membership\.space_id = p_space_id AND membership\.status = 'active'/);
});

test('새 글은 지난 방문 뒤 — 피드가 방문 시각을 바꾸기 직전 값을 남긴다', () => {
    assert.match(sql, /NEW\.previous_seen_at := OLD\.last_seen_at/);
    assert.match(sql, /BEFORE UPDATE ON public\.neighbor_feed_visits/);
    assert.match(sql, /CASE WHEN v_since IS NULL THEN 0/);
});

test('교사 반별 조회는 작업 공간의 50편 상한을 쓰지 않고 따로 읽는다(이웃 글 마당/주제 구분)', () => {
    assert.match(sql, /\(p_kind = 'gallery' AND shared\.activity_id IS NULL\) OR \(p_kind = 'topic' AND shared\.activity_id IS NOT NULL\)/);
    assert.match(sql, /LIMIT 500/);
    assert.match(teacherApi, /rpc\('get_neighbor_teacher_engagement_v1'/);
    assert.match(teacherEntry, /<TeacherEngagementPanel /);
    assert.match(teacherEntry, /kind=\{activeActivityTab === 'topic' \? 'topic' : 'gallery'\}/);
    assert.doesNotMatch(teacherEntry, /const published = workspace\.public_posts\.filter\(\(post\) => post\.status === 'published' && post\.is_own_class\)/);
});

test('학생: 반 고르기 → 주제별 묶음, 새 글 모아보기는 기존 최신순 피드', () => {
    assert.match(api, /rpc\('get_neighbor_gallery_classes_v1'/);
    assert.match(api, /rpc\('get_neighbor_class_gallery_v1'/);
    assert.match(studentEntry, /activeSection === 'gallery' && galleryView !== 'latest' \? \(/);
    assert.match(studentEntry, /🆕 새 글 모아보기/);
    assert.match(studentPanel, /groupByTopic\(gallery\?\.items \|\| \[\]\)/);
    assert.match(teacherPanel, /groupByTopic\(selected\?\.posts \|\| \[\]\)/);
});

test('전역 button:hover 파란 바탕이 카드·단추를 덮지 않는다', () => {
    assert.match(studentCss, /\.neighbor-post-card:hover \{ background: var\(--ui-surface\)/);
    assert.match(teacherCss, /\.neighbor-teacher__engage-card:hover \{ background: #fff/);
});
