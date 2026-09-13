import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    FIRST_TEACHER_TOUR_ID,
    markWelcomeSeen,
    moduleAnchorId,
    tabAnchorId,
    toolAnchorId,
    TEACHER_TOURS,
    getNextTourId,
    getTourProgress,
    TOUR_SPOTLIGHT_TARGET,
    TOUR_SPOTLIGHT_SCREEN,
    TOUR_SPOTLIGHT_MENU,
    TEACHER_TOUR_ANCHORS,
    getTeacherTourSteps,
    getTourEntry,
    isStepSatisfied,
    normalizeTourState,
    reduceTourState,
    shouldOfferTour
} from '../src/guides/teacherTour.js';
import { TEACHER_GUIDE_JOURNEYS, getTeacherGuideJourney } from '../src/guides/teacherGuideJourneys.js';
import { TEACHER_NAV_GROUPS } from '../src/constants/teacherNav.js';

const read = (file) => readFileSync(file, 'utf8');

/*
 * 동행 모드는 **화면의 특정 버튼 위**에 테두리를 씌운다. 그 버튼이 사라지거나 이름표가
 * 빠지면 안내는 그대로 뜨는데 가리키는 곳이 없어진다 — 화면에는 아무 오류도 안 나므로
 * 사람이 눌러 보기 전에는 모른다. 그래서 이름표가 붙은 자리를 검사가 함께 본다.
 */
const ANCHOR_HOSTS = Object.freeze([
    'src/components/teacher/ClassManager.jsx',
    'src/components/teacher/StudentManagerHeader.jsx',
    'src/modules/writing/editor-settings/TeacherWritingEditorManager.jsx',
    'src/components/teacher/MissionManager.jsx',
    // 본문 영역(둘러보는 단계가 가리키는 자리)은 대시보드가 붙인다.
    'src/components/teacher/TeacherDashboard.jsx'
]);

/* 메뉴·도구·놀이 목록은 이름을 규칙(`tabAnchorId` 등)으로 붙인다. */
const DERIVED_ANCHOR_HOSTS = Object.freeze([
    ['tab', 'src/components/teacher/TeacherDashboard.jsx', 'tabAnchorId'],
    ['launch', 'src/components/teacher/TeacherDashboard.jsx', 'launchAnchorId'],
    ['section', 'src/components/teacher/TeacherSettingsHub.jsx', 'sectionAnchorId'],
    ['tool', 'src/components/teacher/TeachingToolsHub.jsx', 'toolAnchorId'],
    ['module', 'src/modules/game/teacher/RegisteredGameModuleCards.jsx', 'moduleAnchorId']
]);

const anchorSources = ANCHOR_HOSTS.map((file) => ({ file, body: read(file) }));

test('동행 모드가 가리키는 이름표는 모두 실제 화면에 붙어 있다', () => {
    const anchorConstantName = (anchorId) => Object.keys(TEACHER_TOUR_ANCHORS)
        .find((key) => Reflect.get(TEACHER_TOUR_ANCHORS, key) === anchorId);

    const steps = TEACHER_TOURS.flatMap((tour) => getTeacherTourSteps(tour.id));
    assert.ok(steps.length > 0);

    steps.forEach((step) => {
        // 모든 단계가 가리킬 곳을 갖는다. 하나라도 비면 그 단계는 안내만 뜨고 아무 데도 안 가리킨다.
        assert.ok(step.anchor, `${step.stepId} 에 가리킬 자리가 없습니다.`);

        const constantName = anchorConstantName(step.anchor);
        if (constantName) {
            const used = anchorSources.some(({ body }) => body.includes(`tourAnchor(TEACHER_TOUR_ANCHORS.${constantName})`));
            assert.ok(used, `${step.stepId} 의 이름표(${step.anchor})를 붙인 화면이 없습니다. 화면을 옮겼다면 tourAnchor 도 같이 옮기세요.`);
            return;
        }

        // 손으로 적지 않은 이름표는 메뉴·도구·놀이 목록이 규칙으로 붙여야 한다.
        const kind = step.anchor.split(':')[0];
        const host = DERIVED_ANCHOR_HOSTS.find(([prefix]) => prefix === kind);
        assert.ok(host, `${step.stepId} 의 이름표 ${step.anchor} 를 붙일 화면을 모릅니다.`);
        assert.ok(read(host[1]).includes(`tourAnchor(${host[2]}(`),
            `${host[1]} 이 ${host[2]} 로 이름표를 붙이지 않습니다. 목록을 옮겼다면 이름표도 같이 옮기세요.`);
    });
});

test('이름표 규칙은 화면과 안내가 같은 문자열을 만든다', () => {
    // 규칙이 어긋나면 테두리가 아무 데도 안 붙는데 오류는 나지 않는다.
    assert.equal(tabAnchorId('dashboard'), 'tab:dashboard');
    assert.equal(toolAnchorId('class-board'), 'tool:class-board');
    assert.equal(moduleAnchorId('dragon'), 'module:dragon');
});

test('환영 안내는 한 번 보면 다시 뜨지 않는다', () => {
    /*
     * 가입 직후 안내서를 알리는 창이다. 매번 뜨면 로그인마다 치우고 시작해야 한다.
     */
    const fresh = normalizeTourState(null);
    assert.equal(fresh.welcomeSeenAt, null);
    const seen = markWelcomeSeen(fresh, { now: '2026-09-13T00:00:00.000Z' });
    assert.equal(seen.welcomeSeenAt, '2026-09-13T00:00:00.000Z');
    // 저장했다 다시 읽어도 남아 있어야 한다.
    assert.equal(normalizeTourState(JSON.parse(JSON.stringify(seen))).welcomeSeenAt, '2026-09-13T00:00:00.000Z');
});

