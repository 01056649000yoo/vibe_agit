#!/usr/bin/env node

/**
 * 옛 수업 도구의 속담·사자성어 팩을 공통 학습 콘텐츠 계약으로 정규화한다.
 *
 * - `--source-dir <경로> --write`: 원본 4개 파일을 병합해 검수용 카탈로그를 다시 만든다.
 * - 인자 없음 또는 `--check`: 저장소에 커밋된 카탈로그의 구조와 개수를 검사한다.
 *
 * 생성 결과는 아직 학생에게 출제할 수 없다. 20개는 편집 검수를 마쳤고, 나머지 165개는
 * 뜻·예문·난이도·선택형 확인 문제 초안까지 갖췄지만 교사 검수 뒤에만 승격한다.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CATALOG_URL = new URL('../docs/language-learning/data/source-import-v1.json', import.meta.url);
const G34_PREVIEW_REVIEW_URL = new URL(
    '../docs/language-learning/data/g34-preview-review-v1.json',
    import.meta.url
);
const G56_REMAINING_REVIEW_URL = new URL(
    '../docs/language-learning/data/g56-remaining-review-v1.json',
    import.meta.url
);
const SOURCE_FILES = Object.freeze({
    proverbs: 'proverbs.json',
    idiomContext: 'idioms.json',
    idiomInitials: 'idiom_initials.json',
    idiomMeaning: 'idiom_meaning_quiz.json'
});
const HANGUL_INITIALS = Object.freeze([
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
    'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
]);
const REQUIRED_REVIEW_FLAGS = Object.freeze([
    'editorial_review_required',
    'meaning_choice_required'
]);
const PILOT_SOURCE_IDS = Object.freeze({
    proverb: Object.freeze([1, 3, 4, 12, 13, 14, 31, 37, 38, 39, 54, 56, 61, 63, 80, 89, 90, 92, 93, 101]),
    idiom: Object.freeze([2, 11, 13, 14, 15, 22, 23, 26, 27, 32, 34, 44, 45, 48, 58, 62, 68, 75, 77, 86])
});
const G34_PREVIEW_SOURCE_IDS = Object.freeze({
    proverb: Object.freeze([3, 13, 14, 37, 54, 63, 90, 92, 93, 101]),
    idiom: Object.freeze([2, 11, 14, 22, 27, 32, 58, 68, 77, 86])
});
const PILOT_SOURCE_ID_SETS = Object.freeze(Object.fromEntries(
    Object.entries(PILOT_SOURCE_IDS).map(([contentType, ids]) => [contentType, new Set(ids)])
));
const G34_PREVIEW_SOURCE_ID_SETS = Object.freeze(Object.fromEntries(
    Object.entries(G34_PREVIEW_SOURCE_IDS).map(([contentType, ids]) => [contentType, new Set(ids)])
));
const G34_PREVIEW_REVIEW_PACK = JSON.parse(await readFile(G34_PREVIEW_REVIEW_URL, 'utf8'));
const G56_REMAINING_REVIEW_PACK = JSON.parse(await readFile(G56_REMAINING_REVIEW_URL, 'utf8'));
const DEFAULT_REVIEW_PACKS = Object.freeze([
    Object.freeze({
        filename: 'g34-preview-review-v1.json',
        role: 'g34PreviewEditorialReview',
        stage: 'review',
        pack: G34_PREVIEW_REVIEW_PACK,
        itemReviewStatus: 'editorial_review',
        itemReviewFlags: Object.freeze(['teacher_confirmation_required']),
        questionReviewStatus: 'editorial_review',
        questionGradeBands: Object.freeze(['g34', 'g56']),
        questionDifficulty: 1,
        variantSuffix: 'meaningChoice-g34-v1'
    }),
    Object.freeze({
        filename: 'g56-remaining-review-v1.json',
        role: 'g56RemainingEditorialDraft',
        stage: 'draft',
        pack: G56_REMAINING_REVIEW_PACK,
        itemReviewStatus: 'source_imported',
        itemReviewFlags: Object.freeze(['editorial_review_required', 'teacher_confirmation_required']),
        questionReviewStatus: 'source_imported',
        questionGradeBands: Object.freeze(['g56']),
        questionDifficulty: 2,
        variantSuffix: 'meaningChoice-g56-draft-v1'
    })
]);

const normalizeText = (value) => String(value ?? '').trim().replaceAll(/\r\n/g, '\n');
const normalizeSpaces = (value) => normalizeText(value).replaceAll(/[ \t]+/g, ' ');
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const stableHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const itemKey = (contentType, sourceId) => `${contentType}:source-${String(sourceId).padStart(3, '0')}`;
const variantKey = (contentType, sourceId, questionType) => (
    `${itemKey(contentType, sourceId)}:${questionType}`
);

const unique = (values) => [...new Set(values)];
const isPilotItem = (contentType, sourceId) => PILOT_SOURCE_ID_SETS[contentType]?.has(Number(sourceId)) || false;
const isG34PreviewItem = (contentType, sourceId) => (
    G34_PREVIEW_SOURCE_ID_SETS[contentType]?.has(Number(sourceId)) || false
);

const learningProfile = (contentType, sourceId) => {
    const g34Preview = isG34PreviewItem(contentType, sourceId);
    return {
        // 2022 개정 국어과 5~6학년군의 관용 표현 학습을 교육과정 기준점으로 삼는다.
        curriculumBand: 'g56',
        curriculumRole: contentType === 'proverb' ? 'aligned' : 'enrichment',
        // gradeBands는 교육과정 귀속이 아니라 실제 학생 제공 가능 학년군이다.
        gradeBands: g34Preview ? ['g34', 'g56'] : ['g56'],
        contentLevel: g34Preview ? 1 : (isPilotItem(contentType, sourceId) ? 2 : null)
    };
};

const reviewFlagsFor = (contentType, sourceId, extraFlags = []) => unique([
    ...REQUIRED_REVIEW_FLAGS,
    ...(!isPilotItem(contentType, sourceId) ? ['content_level_required'] : []),
    ...extraFlags
]);

const summarizeCatalogItems = (items) => {
    const questions = items.flatMap((item) => item.questions || []);
    return {
        items: items.length,
        proverbs: items.filter((item) => item.contentType === 'proverb').length,
        idioms: items.filter((item) => item.contentType === 'idiom').length,
        questionVariants: questions.length,
        reconstructedProverbs: items.filter((item) => (
            item.reviewFlags.includes('expression_reconstructed')
        )).length,
        g56Items: items.filter((item) => item.gradeBands.includes('g56')).length,
        g34PreviewItems: items.filter((item) => item.gradeBands.includes('g34')).length,
        pilotItems: items.filter((item) => isPilotItem(item.contentType, item.source?.sourceId)).length,
        alignedItems: items.filter((item) => item.curriculumRole === 'aligned').length,
        enrichmentItems: items.filter((item) => item.curriculumRole === 'enrichment').length,
        pendingContentLevels: items.filter((item) => item.contentLevel === null).length,
        editorialReviewItems: items.filter((item) => item.reviewStatus === 'editorial_review').length,
        editorialDraftItems: items.filter((item) => Boolean(item.editorialDraft)).length,
        teacherConfirmationItems: items.filter((item) => (
            item.reviewFlags.includes('teacher_confirmation_required')
        )).length,
        meaningChoiceVariants: questions.filter((question) => question.questionType === 'meaningChoice').length
    };
};

const hangulInitials = (value) => [...normalizeText(value)]
    .map((character) => {
        const code = character.charCodeAt(0);
        if (code < 0xac00 || code > 0xd7a3) return character;
        return HANGUL_INITIALS[Math.floor((code - 0xac00) / 588)];
    })
    .join('')
    .replaceAll(/[^ㄱ-ㅎ]/g, '');

const escapeRegExp = (value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const reconstructProverbExpression = (quizValue, answerValue) => {
    const quiz = normalizeSpaces(quizValue);
    const answer = normalizeSpaces(answerValue);

    // 원본의 다수 항목은 answer 자체가 완성 속담이다. 한 낱말만 든 42개 항목만
    // 초성 자리에 답을 넣어 완성 표현 초안을 만들고 반드시 사람 검수 대상으로 남긴다.
    if (answer.includes(' ')) {
        return { expression: answer, reconstructed: false };
    }

    const answerInitials = hangulInitials(answer);
    let expression = quiz.replaceAll(/[ㄱ-ㅎ](?:\s*[ㄱ-ㅎ])*/gu, (masked) => (
        masked.replaceAll(/\s/g, '') === answerInitials ? answer : masked
    ));
    expression = expression.replaceAll(
        new RegExp(`${escapeRegExp(answer)}\\(${escapeRegExp(answer)}\\)`, 'g'),
        answer
    );
    expression = expression.replaceAll(
        new RegExp(`${escapeRegExp(answer)}\\s+(?=(?:은|는|이|가|을|를|의|에|도|만|부터|까지|로|으로)(?:\\s|$))`, 'g'),
        answer
    );
    return { expression: normalizeSpaces(expression), reconstructed: true };
};

