import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('어휘의 탑 교사 학생 현황: 맨 위 탭, 열 때만 RPC 1회, 학생 지도와 같은 원장', async () => {
    const [manager, status, migration] = await Promise.all([
        readFile('src/modules/game/vocab-tower/TeacherManager.jsx', 'utf8'),
        readFile('src/modules/game/vocab-tower/TeacherStudentStatus.jsx', 'utf8'),
        readFile('supabase/migrations/20261366_vocab_tower_teacher_student_status.sql', 'utf8')
    ]);
    assert.match(manager, /\{ id: 'guide', icon: '📘', label: '운영 설명' \},\s*\{ id: 'settings', icon: '⚙️', label: '설정' \},\s*\{ id: 'students', icon: '👥', label: '학생 현황' \}/);
    // 운영 설명과 설정은 다른 갈래 — 설명 상자는 설정 갈래에 섞이지 않는다.
    assert.ok(manager.indexOf("view === 'guide'") < manager.indexOf('vocab-teacher__overview'));
    assert.ok(manager.indexOf("view === 'settings'") > manager.indexOf('vocab-teacher__overview'));
    assert.ok(manager.indexOf("view === 'settings'") < manager.indexOf('vocab-teacher__panel-tabs'));
    assert.match(manager, /view === 'students' && <VocabTeacherStudentStatus classId=\{classId\} \/>/);
    assert.match(status, /rpc\('get_teacher_vocab_tower_student_status_v1', \{ p_class_id: classId \}\)/);
    assert.doesNotMatch(status, /setInterval|\.channel\(/, '학생 현황은 폴링·Realtime 을 쓰지 않는다.');
    // 학생 지도와 같은 상태 이름.
    assert.match(status, /완전히 익힘/);
    assert.match(status, /다시 볼 낱말/);
    // 권한·범위: 담임(또는 관리자)만, 학급 학생 최대 100명, 브라우저 anon 에는 닫힘.
    assert.match(migration, /class\.teacher_id = auth\.uid\(\) AND public\.auth_user_role\(\) = 'TEACHER'\) OR public\.auth_user_role\(\) = 'ADMIN'/);
    assert.match(migration, /LIMIT 100/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_teacher_vocab_tower_student_status_v1\(UUID\) FROM PUBLIC, anon;/);
    for (const ledger of ['learning_item_progress', 'learning_collection_progress', 'learning_challenge_attempts']) {
        assert.match(migration, new RegExp(`public\\.${ledger}`));
    }
});

test('학생 현황 포인트는 지금 탑의 층 익힘 보상만 세고, 예전 탑 일일 미션 보상은 따로 적는다', async () => {
    const [migration, status] = await Promise.all([
        readFile('supabase/migrations/20261367_vocab_tower_status_current_points.sql', 'utf8'),
        readFile('src/modules/game/vocab-tower/TeacherStudentStatus.jsx', 'utf8')
    ]);
    assert.match(migration, /FILTER \(WHERE point_log\.event_key LIKE 'vocab-v2-%'\), 0\)::INTEGER AS vocab_points/);
    assert.match(migration, /'legacy_vocab_points'/);
    assert.match(status, /층 익힘 포인트/);
    assert.match(status, /예전 탑/);
});
