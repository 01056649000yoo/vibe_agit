import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    buildMissionSchedulePatch,
    formatMissionOpenAt,
    fromMissionScheduleInput,
    getMissionScheduleError,
    getMissionScheduleInputMin,
    getMissionScheduleState,
    isMissionScheduled,
    resolveMissionSchedulePatch,
    MISSION_SCHEDULE_MAX_LEAD_DAYS,
    MISSION_SCHEDULE_MIN_LEAD_MINUTES,
    toMissionScheduleInput,
} from '../src/modules/writing/mission-form/missionSchedule.js';

/*
 * 2026-09-14: 선생님 과제 예약 공개.
 * 시간대를 틀리면 **아침 9시 과제가 밤 9시에 열린다.** 눈으로는 못 잡으므로 값으로 검사한다.
 */
test('선생님이 고른 시각은 기기 시간대와 상관없이 한국 시간 그대로다', () => {
    // 한국 시간 2026-09-15 09:00 = UTC 2026-09-15 00:00
    assert.equal(fromMissionScheduleInput('2026-09-15T09:00'), '2026-09-15T00:00:00.000Z');
    // 자정 넘김: 한국 00:30 은 전날 UTC 15:30
    assert.equal(fromMissionScheduleInput('2026-09-15T00:30'), '2026-09-14T15:30:00.000Z');
    // 되돌리면 고른 값 그대로여야 한다.
    assert.equal(toMissionScheduleInput('2026-09-15T00:00:00.000Z'), '2026-09-15T09:00');
    assert.equal(toMissionScheduleInput('2026-09-14T15:30:00.000Z'), '2026-09-15T00:30');

    // 왕복해도 변하지 않는다(여러 시각으로).
    for (const wall of ['2026-01-01T00:00', '2026-06-30T23:59', '2026-12-31T12:34', '2027-03-01T08:05']) {
        assert.equal(toMissionScheduleInput(fromMissionScheduleInput(wall)), wall, `${wall} 왕복이 어긋난다`);
    }

    assert.equal(fromMissionScheduleInput(''), null);
    assert.equal(fromMissionScheduleInput('2026-09-15'), null, '날짜만으로는 시각을 정할 수 없다');
    assert.equal(toMissionScheduleInput(''), '');
});

/*
 * 위 검사만으로는 **한국 시간대 컴퓨터에서 아무것도 잡지 못한다.**
 * 기기 시간대로 해석해도 한국에서는 우연히 답이 같기 때문이다(2026-09-14에 실제로 겪었다).
 * 그래서 일부러 다른 시간대에서 한 번 더 돌려 본다. 이게 이 파일에서 가장 중요한 검사다.
 */
test('한국 밖 시간대에서 돌려도 고른 한국 시간 그대로다', async () => {
    const { execFileSync } = await import('node:child_process');
    const probe = [
        "const m = await import('./src/modules/writing/mission-form/missionSchedule.js');",
        "process.stdout.write(JSON.stringify({",
        "  parsed: m.fromMissionScheduleInput('2026-09-15T09:00'),",
        "  back: m.toMissionScheduleInput('2026-09-15T00:00:00.000Z'),",
        "  label: m.formatMissionOpenAt('2026-09-15T00:00:00.000Z'),",
        "  offset: new Date().getTimezoneOffset()",
        "}));",
    ].join('\n');

    for (const zone of ['America/New_York', 'Europe/London', 'Pacific/Auckland']) {
        const raw = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
            encoding: 'utf8',
            env: { ...process.env, TZ: zone },
        });
        const result = JSON.parse(raw);
        assert.notEqual(result.offset, -540, `${zone} 에서 시간대가 바뀌지 않았다 — 이 검사가 헛돈다`);
        assert.equal(result.parsed, '2026-09-15T00:00:00.000Z', `${zone} 에서 저장 시각이 밀린다`);
        assert.equal(result.back, '2026-09-15T09:00', `${zone} 에서 입력칸 값이 밀린다`);
        assert.match(result.label, /9:00/, `${zone} 에서 선생님이 보는 시각이 밀린다`);
    }
});

