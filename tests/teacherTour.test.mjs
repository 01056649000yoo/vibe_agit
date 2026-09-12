import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    TEACHER_TOURS,
    TEACHER_TOUR_ANCHORS,
    getTeacherTourSteps,
    getTourEntry,
    isStepSatisfied,
    normalizeTourState,
    reduceTourState,
    shouldOfferTour
} from '../src/guides/teacherTour.js';
import { getTeacherGuideJourney } from '../src/guides/teacherGuideJourneys.js';

const read = (file) => readFileSync(file, 'utf8');

/*
 * 동행 모드는 **화면의 특정 버튼 위**에 테두리를 씌운다. 그 버튼이 사라지거나 이름표가
 * 빠지면 안내는 그대로 뜨는데 가리키는 곳이 없어진다 — 화면에는 아무 오류도 안 나므로
 * 사람이 눌러 보기 전에는 모른다. 그래서 이름표가 붙은 자리를 검사가 함께 본다.
 */
const ANCHOR_HOSTS = Object.freeze([
    'src/components/teacher/ClassManager.jsx',
    'src/components/teacher/StudentManagerHeader.jsx',
    'src/modules/writing/editor-settings/TeacherWritingEditorManager.jsx'
]);

const anchorSources = ANCHOR_HOSTS.map((file) => ({ file, body: read(file) }));

test('동행 모드가 가리키는 이름표는 모두 실제 화면에 붙어 있다', () => {
    const anchorConstantName = (anchorId) => Object.keys(TEACHER_TOUR_ANCHORS)
        .find((key) => Reflect.get(TEACHER_TOUR_ANCHORS, key) === anchorId);

    TEACHER_TOURS.forEach((tour) => {
        getTeacherTourSteps(tour.id).forEach((step) => {
            const constantName = anchorConstantName(step.anchor);
            assert.ok(constantName, `${step.stepId} 의 이름표 ${step.anchor} 가 TEACHER_TOUR_ANCHORS 에 없습니다.`);
            const used = anchorSources.some(({ body }) => body.includes(`tourAnchor(TEACHER_TOUR_ANCHORS.${constantName})`));
            assert.ok(used, `${step.stepId} 의 이름표(${step.anchor})를 붙인 화면이 없습니다. 화면을 옮겼다면 tourAnchor 도 같이 옮기세요.`);
        });
    });
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
