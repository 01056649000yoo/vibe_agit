import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    isReusablePastMission,
    pastMissionKind,
    pastMissionSearchTerm,
    toReusableMission
} from '../src/modules/writing/mission-form/pastMission.js';

const [manager, hook, missionHook, picker, typePicker] = await Promise.all([
    readFile('src/components/teacher/MissionManager.jsx', 'utf8'),
    readFile('src/hooks/useMyPastMissions.js', 'utf8'),
    readFile('src/hooks/useMissionManager.js', 'utf8'),
    readFile('src/components/teacher/PastMissionPicker.jsx', 'utf8'),
    readFile('src/components/teacher/MissionTypePicker.jsx', 'utf8')
]);

test('다시 내기는 id·학급·공개/보관 상태를 떼어 내 저장이 새로 만들기가 된다', () => {
    const source = {
        id: 'm1', class_id: 'c1', classes: { name: '4-1' }, created_at: '2026-03-02', teacher_id: 't1',
        is_archived: true, archived_at: '2026-04-01', open_at: '2026-03-03',
        title: '봄 관찰 일기', guide: '안내', genre: '일기', guide_questions: ['무엇을 봤나요?'], tags: ['봄'],
        template_config: { min_stanzas: 3 }, base_reward: 50
    };
    const copy = toReusableMission(source);
    for (const key of ['id', 'class_id', 'classes', 'created_at', 'teacher_id', 'is_archived', 'archived_at', 'open_at']) {
        assert.equal(Object.hasOwn(copy, key), false, key);
    }
    assert.equal(copy.title, '봄 관찰 일기');
    assert.deepEqual(copy.guide_questions, ['무엇을 봤나요?']);
    assert.notEqual(copy.guide_questions, source.guide_questions);
    assert.equal(copy.base_reward, 50);
    // 모두의 아지트 표시 태그는 떼고 선생님 태그는 남긴다
    assert.deepEqual(toReusableMission({ tags: ['이웃 아지트', '같이 쓰기 광장', '봄'] }).tags, ['봄']);
});

test('전용 틀은 그 화면으로, 회의 과제는 목록에서 빠진다', () => {
    assert.equal(pastMissionKind({ input_template: 'poem', mission_type: 'poem' }), 'poem');
    assert.equal(pastMissionKind({ input_template: 'report', mission_type: 'report' }), 'report');
    assert.equal(pastMissionKind({ input_template: 'letter', mission_type: 'letter' }), 'letter');
    assert.equal(pastMissionKind({ input_template: 'freeform', mission_type: '일기' }), 'freeform');
    assert.equal(isReusablePastMission({ input_template: 'freeform', mission_type: 'meeting' }), false);
    assert.equal(isReusablePastMission({ input_template: 'meeting', mission_type: 'meeting' }), false);
    assert.equal(isReusablePastMission({ input_template: 'freeform', mission_type: null }), true);
});

test('검색어는 PostgREST or 필터를 깨지 않는다', () => {
    assert.equal(pastMissionSearchTerm('봄,(관찰)*%'), '봄 관찰');
    assert.equal(pastMissionSearchTerm('  '), '');
    assert.ok(pastMissionSearchTerm('가'.repeat(80)).length <= 40);
});

test('목록은 내 과제만 한 쪽씩, 고르면 폼만 채운다(바로 저장하지 않음)', () => {
    assert.match(hook, /\.eq\('teacher_id', user\.id\)/);
    assert.match(hook, /\.range\(from, from \+ PAST_MISSION_PAGE_SIZE - 1\)/);
    assert.match(hook, /enabled/);
    assert.match(manager, /setActiveGenreMode\('create'\)[\s\S]{0,200}return;[\s\S]{0,120}startFromPastMission\(toReusableMission\(mission\)\)/);
    assert.match(manager, /setEditingGenreMission\(toReusableMission\(mission\)\)/);
    const start = missionHook.match(/const startFromPastMission = [\s\S]*?\n    };/)[0];
    assert.match(start, /setIsEditing\(false\)/);
    assert.match(start, /setEditingMissionId\(null\)/);
    assert.match(start, /schedule_at: ''/);
    assert.doesNotMatch(start, /insert|update\(/);
    assert.match(picker, /isReusablePastMission/);
    assert.match(typePicker, /onOpenPastMissions && \(/);
});
