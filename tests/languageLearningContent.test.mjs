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

test('속담 85개와 사자성어 100개를 손실 없이 하나의 검수 카탈로그로 보존한다', async () => {
    const catalog = await loadLanguageContentCatalog();
    const audit = auditLanguageContentCatalog(catalog);

    assert.equal(audit.valid, true, audit.errors.join('\n'));
    assert.deepEqual(audit.counts, {
        items: 185,
        proverbs: 85,
        idioms: 100,
        questionVariants: 385,
        reconstructedProverbs: 41,
        g56Items: 185,
        g34PreviewItems: 20,
        pilotItems: 40,
        alignedItems: 85,
        enrichmentItems: 100,
        pendingContentLevels: 145
    });
    assert.equal(catalog.collections.length, 2);
    assert.equal(catalog.status, 'curriculum_classified_not_for_student_delivery');
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
});

test('사자성어의 세 원본 문제 파일을 같은 항목 아래 문제 변형으로 병합한다', async () => {
    const catalog = await loadLanguageContentCatalog();
    const idioms = catalog.items.filter((item) => item.contentType === 'idiom');
    assert.equal(idioms.length, 100);

    idioms.forEach((item) => {
        assert.deepEqual(
            item.questions.map((question) => question.questionType),
            ['clozeInput', 'initialsInput', 'definitionInput']
        );
        assert.equal(item.questions.every((question) => question.correctAnswer === item.expression), true);
        assert.ok(item.hanja);
        assert.ok(item.example.includes(item.expression));
    });

    const 고진감래 = idioms.find((item) => item.expression === '고진감래');
    assert.equal(고진감래.hanja, '苦盡甘來');
    assert.match(고진감래.definition, /고생 끝/);
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
    assert.equal(reconstructed.length, 41);
    assert.equal(reconstructed.every((item) => item.reviewStatus === 'source_imported'), true);

    const unresolved = catalog.items.filter((item) => item.reviewFlags.includes('unresolved_initials'));
    assert.deepEqual(unresolved.map((item) => item.source.sourceId), [58]);
});

test('교육과정 기준과 제공 학년을 분리하고 시범 40개만 내용 난이도를 정한다', async () => {
    const catalog = await loadLanguageContentCatalog();
    const previewItems = catalog.items.filter((item) => item.gradeBands.includes('g34'));
    const pilotItems = catalog.items.filter((item) => item.contentLevel !== null);

    assert.equal(previewItems.length, 20);
    assert.equal(pilotItems.length, 40);
    assert.equal(previewItems.every((item) => item.contentLevel === 1), true);
    assert.equal(pilotItems.filter((item) => item.contentLevel === 2).length, 20);

    catalog.items.forEach((item) => {
        assert.equal(item.curriculumBand, 'g56');
        assert.equal(item.curriculumRole, item.contentType === 'proverb' ? 'aligned' : 'enrichment');
        assert.ok(item.gradeBands.includes('g56'));
        assert.equal(item.reviewFlags.includes('grade_band_required'), false);
        assert.equal(item.reviewFlags.includes('content_level_required'), item.contentLevel === null);
        assert.ok(item.reviewFlags.includes('meaning_choice_required'));
        item.questions.forEach((question) => {
            assert.deepEqual(question.choices, []);
            assert.deepEqual(question.gradeBands, ['g56']);
            assert.equal(question.difficulty, 3);
            assert.equal(question.reviewStatus, 'source_imported');
        });
    });

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