test('환영 안내는 학급이 있는 교사에게 뜨지 않는다', () => {
    // 568명이 쓰고 있는 앱이다. 조건이 느슨하면 어느 날 전원에게 환영 인사가 뜬다.
    const hook = read('src/hooks/useTeacherTour.js');
    assert.match(hook, /needsWelcome:[^,]*!state\.welcomeSeenAt[^,]*classes\.length === 0/s);
});

test('학급 목록을 다 받기 전에는 아무 판단도 하지 않는다', () => {
    /*
     * 받는 동안 `classes` 는 빈 배열이라 이미 학급이 있는 선생님도 잠깐 "0개" 로 보인다.
     * 그 틈에 환영 안내가 번쩍이거나 동행 모드가 저절로 켜지면 안 된다.
     */
    const hook = read('src/hooks/useTeacherTour.js');
    assert.match(hook, /const ready = \(!userId \|\| loaded\) && classesLoaded;/);
    const dashboard = read('src/components/teacher/TeacherDashboard.jsx');
    assert.match(dashboard, /classesLoaded: !loadingClasses/);
});

test('첫 학급을 만들면 동행 모드가 이어진다 — 다만 이번 접속에서 늘어난 경우만', () => {
    /*
     * 학급이 생기는 순간 첫 걸음 카드가 사라져(카드는 학급 0개 화면에만 있다) 다시 시작할
     * 길이 없었다. 그렇다고 "학급이 있으면 켠다" 로 두면 쓰고 계신 568명에게 전부 켜진다.
     * 0 → 1 로 **바뀌는 순간**만 잡아야 한다.
     */
    const hook = read('src/hooks/useTeacherTour.js');
    assert.match(hook, /lastClassCountRef/);
    assert.match(hook, /if \(previous !== 0 \|\| classes\.length === 0\) return;/);
    // 이미 따라 했거나 그만둔 사람에게 다시 켜지 않는다.
    assert.match(hook, /if \(!shouldOfferTour\(stateRef\.current, FIRST_TEACHER_TOUR_ID\)\) return;/);
});

