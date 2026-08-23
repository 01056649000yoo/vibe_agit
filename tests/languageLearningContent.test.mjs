import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    auditLanguageContentCatalog,
    loadLanguageContentCatalog,
    reconstructProverbExpression
} from '../scripts/audit-language-learning-content.mjs';

const migration = await readFile('supabase/migrations/20261160_learning_content_catalog.sql', 'utf8');
const alignmentMigration = await readFile(
    'supabase/migrations/20261161_learning_content_curriculum_alignment.sql',
    'utf8'
);
const g34ReviewPack = JSON.parse(await readFile(
    'docs/language-learning/data/g34-preview-review-v1.json',
    'utf8'
));

test('속담 85개와 사자성어 100개를 손실 없이 하나의 검수 카탈로그로 보존한다', async () => {
    const catalog = await loadLanguageContentCatalog();
    const audit = auditLanguageContentCatalog(catalog);

    assert.equal(audit.valid, true, audit.errors.join('\n'));
    assert.deepEqual(audit.counts, {
        items: 185,
        proverbs: 85,
        idioms: 100,
        questionVariants: 405,
        reconstructedProverbs: 36,
        g56Items: 185,
        g34PreviewItems: 20,
        pilotItems: 40,
        alignedItems: 85,
        enrichmentItems: 100,
        pendingContentLevels: 145,
        editorialReviewItems: 20,
        teacherConfirmationItems: 20,
        meaningChoiceVariants: 20
    });
    assert.equal(catalog.collections.length, 2);
    assert.equal(catalog.status, 'g34_preview_editorial_review_not_for_student_delivery');
});

test('항목 하나라도 빠지거나 검수 없이 승격되면 카탈로그 검사가 실패한다', async () => {
    const catalog = await loadLanguageContentCatalog();
    const missingItem = structuredClone(catalog);
    missingItem.items.pop();
    assert.equal(auditLanguageContentCatalog(missingItem).valid, false);

    const prematurelyPublished = structuredClone(catalog);
    prematurelyPublished.items[0].reviewStatus = 'published';
    assert.equal(auditLanguageContentCatalog(prematurelyPublished).valid, false);

    const wrongCurriculumBand = structuredClone(catalog);
    wrongCurriculumBand.items[0].curriculumBand = 'g34';
    assert.equal(auditLanguageContentCatalog(wrongCurriculumBand).valid, false);

    const missingPilotMember = structuredClone(catalog);
    missingPilotMember.collections[0].itemKeys.pop();
    assert.equal(auditLanguageContentCatalog(missingPilotMember).valid, false);

    const changedReviewedMeaning = structuredClone(catalog);
    const reviewedItem = changedReviewedMeaning.items.find((item) => item.gradeBands.includes('g34'));
    reviewedItem.definition = '검수팩과 다른 뜻';
    assert.equal(auditLanguageContentCatalog(changedReviewedMeaning).valid, false);

    const missingCorrectChoice = structuredClone(catalog);
    const meaningChoice = missingCorrectChoice.items
        .find((item) => item.gradeBands.includes('g34'))
        .questions.find((question) => question.questionType === 'meaningChoice');
    meaningChoice.choices = meaningChoice.choices.filter((choice) => choice !== meaningChoice.correctAnswer);
    assert.equal(auditLanguageContentCatalog(missingCorrectChoice).valid, false);

    const wrongSummaryCount = structuredClone(catalog);
    wrongSummaryCount.counts.meaningChoiceVariants = 19;
    assert.equal(auditLanguageContentCatalog(wrongSummaryCount).valid, false);
});

test('사자성어의 세 원본 문제 파일을 같은 항목 아래 문제 변형으로 병합한다', async () => {
    const catalog = await loadLanguageContentCatalog();
    const idioms = catalog.items.filter((item) => item.contentType === 'idiom');
    assert.equal(idioms.length, 100);

    idioms.forEach((item) => {
        const sourceQuestions = item.questions.filter((question) => question.reviewStatus === 'source_imported');
        assert.deepEqual(
            sourceQuestions.map((question) => question.questionType),
            ['clozeInput', 'initialsInput', 'definitionInput']
        );
        assert.equal(sourceQuestions.every((question) => question.correctAnswer === item.expression), true);
        assert.ok(item.hanja);
        assert.ok(item.example.includes(item.expression));
    });

    const 고진감래 = idioms.find((item) => item.expression === '고진감래');
    assert.equal(고진감래.hanja, '苦盡甘來');
    assert.match(고진감래.definition, /힘든 일이 끝난 뒤/);
});

