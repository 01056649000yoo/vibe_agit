import test from 'node:test';
import assert from 'node:assert/strict';
import {
    auditVocabularySources,
    buildDeckPlan,
    buildReviewDraft,
    createAuditArtifacts,
    loadVocabularySources
} from '../scripts/audit-vocab-tower-v2.mjs';

test('정적 어휘 원본과 현재 운영 기준 개수를 함께 보존한다', async () => {
    const audit = auditVocabularySources(await loadVocabularySources());
    assert.equal(audit.sourceRows.length, 1586);
    assert.equal(audit.canonicalRows.length, 1573);
    assert.equal(audit.duplicateGroups.length, 13);
    assert.deepEqual(
        audit.canonicalRows.filter((item) => item.grade === 3).map((item) => item.word).includes('가상'),
        true
    );
    assert.equal(
        audit.duplicateGroups.find((group) => group.grade === 3 && group.word === '가상')?.classification,
        'exact_duplicate'
    );
    assert.equal(
        audit.duplicateGroups.find((group) => group.grade === 4 && group.word === '상황')?.classification,
        'example_variant'
    );
    assert.equal(
        audit.duplicateGroups.find((group) => group.grade === 4 && group.word === '문제')?.classification,
        'definition_variant'
    );
});

test('모든 운영 기준 어휘를 학년별 10개 덱에 한 번씩 균형 배정한다', async () => {
    const audit = auditVocabularySources(await loadVocabularySources());
    const plan = buildDeckPlan(audit);
    const plannedKeys = plan.grades.flatMap((grade) => grade.decks.flatMap((deck) => deck.items.map((item) => item.itemKey)));
    assert.equal(plan.grades.length, 4);
    assert.equal(plannedKeys.length, 1573);
    assert.equal(new Set(plannedKeys).size, 1573);
    plan.grades.forEach((grade) => {
        assert.equal(grade.decks.length, 10);
        const sizes = grade.decks.map((deck) => deck.itemCount);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
        assert.equal(sizes.reduce((sum, size) => sum + size, 0), grade.itemCount);
    });
});

test('첫 덱 검수 초안은 자동 문항과 사람 검수 문항을 명확히 분리한다', async () => {
    const audit = auditVocabularySources(await loadVocabularySources());
    const plan = buildDeckPlan(audit);
    const draft = buildReviewDraft(audit, plan, 3, 1);
    assert.equal(draft.itemCount, 40);
    assert.equal(draft.items.length, 40);
    draft.items.forEach((item) => {
        assert.deepEqual(item.questions.definitionInput.acceptedAnswers, [item.word]);
        assert.deepEqual(item.questions.clozeInput.acceptedAnswers, [item.word]);
        assert.equal(item.questions.usageDistinction.status, 'human_review_required');
        assert.equal(item.partOfSpeech, null);
    });
});

test('생성 파일은 같은 원본에서 항상 같은 결과를 만든다', async () => {
    const first = await createAuditArtifacts();
    const second = await createAuditArtifacts();
    assert.equal(JSON.stringify(first.deckPlan), JSON.stringify(second.deckPlan));
    assert.equal(JSON.stringify(first.reviewDraft), JSON.stringify(second.reviewDraft));
    assert.deepEqual(first.files.map(([, contents]) => contents), second.files.map(([, contents]) => contents));
});

