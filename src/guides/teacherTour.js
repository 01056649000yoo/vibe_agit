/**
 * 교사 동행 모드(튜토리얼)의 단일 원본.
 *
 * 안내서(`teacherGuideJourneys.js`)는 "무엇을 하는 흐름인가"를 이미 갖고 있다.
 * 동행 모드는 그 흐름을 **옆에 붙어 다니며 한 단계씩 재생**할 뿐이므로, 제목·설명을
 * 다시 적지 않고 안내서의 8개 흐름 35단계를 **그대로 변환**한다. 단계를 손으로 옮겨
 * 적으면 안내서만 고쳐졌을 때 둘의 말이 달라진다.
 *
 * 단계마다 더하는 것은 세 가지뿐이고, 셋 다 **없어도 된다**.
 *
 *   anchor — 화면에서 테두리를 씌울 자리(`data-tour` 값). 가리킬 버튼이 분명한 단계에만.
 *   hint   — 지금 무엇을 누르면 되는지 한 줄. 없으면 안내서의 설명만 보여 준다.
 *   done   — 다음으로 넘어가는 조건. 기본은 `확인했어요`(ack) 다.
 *
 * **기본이 ack 인 이유**: 35단계 대부분은 "이런 화면이 있다"를 한 번 보고 가는 단계다.
 * 그런 단계까지 자동 판정으로 두면 아무것도 바꿀 생각이 없는 교사가 갇힌다. 결과가 DB 에
 * 남는 네 단계(학급·학생·과제)만 실제 데이터로 저절로 넘어간다.
 */

import { TEACHER_GUIDE_JOURNEYS, getTeacherGuideJourney } from './teacherGuideJourneys.js';

/** 화면 요소에 붙이는 이름. 화면 코드와 이 표가 유일한 짝이다. */
export const TEACHER_TOUR_ANCHORS = Object.freeze({
    CLASS_CREATE: 'class-create',
    STUDENT_ADD: 'student-add',
    WRITING_EDITOR_SETTINGS: 'writing-editor-settings',
    MISSION_CREATE: 'mission-create',
    // 화면 본문 전체. "이 화면을 둘러보세요" 단계가 가리키는 자리다.
    WORKSPACE: 'workspace',
    // 머리말의 `우리 반 스크린` 단추. 교실에 띄우는 화면은 눌러 봐야 안다.
    CLASS_BOARD_OPEN: 'class-board-open'
});

/** `<Button {...tourAnchor(TEACHER_TOUR_ANCHORS.CLASS_CREATE)}>` 처럼 펼쳐 쓴다. */
export const tourAnchor = (anchorId) => ({ 'data-tour': anchorId });

export const TEACHER_TOUR_ANCHOR_SELECTOR = (anchorId) => `[data-tour="${anchorId}"]`;

/*
 * 35단계마다 이름표를 손으로 적지 않는다.
 *
 * 단계는 이미 "어느 화면으로 가는가"(`target`)를 갖고 있고, 그 화면으로 가는 **메뉴 항목**은
 * 화면에 그려져 있다. 그래서 메뉴·도구·놀이 목록에 이름을 규칙대로 붙여 두고, 단계는
 * 자기 target 에서 이름을 계산한다. 손으로 적는 이름표는 "메뉴가 아니라 그 안의 특정
 * 버튼"을 가리켜야 하는 네 단계뿐이다(학급 만들기·학생 추가·글쓰기 설정·과제 만들기).
 */
export const tabAnchorId = (tabId) => `tab:${tabId}`;
export const toolAnchorId = (toolId) => `tool:${toolId}`;
export const moduleAnchorId = (moduleId) => `module:${moduleId}`;
export const launchAnchorId = (groupId) => `launch:${groupId}`;

const deriveAnchor = (target) => {
    if (!target) return null;
    if (target.launch) return launchAnchorId(target.launch);
    if (target.tool) return toolAnchorId(target.tool);
    if (target.module) return moduleAnchorId(target.module);
    if (target.tab) return tabAnchorId(target.tab);
    return null;
};

/*
 * 짚는 방식은 두 가지다.
 *
 *   'target' — 눌러야 할 자리가 분명한 단계. 주변을 어둡게 덮고 그 자리만 남긴다.
 *   'screen' — "이 화면을 한 번 둘러보세요" 단계. **덮지 않는다.**
 *
 * 둘러보는 단계까지 덮으면 정반대가 된다 — 봐야 할 내용이 어두워지고 작은 메뉴 버튼만
 * 밝아진다(2026-09-13 점검에서 35단계 중 28단계가 이랬다). 그런 단계는 본문 영역을
 * 옅은 테두리로만 둘러 "여기를 보세요" 라고 말한다.
 */
export const TOUR_SPOTLIGHT_TARGET = 'target';
export const TOUR_SPOTLIGHT_SCREEN = 'screen';

const ACK = Object.freeze({ ack: true });

