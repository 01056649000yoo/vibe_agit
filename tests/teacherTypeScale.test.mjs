/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * 2026-08-24: 교사 화면 글자가 화면마다 제각각이라 "작다"는 지적을 받았다.
 * 실측하니 CSS 에 서로 다른 크기가 114종, font-size 지정 1,015곳 중 토큰 사용은 37곳뿐이었고
 * 0.8rem 미만이 565곳이었다.
 *
 * ⚠️ 한 화면씩 고치면 **또 흩어진다**. 그래서 이미 옮긴 화면들을 이 검사 하나가 한꺼번에 본다.
 *    여기 있는 파일에 새 하드코딩 rem 이 들어오면 실패한다. 새 화면을 옮길 때 목록에 추가한다.
 */

// 계단으로 옮긴 화면들. 값은 --ui-text-xs~xl 만 쓴다.
const MIGRATED = [
    'src/modules/writing/editor-settings/teacherWritingEditorManager.css',
    'src/modules/writing/spelling-learning/TeacherEntry.css',
    'src/components/teacher/TeacherSettingsHub.jsx',
    'src/components/teacher/TeacherSettingsTab.jsx',
    'src/components/teacher/TeachingToolsHub.jsx',
    'src/components/teacher/ClassManager.jsx',
    'src/modules/community/neighbor-agit/SettingsEntry.jsx'
];

/*
 * 아이콘·이모지는 글자 계단이 아니다. 글이 아니라 그림이라 본문과 같이 커질 필요가 없고,
 * 계단에 끼우면 칸만 넓어진다. 그래서 1.1rem 이상은 아이콘으로 보고 넘긴다.
 * ⚠️ 미리보기 **안**의 학생 화면(`writing-editor-preview-*`)도 뺀다 —
 *    학생에게 보일 크기를 흉내 내는 곳이라 교사 계단으로 키우면 거짓말이 된다.
 */
const ICON_OR_LARGER = 1.1;
const PREVIEW_ONLY = /writing-editor-preview-/;

const findHardCoded = (source) => {
    const hits = [];
    for (const line of source.split('\n')) {
        if (PREVIEW_ONLY.test(line)) continue;
        for (const match of line.matchAll(/font-?[Ss]ize:\s*'?([0-9.]+)rem/g)) {
            if (Number(match[1]) < ICON_OR_LARGER) hits.push(`${match[1]}rem — ${line.trim().slice(0, 72)}`);
        }
    }
    return hits;
};

test('계단으로 옮긴 교사 화면에는 하드코딩한 글자 크기가 없다', async () => {
    for (const path of MIGRATED) {
        const source = await readFile(path, 'utf8');
        const hits = findHardCoded(source);
        assert.deepEqual(hits, [], `${path}: 계단 대신 직접 적은 크기가 있다\n  ${hits.join('\n  ')}`);
    }
});

test('글자 계단은 다섯 단계뿐이고 바닥이 0.8rem이다', async () => {
    const tokens = await readFile('src/styles/design-system.css', 'utf8');
    const steps = [...tokens.matchAll(/--ui-text-(\w+):\s*([0-9.]+)rem/g)].map((m) => [m[1], Number(m[2])]);

    assert.deepEqual(steps.map(([name]) => name), ['xs', 'sm', 'md', 'lg', 'xl'], '계단 이름이나 개수가 달라졌다');
    // 읽어야 하는 글자가 12.8px 밑으로 내려가지 않게 바닥을 고정한다.
    assert.equal(steps[0][1], 0.8, 'xs 바닥이 0.8rem이 아니다');
    // 계단은 항상 커지는 순서여야 한다 — 뒤집히면 화면이 뒤죽박죽이 된다.
    for (let i = 1; i < steps.length; i += 1) {
        assert.ok(steps[i][1] > steps[i - 1][1], `${steps[i][0]}가 ${steps[i - 1][0]}보다 크지 않다`);
    }
});
