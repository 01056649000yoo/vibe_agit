import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 새 판을 만들면서 옛 판을 안 지우고 넘어가는 것을 **마이그레이션 파일만 보고** 막는다.
 *
 * 이미 `npm run check:rpc-surface` 가 같은 것을 보지만 그쪽은 운영 DB 를 읽는다.
 * 도커가 꺼진 컴퓨터에서는 건너뛰고, 배포 컨테이너 안에서도 돌지 않으며, 무엇보다
 * **푸시할 때**야 걸린다 — 그때는 이미 마이그레이션을 다 쓴 뒤라 되돌아가야 한다.
 * 이 검사는 파일만 읽으므로 `npm run test:all` 안에서, 즉 어디서나 즉시 걸린다.
 *
 * 자동으로 지워 주지는 않는다. 옛 판을 남겨야 하는 진짜 이유가 있기 때문이다 —
 * 실제로 셋 다 겪었다.
 *   · `record_system_daily_metric_v1`  — 스크립트가 v2 실패 시 쓰는 되돌림 경로
 *   · `teacher_assignment_submission_board_snapshot_v1` — 다른 RPC 가 내부에서 부름
 *   · `get_student_spelling_entries_v1` — 같은 DB 를 쓰는 **다른 앱**이 부름
 * 셋 다 자동으로 지웠다면 조용히 깨졌을 것이다.
 *
 * 그래서 이 검사가 강제하는 것은 삭제가 아니라 **결정**이다.
 * 지우거나, `ops/rpc-surface-allowlist.json` 에 이유를 적거나 — 둘 중 하나는 해야 한다.
 */

const MIGRATIONS_DIR = 'supabase/migrations';
const ALLOWLIST_PATH = 'ops/rpc-surface-allowlist.json';

const CREATE_FUNCTION = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
const DROP_FUNCTION = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi;

/*
 * 판 번호가 없는 이름도 **0판**으로 본다.
 *
 * 처음엔 `_vN` 끼리만 견줬는데, 그러면 `get_post_interactions` 옆에
 * `get_post_interactions_v2` 를 새로 만들어도 조용히 통과했다. 첫 판에는 번호를 안 붙이고
 * 두 번째부터 `_v2` 를 붙이는 것이 이 저장소의 실제 습관이라, 그 경우가 오히려 흔하다.
 */
const versionOf = (name) => {
    const match = name.match(/_v(\d+)$/);
    return match
        ? { base: name.slice(0, match.index), version: Number(match[1]) }
        : { base: name, version: 0 };
};

const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
const created = new Set();
const dropped = new Set();

for (const file of files) {
    const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, 'utf8');
    for (const match of sql.matchAll(CREATE_FUNCTION)) created.add(match[1]);
    for (const match of sql.matchAll(DROP_FUNCTION)) dropped.add(match[1]);
}

const allowlist = JSON.parse(await readFile(ALLOWLIST_PATH, 'utf8'));
const keptReasons = new Map((allowlist.keep || []).map((item) => [item.name, item.reason]));

test('새 판을 만든 함수의 옛 판은 지우거나 남기는 이유를 적는다', () => {
    const names = [...created];
    const undecided = names.filter((name) => {
        const info = versionOf(name);
        const hasNewer = names.some((other) => {
            const otherInfo = versionOf(other);
            return otherInfo.base === info.base && otherInfo.version > info.version;
        });
        return hasNewer && !dropped.has(name) && !keptReasons.has(name);
    }).sort();

    assert.deepEqual(undecided, [], [
        '',
        '더 새로운 판을 만들었는데 옛 판을 어떻게 할지 정하지 않았습니다:',
        ...undecided.map((name) => `    ${name}`),
        '',
        '둘 중 하나를 하세요.',
        `  · 새 판을 만든 마이그레이션에서 함께 지운다 — DROP FUNCTION IF EXISTS public.<이름>(...)`,
        `  · 남겨야 하면 ${ALLOWLIST_PATH} 의 keep 에 이름과 이유를 적는다`,
        '',
        '남기는 이유는 실제로 있습니다 — 되돌림 경로, 다른 RPC 가 내부에서 부름,',
        '같은 DB 를 쓰는 다른 앱이 부름. 그래서 자동으로 지우지 않고 물어봅니다.',
        '이유에는 "언제 지울 수 있는지"까지 적어 두면 다음 사람이 이어서 지울 수 있습니다.',
        ''
    ].join('\n'));
});

test('허용 목록의 이유는 비어 있지 않고, 이미 없는 함수를 가리키지 않는다', () => {
    for (const [name, reason] of keptReasons) {
        assert.ok(
            typeof reason === 'string' && reason.trim().length >= 10,
            `${ALLOWLIST_PATH}: ${name} 에 남기는 이유를 적어야 합니다.`
        );
    }

    // 이미 지운 함수가 목록에 남아 있으면 다음 사람이 "아직 못 지우는구나"로 잘못 읽는다.
    const stale = [...keptReasons.keys()].filter((name) => dropped.has(name) && !created.has(name));
    assert.deepEqual(stale, [], `이미 지운 함수가 ${ALLOWLIST_PATH} 에 남아 있습니다: ${stale.join(', ')}`);
});
