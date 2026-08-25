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
    'src/modules/community/neighbor-agit/SettingsEntry.jsx',
    'src/components/teacher/PromptRuleModal.jsx',
    'src/components/teacher/TeacherDashboard.css',
    'src/components/teacher/TeacherEvaluationTab.jsx',
    'src/components/teacher/ActivityReport.jsx',
    'src/components/teacher/teacherComments.css',
    'src/components/teacher/StudentManager.css',
    'src/components/teacher/TeacherStudentAgitViewer.css',
    'src/components/teacher/TeacherStudentAgitPostDetail.css',
    'src/components/teacher/MissionLabQuestionsModal.css',
    'src/components/teacher/MissionLabSourcesModal.css',
    'src/components/teacher/MissionStudentPreview.css',
    'src/modules/writing/writing-footprint/TeacherWritingFootprintDashboard.jsx',
    'src/components/teacher/PostDetailViewer.jsx',
    'src/components/teacher/MissionForm.jsx',
    'src/components/teacher/SubmissionStatusModal.jsx',
    'src/components/teacher/ClassAnalysis.jsx',
    'src/components/teacher/ArchiveManager.jsx',
    'src/components/teacher/EvaluationReport.jsx',
    'src/components/teacher/StudentModals.jsx',
    'src/modules/game/vocab-tower/teacherManager.css',
    'src/modules/game/dragon/TeacherManager.css',
    'src/modules/game/dragon/TeacherWorkshopPreview.css',
    'src/modules/game/dragon/TeacherStagePreview.css',
    // 학생 화면 — 글 위주부터 옮긴다(2026-08-25). 게임 화면은 좁은 칸이 많아 뒤로 미룬다.
    'src/components/student/PostDetailModal.jsx',
    'src/components/student/MyShelfPostDetail.jsx',
    'src/components/student/StudentFeedbackModal.jsx',
    'src/components/student/StudentGuideModal.jsx',
    'src/components/student/MissionList.jsx',
    'src/components/student/StudentWriting.jsx',
    'src/components/student/StudentLogin.jsx',
    'src/components/student/StudentHeader.css',
    'src/components/student/DashboardMenu.css',
    'src/components/student/StudentTodoCard.css',
    'src/components/student/StudentModuleGuide.css',
    'src/components/student/StudentHomeGrowthPanel.css',
    'src/components/student/StudentBottomNav.jsx',
    'src/components/student/ReactionNamesTooltip.jsx',
    'src/components/teacher/TeacherSubmissionBoard.css'
];

/*
 * 아이콘·이모지는 글자 계단이 아니다. 글이 아니라 그림이라 본문과 같이 커질 필요가 없고,
 * 계단에 끼우면 칸만 넓어진다. 그래서 1.1rem 이상은 아이콘으로 보고 넘긴다.
 * ⚠️ 미리보기 **안**의 학생 화면(`writing-editor-preview-*`)도 뺀다 —
 *    학생에게 보일 크기를 흉내 내는 곳이라 교사 계단으로 키우면 거짓말이 된다.
 */
const ICON_OR_LARGER = 1.1;
const DISPLAY_FLOOR = 2;
const PREVIEW_ONLY = /writing-editor-preview-/;
/*
 * ⚠️ 아이콘만 넘기려다 **제목까지 넘어갔다**(2026-08-24, 일부러 되돌려 보고 확인).
 *    화면 제목은 1.5rem 이라 아이콘 기준(1.1rem)보다 커서 그냥 통과했다.
 *    그래서 `h1`~`h6` 이 걸린 줄은 크기와 상관없이 계단을 쓰게 한다.
 */
