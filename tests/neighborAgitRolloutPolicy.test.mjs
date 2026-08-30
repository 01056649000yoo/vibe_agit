import assert from 'node:assert/strict';
import test from 'node:test';
import {
    NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE,
    NEIGHBOR_AGIT_LIMITS,
    NEIGHBOR_AGIT_ROLLOUT_MODES,
    canEnterNeighborAgitAsStudent,
    getNeighborAgitTeacherSurface
} from '../src/modules/community/neighbor-agit/policy.js';

test('이웃 아지트 공개 단계와 초기 제한은 한 원본에서 fail-closed로 정한다', () => {
    assert.deepEqual(NEIGHBOR_AGIT_ROLLOUT_MODES, {
        INTERNAL: 'internal',
        PUBLIC_BETA: 'public_beta',
        PAUSED: 'paused'
    });
    assert.equal(NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE, 'internal');
    assert.equal(NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace, 4);
    assert.equal(NEIGHBOR_AGIT_LIMITS.maxActiveSpacesPerClass, 1);
    assert.equal(NEIGHBOR_AGIT_LIMITS.minimumActiveClasses, 2);
    assert.equal(NEIGHBOR_AGIT_LIMITS.inviteTtlHours, 24);
    assert.equal(NEIGHBOR_AGIT_LIMITS.initialFeedRows, 20);
    assert.equal(NEIGHBOR_AGIT_LIMITS.maximumFeedRows, 50);
    assert.equal(getNeighborAgitTeacherSurface({ rolloutMode: 'unknown', isAdmin: true }), 'preparation');
});

test('internal에서는 관리자만 실제 작업 화면을 보고 일반 교사는 준비 화면을 본다', () => {
    assert.equal(getNeighborAgitTeacherSurface({ rolloutMode: 'internal', isAdmin: true }), 'workspace');
    assert.equal(getNeighborAgitTeacherSurface({ rolloutMode: 'internal', isAdmin: false }), 'preparation');
    assert.equal(getNeighborAgitTeacherSurface({ rolloutMode: 'public_beta', isAdmin: false }), 'workspace');
    assert.equal(getNeighborAgitTeacherSurface({ rolloutMode: 'paused', isAdmin: true }), 'paused');
});

test('학생은 공개·교사 ON·활성 공간·활성 참여·두 학급 조건이 모두 맞아야 들어간다', () => {
    const allowed = {
        rolloutMode: 'public_beta',
        classModuleEnabled: true,
        spaceStatus: 'active',
        membershipStatus: 'active',
        activeClassCount: 2
    };

    assert.equal(canEnterNeighborAgitAsStudent(allowed), true);
    assert.equal(canEnterNeighborAgitAsStudent({ ...allowed, rolloutMode: 'internal' }), false);
    assert.equal(canEnterNeighborAgitAsStudent({ ...allowed, classModuleEnabled: false }), false);
    assert.equal(canEnterNeighborAgitAsStudent({ ...allowed, spaceStatus: 'closed' }), false);
    assert.equal(canEnterNeighborAgitAsStudent({ ...allowed, membershipStatus: 'left' }), false);
    assert.equal(canEnterNeighborAgitAsStudent({ ...allowed, activeClassCount: 1 }), false);
});