const parseIdiomIdentity = (value) => {
    const lines = normalizeText(value).split('\n').map((line) => line.trim()).filter(Boolean);
    const word = normalizeSpaces(lines[0]?.replace(/\s*\([^)]*\)\s*$/u, ''));
    const inlineHanja = lines[0]?.match(/\(([^)]+)\)/u)?.[1] || null;
    const lineHanja = lines.find((line) => line.startsWith('한자:'))?.replace(/^한자:\s*/u, '') || null;
    return { word, hanja: normalizeText(inlineHanja || lineHanja) || null };
};

const parseContextDefinition = (value) => normalizeText(value)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('뜻:'))
    ?.replace(/^뜻:\s*/u, '') || null;

const fillIdiomExample = (phraseValue, word) => normalizeSpaces(phraseValue)
    .replace(/\[\s*[ㄱ-ㅎ\s]+\s*\]/u, word);

const baseQuestion = ({ contentType, sourceId, questionType, prompt, correctAnswer, explanation, source }) => ({
    variantKey: variantKey(contentType, sourceId, questionType),
    questionType,
    prompt: normalizeText(prompt),
    choices: [],
    correctAnswer: normalizeText(correctAnswer),
    acceptedAnswers: [normalizeText(correctAnswer)],
    explanation: normalizeText(explanation),
    // 옛 팩의 직접 입력 문제는 5~6학년 심화 초안으로만 보존한다.
    gradeBands: ['g56'],
    difficulty: 3,
    reviewStatus: 'source_imported',
    source
});