test('환영 안내가 안내서에 무엇이 들었는지 실제로 보여 준다', () => {
    // "안내서가 있습니다" 라고만 하면 무엇이 들었는지 몰라 열어 보지 않는다.
    const modal = read('src/components/teacher/TeacherWelcomeModal.jsx');
    assert.match(modal, /journeys\.map\(\(journey\) =>/);
    assert.ok(modal.includes('journey.steps.length'), '흐름마다 몇 단계인지 보여 주어야 합니다.');
    // 나중에 어디서 다시 여는지까지 알려 준다.
    assert.ok(modal.includes('활용 안내서'));
});

test('동행 중에도 그 단계의 안내서를 바로 열 수 있다', () => {
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /onOpenGuide\(tour\.tourId, step\.stepId\)/);
    const dashboard = read('src/components/teacher/TeacherDashboard.jsx');
    assert.match(dashboard, /onOpenGuide=\{\(journeyId, stepId\) => setGuideCenterRequest/);
});

test('안내서의 모든 흐름을 빠짐없이 따라 할 수 있다', () => {
    /*
     * 안내서에만 흐름을 더하고 동행 모드를 잊으면, 교사는 목차에서 본 흐름을
     * `따라 해보기` 로 열 수 없다. 둘은 자동 변환이라 어긋날 수 없어야 한다.
     */
    assert.equal(TEACHER_TOURS.length, TEACHER_GUIDE_JOURNEYS.length);
    TEACHER_GUIDE_JOURNEYS.forEach((journey) => {
        const steps = getTeacherTourSteps(journey.id);
        assert.equal(steps.length, journey.steps.length, `${journey.id} 의 단계 수가 안내서와 다릅니다.`);
        steps.forEach((step) => {
            // 화면으로 옮겨 주지 못하면 "따라 하기"가 아니라 읽기다.
            assert.ok(step.target, `${journey.id}/${step.stepId} 에 열어 줄 화면이 없습니다.`);
        });
    });
});

test('가리킬 곳이 없는 단계는 반드시 확인 버튼으로 넘긴다', () => {
    /*
     * 자동 판정인데 테두리도 없으면 교사는 무엇을 해야 넘어가는지 알 길이 없다.
     * 35단계 대부분은 한 번 보고 가는 단계라 기본이 ack 여야 한다.
     */
    TEACHER_TOURS.forEach((tour) => {
        getTeacherTourSteps(tour.id).forEach((step) => {
            if (step.anchor) return;
            assert.equal(step.done.ack, true,
                `${tour.id}/${step.stepId} 는 테두리 없이 자동 판정이라 교사가 갇힙니다.`);
        });
    });
});

test('흐름을 끝내면 아직 안 본 다음 흐름을 권한다', () => {
    let state = normalizeTourState(null);
    // 첫 흐름을 끝내면 두 번째 흐름을 권한다.
    assert.equal(getNextTourId(state, FIRST_TEACHER_TOUR_ID), TEACHER_TOURS[1].id);

    // 이미 본 흐름은 건너뛴다.
    state = reduceTourState(state, TEACHER_TOURS[1].id, 'start');
    TEACHER_TOURS[1].steps.forEach(() => { state = reduceTourState(state, TEACHER_TOURS[1].id, 'complete'); });
    assert.equal(getNextTourId(state, FIRST_TEACHER_TOUR_ID), TEACHER_TOURS[2].id);

    // 마지막 흐름 뒤에는 권할 것이 없다.
    assert.equal(getNextTourId(state, TEACHER_TOURS.at(-1).id), null);
});

test('동행 모드는 안내서 단계를 가리킬 뿐 제목을 따로 적지 않는다', () => {
    // 제목·설명을 여기서 다시 적으면 안내서만 고쳐졌을 때 두 곳의 말이 달라진다.
    TEACHER_TOURS.forEach((tour) => {
        const journey = getTeacherGuideJourney(tour.journeyId);
        assert.ok(journey, `${tour.id} 가 가리키는 흐름 ${tour.journeyId} 가 안내서에 없습니다.`);
        const steps = getTeacherTourSteps(tour.id);
        assert.equal(steps.length, tour.steps.length,
            `${tour.id} 의 단계 중 안내서에 없는 것이 있습니다.`);
        steps.forEach((step) => {
            const journeyStep = journey.steps.find((candidate) => candidate.id === step.stepId);
            assert.equal(step.title, journeyStep.title);
            assert.deepEqual(step.target, journeyStep.target);
        });
    });
});

test('결과가 남지 않는 단계는 자동 판정을 기다리지 않는다', () => {
    /*
     * "글쓰기 설정 둘러보기"는 아무것도 바꾸지 않아도 정상이다. 자동 판정만 두면
     * 설정을 건드릴 생각이 없는 교사가 그 단계에 갇힌다.
     */
    const steps = getTeacherTourSteps('getting-started');
    const editorStep = steps.find((step) => step.stepId === 'prepare-editor');
    assert.equal(editorStep.done.ack, true);
    assert.equal(isStepSatisfied(editorStep, { classCount: 99, studentCount: 99 }), false);

    const classStep = steps.find((step) => step.stepId === 'prepare-class');
    assert.equal(isStepSatisfied(classStep, { classCount: 0 }), false);
    assert.equal(isStepSatisfied(classStep, { classCount: 1 }), true);
    // 숫자를 못 받았을 때(조회 실패)를 끝난 것으로 보면 안 된다.
    assert.equal(isStepSatisfied(classStep, {}), false);
});

test('해낸 단계는 기록되고 마지막 단계에서 끝난다', () => {
    let state = reduceTourState(normalizeTourState(null), 'getting-started', 'start');
    assert.equal(getTourEntry(state, 'getting-started').stepId, 'prepare-class');

    state = reduceTourState(state, 'getting-started', 'complete');
    assert.equal(getTourEntry(state, 'getting-started').stepId, 'invite-students');
    assert.deepEqual(getTourEntry(state, 'getting-started').completed, ['prepare-class']);

    // 건너뛴 단계는 해낸 것으로 적지 않는다. 나중에 첫 걸음 카드가 ✅ 로 거짓말하면 안 된다.
    state = reduceTourState(state, 'getting-started', 'skipStep');
    assert.deepEqual(getTourEntry(state, 'getting-started').completed, ['prepare-class']);

    state = reduceTourState(state, 'getting-started', 'complete');
    const finished = getTourEntry(state, 'getting-started');
    assert.equal(finished.status, 'done');
    assert.equal(shouldOfferTour(state, 'getting-started'), false);
});

test('그만두면 다시 권하지 않고, 다시 시작하면 못 끝낸 단계부터 연다', () => {
    let state = reduceTourState(normalizeTourState(null), 'getting-started', 'start');
    state = reduceTourState(state, 'getting-started', 'complete');
    state = reduceTourState(state, 'getting-started', 'stop');
    assert.equal(getTourEntry(state, 'getting-started').status, 'skipped');
    assert.equal(shouldOfferTour(state, 'getting-started'), false);

    // 안내서의 `따라 해보기` 로 다시 들어오면 해낸 단계는 건너뛰고 이어 연다.
    state = reduceTourState(state, 'getting-started', 'start');
    assert.equal(getTourEntry(state, 'getting-started').stepId, 'invite-students');
});

test('모르는 단계 이름이 남아 있어도 갇히지 않는다', () => {
    // 화면을 개편해 단계를 지웠는데 교사 계정에 옛 이름이 남아 있는 경우.
    const state = normalizeTourState({
        version: 1,
        tours: { 'getting-started': { status: 'running', stepId: 'gone-step', completed: ['gone-step'] } }
    });
    const entry = getTourEntry(state, 'getting-started');
    assert.equal(entry.stepId, 'prepare-class');
    assert.deepEqual(entry.completed, []);
});

test('진행 상태를 적는 열 이름이 DB 와 화면에서 같다', () => {
    // 같은 값을 두 곳에서 쓰므로 한꺼번에 본다(한 곳만 고치고 끝내지 않는다).
    const migration = read('supabase/migrations/20261281_teacher_tour_state.sql');
    const store = read('src/lib/teacherTourStore.js');
    assert.match(migration, /ADD COLUMN IF NOT EXISTS teacher_tour_state JSONB NOT NULL DEFAULT '\{\}'::JSONB/);
    assert.ok(store.includes("select('teacher_tour_state')"));
    assert.ok(store.includes('update({ teacher_tour_state: next })'));
    // 삭제된 학생까지 세면 명단이 빈 학급에서 단계가 저절로 넘어간다.
    assert.ok(store.includes(".is('deleted_at', null)"));
});

test('짚어 주는 테두리는 앱의 파랑과 달라야 한다', () => {
    /*
     * 2026-09-13 사용자 지적: 앱 전체가 파랑이라 파란 테두리는 묻힌다.
     * 그렇다고 `--ui-danger`(삭제·위험의 색)를 쓰면 "여기를 누르세요" 가 지우는 단추처럼 보인다.
     */
    const css = read('src/components/teacher/TeacherTourCompanion.css');
    const ring = css.slice(css.indexOf('.teacher-tour__ring'), css.indexOf('@media (prefers-reduced-motion'));
    assert.ok(!ring.includes('var(--ui-primary)'), '테두리가 앱의 파랑과 같아 묻힙니다.');
    assert.ok(!ring.includes('var(--ui-danger)'), '삭제·위험의 색은 쓰지 않습니다.');
    assert.ok(ring.includes('var(--ui-accent)'), '테두리 색을 디자인 토큰으로 정하세요.');
});

test('어둡게 덮어도 눌러야 할 버튼은 막히지 않는다', () => {
    /*
     * 테두리만으로는 눈에 안 띈다는 지적에 따라 주변을 어둡게 덮었다(2026-09-13).
     * 하지만 **진짜 덮개를 깔면 정작 눌러야 할 버튼이 막힌다.** 그래서 요소는 그 자리
     * 크기뿐이고 바깥은 그림자로만 그리며, 둘 다 클릭을 통과시킨다.
     */
    const css = read('src/components/teacher/TeacherTourCompanion.css');
    ['__dim', '__ring'].forEach((part) => {
        const block = css.slice(css.indexOf(`.teacher-tour${part} {`));
        assert.match(block.slice(0, block.indexOf('}')), /pointer-events:\s*none/,
            `.teacher-tour${part} 가 클릭을 막습니다.`);
    });
    // 바깥을 덮는 것은 그림자여야 한다. inset:0 같은 진짜 덮개면 클릭이 막힌다.
    assert.match(css, /\.teacher-tour__dim[^}]*box-shadow: 0 0 0 9999px/s);
    const jsx = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.ok(!/className="[^"]*backdrop/.test(jsx),
        '동행 패널에 덮개를 두면 안내가 가리키는 버튼을 누를 수 없습니다.');
});

