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
        'set_meeting_idea_status'
    ]) {
        assert.ok(source.includes(rpc), `${rpc} 호출이 공용 API에 없습니다.`);
    }
});

test('DB 공용 엔진은 event_key 중복 방지와 클라이언트 권한 차단을 갖는다', async () => {
    const migration = await read('supabase/migrations/20261005_assignment_approval_integrity.sql');
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.point_engine_apply/);
    assert.match(migration, /uq_point_logs_student_event_key/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.point_engine_apply[\s\S]*authenticated/);
    assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.point_logs/);
});

test('포인트 활동 유형 계약은 DB 엔진 허용 목록과 같다', async () => {
    const migration = await read('supabase/migrations/20261005_assignment_approval_integrity.sql');
    for (const activityType of Object.values(POINT_ACTIVITY_TYPES)) {
        assert.ok(
            migration.includes(`'${activityType}'`),
            `${activityType}이 DB 포인트 엔진 허용 목록에 없습니다.`
        );
    }
});
