import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    getReactionOption,
    getReactionOptions,
    getReactionProfiles,
} from '../src/modules/writing/reactions/registry.js';
import {
    getGenreMissionTypes,
    getMissionReactionProfile,
} from '../src/modules/writing/mission-types/registry.js';

test('반응 프로필은 유형이 중복되지 않고 기본·보고서·회의 목록을 제공한다', () => {
    const profiles = getReactionProfiles();
    const allTypes = profiles.flatMap((profile) => profile.options.map((option) => option.type));

    assert.deepEqual(profiles.map((profile) => profile.id), ['standard', 'report', 'meeting']);
    assert.equal(new Set(allTypes).size, allTypes.length);
    assert.deepEqual(getReactionOptions('report').map((option) => option.type), [
        'report_detail', 'report_clear', 'report_new',
    ]);
    assert.equal(getReactionOption('report_clear').emoji, '📋');
    assert.equal(getReactionOption('unknown-value').emoji, '✨');
});

test('등록된 모든 장르 매니페스트가 반응 프로필을 명시한다', () => {
    for (const missionType of getGenreMissionTypes()) {
        assert.ok(missionType.reactionProfile, `${missionType.id} 장르에 reactionProfile이 없습니다.`);
        assert.equal(
            getMissionReactionProfile({ input_template: missionType.id }).id,
            missionType.reactionProfile,
        );
    }
    assert.equal(getMissionReactionProfile(null).id, 'standard');
});

test('학생·친구·알림·교사 화면은 공용 반응 레지스트리를 사용한다', async () => {
    const [studentWriting, friendsHideout, feedbackModal, teacherModal, relationshipCard, ideaMarket] = await Promise.all([
        readFile('src/components/student/StudentWriting.jsx', 'utf8'),
        readFile('src/modules/community/friends-hideout/FriendsHideout.jsx', 'utf8'),
        readFile('src/components/student/StudentFeedbackModal.jsx', 'utf8'),
        readFile('src/components/teacher/SubmissionStatusModal.jsx', 'utf8'),
        readFile('src/modules/community/friends-hideout/profile/cards/FriendRelationshipCard.jsx', 'utf8'),
        readFile('src/modules/writing/idea-market/IdeaMarketManager.jsx', 'utf8'),
    ]);

    assert.match(studentWriting, /getReactionOptions\(genreMissionType\?\.reactionProfile\)/);
    assert.match(friendsHideout, /getMissionReactionOptions\(viewingMission\)/);
    assert.match(feedbackModal, /getReactionOption\(f\.reaction_type\)/);
    assert.match(teacherModal, /getMissionReactionOptions\(selectedMission\)/);
    assert.match(teacherModal, /fetchTeacherMissionEngagement\(missionId\)/);
    assert.match(relationshipCard, /getReactionOption\(event\.reaction_type\)/);
    assert.match(ideaMarket, /getReactionOptions\('meeting'\)/);
    assert.doesNotMatch(studentWriting, /const REACTION_ICONS/);
    assert.doesNotMatch(friendsHideout, /MEETING_REACTION_ICONS|const REACTION_ICONS/);
    assert.doesNotMatch(teacherModal, /const reactionIcons = \[/);
});

test('반응 쓰기와 교사 모아보기는 장르 검증·RPC 1회·목록 상한 계약을 갖는다', async () => {
    const [migration, api, moduleReadme] = await Promise.all([
        readFile('supabase/migrations/20261024_writing_reaction_profiles.sql', 'utf8'),
        readFile('src/modules/writing/reactions/reactionApi.js', 'utf8'),
        readFile('src/modules/writing/reactions/README.md', 'utf8'),
    ]);

    assert.match(migration, /writing_reaction_profile_types/);
    const serverCatalog = Array.from(migration.matchAll(
        /\('([a-z][a-z0-9_]*)', '([a-z][a-z0-9_]*)', \d+\)/g,
    )).map((match) => `${match[1]}:${match[2]}`);
    const clientCatalog = getReactionProfiles().flatMap((profile) => (
        profile.options.map((option) => `${profile.id}:${option.type}`)
    ));
    assert.deepEqual(serverCatalog, clientCatalog, '프런트와 서버의 반응 프로필 카탈로그가 다릅니다.');
    assert.match(migration, /mission\.input_template/);
    assert.match(migration, /profile\.profile_id = v_profile_id[\s\S]*profile\.reaction_type = p_reaction_type/);
    assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.post_reactions/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_teacher_mission_engagement_v1/);
    assert.match(migration, /LIMIT 100/);
    assert.match(api, /rpc\('get_teacher_mission_engagement_v1'/);
    assert.doesNotMatch(api, /\.from\(/);
    assert.match(moduleReadme, /화면에 반응 배열이나 장르별 조건문을 하드코딩하지 않는다/);
});