test('예약 시각은 지금보다 뒤여야 하고, 연도 오타는 걸러진다', () => {
    const now = new Date('2026-09-15T00:00:00.000Z'); // 한국 09:00

    assert.equal(getMissionScheduleError('', now), '', '예약을 끄면 검사할 것이 없다');
    assert.equal(getMissionScheduleError('2026-09-15T10:00', now), '', '한 시간 뒤는 정상');

    // 지나간 시각·지금 당장은 막는다. 시계가 1분마다 돌아 그 사이 지나가 버린다.
    assert.match(getMissionScheduleError('2026-09-15T08:00', now), /분 뒤부터/);
    assert.match(getMissionScheduleError('2026-09-15T09:00', now), /분 뒤부터/);
    assert.equal(
        getMissionScheduleError(`2026-09-15T09:0${MISSION_SCHEDULE_MIN_LEAD_MINUTES}`, now),
        '',
        '최소 여유를 딱 채우면 통과해야 한다'
    );

    // 연도를 잘못 친 경우(2206년) 를 잡는다.
    assert.match(getMissionScheduleError('2206-09-15T09:00', now), /일 뒤까지만/);
    assert.ok(MISSION_SCHEDULE_MAX_LEAD_DAYS >= 180, '한 학기는 넘게 잡을 수 있어야 한다');

    // 날짜만 고르고 시간을 안 고른 경우.
    assert.match(getMissionScheduleError('2026-09-15', now), /시간까지/);

    // 입력칸의 가장 이른 값도 같은 규칙을 따른다.
    const min = getMissionScheduleInputMin(now);
    assert.equal(getMissionScheduleError(min, now), '', '입력칸이 제시하는 최소값은 통과해야 한다');
});

test('세 상태는 한 판정으로 갈리고, 저장 값은 DB 제약과 어긋나지 않는다', () => {
    assert.equal(getMissionScheduleState({ open_at: '2026-09-15T00:00:00Z', is_archived: true }), 'scheduled');
    assert.equal(getMissionScheduleState({ open_at: null, is_archived: true }), 'archived');
    assert.equal(getMissionScheduleState({ open_at: null, is_archived: false }), 'open');
    assert.equal(getMissionScheduleState({}), 'open');
    assert.equal(isMissionScheduled({ open_at: '2026-09-15T00:00:00Z' }), true);
    assert.equal(isMissionScheduled({ is_archived: true }), false, '보관은 예약이 아니다');

    /*
     * DB 제약: open_at 이 있으면 반드시 is_archived=TRUE 이고 archived_at=NULL 이다.
     * 화면이 이 셋을 따로 정하면 저장이 거절되므로 한 곳에서 함께 만든다.
     */
    const scheduled = buildMissionSchedulePatch('2026-09-15T09:00');
    assert.equal(scheduled.open_at, '2026-09-15T00:00:00.000Z');
    assert.equal(scheduled.is_archived, true, '예약은 학생에게 숨겨져야 한다');
    assert.equal(scheduled.archived_at, null, '예약은 보관이 아니다');

    const immediate = buildMissionSchedulePatch('');
    assert.deepEqual(immediate, { open_at: null, is_archived: false, archived_at: null });
});

/*
 * 이게 없으면 **보관해 둔 과제를 고치기만 해도 학생에게 다시 열린다.**
 * 예약을 안 쓰는 과제가 대부분이라, 저장할 때마다 is_archived:false 가 딸려 가기 때문이다.
 */
test('고칠 때는 예약이 실제로 달라진 경우에만 공개 상태를 건드린다', () => {
    const archived = { open_at: null, is_archived: true, archived_at: '2026-09-01T00:00:00Z' };
    const open = { open_at: null, is_archived: false, archived_at: null };
    const scheduled = { open_at: '2026-09-15T00:00:00.000Z', is_archived: true, archived_at: null };

    // 예약과 무관한 과제를 고칠 때는 공개 상태를 아예 안 보낸다.
    assert.equal(resolveMissionSchedulePatch({ scheduleInput: '', current: archived, isEditing: true }), null,
        '보관 과제를 고쳤다고 다시 열리면 안 된다');
    assert.equal(resolveMissionSchedulePatch({ scheduleInput: '', current: open, isEditing: true }), null);

    // 예약을 끄면 그때는 지금 열기로 본다.
    assert.deepEqual(
        resolveMissionSchedulePatch({ scheduleInput: '', current: scheduled, isEditing: true }),
        { open_at: null, is_archived: false, archived_at: null }
    );

    // 예약 시각을 바꾸면 새 시각으로 간다.
    const moved = resolveMissionSchedulePatch({ scheduleInput: '2026-09-16T09:00', current: scheduled, isEditing: true });
    assert.equal(moved.open_at, '2026-09-16T00:00:00.000Z');
    assert.equal(moved.is_archived, true);

    // 같은 시각을 다시 저장하면 보낼 것이 없다.
    assert.equal(
        resolveMissionSchedulePatch({ scheduleInput: '2026-09-15T09:00', current: scheduled, isEditing: true }),
        null
    );

    // 새로 만들 때는 늘 보낸다.
    assert.deepEqual(
        resolveMissionSchedulePatch({ scheduleInput: '', current: null, isEditing: false }),
        { open_at: null, is_archived: false, archived_at: null }
    );
    assert.equal(
        resolveMissionSchedulePatch({ scheduleInput: '2026-09-15T09:00', current: null, isEditing: false }).is_archived,
        true
    );
});

