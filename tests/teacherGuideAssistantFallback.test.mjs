import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GUIDE_CHAT_LIMITS, buildTeacherGuideOverview } from '../src/guides/teacherGuideSearch.js';
import { getTeacherGuide } from '../src/guides/teacherGuideRegistry.js';

const read = (file) => readFileSync(file, 'utf8');
const assistant = read('src/components/teacher/TeacherGuideAssistant.jsx');
const edge = read('supabase/functions/vibe-ai/index.ts');

test('낱말이 안 걸려도 AI 에게 물어본다', () => {
    /*
     * 2026-09-13 지적: 안내서에 없는 낱말로 물으면 "기능 이름을 넣어 다시 물어봐 주세요"
     * 로 끝났다. 낱말 검색이 빗나갔을 뿐인데 **AI 를 부르지도 않고** 문을 닫는 것은
     * 'AI 길잡이' 라는 이름과 맞지 않는다.
     */
    assert.match(assistant, /const askWith = candidates\.length \? candidates : buildTeacherGuideOverview\(\);/);
    assert.match(assistant, /candidates: askWith/);
    assert.ok(!assistant.includes('기능 이름이나 메뉴 이름을 넣어 다시 물어봐 주세요'),
        '아직도 낱말이 안 맞으면 거절합니다.');
});

test('훑어보기 후보는 안내서 전체를 덮고 실제 도움말을 가리킨다', () => {
    const overview = buildTeacherGuideOverview();
    assert.ok(overview.length >= 6, '몇 갈래만 보내면 엉뚱한 곳을 고른다.');
    assert.ok(overview.length <= GUIDE_CHAT_LIMITS.overviewCount);
    overview.forEach((candidate) => {
        // 버튼이 갈 곳이 실제로 있어야 한다.
        assert.ok(getTeacherGuide(candidate.guideRef), `${candidate.title}: 없는 도움말을 가리킵니다.`);
        assert.ok(candidate.context.length > 0);
        assert.ok(/^[a-z0-9:-]+$/i.test(candidate.guideRef), '서버가 받는 모양이 아닙니다.');
    });
});

test('후보가 늘어도 보내는 글자는 늘지 않는다', () => {
    // 비용이 따라 늘면 안 된다 — 후보가 많으면 하나하나가 짧아질 뿐이다.
    const total = buildTeacherGuideOverview().reduce((sum, candidate) => sum + candidate.context.length, 0);
    assert.ok(total <= GUIDE_CHAT_LIMITS.contextChars,
        `문맥이 ${total}자로 상한(${GUIDE_CHAT_LIMITS.contextChars})을 넘습니다.`);
});

test('서버도 늘어난 후보 수를 받아 준다', () => {
    // 화면만 고치면 서버가 400 으로 막아 오히려 아무 답도 못 받는다.
    assert.match(edge, /candidates\.length > 8/);
    assert.ok(edge.includes('가장 가까운 것'), '딱 맞는 것이 없을 때 무엇을 하라는 지시가 없습니다.');
    assert.ok(edge.includes('없는 기능을 있다고 지어내지 않는다'), '지어내지 말라는 지시가 빠졌습니다.');
    // 문맥 총량 상한은 그대로여야 비용이 안 는다.
    assert.match(edge, /contextChars > 1200/);
});