test('움직임을 줄여 달라는 설정에서는 맥동을 끈다', () => {
    // 맥동이 어지러운 분이 있다. 대신 테두리를 굵게 남긴다.
    const css = read('src/components/teacher/TeacherTourCompanion.css');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(reduced, /animation:\s*none/);
});

test('첫 걸음 카드의 ✅ 는 교사가 누르는 체크가 아니다', () => {
    // 스스로 체크하게 두면 해 놓지 않은 일이 끝난 것으로 남는다.
    const card = read('src/components/teacher/TeacherFirstStepsCard.jsx');
    assert.ok(card.includes('completedStepIds.includes(step.stepId)'));
    assert.ok(!card.includes('type="checkbox"'));
});

test('다 해본 흐름을 다시 열면 처음부터, 자동 판정 없이 둘러본다', () => {
    /*
     * 2026-09-13 제보: 다 하고 안내서에서 `다시 하기` 를 눌러도 다시 해볼 수 없었다.
     *
     * 원인은 자동 판정이었다 — "학급이 하나 이상" 같은 조건이 **이미 충족돼 있어** 단계가
     * 순식간에 지나갔다. 다시 보기는 실제 작업이 아니라 둘러보기이므로, 학급을 또 만들라고
     * 할 수 없다. 자동 판정을 끄고 모든 단계를 `확인했어요` 로 넘긴다.
     */
    let state = reduceTourState(normalizeTourState(null), FIRST_TEACHER_TOUR_ID, 'start');
    getTeacherTourSteps(FIRST_TEACHER_TOUR_ID).forEach(() => {
        state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'complete');
    });
    assert.equal(getTourEntry(state, FIRST_TEACHER_TOUR_ID).status, 'done');

    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'start');
    const entry = getTourEntry(state, FIRST_TEACHER_TOUR_ID);
    assert.equal(entry.status, 'running');
    assert.equal(entry.replay, true, '다시 보기 표시가 없으면 자동 판정이 다시 켜집니다.');
    assert.equal(entry.stepId, getTeacherTourSteps(FIRST_TEACHER_TOUR_ID)[0].stepId, '처음부터 열어야 합니다.');
    assert.deepEqual(entry.completed, [], '진도를 새로 세야 다시 보기가 눈에 보입니다.');
});

test('하다 만 흐름은 다시 열어도 이어서 간다', () => {
    // 다시 보기와 이어 하기는 다르다. 하다 만 것을 처음으로 되돌리면 한 일을 또 시킨다.
    let state = reduceTourState(normalizeTourState(null), FIRST_TEACHER_TOUR_ID, 'start');
    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'complete');
    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'stop');
    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'start');
    const entry = getTourEntry(state, FIRST_TEACHER_TOUR_ID);
    assert.equal(entry.replay, false);
    assert.equal(entry.stepId, getTeacherTourSteps(FIRST_TEACHER_TOUR_ID)[1].stepId);
});

test('다시 보기에서는 훅이 자동 판정을 돌리지 않는다', () => {
    const hook = read('src/hooks/useTeacherTour.js');
    assert.match(hook, /const isReplay = entry\?\.replay === true;/);
    assert.match(hook, /if \(!isRunning \|\| !step \|\| isReplay\) return;/);
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /Boolean\(step\.done\?\.ack\) \|\| tour\.isReplay/);
});

test('안내서 목차에서 어디까지 해봤는지 보인다', () => {
    /*
     * 진도가 안 보이면 여덟 흐름 중 무엇을 아직 안 봤는지 알 수 없다.
     * 다 해본 흐름은 다시 보기로 진도가 0 이 되어도 "다 해봤다" 는 사실이 남아야 한다.
     */
    let state = reduceTourState(normalizeTourState(null), FIRST_TEACHER_TOUR_ID, 'start');
    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'complete');
    let progress = Reflect.get(getTourProgress(state), FIRST_TEACHER_TOUR_ID);
    assert.equal(progress.done, 1);
    assert.equal(progress.total, getTeacherTourSteps(FIRST_TEACHER_TOUR_ID).length);
    assert.equal(progress.hasFinished, false);

    getTeacherTourSteps(FIRST_TEACHER_TOUR_ID).forEach(() => {
        state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'complete');
    });
    assert.equal(Reflect.get(getTourProgress(state), FIRST_TEACHER_TOUR_ID).hasFinished, true);

    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'start');
    progress = Reflect.get(getTourProgress(state), FIRST_TEACHER_TOUR_ID);
    assert.equal(progress.done, 0, '다시 보기는 진도를 새로 센다.');
    assert.equal(progress.hasFinished, true, '다 해봤다는 사실까지 지워지면 안 됩니다.');

    const center = read('src/components/teacher/TeacherGuideCenter.jsx');
    assert.ok(center.includes('progress.done'), '목차에 진도를 그리지 않습니다.');
    assert.ok(center.includes('다 해보셨습니다'), '다 해봤다는 표시가 없습니다.');
    assert.ok(center.includes('동행 모드 다시 보기'), '다 해본 뒤에도 다시 할 길이 있어야 합니다.');
});