/**
 * 기본(둘러보고 `확인했어요`)에서 벗어나는 단계만 적는다.
 * 여기 없는 단계는 화면만 열어 주고 안내서 설명을 보여 준다.
 */
const STEP_RULES = Object.freeze({
    'prepare-class': Object.freeze({
        anchor: TEACHER_TOUR_ANCHORS.CLASS_CREATE,
        hint: '테두리가 씌워진 버튼을 눌러 올해 맡은 반을 만들어 주세요. 연습이 아니라 실제로 쓰실 학급입니다.',
        done: Object.freeze({ signal: 'classCount', atLeast: 1 })
    }),
    'invite-students': Object.freeze({
        anchor: TEACHER_TOUR_ANCHORS.STUDENT_ADD,
        hint: '학생 이름을 적고 추가를 눌러 보세요. 한 명만 등록해도 다음으로 넘어갑니다.',
        done: Object.freeze({ signal: 'studentCount', atLeast: 1 })
    }),
    'prepare-editor': Object.freeze({
        anchor: TEACHER_TOUR_ANCHORS.WRITING_EDITOR_SETTINGS,
        hint: '학생 글쓰기 화면에 넣을 도움 기능을 켜고 꺼 보세요. 바꾸지 않아도 괜찮습니다.'
    }),
    'class-board': Object.freeze({
        anchor: TEACHER_TOUR_ANCHORS.CLASS_BOARD_OPEN,
        hint: '머리말의 `우리 반 스크린`을 눌러 교실에 띄울 화면을 한 번 열어 보세요. 새 창으로 크게 열립니다.'
    }),
    'create-mission': Object.freeze({
        anchor: TEACHER_TOUR_ANCHORS.MISSION_CREATE,
        hint: '테두리가 씌워진 버튼으로 글 종류를 고르고 과제를 하나 만들어 보세요. 만들면 다음으로 넘어갑니다.',
        done: Object.freeze({ signal: 'missionCount', atLeast: 1 })
    })
});

/**
 * 안내서의 흐름 8개를 그대로 동행 모드로 만든다.
 * 안내서에 단계를 더하면 동행 모드에도 저절로 생긴다 — 두 곳을 맞출 일이 없다.
 */
export const TEACHER_TOURS = Object.freeze(TEACHER_GUIDE_JOURNEYS.map((journey) => Object.freeze({
    id: journey.id,
    journeyId: journey.id,
    steps: Object.freeze(journey.steps.map((journeyStep) => {
        const rule = Reflect.get(STEP_RULES, journeyStep.id) || {};
        return Object.freeze({
            stepId: journeyStep.id,
            anchor: rule.anchor || null,
            hint: rule.hint || null,
            done: rule.done || ACK
        });
    }))
})));

export const FIRST_TEACHER_TOUR_ID = TEACHER_TOURS[0].id;

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
            /*
             * 손으로 적은 이름표가 있으면 눌러야 할 자리가 분명한 단계다. 없으면 화면만
             * 열어 주고 둘러보는 단계이므로 본문 영역을 가리킨다 — 메뉴 버튼을 짚어 봐야
             * 정작 볼 내용이 어두워질 뿐이다. 메뉴 이름표는 본문을 못 찾았을 때의 대비책.
             */
            /*
             * 새 화면으로 여는 단계(연구소)는 **그 링크를 눌러야** 진행된다. 화면을 옮겨
             * 주지 못하므로 본문이 아니라 링크 자리를 또렷이 짚어야 한다.
             */
            const mustClick = Boolean(step.anchor) || Boolean(journeyStep.target?.launch);
            const derived = deriveAnchor(journeyStep.target);
            return {
                ...step,
                spotlight: mustClick ? TOUR_SPOTLIGHT_TARGET : TOUR_SPOTLIGHT_SCREEN,
                anchor: step.anchor || (journeyStep.target?.launch ? derived : TEACHER_TOUR_ANCHORS.WORKSPACE),
                fallbackAnchor: mustClick ? null : derived,
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
        /*
         * 다시 보기 중인가.
         *
         * 한 번 끝낸 흐름을 다시 열면 "학급이 하나 이상" 같은 조건은 **이미 충족돼 있어**
         * 단계가 순식간에 통과해 버린다. 그래서 다시 보기에서는 자동 판정을 끄고 모든
         * 단계를 `확인했어요` 로 넘긴다 — 학급을 또 만들라는 뜻이 아니라 둘러보는 것이다.
         */
        replay: raw?.replay === true,
        updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null
    };
};

/** DB 에서 읽은 값을 언제나 같은 모양으로 만든다. 열이 비어 있어도 기본값이 나온다. */
export const normalizeTourState = (raw) => {
    const tours = {};
    TEACHER_TOURS.forEach((tour) => {
        Reflect.set(tours, tour.id, normalizeTourEntry(Reflect.get(raw?.tours || {}, tour.id), tour.id));
    });
    return {
        version: 1,
        // 가입 직후 한 번 뜨는 환영 안내를 봤는지. 흐름별이 아니라 교사당 하나다.
        welcomeSeenAt: typeof raw?.welcomeSeenAt === 'string' ? raw.welcomeSeenAt : null,
        // 대시보드에 처음 들어온 시각. 첫 자리에서는 공지를 미뤄 두는 데 쓴다.
        firstLoginAt: typeof raw?.firstLoginAt === 'string' ? raw.firstLoginAt : null,
        tours
    };
};

