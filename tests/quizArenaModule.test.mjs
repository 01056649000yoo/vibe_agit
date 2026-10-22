import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateManifest } from '../src/modules/types.js';
import { quizArenaManifest } from '../src/modules/game/quiz-arena/manifest.js';

// `npm run new:module` 이 만든 기본 검사. 모듈이 자라면 기능 검사를 이 파일에 더한다.
// 레지스트리는 확장자 없이 불러와 Node 에서 직접 열리지 않으므로 등록은 글로 확인한다(tests/extensionRegistries.test.mjs 와 같은 방식).
test('quiz-arena: 설정 규칙을 지키고 레지스트리에 있다', () => {
    assert.deepEqual(validateManifest(quizArenaManifest), []);
    const registry = readFileSync('src/modules/registry.js', 'utf8');
    assert.ok(registry.includes("'./game/quiz-arena/manifest'") && registry.split('quizArenaManifest').length - 1 >= 2, '레지스트리에 없습니다.');
});

test('quiz-arena: 관리자 시험 모듈 — 학생·일반 교사에게는 어떤 설정으로도 보이지 않는다', () => {
    assert.equal(quizArenaManifest.defaultEnabled, false);
    assert.equal(quizArenaManifest.adminOnly, true, '공개 전에는 관리자 전용이어야 합니다(공개할 때 이 검사를 함께 고칩니다).');
    assert.equal(quizArenaManifest.performance.realtime, 'none');
    // 학생·교사 활성 목록은 adminOnly 를 항상 거르고, 교사 놀이터 관리 화면은 관리자에게만 메뉴를 보인다.
    const registry = readFileSync('src/modules/registry.js', 'utf8');
    assert.match(registry, /if \(m\.adminOnly\) return false;/);
    const cards = readFileSync('src/modules/game/teacher/RegisteredGameModuleCards.jsx', 'utf8');
    assert.match(cards, /!module\.adminOnly \|\| isAdmin/);
    assert.match(cards, /module\.adminOnly && <span[^>]*>개발중<\/span>/);
});

test('quiz-arena: 인형뽑기 바로 아래에 놓이고 도움말도 관리자 전용이다', async () => {
    const { spellingClawManifest } = await import('../src/modules/game/spelling-claw/manifest.js');
    assert.ok(quizArenaManifest.management.order > spellingClawManifest.management.order);
    const guides = readFileSync('src/constants/teacherGuides.js', 'utf8');
    assert.match(guides, /'quiz-arena': \{\n\s+title: '수호룡 퀴즈 아레나',\n\s+adminOnly: true,/);
});
