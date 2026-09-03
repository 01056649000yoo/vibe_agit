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
