/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_MISSION_CARD_SIZE,
    MISSION_CARD_SIZE_OPTIONS,
    getMissionCardColumns,
    migrateLegacyMissionCardSize,
    normalizeMissionCardSize
} from '../src/modules/writing/mission-card-layout/missionCardLayout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('미션 카드 크기는 작게·보통·크게 세 단계와 한 곳의 열 수 기준을 쓴다', () => {
    assert.deepEqual(MISSION_CARD_SIZE_OPTIONS.map((option) => option.id), ['small', 'medium', 'large']);
    assert.equal(DEFAULT_MISSION_CARD_SIZE, 'medium');
    assert.equal(normalizeMissionCardSize('unknown'), 'medium');

    assert.deepEqual(
        MISSION_CARD_SIZE_OPTIONS.map((option) => getMissionCardColumns(option.id, true)),
        [2, 2, 1]
    );
    assert.deepEqual(
        MISSION_CARD_SIZE_OPTIONS.map((option) => getMissionCardColumns(option.id, false)),
        [4, 3, 2]
    );
});

test('예전 압축·5열 이상 설정만 작은 카드로 이어지고 나머지는 보통으로 시작한다', () => {
    assert.equal(migrateLegacyMissionCardSize({ columns: 6, density: 'comfortable' }), 'small');
    assert.equal(migrateLegacyMissionCardSize({ columns: 3, density: 'compact' }), 'small');
    assert.equal(migrateLegacyMissionCardSize({ columns: 4, density: 'comfortable' }), 'medium');
    assert.equal(migrateLegacyMissionCardSize(null), 'medium');
});

test('상단 조절기는 선생님 과제에서만 보이고 숫자 열 수 대신 크기를 저장한다', async () => {
    const dashboard = await read('src/components/teacher/TeacherDashboard.jsx');

    assert.match(dashboard, /showsMissionCardSizeControls = !isMobile && visibleTab === 'dashboard'/);
    assert.match(dashboard, /aria-label="미션 카드 크기 설정"/);
    assert.match(dashboard, /MISSION_CARD_SIZE_OPTIONS\.map/);
    assert.match(dashboard, /MISSION_CARD_SIZE_STORAGE_KEY, missionCardSize/);
    assert.doesNotMatch(dashboard, /\[3, 4, 5, 6\]\.map|showsWritingLayoutControls|setWritingCardLayout/);
});

test('미션 카드만 크기 프리셋을 받고 모바일은 한 열, 보관함은 자동 반응형으로 분리된다', async () => {
    const [dashboard, hub, tab, manager, missionList, archive] = await Promise.all([
        read('src/components/teacher/TeacherDashboard.jsx'),
        read('src/components/teacher/TeacherWritingHub.jsx'),
        read('src/components/teacher/TeacherMissionTab.jsx'),
        read('src/components/teacher/MissionManager.jsx'),
        read('src/components/teacher/MissionList.jsx'),
        read('src/components/teacher/ArchiveManager.jsx')
    ]);

    for (const source of [dashboard, hub, tab, manager, missionList]) {
        assert.match(source, /missionCardSize/);
    }
    assert.match(missionList, /gridTemplateColumns: isMobile \? '1fr' : `repeat\(\$\{cardColumns\}/);
    assert.match(missionList, /isSmall[\s\S]*isLarge[\s\S]*fontSize: isSmall/);
    assert.doesNotMatch(missionList, /columns >= 5|cardLayout/);

    assert.match(archive, /repeat\(auto-fill, minmax\(240px, 1fr\)\)/);
    assert.doesNotMatch(archive, /cardLayout|isDenseCard/);
    assert.match(dashboard, /<ArchiveManager activeClass=\{activeClass\} isMobile=\{isMobile\} \/>/);
});