/**
 * 가입하고 처음 앉은 자리인지.
 *
 * 첫 자리에는 환영 안내·첫 걸음 카드·동행 패널이 이미 겹쳐 뜬다. 여기에 공지 띠와 공지
 * 팝업까지 얹으면 **무엇부터 해야 하는지** 가 묻힌다. 학급을 만드는 일에만 집중하게 두고,
 * 공지는 다음에 들어올 때 보여 준다.
 *
 * 시간으로 재는 이유: "이번 페이지에서 처음 썼는가" 로 보면 새로고침 한 번에 공지가
 * 튀어나온다. 가입 직후 한 자리(30분) 동안만 미루면 다음 로그인에는 자연히 보인다.
 */
export const FIRST_SESSION_QUIET_MS = 30 * 60 * 1000;

export const markFirstLogin = (state, { now = new Date().toISOString() } = {}) => {
    const normalized = normalizeTourState(state);
    if (normalized.firstLoginAt) return normalized;
    return { ...normalized, firstLoginAt: now };
};

export const isFirstSession = (state, { now = Date.now() } = {}) => {
    const firstLoginAt = normalizeTourState(state).firstLoginAt;
    if (!firstLoginAt) return false;
    const startedAt = Date.parse(firstLoginAt);
    return Number.isFinite(startedAt) && now - startedAt < FIRST_SESSION_QUIET_MS;
};

/** 환영 안내를 봤다고 적는다. 한 번 본 사람에게 다시 띄우지 않는다. */
export const markWelcomeSeen = (state, { now = new Date().toISOString() } = {}) => ({
    ...normalizeTourState(state),
    welcomeSeenAt: now
});

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
        // 이미 다 해본 흐름은 처음부터 **다시 보기**로 연다(자동 판정 없이 둘러본다).
        if (entry.status === 'done') {
            Reflect.set(next.tours, tourId, withUpdatedAt({
                ...entry,
                status: 'running',
                stepId: steps.at(0).stepId,
                completed: [],
                replay: true
            }, now));
            return next;
        }
        // 하다 만 흐름은 아직 못 끝낸 단계에서 이어 연다.
        const resumeIndex = steps.findIndex((step) => !entry.completed.includes(step.stepId));
        Reflect.set(next.tours, tourId, withUpdatedAt({
            ...entry,
            status: 'running',
            replay: false,
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

/**
 * 이 흐름을 끝낸 뒤 이어서 볼 다음 흐름.
 * 35단계를 한 줄로 세워 두고 끝까지 가라고 하면 아무도 못 간다. 흐름 하나가 끝날 때마다
 * "이어서 볼까요" 를 권하고, 이미 본 흐름은 건너뛴다.
 */
export const getNextTourId = (state, tourId) => {
    const index = TEACHER_TOURS.findIndex((tour) => tour.id === tourId);
    if (index === -1) return null;
    const normalized = normalizeTourState(state);
    const next = TEACHER_TOURS
        .slice(index + 1)
        .find((tour) => Reflect.get(normalized.tours, tour.id)?.status !== 'done');
    return next?.id || null;
};

/**
 * 안내서 목차에 보여 줄 흐름별 진도.
 *
 * 상태만으로는 "어디까지 해봤는지" 를 알 수 없어, 몇 단계 중 몇 개를 끝냈는지 함께 준다.
 * 다시 보기 중이면 그 회차의 진도를 보여 준다(다 해봤다는 사실은 `hasFinished` 가 지킨다).
 */
export const getTourProgress = (state) => {
    const normalized = normalizeTourState(state);
    const progress = {};
    TEACHER_TOURS.forEach((tour) => {
        const entry = Reflect.get(normalized.tours, tour.id);
        const total = getTeacherTourSteps(tour.id).length;
        Reflect.set(progress, tour.id, {
            status: entry?.status || 'idle',
            done: Math.min(entry?.completed?.length || 0, total),
            total,
            // 한 번이라도 끝까지 가 본 흐름인지. 다시 보기로 진도가 0 이 되어도 이건 남는다.
            hasFinished: entry?.status === 'done' || (entry?.replay === true),
            replay: entry?.replay === true
        });
    });
    return progress;
};

/** 첫 걸음 카드를 띄울지. 한 번 끝냈거나 스스로 그만둔 교사에게는 다시 권하지 않는다. */
export const shouldOfferTour = (state, tourId) => {
    const entry = getTourEntry(state, tourId);
    return Boolean(entry) && entry.status !== 'done' && entry.status !== 'skipped';
};
