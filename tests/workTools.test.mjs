import assert from 'node:assert/strict';
import test from 'node:test';
import { guardsFor, relatedTests } from '../scripts/relatedTests.mjs';
import { areaOf, buildRetro, monthEntries, normalizeModel, parseSubject } from '../scripts/retroReport.mjs';
import { entriesMentioning } from '../scripts/workMemory.mjs';

/*
 * 작업 중 도구(2026-09-28): 관련 검사 찾기(test:related·recall), 작업 기록 찾기(recall), 월간 회고(retro).
 */

test('관련 검사: 저장소 경로·확장자 뺀 경로·흔하지 않은 이름으로 찾고, 맨 이름·흔한 이름은 안 쓴다', () => {
    const tests = {
        'tests/a.test.mjs': "readFile('README.md')",
        'tests/b.test.mjs': "read('src/x/README.md')",
        'tests/c.test.mjs': "import x from '../src/lib/textMetrics.js'",
        'tests/d.test.mjs': 'const m = "src/lib/textMetrics";',
        'tests/e.test.mjs': "import { a } from '../src/modules/registry.js'; // package 이야기",
        'tests/f.test.mjs': "it's about StudentBottomNav.jsx"
    };
    assert.deepEqual(guardsFor('README.md', tests), ['tests/a.test.mjs'], '맨 위 README 가 폴더 속 README 에 걸리면 안 된다');
    assert.deepEqual(guardsFor('src/lib/textMetrics.js', tests), ['tests/c.test.mjs', 'tests/d.test.mjs']);
    assert.deepEqual(guardsFor('package.json', tests), [], '맨 이름 `package` 로 찾으면 아무 데나 걸린다');
    assert.deepEqual(guardsFor('src/other/registry.js', tests), [], 'registry 같은 흔한 이름은 이름만으로 찾지 않는다');
    assert.deepEqual(relatedTests(['tests/b.test.mjs', 'src/lib/textMetrics.js'], tests),
        ['tests/b.test.mjs', 'tests/c.test.mjs', 'tests/d.test.mjs'], '바뀐 검사 파일 자신도 넣는다');
});

test('작업 기록에서 그 이름이 나오는 항목 제목을 최신부터 찾는다', () => {
    const log = '# W\n## 2026-10-02 — 둘 (Codex)\nStudentBottomNav 고침\n\n## 2026-10-01 — 하나 (Claude)\n다른 일\n';
    const archive = '# 9월\n## 2026-09-30 — 옛날 (Claude)\nStudentBottomNav.jsx\n';
    assert.deepEqual(entriesMentioning([log, archive], 'StudentBottomNav'), ['2026-10-02 — 둘 (Codex)', '2026-09-30 — 옛날 (Claude)']);
    assert.deepEqual(entriesMentioning([log, archive], 'StudentBottomNav', 1), ['2026-10-02 — 둘 (Codex)']);
});

test('회고: 커밋 제목·모델 이름·영역·원인 태그를 모아 센다', () => {
    assert.deepEqual(parseSubject('fix(neighbor-agit): 무엇'), { type: 'fix', scope: 'neighbor-agit' });
    assert.deepEqual(parseSubject('그냥 제목'), { type: '기타', scope: null });
    assert.equal(normalizeModel('Claude Opus 5.5'), 'Claude');
    assert.equal(normalizeModel('GPT/Codex'), 'Codex');
    assert.equal(normalizeModel('Claude, 읽기 전용'), 'Claude');
    assert.equal(areaOf('src/modules/community/neighbor-agit/api.js'), 'src/modules/community/neighbor-agit');
    assert.equal(areaOf('supabase/migrations/1.sql'), 'supabase/migrations');
    assert.equal(areaOf('package.json'), '(맨 위 파일)');

    const logs = ['## 2026-10-02 — a (Claude Opus 5)\n- **한 일**: [원인: 반쪽수정] 고침\n\n## 2026-10-01 — b (Codex)\n- **한 일**: [원인: 엉뚱한이름]\n\n## 2026-09-30 — c (Claude)\n'];
    assert.equal(monthEntries(logs, '2026-10').length, 2);
    const retro = buildRetro({
        month: '2026-10',
        subjects: ['fix(a): x', 'feat: y', 'fix: z'],
        fixFiles: [['src/components/teacher/A.jsx', 'tests/a.test.mjs'], ['src/components/teacher/B.jsx']],
        logs,
        openItems: [{ id: 'OI-001', kind: '후속', since: '2026-08-01' }],
        pitfallsAdded: 1,
        checkCounts: { unitTests: 10, sqlSmokes: 2, e2eTests: 1, skipped: 0 },
        failures: ['검사 가', '검사 가', '검사 나'],
        today: '2026-11-01'
    });
    assert.match(retro, /커밋 3개 · 고침\(fix\) 2개 \(67%\)/);
    assert.match(retro, /\| src\/components\/teacher \| 2 \|/, '테스트 파일은 영역에서 빼고, 한 커밋 안 같은 영역은 한 번만');
    assert.match(retro, /\| 반쪽수정 \| 1 \|/);
    assert.match(retro, /정해 두지 않은 원인 이름: 엉뚱한이름/);
    assert.match(retro, /\| 검사 가 \| 2 \|/);
    assert.match(retro, /- OI-001 후속 \(2026-08-01\)/);
    assert.match(retro, /## 판단 \(사람이 쓴다\)/);
});
