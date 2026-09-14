import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 2026-09-14 제보: 한 주제에 승인된 글이 12편인데 글꽃 책방·전시관에는 11편만 불러와졌다.
 * 빠진 1편은 교사가 **강제로 회수한 뒤 승인한 글**이었다.
 *
 * `회수` 는 교사가 미제출 글을 대신 걷어오는 기능이고 `student_posts.recalled_at` 에 자국이 남는다.
 * 승인(`approve_assignment_post`)은 이 자국을 지우지 않는데(기록이므로 지울 이유도 없다),
 * 글꽃 쪽 자격 판정이 그 자국까지 보고 있어서 승인해도 계속 빠졌다.
 *
 * 이제 자격은 **최종 승인**만으로 정한다. 같은 규칙이 여섯 함수에 흩어져 있어 한 곳만 고치면
 * 목록에는 떠도 발행이 거부되거나 실린 뒤 자동 철회된다 — 그래서 여기서 **여섯 곳을 한꺼번에** 본다.
 */
const MIGRATION = 'supabase/migrations/20261291_class_agit_includes_recalled_approved.sql';

const ELIGIBILITY_FUNCTIONS = [
    'get_class_agit_candidates_v2',          // 후보 목록 (작품 찾기)
    'get_class_agit_missions_v1',            // 주제별 목록·편수
    'class_agit_source_data_v1',             // 발행용 원본 만들기
    'class_agit_revoke_changed_posts_v1',    // 원글이 바뀌면 자동 철회
    'revoke_class_agit_source_v1',           // 글 변경 트리거
    'revoke_class_agit_releases_v1',         // 공개판 변경 트리거
];

test('글꽃에 실을 자격은 여섯 곳 모두에서 회수 이력을 보지 않는다', async () => {
    const raw = await readFile(MIGRATION, 'utf8');
    // 설명 주석에는 고치기 전 조건이 그대로 인용돼 있다. 실제 코드만 본다.
    const sql = raw.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
    assert.ok(sql.length > 1000, '주석을 걷어내니 볼 코드가 없다');

    for (const name of ELIGIBILITY_FUNCTIONS) {
        assert.ok(
            sql.includes(`CREATE OR REPLACE FUNCTION public.${name}`),
            `${name} 을 함께 고치지 않았다 — 한 곳만 고치면 목록에만 뜨고 실리지 않는다`
        );
    }

    // 자격 판정에서 회수 조건이 남아 있으면 안 된다.
    assert.doesNotMatch(sql, /recalled_at IS NULL/, '아직 회수 자국으로 거르는 곳이 있다');
    assert.doesNotMatch(sql, /recalled_at IS NOT NULL/, '아직 회수 자국으로 거르는 곳이 있다');

    /*
     * 다만 **변경 감지 지문**에는 회수 시각이 남아야 한다.
     * 그것은 자격이 아니라 "실은 뒤에 원글이 바뀌었는지" 를 알아보는 값이다.
     */
    assert.match(sql, /p_post\.recalled_at, p_mission\.input_template/,
        '변경 감지 지문에서 회수 시각까지 지웠다');

    // 승인 관문까지 풀면 안 된다. 승인 안 한 글은 여전히 빠져야 한다.
    assert.match(sql, /is_confirmed IS TRUE/);
    assert.match(sql, /is_returned IS NOT TRUE/);
    assert.match(sql, /visibility='class'/);
});

test('두 도움말이 같은 기준을 같은 말로 알려 준다', async () => {
    const guides = await readFile('src/constants/teacherGuides.js', 'utf8');

    // 글꽃 전시관과 글꽃 책방 두 곳 모두에 있어야 한다.
    const mentions = guides.split('불러올 수 있는 글은 `최종 승인한 글`입니다').length - 1;
    assert.equal(mentions, 2, '전시관·책방 두 도움말에 모두 적어야 한다');

    // 선생님이 실제로 겪은 상황을 그대로 짚어 준다.
    assert.match(guides, /강제로 회수한 뒤 승인한 글도 함께 나옵니다/);
    // 승인하지 않은 글까지 나온다고 오해하면 안 된다.
    assert.match(guides, /승인하지 않은 글은 회수했더라도 나오지 않습니다/);

    // 도움말이 붙은 자리가 실제 그 기능 설명 안이어야 한다.
    const exhibition = guides.indexOf("title: '우리반 아지트 · 글꽃 전시관'");
    const shelf = guides.indexOf("title: '우리반 아지트 · 글꽃 책방'");
    assert.ok(exhibition >= 0 && shelf >= 0);
    const first = guides.indexOf('불러올 수 있는 글은 `최종 승인한 글`입니다');
    const second = guides.indexOf('불러올 수 있는 글은 `최종 승인한 글`입니다', first + 1);
    assert.ok(first > exhibition && first < shelf, '전시관 도움말 안에 있어야 한다');
    assert.ok(second > shelf, '책방 도움말 안에 있어야 한다');
});
