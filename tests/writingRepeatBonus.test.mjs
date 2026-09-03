import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = 'supabase/migrations/20261230_writing_repeat_bonus.sql';

test('반복 보너스 설정과 제출 스냅샷은 같은 마이그레이션에서 함께 추가된다', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    for (const table of ['writing_missions', 'class_writing_policies', 'student_posts']) {
        assert.match(migration, new RegExp(`ALTER TABLE public\\.${table}`));
    }
    for (const field of [
        'repeat_bonus_enabled', 'repeat_bonus_threshold',
        'repeat_bonus_reward', 'repeat_bonus_max_count'
    ]) {
        assert.match(migration, new RegExp(field));
    }
    assert.match(migration, /snapshot_student_post_repeat_bonus_v1/);
    assert.match(migration, /guard_student_post_server_columns[\s\S]*awarded_repeat_bonus_max_count/);
});

test('과제·자율 글·승인 알림은 공용 반복 보너스 계산을 사용한다', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    const calls = migration.match(/calculate_writing_reward_total_v1\(/g) || [];
    assert.ok(calls.length >= 4, `공용 계산 함수 정의와 호출이 부족합니다: ${calls.length}`);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.approve_assignment_post/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.award_self_writing_review_points_v1/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.emit_assignment_status_notification_v1/);
});

test('반복 보너스는 SQL 스모크로 공식·호환·제출 스냅샷 경계를 함께 지킨다', async () => {
    const smoke = await readFile('tests/sql/20261230_writing_repeat_bonus.smoke.sql', 'utf8');

    // 교사에게 안내한 예시 표를 서버에서도 그대로 확인한다.
    assert.match(smoke, /calculate_writing_reward_total_v1\(100, 300, v_chars, 200, 30, TRUE, 200, 10, 3\)/);
    assert.match(smoke, /반복 보너스 계산이 예시와 다릅니다/);

    // 끄면 지금과 완전히 같아야 한다(기존 설정·기존 글 호환).
    assert.match(smoke, /반복 보너스를 꺼도 금액이 달라집니다/);
    assert.match(smoke, /반복 보너스 스위치의 기본값이 꺼짐이 아닙니다/);

    // 추가 보너스가 없으면 최소 글자 수부터 구간을 센다.
    assert.match(smoke, /반복 구간 시작점이 최소 글자 수가 아닙니다/);

    // 제출 뒤 교사가 설정을 바꿔도 이미 낸 글의 지급 기준은 그대로다.
    assert.match(smoke, /제출 뒤 과제 설정을 바꾸자 이미 낸 글의 지급액이/);
    assert.match(smoke, /자율 글 지급이 제출 스냅샷을 읽지 않습니다/);

    // 계산 함수는 브라우저 역할에 열지 않는다.
    assert.match(smoke, /보상 계산 함수가 브라우저 역할에 열려 있습니다/);

    /*
     * ⚠️ student_posts 의 BEFORE 트리거는 이름 알파벳 순서로 돈다.
     *    학생 쓰기 가드가 스냅샷보다 뒤에 돌면 방금 찍은 스냅샷을 NULL 로 지워 버린다.
     *    이름을 바꾸면 조용히 깨지므로 스모크가 순서를 직접 확인한다.
     */
    assert.match(smoke, /보다 뒤에 돌아 스냅샷이 지워집니다/);
});

test('학생 글쓰기 창도 반복 보너스 설정을 받아 남은 글자 수를 안내한다', async () => {
    const [workspaceMigration, workspaceSmoke, progress, diary, readingLog] = await Promise.all([
        readFile('supabase/migrations/20261231_student_workspace_repeat_bonus.sql', 'utf8'),
        readFile('tests/sql/20261231_student_workspace_repeat_bonus.smoke.sql', 'utf8'),
        readFile('src/modules/writing/policy/WritingPolicyProgress.jsx', 'utf8'),
        readFile('src/modules/writing/diary/DiaryPage.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/ReadingLogPage.jsx', 'utf8')
    ]);

    /*
     * 교사가 켜도 학생 화면이 설정을 못 받으면 계산기는 늘 `꺼짐`으로 보고
     * 안내를 그리지 않는다. 과제는 RPC가, 일기·독서록은 학생이 읽는 열 목록이 통로다.
     */
    assert.match(workspaceMigration, /mission\.repeat_bonus_enabled, mission\.repeat_bonus_threshold/);
    assert.match(workspaceMigration, /mission\.repeat_bonus_reward, mission\.repeat_bonus_max_count/);
    assert.match(workspaceSmoke, /학생 작업공간이 반복 보너스 설정을 돌려주지 않습니다/);
    for (const source of [diary, readingLog]) {
        assert.match(source, /repeat_bonus_enabled, repeat_bonus_threshold, repeat_bonus_reward, repeat_bonus_max_count/);
    }

    // 남은 글자 수와 진행 횟수를 함께 보여 준다.
    assert.match(progress, /nextRepeatTarget/);
    assert.match(progress, /reward\.repeatCount >= evaluation\.policy\.repeat_bonus_max_count/);
    assert.match(progress, /자 남음/);
});

test('교사 도움말은 설정을 바꿨을 때 이미 낸 글이 어떻게 되는지 세 곳 모두 설명한다', async () => {
    const { TEACHER_GUIDES } = await import('../src/constants/teacherGuides.js');
    const text = (guide) => [
        guide.summary,
        ...(guide.steps || []),
        ...(guide.notes || []),
        ...(guide.sections || []).flatMap((section) => [
            section.summary, ...section.steps, ...section.notes
        ])
    ].join('\n');

    /*
     * 교사가 도중에 포인트를 바꾸면 "이미 낸 글은 어떻게 되나"를 반드시 알아야 한다.
     * 과제·독서록·일기 세 곳 모두에서 안내하고, 최소 글자 수도 함께 고정된다는 것을 적는다.
     */
    const guides = [
        ['선생님 과제', text(TEACHER_GUIDES.dashboard)],
        ['학생 독서록', text(TEACHER_GUIDES['reading-logs'])],
        ['학생 일기', text(TEACHER_GUIDES.diaries)]
    ];
    for (const [label, guide] of guides) {
        assert.match(guide, /포인트 설정을 바꿔도 이미 낸 (글|일기)의 포인트는 달라지지 않습니다/,
            `${label}: 제출 시점 기준 안내가 없다`);
        assert.match(guide, /최소 글자 수를 바꿔도 마찬가지입니다/, `${label}: 최소 글자 수도 고정된다는 안내가 없다`);
    }

    // 다시 낸 글은 그때 설정으로 계산한다는 것도 과제·독서록에 적는다.
    assert.match(text(TEACHER_GUIDES.dashboard), /다시 낸 글은 그때의 설정/);
    assert.match(text(TEACHER_GUIDES['reading-logs']), /다시 낸 때의 설정/);

    // 계산 방식은 예시 표로 설명한다.
    assert.match(text(TEACHER_GUIDES['reading-logs']),
        /300자 100P → 500자 130P → 700자 140P → 900자 150P → 1,100자부터 160P/);
});
