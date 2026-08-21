/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

/*
 * 2026-08-21 사용자 지적: "공지가 클릭하고 들어가서 봐야만 알게 되어 있고, 새 공지를 해도
 * 눈에 잘 띄지 않는다." 머리말의 작은 버튼 하나가 전부였기 때문이다.
 */
test('안 읽은 공지는 대시보드 위에 내용까지 펼쳐 보인다', async () => {
    const [dashboard, spotlight] = await Promise.all([
        read('src/components/teacher/TeacherDashboard.jsx'),
        read('src/components/teacher/AnnouncementSpotlight.jsx')
    ]);

    // 띠는 머리말 바로 아래, 업무 메뉴 위에 있어야 한다. 아래로 밀리면 또 안 보인다.
    const headerToNav = dashboard.slice(
        dashboard.indexOf('</header>'),
        dashboard.indexOf('교사 업무 영역 네비게이션')
    );
    assert.ok(headerToNav.includes('<AnnouncementSpotlight'), '띠가 머리말과 업무 메뉴 사이에 없다');

    // 제목만이 아니라 본문을 함께 그린다.
    assert.ok(spotlight.includes('{isExpanded || !needsMore ? body : `${body.slice(0, PREVIEW_LENGTH)}...`}'));
    // 펼치기는 그 자리에서 한다. 창을 새로 열면 예전과 같아진다.
    assert.ok(spotlight.includes("{isExpanded ? '접기' : '더 보기'}"));
    // 다 읽으면 사라진다. 읽은 공지까지 자리를 차지하면 곧 눈에 안 들어온다.
    assert.ok(spotlight.includes('if (unread.length === 0) return null;'));
});

test('팝업 설정이 실제로 동작한다', async () => {
    const [hook, components, dashboard, migration] = await Promise.all([
        read('src/hooks/useAnnouncements.js'),
        read('src/components/teacher/AnnouncementComponents.jsx'),
        read('src/components/teacher/TeacherDashboard.jsx'),
        read('supabase/migrations/20261149_teacher_bootstrap_announcement_popup.sql')
    ]);

    // 세 곳 중 하나라도 is_popup 을 빠뜨리면 설정이 다시 헛돈다.
    // ⚠️ 그냥 /is_popup/ 로 보면 **주석에 있는 글자**에 걸려 통과한다. 실제 select 문을 본다.
    assert.match(hook, /\.select\('[^']*is_popup[^']*'\)/, '화면 조회의 select 에 is_popup 이 없다');
    assert.match(migration, /target_role, is_popup FROM public\.announcements/, '부트스트랩에 is_popup 이 없다');
    assert.ok(components.includes('export { AnnouncementListModal, AnnouncementModal };'), '팝업 창이 내보내지지 않았다');
    assert.ok(dashboard.includes('<AnnouncementModal'), '팝업 창이 어디에도 그려지지 않는다');

    // 만들어 두고 아무 데서도 쓰지 않던 배너는 걷어냈다.
    assert.doesNotMatch(components, /const AnnouncementBanner/, '죽은 배너가 남아 있다');
});

test('읽음은 공지별로 센다', async () => {
    const seen = await read('src/components/teacher/useAnnouncementSeen.js');

    // 예전에는 "최신 공지 ID 하나"만 저장해, 목록을 한 번 열면 밀린 공지가 전부 읽음이 됐다.
    assert.ok(seen.includes('announcements.filter((item) => !seenIds.includes(String(item.id)))'));
    assert.match(seen, /MAX_REMEMBERED/, '기억할 개수 상한이 없으면 저장소가 계속 커진다');

    // 팝업은 안 읽었고 `다시 보지 않기` 를 누르지 않은 것만, 그것도 한 번에 하나만 띄운다.
    assert.ok(seen.includes("unread.find((item) => item.is_popup && !hiddenPopupIds.includes(String(item.id)))"));

    // 저장소가 막힌 환경에서도 화면이 죽으면 안 된다.
    assert.match(seen, /catch \{[\s\S]*?return \[\];/);
});
