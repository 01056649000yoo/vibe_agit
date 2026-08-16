import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    artifactToWorkspace,
    rowToSeedItem,
    validateReviewItem
} from '../src/modules/game/vocab-tower/reviewModel.js';

const [artifactText, dashboardSource, panelSource, apiSource] = await Promise.all([
    readFile('docs/vocab-tower/data/grade3-deck01-review.json', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('src/components/admin/AdminVocabReviewPanel.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/reviewApi.js', 'utf8')
]);

const artifact = JSON.parse(artifactText);

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
    assert.match(dashboardSource, /어휘 V2 검수/);
    assert.match(panelSource, /grade3-deck01-review\.json/);
    assert.match(panelSource, /학생 게임에는 연결되지 않습니다/);
    assert.match(apiSource, /admin_get_vocab_tower_v2_review_deck_v1/);
    assert.match(apiSource, /admin_seed_vocab_tower_v2_review_deck_v1/);
    assert.match(apiSource, /admin_save_vocab_tower_v2_review_item_v1/);
    assert.match(apiSource, /admin_set_vocab_tower_v2_review_status_v1/);
    assert.doesNotMatch(apiSource, /\.from\(/);
});