test('예약 시각은 선생님이 읽는 한국 시간 표기로 보인다', () => {
    const label = formatMissionOpenAt('2026-09-15T00:00:00.000Z');
    assert.match(label, /9월 15일/);
    assert.match(label, /9:00/);
    assert.doesNotMatch(label, /12:00/, 'UTC 를 그대로 보여 주고 있다');
    assert.equal(formatMissionOpenAt(''), '');
    assert.equal(formatMissionOpenAt('이상한 값'), '');
});

/*
 * 예약을 숨기는 방법은 `is_archived` 하나다. 학생 쪽 조회는 한 줄도 고치지 않는 것이 이 설계의
 * 핵심이므로, 마이그레이션이 그 약속을 지키는지 여기서 함께 본다.
 */
test('예약은 이미 있는 숨김 스위치로만 감추고, 학생 조회는 그대로 둔다', async () => {
    const [migration, cron, smoke] = await Promise.all([
        readFile('supabase/migrations/20261292_scheduled_mission_open_at.sql', 'utf8'),
        readFile('supabase/migrations/20261293_scheduled_mission_cron.sql', 'utf8'),
        readFile('tests/sql/20261292_scheduled_mission_open_at.smoke.sql', 'utf8'),
    ]);

    // "예약됐는데 학생에게 보이는" 상태를 DB 가 막는다. 이 제약이 이 기능의 안전장치다.
    assert.match(migration, /CHECK \(open_at IS NULL OR \(is_archived IS TRUE AND archived_at IS NULL\)\)/);
    // 학생이 표를 직접 읽어도 예약 과제는 걸러진다.
    assert.match(migration, /class_id = public\.auth_user_class_id\(\) AND open_at IS NULL/);
    // 놓친 것을 다음 차례에 따라잡는다. `=` 로 바꾸면 맥미니가 잠깐 꺼졌을 때 영영 안 열린다.
    assert.match(migration, /open_at <= NOW\(\)/);
    assert.doesNotMatch(migration, /open_at = NOW\(\)/);
    // 여는 함수는 브라우저에 열어 주지 않는다.
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.open_due_scheduled_missions_v1\(\) FROM PUBLIC, anon, authenticated/);
    // 교사 목록만 예약분을 함께 싣는다.
    assert.match(migration, /mission\.is_archived IS FALSE OR mission\.open_at IS NOT NULL/);

    // 시계는 1분마다. 다시 적용해도 겹치지 않게 먼저 지운다.
    assert.match(cron, /cron\.unschedule/);
    assert.match(cron, /'open-scheduled-missions',\s*\n?\s*'\* \* \* \* \*'/);
    assert.match(smoke, /open_due_scheduled_missions_v1/);
});

/*
 * 화면 세 곳이 같은 규칙을 쓰는지 본다. 폼에서 고른 값이 저장 경로를 거쳐 카드에 표시되기까지
 * 한 군데라도 다른 판정을 쓰면, 선생님 눈에는 "예약했는데 그냥 열렸다" 로 보인다.
 */
test('예약 칸·저장·카드 표시가 같은 규칙을 쓴다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [form, hook, list, guides] = await Promise.all([
        readFile('src/components/teacher/MissionForm.jsx', 'utf8'),
        readFile('src/hooks/useMissionManager.js', 'utf8'),
        readFile('src/components/teacher/MissionList.jsx', 'utf8'),
        readFile('src/constants/teacherGuides.js', 'utf8'),
    ]);

    // 폼은 공용 규칙으로 검사하고 최소 시각도 같은 곳에서 얻는다.
    assert.match(form, /getMissionScheduleError\(formData\.schedule_at\)/);
    assert.match(form, /min=\{getMissionScheduleInputMin\(\)\}/);
    assert.match(form, /type="datetime-local"/);

    // 저장은 공용 계약을 거친다. 세 칸을 손으로 적으면 DB 제약에 걸린다.
    assert.match(hook, /resolveMissionSchedulePatch\(\{/);
    assert.match(hook, /getMissionScheduleError\(scheduleInput\)/);
    // 지금 열기는 세 칸을 함께 되돌린다.
    assert.match(hook, /open_at: null, is_archived: false, archived_at: null/);

    // 카드는 같은 판정으로 예약을 가른다.
    assert.match(list, /isMissionScheduled\(mission\)/);
    assert.match(list, /formatMissionOpenAt\(mission\.open_at\)/);
    assert.match(list, /학생에게는 아직 안 보여요/);

    // 도움말에도 적는다 — 화면을 고쳤으면 도움말도 같은 커밋에서 고친다.
    assert.match(guides, /예약/);
    assert.match(guides, /정한 시각에 저절로 열기/);
});
