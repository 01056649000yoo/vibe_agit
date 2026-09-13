import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TEACHER_TOURS, getTeacherTourSteps } from '../src/guides/teacherTour.js';
import { getStepDetail } from '../src/guides/teacherTourDetail.js';

const read = (file) => readFileSync(file, 'utf8');
const allSteps = TEACHER_TOURS.flatMap((tour) => getTeacherTourSteps(tour.id));
const stepOf = (stepId) => allSteps.find((step) => step.stepId === stepId);

test('모든 단계가 지나가면서 짚어 줄 말을 갖는다', () => {
    /*
     * 창 위치만 알려 주고 "자세한 건 안내서에서 보세요" 로 끝나면, 찾기 어려운 기능은
     * 끝까지 모른 채 지나간다(2026-09-13 사용자 지적).
     */
    const empty = allSteps.filter((step) => !getStepDetail(step));
    assert.deepEqual(empty.map((step) => step.stepId), [], '설명이 붙지 않는 단계가 있습니다.');
});

test('그 단계에 맞는 문장을 고른다 — 앞에서부터 자르지 않는다', () => {
    /*
     * 수호룡 안내서에는 성장 보기·미리보기·시즌 마감이 함께 들어 있다. 앞에서부터
     * 자르면 `시즌 마감` 단계인데 `성장 단계 보는 법` 만 나온다.
     */
    const detail = getStepDetail(stepOf('close-dragon-season'));
    const text = [...detail.points, ...detail.cautions].join('\n');
    assert.match(text, /시즌 종료/);
    assert.match(text, /초기화/, '칭호가 언제 초기화되는지가 이 단계의 핵심입니다.');
});

test('되돌릴 수 없는 대목은 주의로 올린다', () => {
    // 안내서가 **굵게** 적어 둔 것은 사고를 막는 문장이다. 그것부터 보여 준다.
    const detail = getStepDetail(stepOf('close-dragon-season'));
    assert.ok(detail.cautions.length > 0);
    assert.ok(detail.cautions.some((line) => line.includes('**')), '강조된 주의를 고르지 않았습니다.');
});

test('관계없는 주의를 억지로 채우지 않는다', () => {
    /*
     * 빈칸을 채우려고 아무 문장이나 넣으면 **틀린 경고**가 된다.
     * 그 단계와 겹치는 말이 없으면 주의는 비워 둔다.
     */
    allSteps.forEach((step) => {
        const detail = getStepDetail(step);
        assert.ok(detail.cautions.length <= 2, `${step.stepId} 주의가 너무 많습니다.`);
        assert.ok(detail.points.length <= 3, `${step.stepId} 핵심이 너무 많습니다.`);
    });
});

test('설명을 여기 다시 적지 않고 안내서에서 읽어 온다', () => {
    // 같은 말을 두 곳에 적으면 안내서만 고쳐졌을 때 둘의 말이 달라진다.
    const detailSource = read('src/guides/teacherTourDetail.js');
    assert.match(detailSource, /getTeacherGuide|getTeacherGuideSection/);
    assert.ok(!/['"][가-힣]{12,}/.test(detailSource.replace(/\/\*[\s\S]*?\*\//g, '')),
        '설명 문장을 여기 직접 적어 두었습니다. 안내서에서 읽어 오세요.');
});

test('안내서와 패널이 같은 방법으로 글자를 그린다', () => {
    // 한쪽만 고치면 별표(**)가 그대로 보인다.
    const panel = read('src/components/teacher/TeacherTourCompanion.jsx');
    const guide = read('src/components/teacher/TeacherGuideContent.jsx');
    assert.match(panel, /from '\.\/guideEmphasis\.jsx'/);
    assert.match(guide, /from '\.\/guideEmphasis\.jsx'/);
});
