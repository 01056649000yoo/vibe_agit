/**
 * 교사가 미션을 만들 때 고르는 **글 종류 목록의 원본**이다.
 *
 * 예전에는 목록이 `MissionManager.jsx` 안에 배열로 박혀 있었고, 전용 틀이 있는 종류(시·보고서·회의)와
 * 자유 글쓰기 종류가 서로 다른 화면에 흩어져 있었다. 그래서 운영에서 `동시`(자유 글) 12건과
 * `시`(전용 틀) 2건처럼 같은 글이 두 이름으로 갈라져 쌓였다. 이제 목록은 이 파일 하나이고,
 * 교사는 글 종류만 고르면 전용 틀로 갈지 자유 글쓰기로 갈지는 앱이 정한다.
 *
 * - `missionTypeId`가 있으면 그 전용 틀 화면으로 보낸다(`mission-types/registry.js`).
 * - `preset`이 있으면 자유 글쓰기 폼의 안내·질문·분량을 대신 채워 준다.
 * - 둘 다 없으면(기타) 빈 폼 그대로 연다.
 *
 * 일기와 독서록은 학생이 스스로 쓰는 자율 글이라 여기 없다(`selfWritingTypes.js`).
 * 과거 미션에 남아 있는 `일기`·`독후감(서평)`·`동시` 같은 값은 기록 보존을 위해 건드리지 않는다.
 */

const GENRE_ENTRIES = Object.freeze([
    {
        id: '생활문',
        category: '❤️ 마음을 표현하는 글',
        preset: {
            guide: '오늘 겪은 일 가운데 마음에 남은 한 가지를 골라, 그때 보고 들은 것과 느낌을 자세히 씁니다.',
            questions: [
                '언제, 어디에서 있었던 일인가요?',
                '그때 무슨 일이 차례대로 일어났나요?',
                '그 일을 겪으며 든 생각이나 느낌은 어땠나요?',
            ],
            minChars: 300,
            minParagraphs: 3,
        },
    },
    {
        id: '편지',
        category: '❤️ 마음을 표현하는 글',
        missionTypeId: 'letter',
        summary: '받는 사람·인사 칸을 나눠 쓰고 계기교육용 편지지로 인쇄하는 전용 틀로 만듭니다.',
    },
    {
        id: '설명문',
        category: '🔍 사실을 전달하는 글',
        preset: {
            guide: '읽는 사람이 잘 모를 만한 것을 골라 처음·가운데·끝 차례로 알기 쉽게 설명합니다.',
            questions: [
                '무엇을 설명할 건가요?',
                '꼭 알려 주고 싶은 내용 두세 가지는 무엇인가요?',
                '읽는 사람이 기억했으면 하는 점은 무엇인가요?',
            ],
            minChars: 400,
            minParagraphs: 3,
        },
    },
    {
        id: '관찰·조사 보고서',
        category: '🔍 사실을 전달하는 글',
        missionTypeId: 'report',
        summary: '사진을 넣고 칸을 나눠 쓰는 전용 틀로 만듭니다.',
    },
    {
        id: '기사문',
        category: '🔍 사실을 전달하는 글',
        preset: {
            guide: '언제·어디서·누가·무엇을·왜·어떻게가 드러나게 사실을 전하는 기사를 씁니다.',
            questions: [
                '어떤 일이 있었나요?',
                '언제, 어디에서, 누가 한 일인가요?',
                '그 일이 왜 알릴 만한 일인가요?',
            ],
            minChars: 350,
            minParagraphs: 3,
        },
    },
    {
        id: '기행문',
        category: '🔍 사실을 전달하는 글',
        preset: {
            guide: '다녀온 곳에서 본 것, 들은 것, 느낀 것을 다녀온 차례대로 씁니다.',
            questions: [
                '어디에 다녀왔나요? 가는 길은 어땠나요?',
                '그곳에서 보고 들은 것 가운데 가장 기억에 남는 것은 무엇인가요?',
                '다녀와서 새로 알게 되었거나 느낀 점은 무엇인가요?',
            ],
            minChars: 400,
            minParagraphs: 3,
        },
    },
    {
        id: '논설문',
        category: '💡 생각을 주장하는 글',
        preset: {
            guide: '주장을 정하고, 왜 그렇게 생각하는지 근거를 들어 읽는 사람을 설득하는 글을 씁니다.',
            questions: [
                '내 주장은 무엇인가요?',
                '그렇게 생각하는 까닭 두 가지는 무엇인가요?',
                '반대로 생각하는 사람에게 어떻게 답하고 싶나요?',
            ],
            minChars: 400,
            minParagraphs: 3,
        },
    },
    {
        id: '안건 의견 모으기',
        category: '💡 생각을 주장하는 글',
        missionTypeId: 'meeting',
        summary: '선생님이 낸 안건에 학생들이 의견을 내는 전용 틀로 만듭니다.',
    },
    {
        id: '시',
        category: '🌈 상상을 담은 글',
        missionTypeId: 'poem',
        summary: '연을 나눠 쓰는 전용 틀로 만듭니다.',
    },
    {
        id: '이야기(동화)',
        category: '🌈 상상을 담은 글',
        preset: {
            guide: '인물과 배경을 정하고, 일이 벌어지고 해결되는 차례로 이야기를 지어 씁니다.',
            questions: [
                '주인공은 누구이고 어떤 성격인가요?',
                '주인공에게 어떤 어려운 일이 생기나요?',
                '그 일은 어떻게 해결되나요?',
            ],
            minChars: 400,
            minParagraphs: 3,
        },
    },
    {
        id: '기타',
        category: '✨ 기타 활동',
        summary: '안내와 질문을 선생님이 직접 씁니다.',
    },
]);

