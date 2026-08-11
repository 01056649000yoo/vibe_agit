const freezeSubcategories = (subcategories) => Object.freeze(
    subcategories.map((subcategory) => Object.freeze(subcategory))
);

export const SPELLING_DETECTION_MODES = Object.freeze([
    Object.freeze({
        id: 'exact',
        label: '단어',
        description: '문맥과 관계없이 틀린 표기 자체를 찾습니다.'
    }),
    Object.freeze({
        id: 'phrase',
        label: '어구',
        description: '띄어쓰기를 포함한 틀린 어구 전체를 찾습니다.'
    }),
    Object.freeze({
        id: 'context',
        label: '문맥',
        description: '앞뒤 표현을 함께 확인해야 하는 경우에만 찾습니다.'
    })
]);

export const SPELLING_CATEGORY_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: 'grammar',
        label: '문장 규칙',
        description: '조사·어미·의존 명사·접사·띄어쓰기',
        subcategories: freezeSubcategories([
            { id: 'particle', label: '조사' },
            { id: 'ending', label: '어미' },
            { id: 'dependent', label: '의존 명사·단위' },
            { id: 'affix', label: '접두사·접미사' },
            { id: 'negation', label: '부정 표현' },
            { id: 'spacing', label: '일반 띄어쓰기' },
            { id: 'joined-word', label: '붙여 쓰는 낱말' }
        ])
    }),
    Object.freeze({
        id: 'conjugation',
        label: '용언 활용',
        description: '되·돼, 준말, 피동·사동, 활용 형태',
        subcategories: freezeSubcategories([
            { id: 'doe-dwae', label: '되·돼' },
            { id: 'contraction', label: '준말' },
            { id: 'passive-causative', label: '피동·사동' },
            { id: 'inflection', label: '활용 형태' }
        ])
    }),
    Object.freeze({
        id: 'meaning',
        label: '뜻 구별',
        description: '모양이 비슷하지만 뜻과 쓰임이 다른 말',
        subcategories: freezeSubcategories([
            { id: 'context', label: '뜻과 쓰임' }
        ])
    }),
    Object.freeze({
        id: 'word',
        label: '낱말 표기',
        description: '자주 틀리는 일반 낱말과 부사',
        subcategories: freezeSubcategories([
            { id: 'general', label: '일반 낱말' },
            { id: 'adverb', label: '부사' }
        ])
    }),
    Object.freeze({
        id: 'compound',
        label: '합성어·사이시옷',
        description: '사이시옷을 쓰거나 쓰지 않는 합성어',
        subcategories: freezeSubcategories([
            { id: 'saisiot', label: '사이시옷을 쓰는 말' },
            { id: 'no-saisiot', label: '사이시옷을 쓰지 않는 말' }
        ])
    }),
    Object.freeze({
        id: 'loanword',
        label: '외래어',
        description: '자주 틀리는 외래어 표기',
        subcategories: freezeSubcategories([
            { id: 'loanword', label: '외래어' }
        ])
    })
]);

const CATEGORY_BY_ID = new Map(
    SPELLING_CATEGORY_DEFINITIONS.map((category) => [category.id, category])
);
const DETECTION_MODE_BY_ID = new Map(
    SPELLING_DETECTION_MODES.map((mode) => [mode.id, mode])
);

const DICTIONARY_SEARCH_URL = 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=';
const NORM_SOURCE = Object.freeze({
    label: '국립국어원 한국어 어문 규범',
    url: 'https://korean.go.kr/kornorms/main/main.do'
});
const INLINE_CHOICES_PATTERN = /\(([^()]+)\)/g;
const TRAILING_SENTENCE_MARK_PATTERN = /[.!?。！？]+$/;

const dictionarySource = (query) => ({
    label: '국립국어원 표준국어대사전',
    url: `${DICTIONARY_SEARCH_URL}${encodeURIComponent(query)}`
});

const splitReferenceChoices = (question) => question.split('/').map((choice) => choice.trim());

const createReferencePatterns = (question, answer) => {
    const choices = splitReferenceChoices(question);
    if (!choices.includes(answer)) return [];
    return choices
        .filter((choice) => choice !== answer)
        .map((choice) => {
            const wrong = choice.replace(/^-/, '');
            return { text: wrong, target: wrong, right: answer, lookup: answer };
        });
};

export const reference = (
    sortOrder,
    id,
    subcategoryId,
    detectionMode,
    origin,
    question,
    answer,
    explanation,
    examples,
    options = {}
) => ({
    sortOrder,
    id,
    subcategoryId,
    detectionMode,
    origin,
    contentType: 'reference',
    learningLabel: options.learningLabel || question,
    question,
    answer,
    searchable: options.searchable || [
        ...new Set([...splitReferenceChoices(question), answer])
    ],
    explanation,
    examples,
    source: options.sourceType === 'norm'
        ? NORM_SOURCE
        : dictionarySource(options.sourceQuery || answer),
    detectionPatterns: options.detectionPatterns || createReferencePatterns(question, answer)
});

const splitChoiceParts = (choice) => choice.split(',').map((part) => part.trim());

const fillQuestionChoices = (question, choice) => {
    const parts = splitChoiceParts(choice);
    let partIndex = 0;
    return question.replace(
        INLINE_CHOICES_PATTERN,
        () => parts.at(partIndex++) || choice
    );
};