const buildProverbItem = (source) => {
    const { expression, reconstructed } = reconstructProverbExpression(source.quiz, source.answer);
    const flags = reviewFlagsFor('proverb', source.id, [
        'example_required',
        ...(reconstructed ? ['expression_reconstructed'] : []),
        ...(/[ㄱ-ㅎ]/u.test(expression) ? ['unresolved_initials'] : [])
    ]);
    return {
        itemKey: itemKey('proverb', source.id),
        contentType: 'proverb',
        expression,
        hanja: null,
        definition: normalizeText(source.meaning),
        example: null,
        ...learningProfile('proverb', source.id),
        themes: [],
        reviewStatus: 'source_imported',
        reviewFlags: flags,
        source: {
            pack: 'survival-proverbs',
            sourceId: source.id
        },
        questions: [baseQuestion({
            contentType: 'proverb',
            sourceId: source.id,
            questionType: 'clozeInput',
            prompt: source.quiz,
            correctAnswer: source.answer,
            explanation: source.meaning,
            source: {
                pack: 'survival-proverbs',
                sourceId: source.id,
                sourceField: 'quiz'
            }
        })]
    };
};

const buildIdiomItem = (context, initials, meaning) => {
    const identities = [context, initials, meaning].map((row) => parseIdiomIdentity(row.meaning));
    const words = unique(identities.map((identity) => identity.word));
    const hanjaValues = unique(identities.map((identity) => identity.hanja).filter(Boolean));
    const definition = normalizeText(meaning.phrase || parseContextDefinition(context.meaning));
    const reviewFlags = reviewFlagsFor('idiom', context.id);
    if (words.length !== 1) reviewFlags.push('source_word_mismatch');
    if (hanjaValues.length !== 1) reviewFlags.push('source_hanja_mismatch');
    const word = words[0];
    const hanja = hanjaValues[0] || null;

    return {
        itemKey: itemKey('idiom', context.id),
        contentType: 'idiom',
        expression: word,
        hanja,
        definition,
        example: fillIdiomExample(context.phrase, word),
        ...learningProfile('idiom', context.id),
        themes: [],
        reviewStatus: 'source_imported',
        reviewFlags: unique(reviewFlags),
        source: {
            pack: 'survival-idioms',
            sourceId: context.id,
            mergedFiles: Object.values(SOURCE_FILES).filter((file) => file.startsWith('idiom'))
        },
        questions: [
            baseQuestion({
                contentType: 'idiom',
                sourceId: context.id,
                questionType: 'clozeInput',
                prompt: context.phrase,
                correctAnswer: word,
                explanation: definition,
                source: { pack: 'survival-idioms', sourceId: context.id, sourceField: 'context' }
            }),
            baseQuestion({
                contentType: 'idiom',
                sourceId: context.id,
                questionType: 'initialsInput',
                prompt: initials.phrase,
                correctAnswer: word,
                explanation: definition,
                source: { pack: 'survival-idioms', sourceId: context.id, sourceField: 'initials' }
            }),
            baseQuestion({
                contentType: 'idiom',
                sourceId: context.id,
                questionType: 'definitionInput',
                prompt: meaning.phrase,
                correctAnswer: word,
                explanation: definition,
                source: { pack: 'survival-idioms', sourceId: context.id, sourceField: 'meaning' }
            })
        ]
    };
};

