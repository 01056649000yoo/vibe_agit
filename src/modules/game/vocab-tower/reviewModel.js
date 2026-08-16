export const REVIEW_STATUS = Object.freeze({
    editorial_review: { label: '1차 검수', tone: 'draft' },
    teacher_confirmed: { label: '교사 확인', tone: 'confirmed' },
    locked: { label: '잠금 완료', tone: 'locked' }
});

export const getReviewStatusInfo = (status) => {
    switch (status) {
        case 'teacher_confirmed': return REVIEW_STATUS.teacher_confirmed;
        case 'locked': return REVIEW_STATUS.locked;
        default: return REVIEW_STATUS.editorial_review;
    }
};

export const CHOICE_QUESTION_KEYS = Object.freeze([
    ['meaningChoice', '뜻 선택'],
    ['clozeChoice', '문맥 선택'],
    ['usageDistinction', '쓰임 구별']
]);

export const INPUT_QUESTION_KEYS = Object.freeze([
    ['definitionInput', '뜻 직접 입력'],
    ['clozeInput', '빈칸 직접 입력']
]);

export const artifactItemToRow = (item, itemIndex) => ({
    item_key: item.itemKey,
    deck_id: null,
    item_order: itemIndex + 1,
    word: item.word,
    part_of_speech: item.partOfSpeech,
    meaning_number: item.meaningNumber,
    difficulty: item.level,
    category: item.category,
    source_definition: item.sourceDefinition,
    source_example: item.sourceExample,
    definition: item.definition,
    example: item.example,
    accepted_answers: item.questions.definitionInput.acceptedAnswers,
    questions: item.questions,
    review_notes: '',
    version: 1,
    is_local_seed: true
});

export const artifactToWorkspace = (artifact) => {
    const hasPriorityItems = artifact.items.some((item) => item.reviewPriority === 'priority');
    return {
        deck: {
            deck_id: artifact.deckId,
            grade: artifact.grade,
            deck_number: artifact.deckNumber,
            review_status: artifact.reviewMode === 'assisted' && hasPriorityItems
                ? 'editorial_review'
                : 'teacher_confirmed',
            review_mode: artifact.reviewMode,
            source_fingerprint: artifact.sourceFingerprint,
            version: 0,
            is_local_seed: true
        },
        items: artifact.items.map(artifactItemToRow),
        can_edit: true
    };
};

export const rowToSeedItem = (item) => ({
    itemKey: item.item_key,
    itemOrder: Number(item.item_order),
    word: item.word,
    partOfSpeech: item.part_of_speech,
    meaningNumber: Number(item.meaning_number),
    level: Number(item.difficulty),
    category: item.category,
    sourceDefinition: item.source_definition,
    sourceExample: item.source_example,
    definition: item.definition,
    example: item.example,
    acceptedAnswers: item.accepted_answers,
    questions: item.questions,
    reviewNotes: item.review_notes || null
});

export const validateReviewItem = (item) => {
    if (!item.part_of_speech?.trim()) return '품사를 입력해주세요.';
    if (!Number.isInteger(Number(item.meaning_number)) || Number(item.meaning_number) < 1) return '뜻 번호를 확인해주세요.';
    if (!Number.isInteger(Number(item.difficulty)) || Number(item.difficulty) < 1 || Number(item.difficulty) > 5) return '난이도는 1~5로 입력해주세요.';
    if (!item.definition?.trim()) return '뜻을 입력해주세요.';
    if (!item.example?.includes(item.word)) return '예문에 표제어가 포함되어야 합니다.';
    if (!Array.isArray(item.accepted_answers) || !item.accepted_answers.includes(item.word)) return '허용 정답에 표제어가 포함되어야 합니다.';
    const choiceQuestions = [
        item.questions?.meaningChoice,
        item.questions?.clozeChoice,
        item.questions?.usageDistinction
    ];
    const inputQuestions = [item.questions?.definitionInput, item.questions?.clozeInput];
    if ([...choiceQuestions, ...inputQuestions].some((question) => !question)) return '다섯 문항을 모두 채워주세요.';
    for (const question of choiceQuestions) {
        if (!question.prompt?.trim() || !Array.isArray(question.options) || question.options.length < 2) {
            return '선택형 문항의 질문과 보기를 확인해주세요.';
        }
        if (question.options.some((option) => !option.value?.trim())) return '선택형 문항의 빈 보기를 채워주세요.';
        if (question.options.filter((option) => option.isCorrect).length !== 1) return '선택형 문항마다 정답은 하나여야 합니다.';
    }
    if (inputQuestions.some((question) => !question.prompt?.trim())) return '직접 입력 문항의 질문을 채워주세요.';
    if (inputQuestions.some((question) => (
        !Array.isArray(question.acceptedAnswers) || !question.acceptedAnswers.includes(item.word)
    ))) return '직접 입력 문항의 허용 정답에 표제어가 포함되어야 합니다.';
    return null;
};
