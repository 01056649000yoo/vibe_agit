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
    TEACHER_TOUR_ANCHORS,
    getTeacherTourSteps,
    getTourEntry,
    isStepSatisfied,
    normalizeTourState,
    reduceTourState,
    shouldOfferTour
} from '../src/guides/teacherTour.js';
import { TEACHER_GUIDE_JOURNEYS, getTeacherGuideJourney } from '../src/guides/teacherGuideJourneys.js';

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
    'src/components/teacher/MissionManager.jsx'
]);

/* 메뉴·도구·놀이 목록은 이름을 규칙(`tabAnchorId` 등)으로 붙인다. */
const DERIVED_ANCHOR_HOSTS = Object.freeze([
    ['tab', 'src/components/teacher/TeacherDashboard.jsx', 'tabAnchorId'],
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

test('동행 패널은 화면을 덮지 않는다', () => {
    /*
     * 덮개를 씌우면 정작 눌러야 할 버튼이 막힌다. 안내서 모달과 다른 점이 이것이라
     * 검사로 못 박아 둔다.
     */
    const css = read('src/components/teacher/TeacherTourCompanion.css');
    assert.match(css, /\.teacher-tour__ring[^}]*pointer-events:\s*none/s);
    const jsx = read('src/components/teacher/TeacherTourCompanion.jsx');
    assert.ok(!/className="[^"]*backdrop/.test(jsx),
        '동행 패널에 덮개를 두면 안내가 가리키는 버튼을 누를 수 없습니다.');
});

test('첫 걸음 카드의 ✅ 는 교사가 누르는 체크가 아니다', () => {
    // 스스로 체크하게 두면 해 놓지 않은 일이 끝난 것으로 남는다.
    const card = read('src/components/teacher/TeacherFirstStepsCard.jsx');
    assert.ok(card.includes('completedStepIds.includes(step.stepId)'));
    assert.ok(!card.includes('type="checkbox"'));
});
