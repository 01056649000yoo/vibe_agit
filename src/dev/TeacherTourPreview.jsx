import React, { useMemo, useState } from 'react';
import TeacherTourCompanion from '../components/teacher/TeacherTourCompanion';
import TeacherFirstStepsCard from '../components/teacher/TeacherFirstStepsCard';
import {
    TEACHER_TOUR_ANCHORS,
    getTeacherTourSteps,
    getTourEntry,
    isStepSatisfied,
    normalizeTourState,
    reduceTourState,
    tourAnchor
} from '../guides/teacherTour.js';
import { getTeacherGuideJourney } from '../guides/teacherGuideJourneys.js';

/*
 * 교사 동행 모드 미리보기 (2026-09-13).
 *
 * DB 없이 `teacherTour.js` 의 상태 기계만 돌린다. 아래 가짜 버튼을 실제로 눌러
 * "해내면 저절로 다음 단계로 넘어가는지" 와 테두리가 옮겨 붙는지를 눈으로 본다.
 */

const TOUR_ID = 'getting-started';

export default function TeacherTourPreview() {
    const [state, setState] = useState(() => normalizeTourState(null));
    const [classCount, setClassCount] = useState(0);
    const [studentCount, setStudentCount] = useState(0);

    const steps = useMemo(() => getTeacherTourSteps(TOUR_ID), []);
    const journey = getTeacherGuideJourney(TOUR_ID);
    const entry = getTourEntry(state, TOUR_ID);
    const stepIndex = Math.max(0, steps.findIndex((candidate) => candidate.stepId === entry.stepId));
    const step = steps.at(stepIndex) || null;
    const isRunning = entry.status === 'running';

    const run = (action) => setState((current) => reduceTourState(current, TOUR_ID, action));

    // 실제 훅이 하는 자동 판정을 미리보기에서도 같은 함수로 흉내 낸다.
    const signals = { classCount, studentCount };
    if (isRunning && step && isStepSatisfied(step, signals)) {
        queueMicrotask(() => run('complete'));
    }

    const tour = {
        isRunning,
        step,
        stepIndex,
        totalSteps: steps.length,
        acknowledge: () => run('complete'),
        skipStep: () => run('skipStep'),
        back: () => run('back'),
        stop: () => run('stop')
    };

    return (
        <div style={{ padding: 24, minHeight: '160vh', background: 'var(--ui-page)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                <button type="button" onClick={() => run('start')}>동행 시작</button>
                <button type="button" onClick={() => { setState(normalizeTourState(null)); setClassCount(0); setStudentCount(0); }}>처음으로</button>
                <span style={{ fontSize: 'var(--ui-text-xs)' }}>
                    상태 {entry.status} · 단계 {stepIndex + 1}/{steps.length} · 학급 {classCount} · 학생 {studentCount}
                </span>
            </div>

            {!isRunning && journey && (
                <div style={{ maxWidth: 600 }}>
                    <TeacherFirstStepsCard
                        title={journey.title}
                        summary={journey.summary}
                        estimatedTime={journey.estimatedTime}
                        steps={steps}
                        completedStepIds={entry.completed}
                        onStart={() => run('start')}
                        onDismiss={() => run('stop')}
                    />
                </div>
            )}

            <section style={{ display: 'grid', gap: 40, maxWidth: 600 }}>
                <button type="button" onClick={() => setClassCount((n) => n + 1)} {...tourAnchor(TEACHER_TOUR_ANCHORS.CLASS_CREATE)}>
                    ➕ 새 학급 만들기 (가짜)
                </button>
                <div style={{ display: 'flex', gap: 4 }} {...tourAnchor(TEACHER_TOUR_ANCHORS.STUDENT_ADD)}>
                    <input type="text" placeholder="이름 입력" readOnly />
                    <button type="button" onClick={() => setStudentCount((n) => n + 1)}>추가 (가짜)</button>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--ui-border)' }} {...tourAnchor(TEACHER_TOUR_ANCHORS.WRITING_EDITOR_SETTINGS)}>
                    학급별 글쓰기 지원 기능 목록 (가짜)
                </div>
            </section>

            <TeacherTourCompanion tour={tour} journeyTitle={journey?.title || ''} onNavigate={() => {}} />
        </div>
    );
}
