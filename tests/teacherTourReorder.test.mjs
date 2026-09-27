import assert from 'node:assert/strict';
import test from 'node:test';
import { getTeacherTourSteps, getTourEntry, normalizeTourState, reduceTourState, TOUR_STEP_MOVES } from '../src/guides/teacherTour.js';

/*
 * 첫 글쓰기 수업 흐름 순서 바꾸기(2026-09-27): 과제 만들기를 맨 앞으로, 베타인 글쓰기 연구소를 맨 뒤(선택)로.
 * 분석에서 두 번째 흐름의 8명이 연구소에서 멈췄고, 학생 등록은 늘었는데 첫 학생 글은 19% → 20% 그대로였다.
 */
const TOUR = 'first-writing-class';
const stateAt = (entry) => normalizeTourState({ tours: { [TOUR]: entry } });

test('과제 만들기가 맨 앞이고 연구소는 맨 뒤 선택 단계다', () => {
    const ids = getTeacherTourSteps(TOUR).map((step) => step.stepId);
    assert.equal(ids.at(0), 'create-mission');
    assert.equal(ids.at(-1), 'writing-lab');
    assert.ok(ids.indexOf('create-mission') < ids.indexOf('review-submissions'));
});

test('옛 자리(연구소)에 서 있고 과제를 아직 안 만들었으면 과제 만들기에서 이어 본다', () => {
    const entry = getTourEntry(stateAt({ status: 'running', stepId: 'writing-lab', completed: [] }), TOUR);
    assert.equal(entry.stepId, 'create-mission', '연구소에서 다음을 누르면 과제 없이 흐름이 끝나 버린다');
    // 옮긴 뒤 한 걸음 가면 제출 확인으로 — 과제 만들기를 건너뛰지 않는다.
    const next = reduceTourState(stateAt({ status: 'running', stepId: 'writing-lab', completed: [] }), TOUR, 'complete');
    assert.equal(getTourEntry(next, TOUR).stepId, 'review-submissions');
    assert.deepEqual(getTourEntry(next, TOUR).completed, ['create-mission']);
});

test('이미 과제를 만들었거나 흐름을 끝낸 사람은 옮기지 않는다', () => {
    assert.equal(getTourEntry(stateAt({ status: 'running', stepId: 'writing-lab', completed: ['create-mission'] }), TOUR).stepId, 'writing-lab');
    assert.equal(getTourEntry(stateAt({ status: 'done', stepId: 'writing-lab', completed: [], everFinished: true }), TOUR).stepId, 'writing-lab');
    assert.deepEqual(TOUR_STEP_MOVES[TOUR], [{ from: 'writing-lab', to: 'create-mission' }]);
});
