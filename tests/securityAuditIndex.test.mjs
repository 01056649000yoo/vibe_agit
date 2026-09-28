import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * 보안 점검 기록 → 다음 점검의 입력(2026-09-28).
 * 점검마다 고친 것을 막는 검사를 표에 적는다. 그 검사가 지워지면 여기서 걸린다 — 고친 구멍이 조용히 다시 열리지 않게.
 */

test('보안 점검 목록의 모든 회차에 막는 검사가 적혀 있고, 그 파일·명령이 실제로 있다', () => {
    const index = readFileSync('docs/security-audits/README.md', 'utf8');
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    const rows = index.split('\n').filter((line) => line.startsWith('| [20'));
    assert.ok(rows.length >= 4);
    for (const row of rows) {
        const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
        assert.equal(cells.length, 4, `칸이 4개여야 한다: ${row.slice(0, 40)}`);
        const guards = [...cells[3].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
        assert.ok(guards.length > 0, `${cells[0]} 에 막는 검사가 없다`);
        for (const guard of guards) {
            if (guard.startsWith('npm run ')) assert.ok(scripts[guard.slice(8)], `${cells[0]}: 명령 \`${guard}\` 가 없다`);
            else assert.ok(existsSync(guard), `${cells[0]}: 검사 파일 ${guard} 가 없다 — 지웠다면 그 구멍을 무엇이 막는지 표를 고치세요`);
        }
        const file = cells[0].match(/\(([^)]+)\)/)[1];
        assert.ok(existsSync(`docs/security-audits/${file}`), `${file} 이 없다`);
    }
});
