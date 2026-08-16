export const ROOM_INFO = Object.freeze({
    meaning: { id: 'meaning', name: '뜻의 방', icon: '📖', guide: '뜻에 알맞은 낱말을 찾아요.' },
    sentence: { id: 'sentence', name: '문장의 방', icon: '✍️', guide: '문장의 빈칸을 완성해요.' },
    distinction: { id: 'distinction', name: '구별의 방', icon: '🔎', guide: '문맥에 가장 잘 어울리는 말을 골라요.' },
    boss: { id: 'boss', name: '복습 보스', icon: '🐉', guide: '앞에서 헷갈린 낱말을 다시 만나요.' }
});

const shuffled = (items, random = Math.random) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const nextIndex = Math.floor(random() * (index + 1));
        const current = Reflect.get(result, index);
        Reflect.set(result, index, Reflect.get(result, nextIndex));
        Reflect.set(result, nextIndex, current);
    }
    return result;
};

const questionKey = () => globalThis.crypto?.randomUUID?.()
    || `tower-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const getRoomType = (floor, roomIndex) => {
    if ((floor === 5 || floor === 10) && roomIndex === 2) return 'boss';
    return Reflect.get(['meaning', 'sentence', 'distinction'], roomIndex) || 'meaning';
};

export const replaceWordWithBlank = (example, word) => {
    if (!example) return '문장 속 빈칸에 알맞은 낱말을 골라보세요.';
    if (example.includes(word)) return example.replace(word, '＿＿＿＿');
    return `${example}\n이 문장과 가장 관계 깊은 낱말은 무엇일까요?`;
};

const pickTarget = ({ vocabulary, floor, roomType, reviewWords, usedWords, random }) => {
    if (roomType === 'boss' && reviewWords.length > 0) {
        const reviewSet = new Set(reviewWords);
        const reviewPool = vocabulary.filter((item) => reviewSet.has(item.word));
        if (reviewPool.length > 0) return shuffled(reviewPool, random).at(0);
    }

    const targetLevel = floor <= 3 ? 1 : floor <= 7 ? 2 : 3;
    const unused = vocabulary.filter((item) => !usedWords.has(item.word));
    const source = unused.length >= 4 ? unused : vocabulary;
    const nearLevel = source.filter((item) => Math.abs(Number(item.level || 1) - targetLevel) <= 1);
    return shuffled(nearLevel.length > 0 ? nearLevel : source, random).at(0);
};

const buildOptions = ({ vocabulary, target, reduceOptions, random }) => {
    const optionCount = reduceOptions ? 3 : 4;
    const sameCategory = vocabulary.filter((item) => item.word !== target.word && item.category === target.category);
    const similarLevel = vocabulary.filter((item) => (
        item.word !== target.word
        && item.category !== target.category
        && Math.abs(Number(item.level || 1) - Number(target.level || 1)) <= 1
    ));
    const others = vocabulary.filter((item) => item.word !== target.word);
    const unique = new Map(
        [...shuffled(sameCategory, random), ...shuffled(similarLevel, random), ...shuffled(others, random)]
            .map((item) => [item.word, item.word])
    );
    return shuffled([target.word, ...[...unique.values()].slice(0, optionCount - 1)], random);
};

export const buildRoomQuiz = ({
    vocabulary,
    floor,
    roomIndex,
    reviewWords = [],
    usedWords = new Set(),
    reduceOptions = false,
    random = Math.random
}) => {
    if (!Array.isArray(vocabulary) || vocabulary.length < 4) return null;
    const roomType = getRoomType(floor, roomIndex);
    const target = pickTarget({ vocabulary, floor, roomType, reviewWords, usedWords, random });
    if (!target) return null;

    const sentence = replaceWordWithBlank(target.example, target.word);
    const prompts = {
        meaning: target.definition,
        sentence,
        distinction: `${sentence}\n문맥에 가장 잘 어울리는 낱말을 골라보세요.`,
        boss: `${target.definition}\n${sentence}`
    };

    return {
        questionKey: questionKey(),
        roomType,
        room: Reflect.get(ROOM_INFO, roomType),
        prompt: Reflect.get(prompts, roomType),
        options: buildOptions({ vocabulary, target, reduceOptions, random }),
        correctAnswer: target.word,
        word: target,
        isReview: roomType === 'boss' && reviewWords.includes(target.word)
    };
};

export const mapV2Question = (data) => {
    const roomType = data?.room_type;
    const room = Reflect.get(ROOM_INFO, roomType);
    if (!data?.question_key || !room || !Array.isArray(data?.options) || !data?.word) return null;
    return {
        questionKey: data.question_key,
        roomType,
        room,
        questionType: data.question_type,
        sequenceNumber: Number(data.sequence_number || 0),
        targetQuestionCount: Number(data.target_question_count || 0),
        deckNumber: Number(data.deck_number || 0),
        prompt: data.prompt,
        options: data.options,
        correctAnswer: null,
        explanation: null,
        word: data.word,
        isReview: Boolean(data.is_review)
    };
};