test('실행해야 하는 단계는 열리면 작업 영역 전체를 짚는다', () => {
    /*
     * 2026-09-13 제보: `미션 만들기` 를 짚었는데, 그 버튼은 열리면 **같은 자리에서
     * `✖ 닫기` 가 된다.** 그대로 짚고 있으니 "닫기를 누르세요" 처럼 보였다.
     *
     * 여닫이 버튼에는 이름표를 고정해 두면 안 된다 — 열린 뒤에는 **실제로 일하는 자리**
     * (적는 창, 만드는 판) 로 옮겨야 한다.
     */
    const mission = read('src/components/teacher/MissionManager.jsx');
    assert.match(mission, /\{\.\.\.\(isFormOpen \|\| isMissionTypePickerOpen \? \{\} : tourAnchor\(TEACHER_TOUR_ANCHORS\.MISSION_CREATE\)\)\}/,
        '닫기로 바뀌는 버튼이 이름표를 계속 들고 있습니다.');
    assert.match(mission, /\{\.\.\.\(isFormOpen \|\| isMissionTypePickerOpen \? tourAnchor\(TEACHER_TOUR_ANCHORS\.MISSION_CREATE\) : \{\}\)\}/,
        '열린 뒤 짚을 작업 영역이 없습니다.');

    const classes = read('src/components/teacher/ClassManager.jsx');
    assert.match(classes, /isModalOpen \? \{\} : tourAnchor\(TEACHER_TOUR_ANCHORS\.CLASS_CREATE\)/,
        '창이 열렸는데 뒤에 가려진 버튼을 계속 짚습니다.');
    assert.match(classes, /<Card \{\.\.\.tourAnchor\(TEACHER_TOUR_ANCHORS\.CLASS_CREATE\)\}/,
        '학급을 적는 창을 짚지 않습니다.');
});

test('둘러보는 단계는 메뉴를 짚고, 열리면 조용해진다', () => {
    /*
     * 2026-09-13 지적 두 번.
     *   ① 메뉴 버튼만 밝히고 볼 내용을 덮으니 정반대다 → 본문 전체를 둘렀다.
     *   ② 본문 전체를 두르니 **어디를 말하는지 알 수 없다** → 메뉴를 짚되,
     *      그 메뉴가 열리면 덮개를 걷고 설명만 남긴다.
     */
    const steps = TEACHER_TOURS.flatMap((tour) => getTeacherTourSteps(tour.id));
    const dimmed = steps.filter((step) => step.spotlight === TOUR_SPOTLIGHT_TARGET);
    const menus = steps.filter((step) => step.spotlight === TOUR_SPOTLIGHT_MENU);

    assert.deepEqual(dimmed.map((step) => step.stepId).sort(),
        ['class-board', 'create-mission', 'invite-students', 'prepare-class', 'prepare-editor', 'writing-lab'],
        '직접 눌러야 하는 단계 목록이 달라졌습니다.');
    assert.ok(menus.length > 0);
    menus.forEach((step) => {
        assert.match(step.anchor, /^(tab|tool|module|section):/, `${step.stepId} 가 메뉴를 가리키지 않습니다.`);
        /*
         * 못 찾았을 때 본문 전체를 두르는 대비책은 **두지 않는다.** 학급운영도구 안의
         * 도구처럼 한 단계 더 들어가야 보이는 메뉴에서, 지금 열려 있는 **앞 단계 화면**이
         * 통째로 밝아져 "3번인데 4번 화면을 짚는다" 로 보였다(2026-09-13 제보).
         */
        /*
         * 못 찾았을 때 본문 전체를 두르지는 않는다(엉뚱한 화면이 밝아진다). 대신 구역·
         * 도구처럼 한 단계 더 들어가야 보이는 메뉴는 **먼저 눌러야 할 바깥 메뉴**로 물러선다.
         */
        assert.notEqual(step.fallbackAnchor, TEACHER_TOUR_ANCHORS.WORKSPACE,
            `${step.stepId} 가 못 찾았을 때 엉뚱한 화면을 두릅니다.`);
        /*
         * 늘 보이는 것은 **위쪽 묶음 단추뿐**이다. 하위 탭은 그 묶음을 열어야 그려지고,
         * 설정 구역·도구·놀이는 그 화면에 들어가야 나온다. 그 둘은 먼저 누를 곳을
         * 반드시 알려 줘야 한다 — 아니면 다른 화면에서 들어왔을 때 테두리가 통째로
         * 사라진다(2026-09-13 제보 — 3·4·5번 흐름).
         */
        const isGroupEntry = TEACHER_NAV_GROUPS.some((group) => tabAnchorId(group.defaultTab) === step.anchor);
        if (!isGroupEntry) {
            assert.match(String(step.fallbackAnchor), /^tab:/,
                `${step.stepId} 는 다른 화면에서 들어오면 짚을 곳이 없습니다.`);
        }
    });

    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    // 열렸는지는 메뉴가 스스로 표시한다. 따로 상태를 들고 다니면 화면과 어긋난다.
    assert.match(panel, /aria-selected'\) === 'true'/);
    assert.match(panel, /const arrivedAtMenu = step\.spotlight === TOUR_SPOTLIGHT_MENU && rect\.opened;/);
    assert.match(panel, /if \(arrivedAtMenu\) return null;/);
    // 저절로 옮겨 주면 어느 메뉴였는지 기억에 남지 않는다.
    assert.match(panel, /if \(step\.spotlight === TOUR_SPOTLIGHT_MENU\) return;/);
});

test('글쓰기 연구소도 안내서와 동행 모드에 들어 있다', () => {
    /*
     * 2026-09-13 지적: 상단 메뉴에 `🧪 글쓰기 연구소` 가 있는데 안내서에도 동행 모드에도
     * 없었다. 교사가 스스로 찾아 들어가 무엇인지 알아내야 했다.
     */
    const step = TEACHER_TOURS.flatMap((tour) => getTeacherTourSteps(tour.id))
        .find((candidate) => candidate.stepId === 'writing-lab');
    assert.ok(step, '연구소 단계가 없습니다.');
    assert.equal(step.guideRef, 'writing-lab');
    // 새 화면으로 여는 링크라 우리가 대신 눌러 줄 수 없다 — 링크 자리를 또렷이 짚어야 한다.
    assert.equal(step.anchor, 'launch:writing-lab');
    assert.equal(step.spotlight, TOUR_SPOTLIGHT_TARGET);
    assert.deepEqual(step.target, { launch: 'writing-lab' });

    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /step\.target\.launch/, '새 화면으로 여는 단계를 대신 눌러 화면이 사라집니다.');
});

