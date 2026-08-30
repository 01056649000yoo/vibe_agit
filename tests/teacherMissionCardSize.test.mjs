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
import {
    CARD_SIZE_OPTIONS,
    DEFAULT_CARD_SIZE,
    getCardColumns,
    normalizeCardSize
} from '../src/modules/card-layout/cardSize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('미션 카드 크기는 작게·보통·크게 세 단계와 한 곳의 열 수 기준을 쓴다', () => {
    assert.equal(MISSION_CARD_SIZE_OPTIONS, CARD_SIZE_OPTIONS);
    assert.equal(DEFAULT_MISSION_CARD_SIZE, DEFAULT_CARD_SIZE);
    assert.equal(normalizeMissionCardSize, normalizeCardSize);
    assert.equal(getMissionCardColumns, getCardColumns);
    assert.deepEqual(MISSION_CARD_SIZE_OPTIONS.map((option) => option.id), ['small', 'medium', 'large']);
    assert.equal(DEFAULT_MISSION_CARD_SIZE, 'medium');
    assert.equal(normalizeMissionCardSize('unknown'), 'medium');

    assert.deepEqual(
        MISSION_CARD_SIZE_OPTIONS.map((option) => getMissionCardColumns(option.id)),
        [4, 3, 2]
    );
});

test('예전 압축·5열 이상 설정만 작은 카드로 이어지고 나머지는 보통으로 시작한다', () => {
    assert.equal(migrateLegacyMissionCardSize({ columns: 6, density: 'comfortable' }), 'small');
    assert.equal(migrateLegacyMissionCardSize({ columns: 3, density: 'compact' }), 'small');
    assert.equal(migrateLegacyMissionCardSize({ columns: 4, density: 'comfortable' }), 'medium');
    assert.equal(migrateLegacyMissionCardSize(null), 'medium');
});

test('공통 조절기는 선생님 과제 도움말 옆에 있고 상단 메뉴에는 남지 않는다', async () => {
    const [dashboard, manager, control] = await Promise.all([
        read('src/components/teacher/TeacherDashboard.jsx'),
        read('src/components/teacher/MissionManager.jsx'),
        read('src/modules/card-layout/CardSizeControl.jsx')
    ]);

    assert.doesNotMatch(dashboard, /showsMissionCardSizeControls|MISSION_CARD_SIZE_OPTIONS\.map/);
    assert.match(dashboard, /MISSION_CARD_SIZE_STORAGE_KEY, missionCardSize/);
    assert.match(dashboard, /onMissionCardSizeChange=\{setMissionCardSize\}/);
    assert.match(manager, /<TeacherGuideButton tabId="dashboard" variant="help" \/>[\s\S]*<CardSizeControl/);
    assert.match(manager, /value=\{missionCardSize\}[\s\S]*onChange=\{onMissionCardSizeChange\}[\s\S]*label="미션 카드"/);
    assert.match(control, /role="group"[\s\S]*CARD_SIZE_OPTIONS\.map[\s\S]*aria-pressed/);
    assert.doesNotMatch(control, /teacher|mission|archive/i);
    assert.doesNotMatch(dashboard, /\[3, 4, 5, 6\]\.map|showsWritingLayoutControls|setWritingCardLayout/);
});

test('선생님 과제와 보관함은 같은 크기 프리셋을 받고 모바일은 한 열을 유지한다', async () => {
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

    assert.match(archive, /getCardColumns\(normalizedCardSize\)/);
    assert.match(archive, /gridTemplateColumns: isMobile \? '1fr' : `repeat\(\$\{cardColumns\}/);
    assert.match(archive, /<TeacherGuideButton tabId="archive" variant="help" \/>[\s\S]*<CardSizeControl/);
    assert.match(archive, /label="보관 카드"/);
    assert.match(dashboard, /cardSize=\{missionCardSize\}[\s\S]*onCardSizeChange=\{setMissionCardSize\}/);
});

test('공통 카드 크기 모듈은 새 카드 화면에서 가져다 쓸 수 있게 사용 계약을 문서화한다', async () => {
    const readme = await read('src/modules/card-layout/README.md');

    assert.match(readme, /<CardSizeControl value=\{cardSize\} onChange=\{setCardSize\}/);
    assert.match(readme, /getCardColumns\(cardSize\)/);
    assert.match(readme, /컴포넌트를 빼도 나머지 기능은 유지/);
});