test('낱말 답만 남은 속담은 완성 표현 초안을 복원하되 사람 검수 신호를 유지한다', async () => {
    assert.deepEqual(
        reconstructProverbExpression('떡 줄 사람은 꿈도 안 꾸는데 ㄱ ㅊ ㄱ 부터 마신다', '김칫국'),
        { expression: '떡 줄 사람은 꿈도 안 꾸는데 김칫국부터 마신다', reconstructed: true }
    );
    assert.deepEqual(
        reconstructProverbExpression('가는 말이 고와야 ㅇ ㄴ 말이 곱다', '가는 말이 고와야 오는 말이 곱다'),
        { expression: '가는 말이 고와야 오는 말이 곱다', reconstructed: false }
    );

    const catalog = await loadLanguageContentCatalog();
    const reconstructed = catalog.items.filter((item) => item.reviewFlags.includes('expression_reconstructed'));
    assert.equal(reconstructed.length, 36);
    assert.equal(reconstructed.every((item) => item.reviewStatus === 'source_imported'), true);

    const reviewedReconstructionIds = [63, 90, 92, 93, 101];
    reviewedReconstructionIds.forEach((sourceId) => {
        const item = catalog.items.find((candidate) => (
            candidate.contentType === 'proverb' && candidate.source.sourceId === sourceId
        ));
        assert.equal(item.reviewFlags.includes('expression_reconstructed'), false);
    });

    const unresolved = catalog.items.filter((item) => item.reviewFlags.includes('unresolved_initials'));
    assert.deepEqual(unresolved.map((item) => item.source.sourceId), [58]);
});

test('3·4학년 미리 만나기 20개는 검수된 뜻·예문·4지선다를 갖고 교사 확인을 기다린다', async () => {
    const catalog = await loadLanguageContentCatalog();
    const previewItems = catalog.items.filter((item) => item.gradeBands.includes('g34'));
    const pilotItems = catalog.items.filter((item) => item.contentLevel !== null);

    assert.equal(previewItems.length, 20);
    assert.equal(pilotItems.length, 40);
    assert.equal(previewItems.every((item) => item.contentLevel === 1), true);
    assert.equal(pilotItems.filter((item) => item.contentLevel === 2).length, 20);
    assert.equal(g34ReviewPack.items.length, 20);
    assert.equal(new Set(g34ReviewPack.items.map((item) => item.itemKey)).size, 20);

    catalog.items.forEach((item) => {
        assert.equal(item.curriculumBand, 'g56');
        assert.equal(item.curriculumRole, item.contentType === 'proverb' ? 'aligned' : 'enrichment');
        assert.ok(item.gradeBands.includes('g56'));
        assert.equal(item.reviewFlags.includes('grade_band_required'), false);
        assert.equal(item.reviewFlags.includes('content_level_required'), item.contentLevel === null);
        const meaningChoices = item.questions.filter((question) => question.questionType === 'meaningChoice');
        const sourceQuestions = item.questions.filter((question) => question.questionType !== 'meaningChoice');

        sourceQuestions.forEach((question) => {
            assert.deepEqual(question.choices, []);
            assert.deepEqual(question.gradeBands, ['g56']);
            assert.equal(question.difficulty, 3);
            assert.equal(question.reviewStatus, 'source_imported');
        });

        if (item.gradeBands.includes('g34')) {
            assert.equal(item.reviewStatus, 'editorial_review');
            assert.deepEqual(item.reviewFlags, ['teacher_confirmation_required']);
            assert.ok(item.example);
            assert.equal(meaningChoices.length, 1);
            assert.equal(meaningChoices[0].choices.length, 4);
            assert.equal(new Set(meaningChoices[0].choices).size, 4);
            assert.equal(meaningChoices[0].choices.includes(meaningChoices[0].correctAnswer), true);
            assert.deepEqual(meaningChoices[0].gradeBands, ['g34', 'g56']);
            assert.equal(meaningChoices[0].difficulty, 1);
            assert.equal(meaningChoices[0].reviewStatus, 'editorial_review');
        } else {
            assert.equal(item.reviewStatus, 'source_imported');
            assert.ok(item.reviewFlags.includes('meaning_choice_required'));
            assert.equal(meaningChoices.length, 0);
        }
    });

    const correctedProverb = previewItems.find((item) => item.itemKey === 'proverb:source-090');
    assert.equal(correctedProverb.expression, '천 리 길도 한 걸음부터');

    const clarifiedProverb = previewItems.find((item) => item.itemKey === 'proverb:source-101');
    assert.equal(clarifiedProverb.definition.includes('험담'), false);

    catalog.collections.forEach((collection) => {
        assert.equal(collection.collectionKey, 'core-v1');
        assert.equal(collection.itemKeys.length, 20);
        assert.equal(new Set(collection.itemKeys).size, 20);
        assert.deepEqual(collection.gradeBands, ['g34', 'g56']);
        assert.equal(collection.reviewStatus, 'editorial_review');
    });
});

test('공통 카탈로그는 원본·문제·묶음을 분리하고 정답표 직접 접근을 닫는다', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.learning_content_items/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.learning_content_questions/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.learning_content_collections/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.learning_content_collection_items/);
    assert.match(migration, /FOREIGN KEY \(content_type, item_key\)[\s\S]*learning_content_items/);
    assert.match(migration, /review_status <> 'published'[\s\S]*cardinality\(grade_bands\) > 0/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.learning_content_questions FROM PUBLIC, anon, authenticated, service_role/);
    assert.doesNotMatch(migration, /GRANT SELECT[\s\S]*learning_content_questions/);
    assert.match(alignmentMigration, /ADD COLUMN IF NOT EXISTS curriculum_band TEXT/);
    assert.match(alignmentMigration, /ADD COLUMN IF NOT EXISTS curriculum_role TEXT/);
    assert.match(alignmentMigration, /curriculum_band IS NOT NULL[\s\S]*curriculum_role IS NOT NULL/);
    assert.match(alignmentMigration, /grade_bands[\s\S]*실제 학생 제공 가능 학년군/);
});