test('교실에 띄우는 화면은 눌러 보는 단계로 둔다', () => {
    // 우리 반 스크린은 말로 들어서는 모른다. 머리말 단추를 짚어 한 번 열어 보게 한다.
    const step = TEACHER_TOURS.flatMap((tour) => getTeacherTourSteps(tour.id))
        .find((candidate) => candidate.stepId === 'class-board');
    assert.equal(step.anchor, TEACHER_TOUR_ANCHORS.CLASS_BOARD_OPEN);
    assert.equal(step.spotlight, TOUR_SPOTLIGHT_TARGET);
    assert.ok(step.hint, '무엇을 누르라는 말이 없습니다.');
});

test('흐름을 새로 열면 "이미 옮겨 줬다" 는 기억을 지운다', () => {
    /*
     * 2026-09-13 제보: 안내서에서 `다시 보기` 를 눌러도 아무 일이 없는 것처럼 보였다.
     * 상태 기계는 1단계로 잘 돌아갔지만, 패널이 "이 단계는 이미 옮겨 줬다" 고 기억하고
     * 있어 **화면이 움직이지 않았다.** 그 기억은 한 회차 안에서만 쓸모가 있다.
     */
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /navigatedStepRef\.current = null;\s*\}, \[tour\.tourId, tour\.isReplay, isRunning\]\);/s,
        '흐름이 바뀌어도 옛 기억이 남아 화면이 안 움직입니다.');
});

test('끝낸 뒤 그만두었어도 다시 보기로 열린다', () => {
    /*
     * 2026-09-13 제보(재발): 다시 보기를 눌러도 전체가 진행되지 않았다.
     *
     * "한 번 끝냈다" 를 `status === 'done'` 으로만 봤기 때문이다. 끝낸 뒤 그만두거나
     * 다른 흐름을 열어 상태가 바뀌면 **이어 하기**로 열리고, 그러면 자동 판정이 켜진 채
     * 열려 과제가 없는 학급의 선생님은 "다 하시면 저절로 넘어갑니다" 앞에서 갇혔다.
     */
    let state = reduceTourState(normalizeTourState(null), FIRST_TEACHER_TOUR_ID, 'start');
    getTeacherTourSteps(FIRST_TEACHER_TOUR_ID).forEach(() => {
        state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'complete');
    });
    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'stop');
    assert.equal(getTourEntry(state, FIRST_TEACHER_TOUR_ID).status, 'skipped');

    state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'start');
    const entry = getTourEntry(state, FIRST_TEACHER_TOUR_ID);
    assert.equal(entry.replay, true, '끝까지 가 본 흐름인데 자동 판정이 켜진 채 열립니다.');
    assert.equal(entry.stepId, getTeacherTourSteps(FIRST_TEACHER_TOUR_ID)[0].stepId);
    assert.equal(Reflect.get(getTourProgress(state), FIRST_TEACHER_TOUR_ID).hasFinished, true);
});

test('끝까지 가 본 사실은 지워지지 않는다', () => {
    // 이것이 지워지면 다시 보기가 이어 하기로 바뀌어 다시 갇힌다.
    let state = reduceTourState(normalizeTourState(null), FIRST_TEACHER_TOUR_ID, 'start');
    getTeacherTourSteps(FIRST_TEACHER_TOUR_ID).forEach(() => {
        state = reduceTourState(state, FIRST_TEACHER_TOUR_ID, 'complete');
    });
    // 저장했다 다시 읽어도, 다시 보기를 시작해 진도가 0 이 되어도 남아야 한다.
    const reloaded = normalizeTourState(JSON.parse(JSON.stringify(state)));
    assert.equal(getTourEntry(reloaded, FIRST_TEACHER_TOUR_ID).everFinished, true);
    const replaying = reduceTourState(reloaded, FIRST_TEACHER_TOUR_ID, 'start');
    assert.equal(getTourEntry(replaying, FIRST_TEACHER_TOUR_ID).everFinished, true);
});

test('이미 끝까지 가 본 흐름은 "이어서" 로 다시 권하지 않는다', () => {
    /*
     * 현재 상태(`done`)로만 보면, 끝낸 뒤 그만둬 `skipped` 가 된 흐름을 "아직 안 봤다" 며
     * 다시 권한다 — 안내서 목차의 ✅ 와 말이 어긋난다.
     */
    let state = normalizeTourState(null);
    const finish = (tourId) => {
        state = reduceTourState(state, tourId, 'start');
        getTeacherTourSteps(tourId).forEach(() => { state = reduceTourState(state, tourId, 'complete'); });
    };
    finish(TEACHER_TOURS[0].id);
    finish(TEACHER_TOURS[1].id);
    state = reduceTourState(state, TEACHER_TOURS[1].id, 'stop');
    assert.equal(getNextTourId(state, TEACHER_TOURS[0].id), TEACHER_TOURS[2].id,
        '이미 본 흐름을 다시 권하고 있습니다.');
});