const mapById = (rows) => new Map(rows.map((row) => [Number(row.id), row]));

const findReview = (item, reviewPacks) => {
    const matches = reviewPacks.flatMap((config) => config.pack.items
        .filter((candidate) => candidate.itemKey === item.itemKey)
        .map((review) => ({ config, review })));
    if (matches.length > 1) throw new Error(`${item.itemKey}가 여러 검수팩에 중복되었습니다.`);
    return matches[0] || null;
};

const applyEditorialPreparation = (item, reviewPacks) => {
    const match = findReview(item, reviewPacks);
    if (!match) return item;

    const { config, review } = match;
    const meaningChoice = review.meaningChoice;
    const preparation = {
        pack: config.filename.replace(/\.json$/u, ''),
        ...(config.stage === 'review'
            ? { reviewedOn: config.pack.reviewedOn, reviewBasis: config.pack.reviewBasis }
            : { draftedOn: config.pack.draftedOn, draftBasis: config.pack.draftBasis }),
        notes: review.reviewNotes || []
    };
    return {
        ...item,
        expression: normalizeSpaces(review.expression),
        hanja: normalizeText(review.hanja) || null,
        definition: normalizeText(review.definition),
        example: normalizeText(review.example),
        contentLevel: review.contentLevel ?? item.contentLevel,
        reviewStatus: config.itemReviewStatus,
        reviewFlags: [...config.itemReviewFlags],
        ...(config.stage === 'review'
            ? { editorialReview: preparation }
            : { editorialDraft: preparation }),
        questions: [
            ...item.questions,
            {
                variantKey: variantKey(item.contentType, item.source.sourceId, config.variantSuffix),
                questionType: 'meaningChoice',
                prompt: `‘${normalizeSpaces(review.expression)}’의 뜻으로 알맞은 것은 무엇인가요?`,
                choices: meaningChoice.choices.map(normalizeText),
                correctAnswer: normalizeText(meaningChoice.correctAnswer),
                acceptedAnswers: [normalizeText(meaningChoice.correctAnswer)],
                explanation: normalizeText(meaningChoice.explanation),
                gradeBands: [...config.questionGradeBands],
                difficulty: config.questionDifficulty,
                reviewStatus: config.questionReviewStatus,
                source: {
                    pack: config.filename.replace(/\.json$/u, ''),
                    sourceId: item.source.sourceId,
                    ...(config.stage === 'review'
                        ? { reviewedOn: config.pack.reviewedOn }
                        : { draftedOn: config.pack.draftedOn })
                }
            }
        ]
    };
};

