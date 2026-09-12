/**
 * 교사 동행 모드(튜토리얼)의 단일 원본.
 *
 * 안내서(`teacherGuideJourneys.js`)는 "무엇을 하는 흐름인가"를 이미 갖고 있다.
 * 동행 모드는 그 흐름을 **옆에 붙어 다니며 한 단계씩 재생**할 뿐이므로, 제목·설명을
 * 다시 적지 않고 journey 의 단계를 그대로 가리킨다(`stepId`). 여기서 더하는 것은
 * 세 가지뿐이다.
 *
 *   anchor — 화면에서 테두리를 씌울 자리(`data-tour` 값)
 *   hint   — 지금 무엇을 누르면 되는지 한 줄 (안내서의 purpose 는 설명문이라 명령문이 없다)
 *   done   — 다음 단계로 넘어가는 조건
 *
 * `done` 이 두 갈래인 이유: 학급·학생은 만들면 DB 에 남아 자동으로 판정할 수 있지만,
 * "글쓰기 설정 둘러보기" 는 아무것도 바꾸지 않아도 정상이다. 모든 단계를 자동 판정으로
 * 만들면 **설정을 건드리지 않는 교사가 갇힌다**. 그래서 결과가 남지 않는 단계는
 * `확인했어요` 버튼(ack)으로 넘긴다.
 */

import { getTeacherGuideJourney } from './teacherGuideJourneys.js';

/** 화면 요소에 붙이는 이름. 화면 코드와 이 표가 유일한 짝이다. */
export const TEACHER_TOUR_ANCHORS = Object.freeze({
    CLASS_CREATE: 'class-create',
    STUDENT_ADD: 'student-add',
    WRITING_EDITOR_SETTINGS: 'writing-editor-settings'
});

/** `<Button {...tourAnchor(TEACHER_TOUR_ANCHORS.CLASS_CREATE)}>` 처럼 펼쳐 쓴다. */
export const tourAnchor = (anchorId) => ({ 'data-tour': anchorId });

export const TEACHER_TOUR_ANCHOR_SELECTOR = (anchorId) => `[data-tour="${anchorId}"]`;

const tourStep = (stepId, anchor, hint, done) => ({ stepId, anchor, hint, done });

/**
 * 1차는 `처음 시작하기` 하나만 재생한다.
 * 가입한 날 일곱 단계를 연달아 시키면 대부분 중간에 그만둔다. 과제·피드백 흐름은
 * 학급과 학생이 준비된 뒤에 따로 권하는 편이 낫다(2차).
 */
export const TEACHER_TOURS = Object.freeze([
    Object.freeze({
        id: 'getting-started',
        journeyId: 'getting-started',
        steps: Object.freeze([
            tourStep(
                'prepare-class',
                TEACHER_TOUR_ANCHORS.CLASS_CREATE,
                '테두리가 씌워진 버튼을 눌러 올해 맡은 반을 만들어 주세요. 연습이 아니라 실제로 쓰실 학급입니다.',
                Object.freeze({ signal: 'classCount', atLeast: 1 })
            ),
            tourStep(
                'invite-students',
                TEACHER_TOUR_ANCHORS.STUDENT_ADD,
                '학생 이름을 적고 추가를 눌러 보세요. 한 명만 등록해도 다음으로 넘어갑니다.',
                Object.freeze({ signal: 'studentCount', atLeast: 1 })
            ),
            tourStep(
                'prepare-editor',
                TEACHER_TOUR_ANCHORS.WRITING_EDITOR_SETTINGS,
                '학생 글쓰기 화면에 넣을 도움 기능을 켜고 꺼 보세요. 바꾸지 않아도 괜찮습니다.',
                Object.freeze({ ack: true })
            )
        ])
    })
]);

export const getTeacherTour = (tourId) => TEACHER_TOURS.find((tour) => tour.id === tourId) || null;

/**
 * 동행 패널이 실제로 그리는 단계 목록.
 * 제목·설명·이동할 화면은 안내서 원본에서 그대로 읽는다. 여기서 다시 적지 않는다.
 */
export const getTeacherTourSteps = (tourId) => {
    const tour = getTeacherTour(tourId);
    if (!tour) return [];
    const journey = getTeacherGuideJourney(tour.journeyId);
    if (!journey) return [];

    return tour.steps
        .map((step) => {
            const journeyStep = journey.steps.find((candidate) => candidate.id === step.stepId);
            if (!journeyStep) return null;
            return {
                ...step,
                title: journeyStep.title,
                purpose: journeyStep.purpose,
                guideRef: journeyStep.guideRef,
                sectionRef: journeyStep.sectionRef || null,
                target: journeyStep.target || null
            };
        })
        .filter(Boolean);
};

