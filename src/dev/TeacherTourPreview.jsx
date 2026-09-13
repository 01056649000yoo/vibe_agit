import React, { useMemo, useState } from 'react';
import TeacherTourCompanion from '../components/teacher/TeacherTourCompanion';
import TeacherFirstStepsCard from '../components/teacher/TeacherFirstStepsCard';
import TeacherWelcomeModal from '../components/teacher/TeacherWelcomeModal';
import {
    FIRST_TEACHER_TOUR_ID,
    TEACHER_TOURS,
    TEACHER_TOUR_ANCHORS,
    getNextTourId,
    getTeacherTourSteps,
    getTourEntry,
    isStepSatisfied,
    normalizeTourState,
    reduceTourState,
    tourAnchor
} from '../guides/teacherTour.js';
import { TEACHER_GUIDE_JOURNEYS, getTeacherGuideJourney } from '../guides/teacherGuideJourneys.js';

/*
 * 교사 동행 모드 미리보기 (2026-09-13).
 *
 * DB 없이 `teacherTour.js` 의 상태 기계만 돌린다. 아래 가짜 버튼을 실제로 눌러
 * "해내면 저절로 다음 단계로 넘어가는지", 테두리가 옮겨 붙는지, 흐름 하나가 끝나면
 * 다음 흐름을 권하는지를 눈으로 본다. 8개 흐름 35단계를 모두 걸어 볼 수 있다.
 */

export default function TeacherTourPreview() {
    const [state, setState] = useState(() => normalizeTourState(null));
    const [tourId, setTourId] = useState(FIRST_TEACHER_TOUR_ID);
    const [finished, setFinished] = useState(null);
    const [welcome, setWelcome] = useState(true);
    const [counts, setCounts] = useState({ classCount: 0, studentCount: 0, missionCount: 0 });

    const steps = useMemo(() => getTeacherTourSteps(tourId), [tourId]);
    const journey = getTeacherGuideJourney(tourId);
    const entry = getTourEntry(state, tourId);
    const stepIndex = Math.max(0, steps.findIndex((candidate) => candidate.stepId === entry.stepId));
    const step = steps.at(stepIndex) || null;
    const isRunning = entry.status === 'running';
    const nextTourId = finished ? getNextTourId(state, finished) : null;

    const run = (action, id = tourId) => setState((current) => {
        const next = reduceTourState(current, id, action);
        setFinished(getTourEntry(next, id)?.status === 'done' ? id : null);
        return next;
    });

    const start = (id = FIRST_TEACHER_TOUR_ID) => { setTourId(id); run('start', id); };

    // 실제 훅이 하는 자동 판정을 미리보기에서도 같은 함수로 흉내 낸다.
    if (isRunning && step && isStepSatisfied(step, counts)) queueMicrotask(() => run('complete'));

    const bump = (key) => setCounts((current) => ({ ...current, [key]: Reflect.get(current, key) + 1 }));

    const tour = {
        isRunning,
        step,
        stepIndex,
        totalSteps: steps.length,
        justFinishedTourId: finished,
        nextTourId,
        start,
        dismissFinished: () => setFinished(null),
        acknowledge: () => run('complete'),
        skipStep: () => run('skipStep'),
        back: () => run('back'),
        stop: () => run('stop')
    };

    return (
        <div style={{ padding: 24, minHeight: '160vh', background: 'var(--ui-page)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                <select value={tourId} onChange={(event) => setTourId(event.target.value)}>
                    {TEACHER_TOURS.map((tourOption) => (
                        <option key={tourOption.id} value={tourOption.id}>
                            {getTeacherGuideJourney(tourOption.id)?.title} ({tourOption.steps.length})
                        </option>
                    ))}
                </select>
                <button type="button" onClick={() => start(tourId)}>이 흐름 시작</button>
                <button type="button" onClick={() => setWelcome(true)}>환영 안내 보기</button>
                <button type="button" onClick={() => { setState(normalizeTourState(null)); setFinished(null); setWelcome(true); setCounts({ classCount: 0, studentCount: 0, missionCount: 0 }); }}>처음으로</button>
                <span style={{ fontSize: 'var(--ui-text-xs)' }}>
                    {entry.status} · {stepIndex + 1}/{steps.length} · 학급 {counts.classCount} · 학생 {counts.studentCount} · 과제 {counts.missionCount}
                </span>
            </div>

            {welcome && (
                <TeacherWelcomeModal
                    teacherName="김아지"
                    journeys={TEACHER_GUIDE_JOURNEYS}
                    stepCount={TEACHER_GUIDE_JOURNEYS.reduce((total, item) => total + item.steps.length, 0)}
                    onStartTour={() => { setWelcome(false); start(FIRST_TEACHER_TOUR_ID); }}
                    onOpenGuide={() => setWelcome(false)}
                    onLater={() => setWelcome(false)}
                />
            )}

            {!isRunning && !finished && journey && (
                <div style={{ maxWidth: 600 }}>
                    <TeacherFirstStepsCard
                        title={journey.title}
                        summary={journey.summary}
                        estimatedTime={journey.estimatedTime}
                        steps={steps}
                        completedStepIds={entry.completed}
                        onStart={() => start(tourId)}
                        onDismiss={() => run('stop')}
                    />
                </div>
            )}

            <section style={{ display: 'grid', gap: 40, maxWidth: 600 }}>
                <button type="button" onClick={() => bump('classCount')} {...tourAnchor(TEACHER_TOUR_ANCHORS.CLASS_CREATE)}>
                    ➕ 새 학급 만들기 (가짜)
                </button>
                <div style={{ display: 'flex', gap: 4 }} {...tourAnchor(TEACHER_TOUR_ANCHORS.STUDENT_ADD)}>
                    <input type="text" placeholder="이름 입력" readOnly />
                    <button type="button" onClick={() => bump('studentCount')}>추가 (가짜)</button>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--ui-border)' }} {...tourAnchor(TEACHER_TOUR_ANCHORS.WRITING_EDITOR_SETTINGS)}>
                    학급별 글쓰기 지원 기능 목록 (가짜)
                </div>
                <button type="button" onClick={() => bump('missionCount')} {...tourAnchor(TEACHER_TOUR_ANCHORS.MISSION_CREATE)}>
                    ➕ 미션 만들기 (가짜)
                </button>
            </section>

            <TeacherTourCompanion
                tour={tour}
                journeyTitle={journey?.title || ''}
                nextJourneyTitle={getTeacherGuideJourney(nextTourId)?.title || null}
                onNavigate={() => {}}
                onOpenGuide={(journeyId, stepId) => console.info('안내서 열기', journeyId, stepId)}
            />
        </div>
    );
}
