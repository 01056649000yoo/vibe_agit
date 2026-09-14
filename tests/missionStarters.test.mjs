import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MISSION_STARTERS, applyMissionStarter } from '../src/constants/missionStarters.js';

const list = readFileSync('src/components/teacher/MissionList.jsx', 'utf8');
const manager = readFileSync('src/components/teacher/MissionManager.jsx', 'utf8');

test('첫 과제를 예시로 시작할 수 있다', () => {
    /*
     * 2026-09-14 분석: 학생을 등록한 교사 168명 중 과제를 만든 사람은 90명이다.
     * 과제만 만들면 그 뒤는 81%가 학생 글까지 가고, 만든 사람은 학생 등록 뒤 6분 만에 만들었다.
     * 첫 자리에서 갈리므로, 빈 화면에서 바로 시작할 길을 둔다.
     */
    assert.ok(MISSION_STARTERS.length >= 3);
    MISSION_STARTERS.forEach((starter) => {
        assert.ok(starter.title.trim() && starter.guide.trim(), `${starter.id} 에 주제나 안내가 비었습니다.`);
    });
    // 빈 화면에서만 보여 준다 — 과제가 있는 교사에게는 쓸데없는 자리다.
    assert.match(list, /if \(missions\.length === 0\) \{[\s\S]{0,1200}MISSION_STARTERS\.map/);
    assert.match(list, /이 과제로 시작하기/);
    assert.match(list, /onUseStarter\(starter\)/);
    assert.match(manager, /setFormData\(\(current\) => applyMissionStarter\(current, starter\)\)/);
    assert.match(manager, /setIsFormOpen\(true\)/);
});

test('예시 안내는 짧게 쓴다', () => {
    /*
     * 실제 교사가 쓴 안내는 중앙값 53자이고 82%가 100자 미만이다.
     * 예시가 길면 "이만큼 써야 하나" 로 읽혀 오히려 문턱이 높아진다.
     */
    MISSION_STARTERS.forEach((starter) => {
        assert.ok(starter.guide.length <= 120, `${starter.id} 안내가 ${starter.guide.length}자로 깁니다.`);
    });
});

test('예시는 실제로 쓰이는 장르 이름을 쓴다', () => {
    // 목록에 없는 이름을 넣으면 장르별 화면이 그 과제를 못 알아본다.
    const known = new Set(['일기', '생활문', '논설문', '설명문', '독후감(서평)', '시', '이야기(동화)', '기타']);
    MISSION_STARTERS.forEach((starter) => {
        assert.ok(known.has(starter.genre), `${starter.genre} 는 쓰이지 않는 장르입니다.`);
        assert.equal(starter.mission_type, starter.genre);
    });
});

test('예시는 학급 기본 설정을 덮어쓰지 않는다', () => {
    /*
     * 점수·댓글 허용 같은 값은 선생님이 정해 둔 기본 설정에서 온다.
     * 예시가 그것까지 바꾸면, 예시를 한 번 쓴 뒤로 설정이 달라져 있다.
     */
    const before = { title: '', guide: '', base_reward: 300, allow_comments: false, min_chars: 500, tags: ['가을'] };
    const after = applyMissionStarter(before, MISSION_STARTERS.at(0));
    assert.equal(after.base_reward, 300);
    assert.equal(after.allow_comments, false);
    assert.deepEqual(after.tags, ['가을']);
    assert.equal(after.title, MISSION_STARTERS.at(0).title);
});
