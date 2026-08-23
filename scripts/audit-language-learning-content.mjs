#!/usr/bin/env node

/**
 * 옛 수업 도구의 속담·사자성어 팩을 공통 학습 콘텐츠 계약으로 정규화한다.
 *
 * - `--source-dir <경로> --write`: 원본 4개 파일을 병합해 검수용 카탈로그를 다시 만든다.
 * - 인자 없음 또는 `--check`: 저장소에 커밋된 카탈로그의 구조와 개수를 검사한다.
 *
 * 생성 결과는 아직 학생에게 출제할 수 없는 `source_imported` 상태다. 학년군·난이도·
 * 선택형 확인 문제를 사람이 검수한 뒤에만 DB의 `published` 상태로 승격한다.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CATALOG_URL = new URL('../docs/language-learning/data/source-import-v1.json', import.meta.url);
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
    'grade_band_required',
    'content_level_required',
    'meaning_choice_required'
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
    gradeBands: [],
    difficulty: null,
    reviewStatus: 'source_imported',
    source
});

const buildProverbItem = (source) => {
    const { expression, reconstructed } = reconstructProverbExpression(source.quiz, source.answer);
    const flags = [
        ...REQUIRED_REVIEW_FLAGS,
        'example_required',
        ...(reconstructed ? ['expression_reconstructed'] : []),
        ...(/[ㄱ-ㅎ]/u.test(expression) ? ['unresolved_initials'] : [])
    ];
    return {
        itemKey: itemKey('proverb', source.id),
        contentType: 'proverb',
        expression,
        hanja: null,
        definition: normalizeText(source.meaning),
        example: null,
        gradeBands: [],
        contentLevel: null,
        themes: [],
        reviewStatus: 'source_imported',
        reviewFlags: unique(flags),
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
    const reviewFlags = [...REQUIRED_REVIEW_FLAGS];
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
        gradeBands: [],
        contentLevel: null,
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

export const buildLanguageContentCatalog = ({ proverbs, idiomContext, idiomInitials, idiomMeaning }) => {
    const contexts = mapById(idiomContext);
    const initials = mapById(idiomInitials);
    const meanings = mapById(idiomMeaning);
    const idiomIds = [...contexts.keys()].sort((left, right) => left - right);
    const items = [
        ...proverbs.map(buildProverbItem),
        ...idiomIds.map((id) => buildIdiomItem(contexts.get(id), initials.get(id), meanings.get(id)))
    ];
    const sourceFingerprint = stableHash({ proverbs, idiomContext, idiomInitials, idiomMeaning });

    return {
        schemaVersion: 1,
        status: 'source_imported_not_for_student_delivery',
        sourceFingerprint,
        sourceFiles: Object.fromEntries(Object.entries(SOURCE_FILES).map(([key, filename]) => [
            filename,
            {
                role: key,
                rowCount: ({ proverbs, idiomContext, idiomInitials, idiomMeaning })[key].length,
                sha256: stableHash(({ proverbs, idiomContext, idiomInitials, idiomMeaning })[key])
            }
        ])),
        counts: {
            items: items.length,
            proverbs: items.filter((item) => item.contentType === 'proverb').length,
            idioms: items.filter((item) => item.contentType === 'idiom').length,
            questionVariants: items.reduce((sum, item) => sum + item.questions.length, 0)
        },
        collections: [],
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

    if (catalog?.schemaVersion !== 1) errors.push('schemaVersion은 1이어야 합니다.');
    if (catalog?.status !== 'source_imported_not_for_student_delivery') {
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
        if (item.reviewStatus !== 'source_imported') {
            errors.push(`${item.itemKey}가 검수 없이 승격되었습니다.`);
        }
        if (item.gradeBands.length !== 0 || item.contentLevel !== null) {
            errors.push(`${item.itemKey}에 검수 전 학년군·난이도가 임의 지정되었습니다.`);
        }
        REQUIRED_REVIEW_FLAGS.forEach((flag) => {
            if (!item.reviewFlags.includes(flag)) errors.push(`${item.itemKey}에 ${flag} 신호가 없습니다.`);
        });
        const expectedQuestionCount = item.contentType === 'idiom' ? 3 : 1;
        if (item.questions.length !== expectedQuestionCount) {
            errors.push(`${item.itemKey}의 원본 문제 병합 수가 ${expectedQuestionCount}개가 아닙니다.`);
        }
        item.questions.forEach((question) => {
            if (!question.prompt || !question.correctAnswer || question.acceptedAnswers.length === 0) {
                errors.push(`${question.variantKey}의 문제 필수 정보가 비었습니다.`);
            }
            if (question.reviewStatus !== 'source_imported' || question.choices.length !== 0) {
                errors.push(`${question.variantKey}가 검수 없이 학생 문제로 바뀌었습니다.`);
            }
        });
    });

    const flagCounts = {};
    items.flatMap((item) => item.reviewFlags).forEach((flag) => {
        flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    });
    return {
        valid: errors.length === 0,
        errors,
        counts: {
            items: items.length,
            proverbs: proverbItems.length,
            idioms: idiomItems.length,
            questionVariants: variantKeys.length,
            reconstructedProverbs: flagCounts.expression_reconstructed || 0
        },
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
        + `원본 문제 ${audit.counts.questionVariants}개를 확인했습니다.`
    );
    console.log(`완성 표현 재구성 속담 ${audit.counts.reconstructedProverbs}개는 사람 검수가 필요합니다.`);
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    runCli().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

