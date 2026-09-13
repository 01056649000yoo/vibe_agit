import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ANNOUNCEMENT_VISIBLE_DAYS, announcementVisibleSince } from '../src/constants/announcements.js';

const read = (file) => readFileSync(file, 'utf8');
const hook = read('src/hooks/useAnnouncements.js');
const migration = read('supabase/migrations/20261285_announcement_two_week_window.sql');
const admin = read('src/components/admin/AdminAnnouncementManager.jsx');
const dashboard = read('src/components/teacher/TeacherDashboard.jsx');

test('교사 공지 목록을 만드는 두 곳이 같은 창을 쓴다', () => {
    /*
     * 목록은 두 곳에서 만들어진다 — 로그인 때 한 번에 받는 `get_teacher_app_bootstrap_v1`
     * 과 화면이 직접 부르는 조회. 한쪽만 고치면 **로그인 직후와 새로고침 뒤의 목록이
     * 달라진다.** 숫자가 다른 파일에 살아 있으므로 함께 본다.
     */
    const days = migration.match(/INTERVAL '(\d+) days'/);
    assert.ok(days, '마이그레이션에서 공지 창을 찾지 못했습니다.');
    assert.equal(Number(days[1]), ANNOUNCEMENT_VISIBLE_DAYS,
        `DB 는 ${days[1]}일, 화면은 ${ANNOUNCEMENT_VISIBLE_DAYS}일입니다.`);
    assert.ok(hook.includes('announcementVisibleSince()'), '화면 조회가 공용 창을 쓰지 않습니다.');
    assert.ok(!/INTERVAL '\d+ (day|days)'/.test(hook), '화면에 날짜 수를 따로 적어 두었습니다.');
});

test('창은 날짜 계산이 맞는다', () => {
    const now = Date.parse('2026-09-13T00:00:00.000Z');
    assert.equal(announcementVisibleSince(now), '2026-08-30T00:00:00.000Z');
});

test('관리자 화면은 지난 공지도 본다', () => {
    // 지난 공지도 고치고 지울 수 있어야 한다. 교사 창을 관리 화면에 쓰면 손댈 수 없다.
    assert.ok(!admin.includes('announcementVisibleSince'),
        '관리자 화면에 교사용 2주 창이 걸려 있습니다.');
});

test('가입하고 처음 앉은 자리에서는 공지를 미룬다', () => {
    /*
     * 첫 자리에는 환영 안내·첫 걸음 카드·동행 패널이 이미 겹쳐 뜬다. 여기에 공지 띠와
     * 팝업까지 얹으면 무엇부터 해야 하는지 묻힌다(2026-09-13 사용자 제안).
     */
    assert.match(dashboard, /\{!tour\.isFirstSession && \(\s*<AnnouncementSpotlight/s);
    assert.match(dashboard, /\{!tour\.isFirstSession && announcementSeen\.popupAnnouncement && \(/);
});

test('미룬 공지는 읽음으로 넘기지 않는다', () => {
    // 안 보여 준 공지를 읽은 것으로 적으면 다음 로그인에도 영영 안 보인다.
    const hidden = dashboard.slice(dashboard.indexOf('!tour.isFirstSession'));
    assert.ok(!/markAllSeen\(\)[^)]*isFirstSession/.test(hidden));
    const store = read('src/guides/teacherTour.js');
    // 첫 자리는 시간으로 잰다 — 새로고침 한 번에 공지가 튀어나오면 안 된다.
    assert.match(store, /FIRST_SESSION_QUIET_MS = 30 \* 60 \* 1000/);
    assert.match(store, /now - startedAt < FIRST_SESSION_QUIET_MS/);
});