export const TEACHER_TOUR_STATUSES = Object.freeze(['idle', 'running', 'done', 'skipped']);

const normalizeTourEntry = (raw, tourId) => {
    const steps = getTeacherTourSteps(tourId);
    const knownStepIds = steps.map((step) => step.stepId);
    const status = TEACHER_TOUR_STATUSES.includes(raw?.status) ? raw.status : 'idle';
    const completed = Array.isArray(raw?.completed)
        ? knownStepIds.filter((candidateId) => raw.completed.includes(candidateId))
        : [];
    // 사라진 단계 이름이 남아 있으면 첫 단계로 되돌린다. 화면을 개편해도 갇히지 않는다.
    const stepId = knownStepIds.includes(raw?.stepId) ? raw.stepId : (knownStepIds[0] || null);
    return {
        status,
        stepId,
        completed,
        updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null
    };
};

/** DB 에서 읽은 값을 언제나 같은 모양으로 만든다. 열이 비어 있어도 기본값이 나온다. */
export const normalizeTourState = (raw) => {
    const tours = {};
    TEACHER_TOURS.forEach((tour) => {
        Reflect.set(tours, tour.id, normalizeTourEntry(Reflect.get(raw?.tours || {}, tour.id), tour.id));
    });
    return { version: 1, tours };
};

export const getTourEntry = (state, tourId) => Reflect.get(normalizeTourState(state).tours, tourId) || null;

/** 지금 단계가 저절로 끝났는지 본다. ack 단계는 신호로는 끝나지 않는다. */
export const isStepSatisfied = (step, signals = {}) => {
    if (!step?.done || step.done.ack) return false;
    const observed = Reflect.get(signals, step.done.signal);
    if (typeof observed !== 'number') return false;
    return observed >= (step.done.atLeast ?? 1);
};

const withUpdatedAt = (entry, now) => ({ ...entry, updatedAt: now });

/**
 * 상태를 한 번 굴린다. 화면이 아니라 여기서 결정해야 미리보기·검사가 같은 길을 걷는다.
 *
 * action: 'start' | 'complete' | 'skipStep' | 'back' | 'stop'
 */
export const reduceTourState = (state, tourId, action, { now = new Date().toISOString() } = {}) => {
    const next = normalizeTourState(state);
    const entry = Reflect.get(next.tours, tourId);
    const steps = getTeacherTourSteps(tourId);
    if (!entry || !steps.length) return next;

    const index = Math.max(0, steps.findIndex((step) => step.stepId === entry.stepId));
    const currentStep = steps.at(index) || null;

    if (action === 'start') {
        // 이미 끝낸 단계는 건너뛴 자리에서 이어 연다.
        const resumeIndex = steps.findIndex((step) => !entry.completed.includes(step.stepId));
        Reflect.set(next.tours, tourId, withUpdatedAt({
            ...entry,
            status: 'running',
            stepId: steps.at(resumeIndex === -1 ? 0 : resumeIndex).stepId
        }, now));
        return next;
    }

    if (action === 'stop') {
        Reflect.set(next.tours, tourId, withUpdatedAt({ ...entry, status: 'skipped' }, now));
        return next;
    }

    if (action === 'back') {
        Reflect.set(next.tours, tourId, withUpdatedAt({ ...entry, stepId: steps.at(Math.max(0, index - 1)).stepId }, now));
        return next;
    }

    if (action === 'complete' || action === 'skipStep') {
        const completed = action === 'complete' && currentStep && !entry.completed.includes(currentStep.stepId)
            ? [...entry.completed, currentStep.stepId]
            : entry.completed;
        const isLast = index >= steps.length - 1;
        Reflect.set(next.tours, tourId, withUpdatedAt({
            ...entry,
            completed,
            status: isLast ? 'done' : 'running',
            stepId: isLast ? currentStep?.stepId || entry.stepId : steps.at(index + 1).stepId
        }, now));
        return next;
    }

    return next;
};

/** 첫 걸음 카드를 띄울지. 한 번 끝냈거나 스스로 그만둔 교사에게는 다시 권하지 않는다. */
export const shouldOfferTour = (state, tourId) => {
    const entry = getTourEntry(state, tourId);
    return Boolean(entry) && entry.status !== 'done' && entry.status !== 'skipped';
};
