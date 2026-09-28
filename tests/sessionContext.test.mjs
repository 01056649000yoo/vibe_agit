import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    buildSessionContext, MAX_CONTEXT_CHARS, MAX_RULES_CHARS, rebaseLinks, roadmapCurrent, worklogRecent
} from '../scripts/sessionContext.mjs';

/*
 * SESSION_CONTEXT 생성(2026-09-28): 손으로 쓰던 파일이 12,757자로 Codex 훅 상한(12,000)을 넘어 끝이 잘렸다.
 * 이제 규칙은 docs/wiki/SESSION_RULES.md, 지금 상태는 ROADMAP·WORKLOG 에서 뽑는다.
 */

test('docs/wiki 기준 링크를 루트 기준으로 바꾼다', () => {
    assert.equal(rebaseLinks('[a](PITFALLS.md) [b](../../FEATURE_MAP.md) [c](../worklog/) [d](https://x.md)'),
        '[a](docs/wiki/PITFALLS.md) [b](FEATURE_MAP.md) [c](docs/worklog/) [d](https://x.md)');
});

test('ROADMAP 현재 위치의 최상위 항목 첫 줄만, WORKLOG 는 제목과 남은 것만 뽑는다', () => {
    const roadmap = '# R\n## 비전\n- 아님\n## 🧭 현재 위치\n\n- [x] **가** 설명\n  이어짐\n- [ ] **나**\n### 다음 절\n- 아님\n';
    assert.deepEqual(roadmapCurrent(roadmap), ['- [x] **가** 설명', '- [ ] **나**']);

    const worklog = '# W\n## 2026-10-02 — 둘 (Codex)\n- **한 일**: x\n- **남은 것 / 다음**: 실기기 확인\n\n## 2026-10-01 — 하나 (Claude)\n- **남은 것**: 없음\n';
    assert.deepEqual(worklogRecent(worklog, 5), [
        { title: '2026-10-02 — 둘 (Codex)', left: '실기기 확인' },
        { title: '2026-10-01 — 하나 (Claude)', left: '없음' }
    ]);
});

test('같은 입력이면 같은 결과다(날짜 같은 흔들리는 값이 없다)', () => {
    const input = { rules: '# 머리\n설명\n## 규칙\n- 하나', roadmap: '## 현재 위치\n- a', worklog: '## 2026-10-01 — t (m)\n' };
    assert.equal(buildSessionContext(input), buildSessionContext(input));
    assert.ok(!buildSessionContext(input).includes('설명'), '규칙 파일의 머리 설명은 싣지 않는다');
});

test('저장된 SESSION_CONTEXT 는 생성 결과와 같고, 상한 안이며, 꼭 있어야 할 규칙을 담는다', () => {
    const rules = readFileSync('docs/wiki/SESSION_RULES.md', 'utf8');
    const saved = readFileSync('SESSION_CONTEXT.md', 'utf8');
    const built = buildSessionContext({
        rules, roadmap: readFileSync('ROADMAP.md', 'utf8'), worklog: readFileSync('WORKLOG.md', 'utf8'),
        openItems: readFileSync('docs/OPEN_ITEMS.md', 'utf8')
    });
    assert.ok(rules.length <= MAX_RULES_CHARS, `SESSION_RULES ${rules.length}자 > ${MAX_RULES_CHARS}`);
    assert.ok(built.length <= MAX_CONTEXT_CHARS, `생성본 ${built.length}자 > ${MAX_CONTEXT_CHARS}`);
    assert.equal(saved, built, 'SESSION_CONTEXT.md 를 직접 고쳤거나 원본이 바뀌었습니다. `npm run context:build` 를 돌리세요.');
    assert.match(saved, /생성 파일이다 — 직접 고치지 않는다/);
    assert.match(saved, /## 최근 작업 \d건/);
});

// 배포 관문(node:20-alpine)에는 bash 도 .git 도 없어 훅을 돌릴 수 없다. 로컬·푸시 전 검사에서 돈다.
const canRunHooks = spawnSync('bash', ['-c', 'git rev-parse --show-toplevel'], { stdio: 'ignore' }).status === 0;

test('두 세션 시작 훅이 같은 내용을 넣고, Codex 상한 안이다', { skip: canRunHooks ? false : 'bash·git 없음(배포 관문)' }, () => {
    const claude = JSON.parse(execFileSync('bash', ['.claude/hooks/session-start-context.sh'], { encoding: 'utf8' }))
        .hookSpecificOutput.additionalContext;
    const codex = execFileSync('bash', ['.codex/hooks/session-start-context.sh'], { encoding: 'utf8' });
    assert.equal(claude.trim(), codex.trim(), 'Claude 와 Codex 가 받는 내용이 달라졌다');
    const codexLimit = JSON.parse(readFileSync('.codex/hooks.json', 'utf8'))
        .hooks.SessionStart[0].hooks[0].additionalContextLimit;
    assert.ok(codex.length <= codexLimit, `Codex 훅 출력 ${codex.length}자 > 상한 ${codexLimit}자 — 끝이 잘린다`);
});
