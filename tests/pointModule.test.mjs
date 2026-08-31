/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POINT_ACTIVITY_TYPES } from '../src/modules/points/pointTypes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const collectSourceFiles = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(target);
        return /\.(js|jsx)$/.test(entry.name) ? [target] : [];
    }));
    return nested.flat();
};

test('화면 코드는 범용 포인트 함수를 직접 호출하지 않는다', async () => {
    const files = await collectSourceFiles(path.join(root, 'src'));
    const offenders = [];
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        if (source.includes("rpc('increment_student_points'")) {
            offenders.push(path.relative(root, file));
        }
    }
    assert.deepEqual(offenders, []);
});

test('공용 포인트 API는 현재 기능별 RPC만 노출한다', async () => {
    const source = await read('src/modules/points/pointApi.js');
    for (const rpc of [
        'approve_assignment_post',
        'bulk_approve_posts',
        'recover_assignment_post_approval',
        'bulk_recover_assignment_posts',
        'teacher_manage_points_bulk',
        'get_teacher_point_manager_snapshot',
        'get_teacher_student_point_history',
        'get_my_point_history_v1',
        'set_meeting_idea_status'
    ]) {
        assert.ok(source.includes(rpc), `${rpc} 호출이 공용 API에 없습니다.`);
    }
});

test('학생 놀이터는 포인트 지갑과 모으기·쓰기 모듈 계약을 사용한다', async () => {
    const playground = await read('src/components/student/AgitPlayground.jsx');
    const dashboard = await read('src/components/student/StudentDashboard.jsx');
    const migration = await read('supabase/migrations/20261026_student_point_history.sql');

    assert.match(playground, /pointApi\.getMyHistory\(\{ limit: 20 \}\)/);
    assert.match(playground, /포인트 모으기/);
    assert.match(playground, /포인트 쓰기/);
    assert.doesNotMatch(playground, /supabase\.(?:from|rpc)\(/);
    assert.match(dashboard, /points=\{points\}[\s\S]*items=\{playgroundItems\}/);

    const dragonManifest = await read('src/modules/game/dragon/manifest.js');
    const vocabManifest = await read('src/modules/game/vocab-tower/manifest.js');
    assert.match(dragonManifest, /economy: 'spend'/);
    assert.match(vocabManifest, /economy: 'earn'/);
    for (const manifest of [dragonManifest, vocabManifest]) {
        assert.match(manifest, /pointLabel:/);
        assert.match(manifest, /ctaLabel:/);
    }

    assert.match(migration, /idx_point_logs_class_student_created/);
    assert.match(migration, /point_log\.class_id = v_class_id[\s\S]*point_log\.student_id = v_student_id/);
    assert.match(migration, /LIMIT v_limit \+ 1/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_my_point_history_v1\(INTEGER\) FROM PUBLIC, anon/);
});

test('과거 댓글 포인트는 원장과 잔액만 보존하고 현재 학생 화면에서는 숨긴다', async () => {
    const playground = await read('src/components/student/AgitPlayground.jsx');
    const footprint = await read('src/modules/writing/writing-footprint/FootprintVisuals.jsx');
    const migration = await read('supabase/migrations/20261182_normalize_historical_comment_point_reasons.sql');
    const hiddenMigration = await read('supabase/migrations/20261215_hide_retired_comment_points.sql');

    assert.doesNotMatch(playground, /comment_reward|친구 댓글 보상/);
    assert.doesNotMatch(footprint, /comment_reward|친구 댓글\(이전 기록\)/);
    assert.match(hiddenMigration, /get_my_writing_footprint_detail_core_v1/);
    assert.match(hiddenMigration, /get_my_point_history_v1/);
    assert.match(hiddenMigration, /'version', 2/);
    assert.match(hiddenMigration, /NOT IN \([\s\S]*'private_adjustment', 'starting_bonus', 'comment_reward'/);
    assert.match(migration, /UPDATE public\.point_logs[\s\S]*SET reason = '친구 댓글 보상 · 이전 기록'[\s\S]*WHERE activity_type = 'comment_reward'/);
    assert.doesNotMatch(migration, /SET\s+(?:amount|activity_type|post_id|student_id)\s*=/i);
});

test('DB 공용 엔진은 event_key 중복 방지와 클라이언트 권한 차단을 갖는다', async () => {
    const migration = await read('supabase/migrations/20261005_assignment_approval_integrity.sql');
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.point_engine_apply/);
    assert.match(migration, /uq_point_logs_student_event_key/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.point_engine_apply[\s\S]*authenticated/);
    assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.point_logs/);
});

test('포인트 활동 유형 계약은 DB 엔진 허용 목록과 같다', async () => {
    const migration = await read('supabase/migrations/20261206_title_season_rewards.sql');
    const pointEngine = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.point_engine_apply'),
        migration.indexOf('REVOKE ALL ON FUNCTION public.point_engine_apply')
    );
    for (const activityType of Object.values(POINT_ACTIVITY_TYPES)) {
        assert.ok(
            pointEngine.includes(`'${activityType}'`),
            `${activityType}이 DB 포인트 엔진 허용 목록에 없습니다.`
        );
    }
    assert.doesNotMatch(pointEngine, /comment_reward/);
});
