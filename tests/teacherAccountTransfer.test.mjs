import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 교사 계정 이관(2026-10-21): 서버 규칙은 tests/sql/20261403 스모크가 본다. 여기서는 화면이 서버 규칙을 우회하지 못하게 한 곳에서만 부르는지,
 * 실행 단추가 점검 통과·확인 문구 일치 때까지 잠겨 있는지, 서버가 새 표를 분류하게 하는지를 본다.
 */
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('확인 문구는 옛 계정 이메일과 같아야 한다(대소문자·앞뒤 공백 무시, 빈 이메일은 불가)', async () => {
    const source = await read('src/components/admin/teacherTransferApi.js');
    // supabase 클라이언트를 가져오는 파일이라 함수 하나만 꺼내 시험한다(서버도 같은 비교를 한다).
    const match = source.match(/export const confirmMatches = ([\s\S]*?);\n/);
    assert.ok(match, 'confirmMatches 가 있어야 합니다.');
    const confirmMatches = new Function(`return ${match[1]}`)();
    assert.equal(confirmMatches('Old@Example.invalid ', 'old@example.invalid'), true);
    assert.equal(confirmMatches('other@example.invalid', 'old@example.invalid'), false);
    assert.equal(confirmMatches('', ''), false);
    assert.equal(confirmMatches('  ', null), false);
});

test('이관 화면은 서버 함수만 부르고, 점검이 통과하고 확인 문구가 맞을 때만 실행할 수 있다', async () => {
    const api = await read('src/components/admin/teacherTransferApi.js');
    for (const name of ['admin_find_teachers_v1', 'admin_transfer_teacher_account_v1', 'admin_list_teacher_transfers_v1']) assert.match(api, new RegExp(name));
    assert.match(api, /p_apply: false/);
    assert.match(api, /p_apply: true, p_confirm: confirm/);
    const panel = await read('src/components/admin/AdminTeacherTransferPanel.jsx');
    assert.match(panel, /result && !result\.applied && result\.can_apply && result\.total_rows > 0 && confirmMatches\(typed, result\.old\?\.email\) && !busy/);
    assert.match(panel, /disabled=\{!canRun\}/);
    assert.doesNotMatch(panel, /supabase\./, '화면이 DB 를 직접 부르면 안 됩니다.');
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');
    assert.match(dashboard, /id: 'transfer', label: '계정 이관'/);
    assert.match(dashboard, /<AdminTeacherTransferPanel \/>/);
});

test('서버 이관 함수는 관리자만, 점검은 되돌리고, 새 표를 분류하게 한다', async () => {
    const sql = await read('supabase/migrations/20261403_teacher_account_transfer.sql');
    assert.match(sql, /auth_user_role\(\) IS DISTINCT FROM 'ADMIN'/);
    assert.match(sql, /transfer-preview-rollback/);
    assert.match(sql, /session_replication_role = replica/);
    assert.match(sql, /teacher_transfer_unclassified_v1/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_transfer_teacher_account_v1\(UUID, UUID, BOOLEAN, TEXT\) FROM PUBLIC, anon/);
    // 같은 옛 계정은 한 번만, 옛 계정은 지우지 않고 승인만 취소한다
    assert.match(sql, /teacher_account_transfers_old_once_idx/);
    assert.doesNotMatch(sql, /DELETE FROM (auth|public)\./);
});

test('옛 계정이 승인 상태이거나 최근 접속했으면 화면이 경고하고, 서버는 이메일이 없는 계정의 실행을 거절한다', async () => {
    const panel = await read('src/components/admin/AdminTeacherTransferPanel.jsx');
    assert.match(panel, /old\.approved \|\| old\.recently_active/);
    assert.match(panel, /최근 30일 안에 로그인했어요/);
    const sql = await read('supabase/migrations/20261403_teacher_account_transfer.sql');
    assert.match(sql, /IF p_apply AND v_old_email = ''/);
    assert.match(sql, /teacher_transfer_missing_parent_v1/);
    assert.match(sql, /FOR KEY SHARE/);
});