const buildPilotCollection = (contentType, items) => ({
    contentType,
    collectionKey: 'core-v1',
    title: contentType === 'proverb' ? '속담 기초 시범팩' : '사자성어 기초 시범팩',
    description: '5·6학년 교육과정 기준 자료 중 첫 직접 검수 대상으로 고른 20개. 쉬운 10개는 3·4학년도 미리 만날 수 있다.',
    gradeBands: ['g34', 'g56'],
    contentLevel: 2,
    reviewStatus: 'editorial_review',
    itemKeys: PILOT_SOURCE_IDS[contentType].map((sourceId) => {
        const item = items.find((candidate) => (
            candidate.contentType === contentType && candidate.source.sourceId === sourceId
        ));
        return item?.itemKey;
    })
});

export const buildLanguageContentCatalog = (
    { proverbs, idiomContext, idiomInitials, idiomMeaning },
    reviewPacks = DEFAULT_REVIEW_PACKS
) => {
    const contexts = mapById(idiomContext);
    const initials = mapById(idiomInitials);
    const meanings = mapById(idiomMeaning);
    const idiomIds = [...contexts.keys()].sort((left, right) => left - right);
    const sourceItems = [
        ...proverbs.map(buildProverbItem),
        ...idiomIds.map((id) => buildIdiomItem(contexts.get(id), initials.get(id), meanings.get(id)))
    ];
    const items = sourceItems.map((item) => applyEditorialPreparation(item, reviewPacks));
    const sourceFingerprint = stableHash({
        proverbs,
        idiomContext,
        idiomInitials,
        idiomMeaning,
        reviewPacks: reviewPacks.map(({ filename, pack }) => ({ filename, pack }))
    });

    return {
        schemaVersion: 4,
        status: 'full_catalog_editorial_draft_not_for_student_delivery',
        sourceFingerprint,
        sourceFiles: Object.fromEntries(Object.entries(SOURCE_FILES).map(([key, filename]) => [
            filename,
            {
                role: key,
                rowCount: ({ proverbs, idiomContext, idiomInitials, idiomMeaning })[key].length,
                sha256: stableHash(({ proverbs, idiomContext, idiomInitials, idiomMeaning })[key])
            }
        ])),
        reviewFiles: Object.fromEntries(reviewPacks.map(({ filename, role, pack }) => [
            filename,
            {
                role,
                rowCount: pack.items.length,
                sha256: stableHash(pack),
                status: pack.status
            }
        ])),
        counts: summarizeCatalogItems(items),
        collections: [
            buildPilotCollection('proverb', items),
            buildPilotCollection('idiom', items)
        ],
        items
    };
};