test('다 둘러본 뒤에도 길이 끊기지 않는다', () => {
    /*
     * 2026-09-13 제보: 마지막 단계를 끝내니 "모든 흐름을 봤다" 며 `나중에` 만 남았다.
     * 맞는 말이지만 거기서 갈 곳이 없다 — 다시 보고 싶은 흐름을 고를 곳으로 보내 준다.
     */
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /tour\.nextTourId \? \(/, '다음 흐름이 없을 때의 길이 없습니다.');
    assert.ok(panel.includes('활용 안내서에서 고르기'), '다 본 뒤 갈 곳을 주지 않습니다.');
    assert.match(panel, /onOpenGuide\(tour\.tourId\)/);
});

test('테두리는 지금 단계의 것일 때만 그린다', () => {
    /*
     * 2026-09-13 제보: 테두리와 오른쪽 아래 설명이 서로 다른 곳을 가리켰다. 중간에
     * 그만두고 다른 흐름을 다시 볼 때 특히 그랬다.
     *
     * 재는 자리를 **이름표에만** 묶어 두었기 때문이다. 설정 다섯 단계가 모두 `tab:settings`
     * 를 쓰는 것처럼 여러 단계가 같은 이름표를 쓰면, 앞 단계의 자리가 그대로 남는다.
     * 어긋난 테두리보다 없는 편이 낫다.
     */
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /const useAnchorRect = \(stepId, anchorId, fallbackAnchorId, isActive\) => \{/);
    assert.match(panel, /measured\?\.stepId === stepId && measured\?\.anchorId === anchorId/);
    assert.match(panel, /useAnchorRect\(step\?\.stepId, step\?\.anchor, step\?\.fallbackAnchor, isRunning\)/);
    // 단계가 바뀌면 다시 잰다.
    assert.match(panel, /\}, \[stepId, anchorId, fallbackAnchorId, isActive\]\);/);
});

test('한 흐름 안에서 서로 다른 단계가 같은 곳을 짚지 않는다', () => {
    /*
     * 2026-09-13 제보: 맞춤법·AI 흐름을 다시 보기로 열면 **설정만** 계속 짚었다.
     * 세 단계가 모두 `설정` 탭을 가리켜 서로 구분되지 않았기 때문이다. 구역이 있으면
     * 구역 메뉴를 짚어야 한다.
     */
    TEACHER_TOURS.forEach((tour) => {
        const steps = getTeacherTourSteps(tour.id);
        const counts = {};
        steps.forEach((step) => { Reflect.set(counts, step.anchor, (Reflect.get(counts, step.anchor) || 0) + 1); });
        Object.entries(counts).forEach(([anchor, count]) => {
            // 같은 화면을 두 단계가 나눠 설명하는 경우(독서록 확인·독서 활동)는 둘까지 봐준다.
            assert.ok(count <= 2,
                `${tour.id}: ${count}개 단계가 모두 ${anchor} 를 짚습니다 — 어느 단계인지 구분되지 않습니다.`);
        });
    });
    const spelling = getTeacherTourSteps('spelling-and-ai').map((step) => step.anchor);
    assert.equal(new Set(spelling).size, spelling.length, '맞춤법·AI 흐름의 세 단계가 같은 곳을 짚습니다.');
});

test('안쪽 메뉴는 먼저 누를 바깥 메뉴를 함께 안다', () => {
    /*
     * 2026-09-13 제보: `AI 피드백 기준 정하기` 에서 하이라이트가 빠졌다. 설정 화면 안의
     * 구역을 짚는데, 대시보드에 있는 동안에는 그 구역 메뉴가 화면에 없어서다.
     */
    const step = TEACHER_TOURS.flatMap((tour) => getTeacherTourSteps(tour.id))
        .find((candidate) => candidate.stepId === 'set-ai-standards');
    assert.equal(step.anchor, 'section:ai-prompts');
    assert.equal(step.fallbackAnchor, 'tab:settings');

    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /findVisibleAnchor\(anchorId\) \|\| findVisibleAnchor\(fallbackAnchorId\)/);
});

test('모든 단계의 이름표가 실제로 그려지는 곳을 가리킨다', () => {
    /*
     * 2026-09-13 전면 재점검. "해당 페이지와 스포트라이트가 맞지 않는다" 는 제보가
     * 거듭됐는데, 뿌리는 늘 같았다 — 이름표는 만들어 두었는데 **그 자리를 그리는 화면이
     * 없거나**, 한 단계 더 들어가야 나오는 메뉴인데 먼저 누를 곳을 알려 주지 않았다.
     * 36단계를 한꺼번에 대조한다.
     */
    const nav = read('src/constants/teacherNav.js');
    const settings = read('src/components/teacher/TeacherSettingsHub.jsx');
    const registry = read('src/modules/registry.js');
    const handWritten = new Set(Object.values(TEACHER_TOUR_ANCHORS));

    const resolves = (anchor) => {
        if (!anchor) return false;
        if (handWritten.has(anchor)) return true;
        const kind = anchor.slice(0, anchor.indexOf(':'));
        const id = anchor.slice(anchor.indexOf(':') + 1);
        if (kind === 'tab') return nav.includes(`id: '${id}'`);
        if (kind === 'launch') return nav.includes(`id: '${id}'`) && nav.includes('launchHref');
        // 설정 구역은 고정 목록이거나 `module:<모듈>` 로 만들어진다.
        if (kind === 'section') {
            return settings.includes(`id: '${id}'`)
                || (id.startsWith('module:') && registry.includes(`/${id.slice('module:'.length)}/manifest`));
        }
        if (kind === 'tool' || kind === 'module') return registry.includes(`/${id}/manifest`);
        return false;
    };

    const problems = [];
    TEACHER_TOURS.forEach((tour) => {
        getTeacherTourSteps(tour.id).forEach((step) => {
            if (!resolves(step.anchor)) problems.push(`${tour.id}/${step.stepId}: 이름표 ${step.anchor} 를 그리는 화면이 없다`);
            if (/^(section|tool|module):/.test(step.anchor) && !step.fallbackAnchor) {
                problems.push(`${tour.id}/${step.stepId}: 한 단계 더 들어가야 보이는데 먼저 누를 곳이 없다`);
            }
            if (step.fallbackAnchor && !resolves(step.fallbackAnchor)) {
                problems.push(`${tour.id}/${step.stepId}: 대비책 ${step.fallbackAnchor} 를 그리는 화면이 없다`);
            }
        });
    });
    assert.deepEqual(problems, []);
});