const CATEGORY_ORDER = Object.freeze([
    '❤️ 마음을 표현하는 글',
    '🔍 사실을 전달하는 글',
    '💡 생각을 주장하는 글',
    '🌈 상상을 담은 글',
    '✨ 기타 활동',
]);

export const getGenreEntries = () => GENRE_ENTRIES;

export const getGenreEntry = (id) => GENRE_ENTRIES.find((entry) => entry.id === id) ?? null;

export const getGenrePreset = (id) => getGenreEntry(id)?.preset ?? null;

/** 전용 틀로 보내야 하는 종류면 그 틀의 id, 아니면 null. */
export const getGenreMissionTypeId = (id) => getGenreEntry(id)?.missionTypeId ?? null;

/** 미션 만들기 첫 화면에서 쓰는 분류별 묶음. 전용 틀 종류까지 함께 보여 준다. */
export const getGenreCategories = () => CATEGORY_ORDER
    .map((label) => ({
        label,
        entries: GENRE_ENTRIES.filter((entry) => entry.category === label),
    }))
    .filter((category) => category.entries.length > 0);

/**
 * 폼 안의 글 종류 선택칸은 자유 글쓰기 종류만 담는다.
 * 전용 틀은 저장 구조가 달라 도중에 갈아탈 수 없으므로 첫 화면에서만 고르게 한다.
 */
export const getFreeformGenreCategories = () => getGenreCategories()
    .map((category) => ({
        label: category.label,
        entries: category.entries.filter((entry) => !entry.missionTypeId),
    }))
    .filter((category) => category.entries.length > 0);

const PRESET_FIELDS = Object.freeze(['guide', 'guide_questions', 'min_chars', 'min_paragraphs']);

const presetValueFor = (preset, field) => {
    if (!preset) return null;
    if (field === 'guide') return preset.guide;
    if (field === 'guide_questions') return [...preset.questions];
    if (field === 'min_chars') return preset.minChars;
    if (field === 'min_paragraphs') return preset.minParagraphs;
    return null;
};

const isEmptyValue = (field, value) => {
    if (field === 'guide') return !String(value || '').trim();
    if (field === 'guide_questions') return !(Array.isArray(value) && value.some((item) => String(item || '').trim()));
    return !Number(value);
};

const isSameValue = (field, left, right) => (
    field === 'guide_questions'
        ? JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
        : left === right
);

/**
 * 글 종류에 맞는 프리셋을 폼에 넣는다. **덮어쓰기가 아니라 채워 넣기다.**
 *
 * 교사가 직접 고친 칸은 건드리지 않는다. 판정은 간단하다 — 지금 값이 비었거나,
 * 직전 프리셋이 넣어 준 값 그대로면 손대지 않은 것으로 본다.
 *
 * @param {object} formData         지금 폼 값
 * @param {string} genreId          새로 고른 글 종류
 * @param {object} options
 * @param {string|null} options.previousGenre  직전에 프리셋을 넣은 종류(없으면 null)
 * @param {boolean} options.force             `프리셋 다시 넣기` 처럼 교사가 직접 요청한 경우
 * @param {boolean} options.keepQuestions     제출이 시작돼 질문을 잠근 경우
 * @returns {{ formData: object, filled: string[], kept: string[] }}
 */
export const applyGenrePreset = (formData, genreId, {
    previousGenre = null,
    force = false,
    keepQuestions = false,
} = {}) => {
    const base = { ...formData, genre: genreId };
    const preset = getGenrePreset(genreId);
    if (!preset) return { formData: base, filled: [], kept: [] };

    const previousPreset = previousGenre && previousGenre !== genreId ? getGenrePreset(previousGenre) : null;
    const next = { ...base };
    const filled = [];
    const kept = [];

    for (const field of PRESET_FIELDS) {
        if (keepQuestions && field === 'guide_questions') {
            kept.push(field);
            continue;
        }
        const current = Reflect.get(formData || {}, field);
        const untouched = isEmptyValue(field, current)
            || (previousPreset && isSameValue(field, current, presetValueFor(previousPreset, field)));

        if (force || untouched) {
            Reflect.set(next, field, presetValueFor(preset, field));
            filled.push(field);
        } else {
            kept.push(field);
        }
    }

    if (filled.includes('guide_questions')) {
        next.use_ai_questions = true;
        next.question_count = next.guide_questions.length;
    }
    return { formData: next, filled, kept };
};

const FIELD_LABELS = Object.freeze({
    guide: '안내 문구',
    guide_questions: '안내 질문',
    min_chars: '최소 글자 수',
    min_paragraphs: '최소 문단 수',
});

/** 프리셋을 넣은 뒤 교사에게 보여 줄 한 줄 안내를 만든다. */
export const describePresetResult = (genreId, { filled = [], kept = [] } = {}) => {
    if (filled.length === 0) return '';
    const keptLabels = kept
        .map((field) => Reflect.get(FIELD_LABELS, field))
        .filter(Boolean);
    const head = `${genreId} 프리셋을 넣었어요.`;
    if (keptLabels.length === 0) return `${head} 언제든 고칠 수 있어요.`;
    return `${head} 선생님이 고친 ${keptLabels.join('·')}은(는) 그대로 두었어요.`;
};
