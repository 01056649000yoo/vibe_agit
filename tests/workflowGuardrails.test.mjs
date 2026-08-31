/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

/*
 * 2026-08-21 정리.
 *
 * 규칙은 `AGENTS.md` 200줄에 다 있었지만, 길어서 매번 훑다 보면 건너뛰었다.
 * 그래서 규칙을 두 종류로 나눴다 — **기계가 잡는 것**(검사 322개가 배포를 막음)과
 * **사람만 아는 것** 여섯 개. 뒤엣것은 `npm run checklist` 가 바뀐 파일을 보고 짚어 준다.
 *
 * 이 검사는 그 장치가 조용히 사라지지 않게 못을 박는다.
 */

test('배포 관문이 검사 전체를 돌린다', async () => {
    const dockerfile = await read('Dockerfile');

    // 일부만 돌리면 "그 묶음에 없는 검사" 는 깨져도 배포된다.
    assert.match(dockerfile, /RUN npm run test:all/, '배포 관문이 검사 전체를 돌리지 않는다');
});

test('푸시 관문은 체크섬 경고를 미적용 마이그레이션으로 오인하지 않는다', async () => {
    const hook = await read('scripts/git-hooks/pre-push');

    assert.match(hook, /\$0 == "적용 대기:" \{ reading_pending = 1; next \}/);
    assert.ok(hook.includes('reading_pending && /^   [^ ].*\\.sql$/'));
    assert.doesNotMatch(hook, /sed -n 's\/\^   /);
});

test('확인표 명령이 살아 있고 사람만 아는 여섯 가지를 본다', async () => {
    const [pkg, script] = await Promise.all([
        read('package.json'),
        read('scripts/checklist.mjs')
    ]);

    assert.match(pkg, /"checklist": "node scripts\/checklist\.mjs"/);

    // 여섯 가지가 다 들어 있어야 한다. 하나 빠지면 그것만 계속 놓치게 된다.
    const mustCheck = [
        ['마이그레이션', 'DB 적용 순서'],
        ['브라우저로 한 번 열어', '브라우저 확인'],
        ['부르는 곳이 남아 있습니다', '부르는 곳 다 고쳤나'],
        ['맥미니에 걸어야', 'git 밖 설치'],
        ['WORKLOG.md 가 아직 안 바뀌었습니다', 'WORKLOG 기록'],
        ['진짜로 잡는지', '새 검사가 실제로 잡나']
    ];
    for (const [needle, label] of mustCheck) {
        assert.ok(script.includes(needle), `확인표에서 '${label}' 항목이 빠졌다`);
    }
});

/*
 * 오늘 실제로 난 사고에서 뽑은 규칙이다.
 * 공지 팝업은 ①화면 조회 ②부트스트랩 RPC ③창 내보내기 셋 중 하나만 빠져도
 * 오류 없이 조용히 아무 일도 안 일어났다.
 */
test('"한 곳만 고치고 끝내지 않는다" 가 지침에 남아 있다', async () => {
    const [agents, session] = await Promise.all([
        read('AGENTS.md'),
        read('SESSION_CONTEXT.md')
    ]);

    for (const [doc, name] of [[agents, 'AGENTS.md'], [session, 'SESSION_CONTEXT.md']]) {
        assert.ok(doc.includes('한 곳만 고치고 끝내지 않는다'), `${name} 에 규칙이 없다`);
    }
    // 해법 두 가지가 함께 적혀 있어야 한다 — 원본을 모으거나, 한꺼번에 보는 검사를 만들거나.
    assert.match(agents, /원본을 한 곳으로 모은다/);
    assert.match(agents, /한꺼번에 보는/);
    assert.match(agents, /npm run checklist/);
});