test('짚어 준 메뉴를 열어야 다음으로 간다 — 다만 갇히지는 않는다', () => {
    /*
     * 2026-09-13 사용자 제안: 스포트라이트를 눌러 보지 않고도 넘어가지면 진행이 되는지
     * 마는지 알 수 없고, 설명과 화면이 계속 어긋난다. 열어야 넘어가게 한다.
     * 다만 어떤 사정으로 못 여는 교사가 갇히면 안 되므로 `건너뛰기` 는 늘 열어 둔다.
     */
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /\{isMenuStep && !arrived \? \(/,
        '열지 않아도 다음으로 넘어갑니다.');
    assert.ok(panel.includes('메뉴를 열면 다음으로 갈 수 있어요'));
    // 탈출구는 조건 없이 늘 있어야 한다.
    assert.match(panel, /<button type="button" onClick=\{tour\.skipStep\}>이 단계 건너뛰기<\/button>/);
});

test('열렸다고 알릴 수 없는 자리에서도 갇히지 않는다', () => {
    /*
     * 2026-09-13 제보: 작가 수호룡 운영에서 스포트라이트가 놀이 카드를 짚는데, 그 카드는
     * 눌러도 "열렸다" 고 알리지 못해 **다음으로 갈 수 없었다.**
     *
     * 카드가 스스로 알리게 고쳤고, 그것과 별개로 **누른 사실 자체**를 함께 본다.
     * 표시를 달 수 없는 자리를 새로 짚게 되더라도 갇히지 않는다.
     */
    const cards = read('src/modules/game/teacher/RegisteredGameModuleCards.jsx');
    assert.match(cards, /aria-current=\{selectedId === module\.id \? 'page' : undefined\}/);

    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /clickedRef\.current = stepId;/);
    assert.match(panel, /opened: isOpenedMenu\(element\) \|\| clickedRef\.current === stepId,/);
});

test('새 화면으로 떠나는 단계는 눌러야 하는 것처럼 보이지 않는다', () => {
    /*
     * 2026-09-13 제보: 연구소 메뉴에 스포트라이트가 있어 꼭 눌러야 할 것 같은데,
     * 누르면 **새 화면으로 떠나 동행 모드가 끊긴다.** 어디 있는지만 알려 주고
     * 읽은 뒤 넘어가게 한다.
     */
    const step = TEACHER_TOURS.flatMap((tour) => getTeacherTourSteps(tour.id))
        .find((candidate) => candidate.stepId === 'writing-lab');
    assert.equal(step.done.ack, true, '새 화면으로 떠나는 단계를 자동 판정으로 두면 갇힙니다.');
    assert.ok(step.hint.includes('동행 모드가 끊기'), '누르면 어떻게 되는지 알려 주지 않습니다.');
});

test('놀이 단계는 늘 보이는 좌측 메뉴를 짚는다', () => {
    /*
     * 2026-09-13 제보 두 번.
     *   ① 학생 대시보드 **미리보기 카드**를 짚었다 — 보여 주기만 할 뿐 눌러도 열리지 않는다.
     *   ② 그다음 `전체 현황` 의 목록으로 옮겼더니 **모듈을 열면 그 목록이 사라져** 불안정했다.
     * 늘 보이는 것은 왼쪽 메뉴(`navStyle`)뿐이다. 이름표는 거기 하나만 있어야 한다.
     */
    const cards = read('src/modules/game/teacher/RegisteredGameModuleCards.jsx');
    const anchors = [...cards.matchAll(/tourAnchor\(moduleAnchorId\(module\.id\)\)/g)];
    assert.equal(anchors.length, 1, '같은 이름표가 여러 곳에 있으면 어디를 짚을지 흔들립니다.');
    const anchorAt = cards.indexOf('tourAnchor(moduleAnchorId(module.id))');
    const navAt = cards.indexOf('navStyle(selectedId === module.id, isMobile)');
    assert.ok(navAt > 0 && Math.abs(navAt - anchorAt) < 400, '이름표가 좌측 메뉴에 붙어 있지 않습니다.');
    assert.match(cards, /aria-current=\{selectedId === module\.id \? 'page' : undefined\}/);
});


test('패널을 접어 화면을 볼 수 있다', () => {
    /*
     * 2026-09-13 제보: 패널이 오른쪽 아래를 늘 차지해 **그 뒤에 볼 내용이 있으면 답답하다.**
     * 접으면 작은 알약만 남고, 덮개와 테두리도 함께 걷는다 — 접었는데 화면이 어두우면
     * 접은 뜻이 없다.
     */
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.match(panel, /if \(collapsed\) \{/);
    assert.match(panel, /teacher-tour__pill/);
    // 접기 판단이 덮개·테두리를 그리는 곳보다 **앞에** 있어야 함께 걷힌다.
    assert.ok(panel.indexOf('if (collapsed) {') < panel.indexOf('teacher-tour__dim'),
        '접어도 화면이 어두운 채로 남습니다.');
    // 접은 상태는 그 사람 브라우저에만 남긴다.
    assert.match(panel, /window\.localStorage\.setItem\(COLLAPSED_KEY/);
});

test('접기 단추는 글자로 무엇인지 알려 준다', () => {
    // 아이콘만으로는 접는 단추인지 모른다는 제보(2026-09-13).
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.ok(panel.includes('접어 두기'), '접기 단추에 글자가 없습니다.');
    assert.ok(panel.includes('안내 다시 펴기'), '접힌 알약이 무엇인지 알려 주지 않습니다.');
});