const createPracticePattern = (question, choice, answer) => {
    const solution = fillQuestionChoices(question, choice);
    const groups = [...question.matchAll(INLINE_CHOICES_PATTERN)];
    const parts = splitChoiceParts(choice);

    if (groups.length === 1 && parts.length === 1) {
        const target = parts[0];
        const targetIndex = solution.indexOf(target);
        const start = Math.max(0, targetIndex - 12);
        const end = Math.min(solution.length, targetIndex + target.length + 8);
        return {
            text: solution.slice(start, end).replace(TRAILING_SENTENCE_MARK_PATTERN, ''),
            target,
            targetOffset: targetIndex - start,
            right: answer,
            lookup: answer
        };
    }

    const text = solution.replace(TRAILING_SENTENCE_MARK_PATTERN, '');
    return { text, target: text, targetOffset: 0, right: answer, lookup: answer };
};

export const practice = (
    sortOrder,
    id,
    subcategoryId,
    detectionMode,
    question,
    answer,
    explanation,
    customChoices
) => {
    const inlineChoices = [...question.matchAll(INLINE_CHOICES_PATTERN)]
        .flatMap((match) => match[1].split('/').map((choice) => choice.trim()));
    const choices = customChoices || [...new Set(inlineChoices)];
    const solution = fillQuestionChoices(question, answer);
    const prompt = question.replace(INLINE_CHOICES_PATTERN, '＿＿＿＿');
    const detectionPatterns = choices
        .filter((choice) => choice !== answer)
        .map((choice) => createPracticePattern(question, choice, answer));

    return {
        sortOrder,
        id,
        subcategoryId,
        detectionMode,
        origin: 'practice',
        contentType: 'practice',
        learningLabel: choices.map((choice) => choice.replace(/,\s*/g, '·')).join(' / '),
        question,
        answer,
        searchable: [prompt, solution, ...choices],
        explanation,
        examples: [solution],
        source: NORM_SOURCE,
        detectionPatterns,
        quiz: { prompt, choices, solution }
    };
};

const freezeEntry = (entry, category, subcategory, detectionMode) => Object.freeze({
    ...entry,
    categoryId: category.id,
    category: category.label,
    subcategoryId: subcategory.id,
    subcategory: subcategory.label,
    detectionMode: detectionMode.id,
    detectionModeLabel: detectionMode.label,
    searchable: Object.freeze([...(entry.searchable || [])]),
    examples: Object.freeze([...(entry.examples || [])]),
    source: Object.freeze({ ...entry.source }),
    detectionPatterns: Object.freeze(entry.detectionPatterns.map((pattern) => Object.freeze({ ...pattern }))),
    ...(entry.quiz ? {
        quiz: Object.freeze({
            ...entry.quiz,
            choices: Object.freeze([...entry.quiz.choices])
        })
    } : {})
});

const inferDetectionMode = (patterns) => {
    const hasContext = patterns.some((pattern) => {
        const target = pattern.target || pattern.text;
        return pattern.text !== target || (pattern.targetOffset || 0) > 0;
    });
    if (hasContext) return 'context';
    if (patterns.some((pattern) => pattern.text.includes(' '))) return 'phrase';
    return 'exact';
};

export const defineSpellingEntries = (categoryId, entries) => {
    const category = CATEGORY_BY_ID.get(categoryId);
    if (!category) throw new Error(`알 수 없는 맞춤법 대분류입니다: ${categoryId}`);
    if (!Array.isArray(entries)) throw new Error(`${categoryId} 맞춤법 항목은 배열이어야 합니다.`);

    const subcategoryById = new Map(
        category.subcategories.map((subcategory) => [subcategory.id, subcategory])
    );

    return Object.freeze(entries.map((entry) => {
        if (!Number.isInteger(entry.sortOrder) || entry.sortOrder < 1) {
            throw new Error(`${entry.id || categoryId}: sortOrder는 1 이상의 정수여야 합니다.`);
        }
        if (!entry.id || !entry.learningLabel || !entry.answer || !entry.explanation) {
            throw new Error(`${entry.id || categoryId}: 필수 맞춤법 정보가 빠졌습니다.`);
        }

        const subcategory = subcategoryById.get(entry.subcategoryId);
        if (!subcategory) {
            throw new Error(`${entry.id}: ${categoryId}에 없는 세부 분류 ${entry.subcategoryId}입니다.`);
        }

        const detectionMode = DETECTION_MODE_BY_ID.get(entry.detectionMode);
        if (!detectionMode) {
            throw new Error(`${entry.id}: 검출 방식(exact/phrase/context)을 지정해야 합니다.`);
        }
        if (!Array.isArray(entry.detectionPatterns) || entry.detectionPatterns.length === 0) {
            throw new Error(`${entry.id}: detectionPatterns가 비어 있습니다.`);
        }
        if (entry.detectionPatterns.some((pattern) => !pattern.text || !pattern.right)) {
            throw new Error(`${entry.id}: 모든 검출 패턴에는 text와 right가 있어야 합니다.`);
        }

        const inferredMode = inferDetectionMode(entry.detectionPatterns);
        if (inferredMode !== entry.detectionMode) {
            throw new Error(
                `${entry.id}: 검출 방식은 ${entry.detectionMode}가 아니라 ${inferredMode}여야 합니다.`
            );
        }

        return freezeEntry(entry, category, subcategory, detectionMode);
    }));
};

export const getSpellingCategoryDefinition = (categoryId) => CATEGORY_BY_ID.get(categoryId) || null;