export const auditLanguageContentCatalog = (catalog) => {
    const errors = [];
    const items = Array.isArray(catalog?.items) ? catalog.items : [];
    const itemKeys = items.map((item) => item.itemKey);
    const variantKeys = items.flatMap((item) => (item.questions || []).map((question) => question.variantKey));
    const proverbItems = items.filter((item) => item.contentType === 'proverb');
    const idiomItems = items.filter((item) => item.contentType === 'idiom');

    if (catalog?.schemaVersion !== 4) errors.push('schemaVersion은 4여야 합니다.');
    if (catalog?.status !== 'full_catalog_editorial_draft_not_for_student_delivery') {
        errors.push('검수 전 카탈로그가 학생 제공 상태로 바뀌었습니다.');
    }
    if (items.length !== 185 || proverbItems.length !== 85 || idiomItems.length !== 100) {
        errors.push(`항목 수가 원본과 다릅니다: 전체 ${items.length}, 속담 ${proverbItems.length}, 사자성어 ${idiomItems.length}`);
    }
    if (new Set(itemKeys).size !== itemKeys.length) errors.push('itemKey가 중복되었습니다.');
    if (new Set(variantKeys).size !== variantKeys.length) errors.push('variantKey가 중복되었습니다.');

    items.forEach((item) => {
        if (!item.itemKey || !item.expression || !item.definition) {
            errors.push(`${item.itemKey || '(키 없음)'}의 필수 학습 정보가 비었습니다.`);
        }
        const sourceId = item.source?.sourceId;
        const expectedProfile = learningProfile(item.contentType, sourceId);
        const expectedMatch = findReview(item, DEFAULT_REVIEW_PACKS);
        const expectedReview = expectedMatch?.review;
        const expectedConfig = expectedMatch?.config;
        if (item.curriculumBand !== expectedProfile.curriculumBand
            || item.curriculumRole !== expectedProfile.curriculumRole
            || JSON.stringify(item.gradeBands) !== JSON.stringify(expectedProfile.gradeBands)
            || item.contentLevel !== (expectedReview?.contentLevel ?? expectedProfile.contentLevel)) {
            errors.push(`${item.itemKey}의 교육과정·접근 학년·내용 난이도 분류가 기준과 다릅니다.`);
        }
        if (expectedReview) {
            const preparation = expectedConfig.stage === 'review' ? item.editorialReview : item.editorialDraft;
            const reviewMatches = item.reviewStatus === expectedConfig.itemReviewStatus
                && JSON.stringify(item.reviewFlags) === JSON.stringify(expectedConfig.itemReviewFlags)
                && item.expression === expectedReview.expression
                && item.hanja === expectedReview.hanja
                && item.definition === expectedReview.definition
                && item.example === expectedReview.example
                && item.example.length > 0
                && preparation?.pack === expectedConfig.filename.replace(/\.json$/u, '');
            if (!reviewMatches) errors.push(`${item.itemKey}의 편집 검수·초안 내용 또는 상태가 검수팩과 다릅니다.`);
        } else {
            errors.push(`${item.itemKey}에 대응하는 편집 검수 또는 초안이 없습니다.`);
        }
        const expectedQuestionCount = (item.contentType === 'idiom' ? 3 : 1) + (expectedReview ? 1 : 0);
        if (item.questions.length !== expectedQuestionCount) {
            errors.push(`${item.itemKey}의 원본 문제 병합 수가 ${expectedQuestionCount}개가 아닙니다.`);
        }
        item.questions.forEach((question) => {
            if (!question.prompt || !question.correctAnswer || question.acceptedAnswers.length === 0) {
                errors.push(`${question.variantKey}의 문제 필수 정보가 비었습니다.`);
            }
            if (question.questionType === 'meaningChoice') {
                const answerCount = question.choices.filter((choice) => choice === question.correctAnswer).length;
                const validMeaningChoice = expectedReview
                    && question.reviewStatus === expectedConfig.questionReviewStatus
                    && question.choices.length === 4
                    && new Set(question.choices).size === 4
                    && answerCount === 1
                    && question.explanation.length > 0
                    && JSON.stringify(question.gradeBands) === JSON.stringify(expectedConfig.questionGradeBands)
                    && question.difficulty === expectedConfig.questionDifficulty;
                if (!validMeaningChoice) errors.push(`${question.variantKey}의 뜻 고르기 검수 단계 계약이 잘못되었습니다.`);
            } else {
                if (question.reviewStatus !== 'source_imported' || question.choices.length !== 0) {
                    errors.push(`${question.variantKey}가 검수 없이 학생 문제로 바뀌었습니다.`);
                }
                if (JSON.stringify(question.gradeBands) !== JSON.stringify(['g56']) || question.difficulty !== 3) {
                    errors.push(`${question.variantKey}의 원본 직접 입력 문제가 5·6학년 심화 초안으로 분류되지 않았습니다.`);
                }
            }
        });
    });

    const expectedReviewKeys = Object.entries(G34_PREVIEW_SOURCE_IDS).flatMap(([contentType, sourceIds]) => (
        sourceIds.map((sourceId) => itemKey(contentType, sourceId))
    ));
    const reviewKeys = G34_PREVIEW_REVIEW_PACK.items.map((review) => review.itemKey);
    if (G34_PREVIEW_REVIEW_PACK.schemaVersion !== 1
        || G34_PREVIEW_REVIEW_PACK.status !== 'editorial_review_teacher_confirmation_required'
        || JSON.stringify(reviewKeys) !== JSON.stringify(expectedReviewKeys)) {
        errors.push('3·4학년 검수팩이 미리 만나기 20개와 정확히 일치하지 않습니다.');
    }
    const remainingReviewKeys = G56_REMAINING_REVIEW_PACK.items.map((review) => review.itemKey);
    const allReviewKeys = [...reviewKeys, ...remainingReviewKeys];
    if (G56_REMAINING_REVIEW_PACK.schemaVersion !== 1
        || G56_REMAINING_REVIEW_PACK.status !== 'editorial_draft_teacher_confirmation_required'
        || remainingReviewKeys.length !== 165
        || new Set(remainingReviewKeys).size !== 165
        || new Set(allReviewKeys).size !== 185
        || !itemKeys.every((key) => allReviewKeys.includes(key))) {
        errors.push('5·6학년 나머지 검수 초안이 기존 20개를 제외한 165개와 정확히 일치하지 않습니다.');
    }

    const collections = Array.isArray(catalog?.collections) ? catalog.collections : [];
    ['proverb', 'idiom'].forEach((contentType) => {
        const collection = collections.find((candidate) => (
            candidate.contentType === contentType && candidate.collectionKey === 'core-v1'
        ));
        const expectedItemKeys = PILOT_SOURCE_IDS[contentType].map((sourceId) => itemKey(contentType, sourceId));
        if (!collection
            || collection.reviewStatus !== 'editorial_review'
            || JSON.stringify(collection.gradeBands) !== JSON.stringify(['g34', 'g56'])
            || collection.contentLevel !== 2
            || JSON.stringify(collection.itemKeys) !== JSON.stringify(expectedItemKeys)) {
            errors.push(`${contentType} core-v1 시범팩의 20개 순서 또는 검수 상태가 기준과 다릅니다.`);
        }
    });
    if (collections.length !== 2) errors.push(`시범 학습 묶음은 2개여야 합니다: 현재 ${collections.length}개`);

    const flagCounts = {};
    items.flatMap((item) => item.reviewFlags).forEach((flag) => {
        flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    });
    const counts = summarizeCatalogItems(items);
    if (JSON.stringify(catalog?.counts) !== JSON.stringify(counts)) {
        errors.push('카탈로그 상단 개수 요약이 실제 항목·문제 상태와 다릅니다.');
    }
    return {
        valid: errors.length === 0,
        errors,
        counts,
        flagCounts
    };
};

