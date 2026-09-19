import assert from 'node:assert/strict';
import test from 'node:test';
import {
    NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE,
    NEIGHBOR_AGIT_LIMITS,
    NEIGHBOR_AGIT_ROLLOUT_MODES
} from '../src/modules/community/neighbor-agit/policy.js';

/*
 * 2026-09-17: 예전에는 화면 관문 함수 두 개(`getNeighborAgitTeacherSurface`,
 * `canEnterNeighborAgitAsStudent`)도 여기서 봤다. 그런데 그 둘을 부르는 화면이 없었다 —
 * 학생 노출은 서버가 내려 주는 `neighbor_agit_available` 이, 교사는 RPC 거절이 정한다.
 * 쓰지 않는 코드를 지키는 검사는 통과해도 아무것도 안 보므로 함수와 함께 걷었다.
 * 여기 남은 것은 **실제로 쓰이는 상수**뿐이다(`manifest.js`·`api.js` 가 읽는다).
 */

test('이웃 아지트 공개 단계와 초기 제한은 한 원본에서 fail-closed로 정한다', () => {
    assert.deepEqual(NEIGHBOR_AGIT_ROLLOUT_MODES, {
        INTERNAL: 'internal',
        LIMITED_BETA: 'limited_beta',
        PUBLIC_BETA: 'public_beta',
        PAUSED: 'paused'
    });
    // 기본은 가장 닫힌 단계여야 한다 — 설정을 못 읽었을 때 열리면 안 된다.
    assert.equal(NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE, 'internal');
    assert.equal(NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace, 10);
    assert.equal(NEIGHBOR_AGIT_LIMITS.maxActiveSpacesPerClass, 1);
    assert.equal(NEIGHBOR_AGIT_LIMITS.minimumActiveClasses, 2);
    assert.equal(NEIGHBOR_AGIT_LIMITS.inviteTtlHours, 24);
    assert.equal(NEIGHBOR_AGIT_LIMITS.initialFeedRows, 20);
    assert.equal(NEIGHBOR_AGIT_LIMITS.maximumFeedRows, 50);
});

test('모듈 명세는 상한을 직접 적지 않고 정책 상수를 가리킨다', async () => {
    /*
     * 같은 숫자를 두 곳에 적으면 한 곳이 낡는다. 여기서는 소스를 글로 읽어 확인한다 —
     * manifest.js 는 `./policy` 를 확장자 없이 import 해서 Vite 는 찾지만 Node 는 못 찾는다
     * (PITFALLS 의 그 함정). 그래서 import 대신 파일 내용을 본다.
     */
    const { readFile } = await import('node:fs/promises');
    const manifest = await readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8');
    assert.match(manifest, /NEIGHBOR_AGIT_LIMITS\.maxClassesPerSpace/);
    assert.match(manifest, /NEIGHBOR_AGIT_LIMITS\.maxActiveSpacesPerClass/);
    assert.match(manifest, /NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE/);
    // 목록 상한만 숫자로 박혀 있다 — 정책 상수와 어긋나면 여기서 갈린다.
    const declared = manifest.match(/maxInitialRows:\s*(\d+)/);
    assert.ok(declared, 'manifest 에 maxInitialRows 가 없습니다.');
    assert.equal(Number(declared[1]), NEIGHBOR_AGIT_LIMITS.initialFeedRows);
});
