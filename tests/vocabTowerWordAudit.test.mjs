import test from 'node:test';
import assert from 'node:assert/strict';
import {
    auditVocabularySources,
    buildDeckPlan,
    buildReviewDraft,
    createAuditArtifacts,
    loadHumanReview,
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

test('첫 덱 검수 초안은 자동 문항과 직접 검수 문항을 명확히 분리한다', async () => {
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
        assert.equal(item.meaningNumber, null);
    });
});

test('3학년 첫 덱 직접 검수는 40개 품사·뜻 번호·정답·구별 문항을 빠짐없이 채운다', async () => {
    const [sources, humanReview] = await Promise.all([
        loadVocabularySources(),
        loadHumanReview()
    ]);
    const audit = auditVocabularySources(sources);
    const plan = buildDeckPlan(audit);
    const reviewed = buildReviewDraft(audit, plan, 3, 1, humanReview);
    assert.equal(
        reviewed.status,
        'manual_review_complete_pending_teacher_spot_check_not_for_student_delivery'
    );
    assert.deepEqual(reviewed.requiredEnrichment, []);
    assert.equal(reviewed.items.length, 40);
    assert.equal(reviewed.reviewSummary.partOfSpeechFilled, 40);
    assert.equal(reviewed.reviewSummary.meaningNumbersAssigned, 40);
    assert.equal(reviewed.reviewSummary.usageDistinctionsAuthored, 40);
    assert.ok(reviewed.reviewSummary.correctedItems > 0);
    assert.equal(
        reviewed.items.filter((item) => item.questions.usageDistinction.options[0].isCorrect).length,
        20
    );
    const expectedFourChoicePositions = Array.from({ length: 40 }, (_, index) => Math.floor(index / 10));
    const meaningCorrectPositions = reviewed.items
        .map((item) => item.questions.meaningChoice.options.findIndex((option) => option.isCorrect))
        .sort((left, right) => left - right);
    const clozeCorrectPositions = reviewed.items
        .map((item) => item.questions.clozeChoice.options.findIndex((option) => option.isCorrect))
        .sort((left, right) => left - right);
    assert.deepEqual(meaningCorrectPositions, expectedFourChoicePositions);
    assert.deepEqual(clozeCorrectPositions, expectedFourChoicePositions);
    reviewed.items.forEach((item) => {
        assert.equal(item.reviewStatus, 'reviewed');
        assert.equal(item.partOfSpeech, '명사');
        assert.equal(item.meaningNumber, 1);
        assert.ok(item.questions.definitionInput.acceptedAnswers.includes(item.word));
        assert.equal(item.questions.usageDistinction.status, 'reviewed');
        assert.equal(item.questions.usageDistinction.options.filter((option) => option.isCorrect).length, 1);
        Object.values(item.questions).forEach((question) => assert.equal(question.status, 'reviewed'));
    });
});

test('직접 검수 항목이 누락되거나 덱과 다르면 산출물을 만들지 않는다', async () => {
    const [sources, humanReview] = await Promise.all([
        loadVocabularySources(),
        loadHumanReview()
    ]);
    const audit = auditVocabularySources(sources);
    const plan = buildDeckPlan(audit);
    const missingItemReview = {
        ...humanReview,
        items: humanReview.items.slice(1)
    };
    assert.throws(
        () => buildReviewDraft(audit, plan, 3, 1, missingItemReview),
        /직접 검수 항목 수가 일치하지 않습니다/
    );
});

test('생성 파일은 같은 원본에서 항상 같은 결과를 만든다', async () => {
    const first = await createAuditArtifacts();
    const second = await createAuditArtifacts();
    assert.equal(JSON.stringify(first.deckPlan), JSON.stringify(second.deckPlan));
    assert.equal(JSON.stringify(first.reviewDraft), JSON.stringify(second.reviewDraft));
    assert.deepEqual(first.files.map(([, contents]) => contents), second.files.map(([, contents]) => contents));
});
