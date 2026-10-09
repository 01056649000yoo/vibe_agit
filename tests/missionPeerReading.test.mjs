import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('선생님만 읽기: 껐다 켜도 댓글 설정은 그대로(끈 동안은 화면이 잠그고 서버가 막는다)', async () => {
    const { peerReadingPatch } = await import('../src/modules/writing/mission-form/peerReading.js');
    assert.deepEqual(peerReadingPatch(false), { peer_reading_enabled: false });
    assert.deepEqual(peerReadingPatch(true), { peer_reading_enabled: true });
    const choice = await readFile('src/modules/writing/mission-form/PeerReadingChoice.jsx', 'utf8');
    assert.match(choice, /checked=\{!locked && Boolean\(allowComments\)\}/, '선생님만일 때 댓글은 꺼진 것으로 보인다');
});

test('과제 만드는 화면 네 곳(일반·편지·보고서·시)이 같은 단추를 쓰고, 저장·불러오기·다시 내기가 값을 옮긴다', async () => {
    const forms = [
        'src/components/teacher/MissionForm.jsx',
        'src/modules/writing/mission-types/letter/LetterMissionForm.jsx',
        'src/modules/writing/mission-types/report/ReportMissionForm.jsx',
        'src/modules/writing/mission-types/poem/PoemMissionForm.jsx'
    ];
    for (const form of forms) {
        const source = await readFile(form, 'utf8');
        assert.match(source, /<PeerReadingChoice/, `${form} 에 선생님만 읽기 단추가 없다`);
        assert.match(source, /peer_reading_enabled/, `${form} 가 값을 다루지 않는다`);
    }
    for (const typeForm of forms.slice(1)) {
        const source = await readFile(typeForm, 'utf8');
        assert.match(source, /peer_reading_enabled: form\.peer_reading_enabled/, `${typeForm} 저장 값에 빠졌다`);
    }
    const manager = await readFile('src/hooks/useMissionManager.js', 'utf8');
    assert.equal((manager.match(/allow_comments, peer_reading_enabled/g) || []).length, 2, '과제 불러오기 두 곳');
    const past = await readFile('src/modules/writing/mission-form/pastMission.js', 'utf8');
    assert.match(past, /peer_reading_enabled/, '내가 낸 과제 다시 내기에 빠졌다');
});

test('서버가 정한다: 과제 글 공개 범위는 과제 설정에서, 설정을 바꾸면 이미 낸 글도 따라간다', async () => {
    const migration = await readFile('supabase/migrations/20261385_mission_teacher_only_reading.sql', 'utf8');
    assert.match(migration, /peer_reading_enabled BOOLEAN NOT NULL DEFAULT TRUE/);
    assert.match(migration, /m\.peer_reading_enabled = FALSE\)\s*THEN 'private'/);
    assert.match(migration, /AFTER UPDATE OF peer_reading_enabled ON public\.writing_missions/);
    assert.match(migration, /visibility IN \('class', 'private'\)/);
    const list = await readFile('supabase/migrations/20261386_student_mission_list_peer_reading.sql', 'utf8');
    assert.match(list, /mission\.peer_reading_enabled/);
    const card = await readFile('src/components/student/MissionList.jsx', 'utf8');
    assert.match(card, /mission\.peer_reading_enabled === false/);
    assert.match(card, /🔒 선생님만 읽어요/);
});

test('과제 만드는 화면 네 곳이 같은 틀(번호 단계 카드·아래 고정 줄·공용 스위치)을 쓴다', async () => {
    const forms = {
        'src/components/teacher/MissionForm.jsx': 4,
        'src/modules/writing/mission-types/letter/LetterMissionForm.jsx': 4,
        'src/modules/writing/mission-types/report/ReportMissionForm.jsx': 4,
        'src/modules/writing/mission-types/poem/PoemMissionForm.jsx': 4
    };
    for (const [form, steps] of Object.entries(forms)) {
        const source = await readFile(form, 'utf8');
        assert.equal((source.match(/<MissionFormStep\s/g) || []).length, steps, `${form} 는 단계 카드 ${steps}개`);
        assert.match(source, /<MissionFormActions/, `${form} 에 아래 고정 줄이 없다`);
        assert.match(source, /<PeerCommentSwitch/, `${form} 의 댓글 켜기가 공용 스위치가 아니다`);
        assert.match(source, /<RubricSettings[\s\S]{0,160}bare[\s\S]{0,160}rubric=/, `${form} 는 루브릭을 rubric= 로 넘긴다(편지가 value= 로 넘겨 켜지지 않던 일)`);
    }
    // 미션 태그는 ④ 평가와 관리 안에 있다(선생님 결정)
    const general = await readFile('src/components/teacher/MissionForm.jsx', 'utf8');
    assert.ok(general.indexOf('🏷️ 미션 태그') > general.indexOf('number={4}'), '미션 태그가 ④ 단계에 있어야 한다');
});

test('친구들에게 열기: 한 번만 열고 닫지 않는다 — 서버가 막고, 승인한 글만 보이고, 알림은 한 번', async () => {
    const migration = await readFile('supabase/migrations/20261388_mission_peer_reading_open.sql', 'utf8');
    assert.match(migration, /peer_reading_opened_at TIMESTAMPTZ/);
    assert.match(migration, /WHEN v_opened_at IS NOT NULL AND NEW\.is_confirmed IS NOT TRUE THEN 'private'/, '연 과제는 승인한 글만');
    assert.match(migration, /UPDATE OF visibility, is_submitted, writing_context, is_confirmed ON public\.student_posts/, '승인하는 순간 보이게');
    assert.match(migration, /peer_reading_locked: 친구들에게 연 과제는 다시 닫을 수 없어요/);
    assert.match(migration, /format\('writing:%s:peer_opened', v_mission\.id\)/, '같은 과제 알림은 한 번');
    assert.match(migration, /v_teacher IS DISTINCT FROM auth\.uid\(\) AND public\.auth_user_role\(\) IS DISTINCT FROM 'ADMIN'/, '담당 선생님만');
    const anyPath = await readFile('supabase/migrations/20261389_mission_peer_reading_open_any_path.sql', 'utf8');
    assert.match(anyPath, /OLD\.peer_reading_enabled IS FALSE AND NEW\.peer_reading_enabled IS TRUE[\s\S]{0,120}clock_timestamp\(\)/, '과제 수정으로 열어도 같은 규칙');

    const { peerReadingLockReason, peerReadingErrorMessage } = await import('../src/modules/writing/mission-form/peerReading.js');
    {
        assert.equal(peerReadingLockReason({ isEditing: false, submittedCount: 5 }), '');
        assert.match(peerReadingLockReason({ isEditing: true, openedAt: '2026-10-09' }), /다시 닫을 수 없어요/);
        assert.match(peerReadingLockReason({ isEditing: true, submittedCount: 1 }), /친구들에게 글 열기/);
        assert.match(peerReadingErrorMessage({ message: 'peer_reading_locked: x' }), /바꿀 수 없어요/);
    }
    const card = await readFile('src/components/teacher/MissionList.jsx', 'utf8');
    assert.match(card, /🔓 친구들에게 글 열기/);
    assert.doesNotMatch(card, /다시 선생님만|친구들에게 닫기/, '닫는 단추를 두지 않는다');
    const notifications = await readFile('src/modules/writing/notifications.js', 'utf8');
    assert.match(notifications, /writing\.peer_reading_opened/);
});