const HEADING = /<h[1-6][\s>]|\bh[1-6]\s*[,{]|\bh[1-6]\s*$/;

const findHardCoded = (source) => {
    const hits = [];
    for (const line of source.split('\n')) {
        if (PREVIEW_ONLY.test(line)) continue;
        const isHeading = HEADING.test(line);
        for (const match of line.matchAll(/font-?[Ss]ize:\s*'?([0-9.]+)rem/g)) {
            const size = Number(match[1]);
            // 계단의 꼭대기(3xl = 2rem)보다 큰 것은 계단 밖의 전용 표시다 —
            // 학급 코드를 화면 가득 띄우는 8rem 같은 것. 이런 것은 계단에 끼우지 않는다.
            if (size >= DISPLAY_FLOOR) continue;
            if (isHeading || size < ICON_OR_LARGER) {
                hits.push(`${match[1]}rem — ${line.trim().slice(0, 72)}`);
            }
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

test('글자 계단은 일곱 단계뿐이고 바닥이 0.8rem이다', async () => {
    const tokens = await readFile('src/styles/design-system.css', 'utf8');
    const steps = [...tokens.matchAll(/--ui-text-(\w+):\s*([0-9.]+)rem/g)].map((m) => [m[1], Number(m[2])]);

    assert.deepEqual(steps.map(([name]) => name), ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'], '계단 이름이나 개수가 달라졌다');

    /*
     * ⚠️ 글쓰기 연구소(`~/writing-helper`)가 **같은 값을 자기 파일에 적어 두고** 쓴다
     *    (`src/app/globals.css` 의 `@theme`, 저쪽 검사는 `tests/ui-consistency.test.mjs`).
     *    저장소가 달라 서로의 파일을 읽을 수 없으므로 값을 여기서도 못 박는다.
     *    이 숫자를 바꾸면 연구소 쪽도 같은 작업에서 함께 바꾼다.
     */
    assert.deepEqual(steps, [
        ['xs', 0.8], ['sm', 0.9], ['md', 1], ['lg', 1.15], ['xl', 1.35], ['2xl', 1.5], ['3xl', 2]
    ], '계단 값이 달라졌다 — 연구소(writing-helper)의 @theme 도 함께 고쳐야 한다');
    // 계단은 항상 커지는 순서여야 한다 — 뒤집히면 화면이 뒤죽박죽이 된다.
    for (let i = 1; i < steps.length; i += 1) {
        assert.ok(steps[i][1] > steps[i - 1][1], `${steps[i][0]}가 ${steps[i - 1][0]}보다 크지 않다`);
    }
});

/*
 * 2026-08-25: 디자인 시스템은 2026-08-05부터 있었는데 **아무 문서도 그것을 가리키지 않았다.**
 * 그래서 새 화면을 만들 때마다 있는 줄 모르고 값을 새로 적었고 색이 680종에서 1,851종으로 늘었다.
 *
 * ⚠️ 가이드를 글로만 두면 또 잊는다. 이 검사는 **가이드가 실제 코드와 어긋나지 않는지**와
 *    **세션마다 읽는 곳에 규칙이 남아 있는지**를 본다. 문서를 지우거나 계단 값을 바꾸면 걸린다.
 */
test('디자인 가이드가 실제 계단·읽는 자리와 어긋나지 않는다', async () => {
    const [guide, sessionContext, wikiIndex, tokens] = await Promise.all([
        readFile('docs/wiki/DESIGN_GUIDE.md', 'utf8'),
        readFile('SESSION_CONTEXT.md', 'utf8'),
        readFile('docs/wiki/README.md', 'utf8'),
        readFile('src/styles/design-system.css', 'utf8')
    ]);

    // 가이드에 적힌 계단 값이 코드의 값과 같아야 한다. 한쪽만 고치면 여기서 걸린다.
    for (const [step, size] of [['xs', '0.80'], ['sm', '0.90'], ['md', '1.00'],
                                ['lg', '1.15'], ['xl', '1.35'], ['2xl', '1.50'], ['3xl', '2.00']]) {
        assert.ok(guide.includes(`--ui-text-${step}`), `가이드에 ${step} 단계가 없다`);
        assert.ok(guide.includes(`${size}rem`), `가이드의 ${step} 크기(${size}rem)가 빠졌다`);
        // 코드 쪽은 0 을 떼고 적으므로(0.8rem) 숫자만 견준다.
        assert.match(tokens, new RegExp(`--ui-text-${step}:\\s*${Number(size)}rem`),
            `코드의 ${step} 값이 가이드(${size}rem)와 다르다`);
    }

    // ⚠️ 세션마다 자동으로 읽는 곳은 SESSION_CONTEXT 뿐이다. 여기서 빠지면 다음 세션이 모른 채 시작한다.
    assert.match(sessionContext, /UI를 다듬을 땐 값을 화면에서 직접 적지 않는다/);
    assert.match(sessionContext, /docs\/wiki\/DESIGN_GUIDE\.md/);
    // 찾아 읽는 경로도 살아 있어야 한다.
    assert.match(wikiIndex, /DESIGN_GUIDE\.md/);

    // 바닥을 낮추면 아이가 태블릿에서 못 읽는다. 이유를 지우지 않는다.
    assert.match(guide, /바닥이 0\.80rem인 이유/);
});
