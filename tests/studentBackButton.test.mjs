import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * 학생 화면의 `뒤로 가기`는 메뉴마다 문구가 달라 학생이 매번 다시 읽어야 했다
 * (`뒤로 가기` / `⬅️ 홈으로` / `⬅️ 돌아가기`). 공용 버튼 하나로 통일한 상태를 고정한다.
 */
const [backButton, missionList, readingLog, diary, friendsHideout, labActivities] = await Promise.all([
    readFile('src/components/student/StudentBackButton.jsx', 'utf8'),
    readFile('src/components/student/MissionList.jsx', 'utf8'),
    readFile('src/modules/writing/reading-log/ReadingLogPage.jsx', 'utf8'),
    readFile('src/modules/writing/diary/DiaryPage.jsx', 'utf8'),
    readFile('src/modules/community/friends-hideout/FriendsHideout.jsx', 'utf8'),
    readFile('src/modules/writing/lab-activities/LabActivitiesPage.jsx', 'utf8')
]);

const MENU_SCREENS = Object.freeze([
    { name: '과제 글쓰기', source: missionList },
    { name: '독서록', source: readingLog },
    { name: '일기', source: diary },
    { name: '친구 아지트', source: friendsHideout },
    { name: '글쓰기 연구소', source: labActivities }
]);

test('공용 뒤로가기 버튼은 문구와 모양을 한곳에서 정한다', () => {
    assert.match(backButton, /뒤로 가기/);
    assert.match(backButton, /variant="ghost"/);
    assert.match(backButton, /size="sm"/);
    // 폼 안에서 눌러도 제출되지 않아야 한다.
    assert.match(backButton, /type="button"/);
    // 문구를 바꾸는 옵션을 열면 화면마다 다시 갈라진다.
    assert.doesNotMatch(backButton, /label\s*=/);
});

test('대시보드 메뉴 화면은 모두 같은 뒤로가기 버튼을 쓴다', () => {
    for (const { name, source } of MENU_SCREENS) {
        assert.match(source, /StudentBackButton/, `${name} 화면이 공용 뒤로가기 버튼을 쓰지 않습니다.`);
        assert.match(
            source,
            /<StudentBackButton onClick=\{onBack\}/,
            `${name} 화면의 뒤로가기가 onBack에 연결되지 않았습니다.`
        );
    }
});

test('화면마다 달랐던 옛 뒤로가기 문구는 남지 않는다', () => {
    for (const { name, source } of MENU_SCREENS) {
        assert.doesNotMatch(source, /⬅️ 홈으로/, `${name} 화면에 옛 문구가 남아 있습니다.`);
        assert.doesNotMatch(source, /⬅️ 돌아가기/, `${name} 화면에 옛 문구가 남아 있습니다.`);
    }
});

test('불러오기 중에는 과제 글쓰기·연구소의 뒤로가기를 잠근다', () => {
    assert.match(missionList, /<StudentBackButton onClick=\{onBack\} disabled=\{loading\}/);
    assert.match(labActivities, /<StudentBackButton onClick=\{onBack\} disabled=\{loading\}/);
});