export const loadLanguageContentCatalog = async () => JSON.parse(await readFile(CATALOG_URL, 'utf8'));

export const loadLanguageSources = async (sourceDirectory) => {
    const entries = await Promise.all(Object.entries(SOURCE_FILES).map(async ([key, filename]) => [
        key,
        JSON.parse(await readFile(path.join(sourceDirectory, filename), 'utf8'))
    ]));
    return Object.fromEntries(entries);
};

const runCli = async () => {
    const args = process.argv.slice(2);
    const sourceIndex = args.indexOf('--source-dir');
    const shouldWrite = args.includes('--write');
    let catalog;

    if (shouldWrite) {
        if (sourceIndex === -1 || !args[sourceIndex + 1]) {
            throw new Error('--write에는 --source-dir <원본 폴더>가 필요합니다.');
        }
        catalog = buildLanguageContentCatalog(await loadLanguageSources(path.resolve(args[sourceIndex + 1])));
        await mkdir(path.dirname(fileURLToPath(CATALOG_URL)), { recursive: true });
        await writeFile(CATALOG_URL, jsonText(catalog));
        console.log(`공통 언어 학습 카탈로그를 생성했습니다: ${fileURLToPath(CATALOG_URL)}`);
    } else {
        catalog = await loadLanguageContentCatalog();
    }

    const audit = auditLanguageContentCatalog(catalog);
    if (!audit.valid) {
        audit.errors.forEach((error) => console.error(`- ${error}`));
        process.exitCode = 1;
        return;
    }
    console.log(
        `언어 학습 데이터 ${audit.counts.items}개(속담 ${audit.counts.proverbs}, 사자성어 ${audit.counts.idioms}), `
        + `문제 변형 ${audit.counts.questionVariants}개를 확인했습니다.`
    );
    console.log(
        `5·6학년 기준 ${audit.counts.g56Items}개, 3·4학년 미리 만나기 ${audit.counts.g34PreviewItems}개, `
        + `첫 검수 시범팩 ${audit.counts.pilotItems}개입니다.`
    );
    console.log(
        `편집 검수 ${audit.counts.editorialReviewItems}개, 나머지 편집 초안 `
        + `${audit.counts.editorialDraftItems}개와 뜻 고르기 ${audit.counts.meaningChoiceVariants}개는 교사 최종 확인이 필요합니다.`
    );
    console.log('학생 제공·DB 승격은 아직 차단되어 있습니다.');
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    runCli().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
