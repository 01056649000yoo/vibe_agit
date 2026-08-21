import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    artifactToWorkspace,
    rowToSeedItem,
    validateReviewItem
} from '../src/modules/game/vocab-tower/reviewModel.js';

const [
    artifactText,
    assistedArtifactText,
    dashboardSource,
    panelSource,
    panelCss,
    apiSource,
    seedScriptSource,
    packageText
] = await Promise.all([
    readFile('docs/vocab-tower/data/grade3-deck01-review.json', 'utf8'),
    readFile('docs/vocab-tower/data/grade4-deck02-review.json', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('src/components/admin/AdminVocabReviewPanel.jsx', 'utf8'),
    readFile('src/components/admin/adminVocabReview.css', 'utf8'),
    readFile('src/modules/game/vocab-tower/reviewApi.js', 'utf8'),
    readFile('scripts/seed-vocab-tower-v2-review.mjs', 'utf8'),
    readFile('package.json', 'utf8')
]);

const artifact = JSON.parse(artifactText);
const assistedArtifact = JSON.parse(assistedArtifactText);

test('확인한 첫 덱 산출물을 DB 검수 행과 시드 입력으로 손실 없이 바꾼다', () => {
    const workspace = artifactToWorkspace(artifact);
    assert.equal(workspace.deck.review_status, 'teacher_confirmed');
    assert.equal(workspace.items.length, 40);

    workspace.items.forEach((item) => {
        assert.ok(item.item_order >= 1 && item.item_order <= 40);
        assert.ok(item.source_definition);
        assert.ok(item.source_example);
        assert.equal(validateReviewItem(item), null);
        const seedItem = rowToSeedItem(item);
        assert.equal(seedItem.itemKey, item.item_key);
        assert.equal(seedItem.itemOrder, item.item_order);
        assert.equal(seedItem.sourceDefinition, item.source_definition);
        assert.equal(seedItem.sourceExample, item.source_example);
        assert.deepEqual(seedItem.acceptedAnswers, item.accepted_answers);
    });
});

test('나머지 덱 보조 검수 산출물은 교사 확인 전 1차 검수 상태로 연다', () => {
    const workspace = artifactToWorkspace(assistedArtifact);
    assert.equal(workspace.deck.review_status, 'editorial_review');
    assert.equal(workspace.deck.review_mode, 'assisted');
    assert.equal(workspace.items.length, assistedArtifact.itemCount);
    workspace.items.forEach((item) => assert.equal(validateReviewItem(item), null));
});

test('자동 신호가 없는 보조 검수 덱은 바로 교사 확인 상태로 연다', async () => {
    const clearArtifact = JSON.parse(await readFile('docs/vocab-tower/data/grade3-deck02-review.json', 'utf8'));
    assert.equal(clearArtifact.reviewSummary.priorityItems, 0);
    assert.equal(artifactToWorkspace(clearArtifact).deck.review_status, 'teacher_confirmed');
});

test('검수 모델은 빈 보기·복수 정답·표제어가 빠진 직접 입력 정답을 막는다', () => {
    const [item] = artifactToWorkspace(artifact).items;
    assert.match(validateReviewItem({
        ...item,
        questions: {
            ...item.questions,
            meaningChoice: {
                ...item.questions.meaningChoice,
                options: item.questions.meaningChoice.options.map((option, index) => (
                    index === 0 ? { ...option, value: '' } : option
                ))
            }
        }
    }), /빈 보기/);
    assert.match(validateReviewItem({
        ...item,
        questions: {
            ...item.questions,
            meaningChoice: {
                ...item.questions.meaningChoice,
                options: item.questions.meaningChoice.options.map((option) => ({ ...option, isCorrect: true }))
            }
        }
    }), /정답은 하나/);
    assert.match(validateReviewItem({
        ...item,
        questions: {
            ...item.questions,
            definitionInput: { ...item.questions.definitionInput, acceptedAnswers: ['다른답'] }
        }
    }), /허용 정답/);
});

test('관리자 화면은 검수 API만 사용하고 운영 게임에는 직접 연결하지 않는다', () => {
    assert.match(dashboardSource, /React\.lazy\(\(\) => import\('\.\/AdminVocabReviewPanel'\)\)/);
    // 2026-08-21 탭을 묶음으로 정리하며 이름이 '어휘 V2' 로 짧아졌다(묶음이 '📚 검수').
    assert.match(dashboardSource, /id: 'vocab', label: '어휘 V2'/);
    assert.match(panelSource, /import\.meta\.glob/);
    assert.match(panelSource, /grade\[3-6\]-deck\[0-9\]\[0-9\]-review\.json/);
    assert.match(panelSource, /학생 게임에는 연결되지 않습니다/);
    assert.match(panelSource, /우선 확인/);
    assert.match(panelSource, /확인 필요만/);
    assert.match(panelSource, /reviewFilter === 'priority'/);
    assert.match(panelSource, /표본 확인/);
    assert.match(panelCss, /grid-template-rows: auto auto minmax\(0, 1fr\)/);
    assert.match(panelCss, /height: min\(720px, calc\(100vh - 40px\)\)/);
    assert.match(panelCss, /admin-vocab-review__word-buttons \{[^}]*min-height: 0;[^}]*overflow-y: auto/);
    assert.match(apiSource, /admin_get_vocab_tower_v2_review_deck_v1/);
    assert.match(apiSource, /admin_seed_vocab_tower_v2_review_deck_v1/);
    assert.match(apiSource, /admin_save_vocab_tower_v2_review_item_v1/);
    assert.match(apiSource, /admin_set_vocab_tower_v2_review_status_v1/);
    assert.doesNotMatch(apiSource, /\.from\(/);
});

test('전체 덱 반영 도구는 agit-db에서 기본 롤백하고 명시 적용만 커밋한다', () => {
    const packageJson = JSON.parse(packageText);
    assert.match(seedScriptSource, /AGIT_DB_CONTAINER \|\| 'agit-db'/);
    assert.match(seedScriptSource, /process\.argv\.includes\('--apply'\)/);
    assert.match(seedScriptSource, /applyChanges \? 'COMMIT;' : 'ROLLBACK;'/);
    assert.match(seedScriptSource, /existing vocabulary review deck item count changed/);
    assert.doesNotMatch(seedScriptSource, /DELETE FROM public\.vocab_tower_v2_review/);
    assert.equal(
        packageJson.scripts['vocab:review:seed:check'],
        'node scripts/seed-vocab-tower-v2-review.mjs'
    );
    assert.equal(
        packageJson.scripts['vocab:review:seed'],
        'node scripts/seed-vocab-tower-v2-review.mjs --apply'
    );
});
