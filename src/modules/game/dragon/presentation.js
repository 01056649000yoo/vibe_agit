const DRAGON_ASSET_PATH = '/assets/dragons/v2';

export const DEFAULT_DRAGON_SPECIES = 'star';

export const DRAGON_SPECIES = [
    {
        id: 'star',
        name: '별빛 룬',
        shortName: '별빛룡',
        description: '별자리의 빛을 품은 차분한 수호룡',
        accent: '#1E88E5',
        soft: '#E3F2FD'
    },
    {
        id: 'forest',
        name: '숲의 수호',
        shortName: '숲수호룡',
        description: '나무와 잎의 기운을 지닌 든든한 수호룡',
        accent: '#558B2F',
        soft: '#F1F8E9'
    },
    {
        id: 'ember',
        name: '노을 불꽃',
        shortName: '노을룡',
        description: '노을처럼 따뜻하고 용감한 수호룡',
        accent: '#C4472D',
        soft: '#FFF3E0'
    },
    {
        id: 'moon',
        name: '달빛 서리',
        shortName: '달빛룡',
        description: '달빛처럼 고요하고 지혜로운 수호룡',
        accent: '#7E71C6',
        soft: '#F3F0FF'
    }
];

const SPECIES_BY_ID = new Map(DRAGON_SPECIES.map((species) => [species.id, species]));

const DRAGON_STAGES = [
    { name: '잠든 이야기의 알', form: 'egg', imageScale: 0.94 },
    { name: '깨어나는 이야기의 알', form: 'egg-awake', imageScale: 0.98 },
    { name: '방금 태어난 해츨링', form: 'hatchling', imageScale: 0.96 },
    { name: '호기심 많은 해츨링', form: 'hatchling', imageScale: 1 },
    { name: '날개 돋은 해츨링', form: 'hatchling', imageScale: 1.02 },
    { name: '성장하는 이야기 용', form: 'juvenile', imageScale: 1.02 },
    { name: '젊은 아지트 수호룡', form: 'guardian', imageScale: 1.03 },
    { name: '든든한 성체 수호룡', form: 'guardian', imageScale: 1.04 },
    { name: '지혜로운 고대 수호룡', form: 'ancient', imageScale: 1.05 },
    { name: '전설의 작가 수호룡', form: 'legend', imageScale: 1.06 }
];

export const READER_DRAGON_EFFECTS = [
    { level: 1, name: '고요한 빛', description: '아직 잔잔한 빛을 품고 있어요.', className: 'quiet', particles: 0 },
    { level: 2, name: '첫 책빛', description: '부드러운 책빛이 수호룡을 감싸요.', className: 'booklight', particles: 2 },
    { level: 3, name: '이야기 반짝임', description: '읽은 이야기의 반짝임이 떠올라요.', className: 'spark', particles: 3 },
    { level: 4, name: '우정의 궤도', description: '친구와 나눈 이야기가 빛의 궤도를 만들어요.', className: 'orbit', particles: 4 },
    { level: 5, name: '별무리 서가', description: '든든한 독자의 별빛이 주변을 밝혀요.', className: 'starlibrary', particles: 5 },
    { level: 6, name: '이야기 오로라', description: '많은 글에서 모은 빛이 오로라처럼 흘러요.', className: 'aurora', particles: 6 },
    { level: 7, name: '아지트 수호광', description: '아지트 지킴이의 찬란한 빛이 완성됐어요.', className: 'guardian', particles: 7 }
];

export const normalizeDragonSpecies = (speciesId) => (
    SPECIES_BY_ID.has(speciesId) ? speciesId : DEFAULT_DRAGON_SPECIES
);

export const getDragonSpecies = (speciesId) => (
    SPECIES_BY_ID.get(normalizeDragonSpecies(speciesId))
);

/**
 * 드래곤의 화면 표현은 모듈 한곳에서 관리한다.
 * 4종×작가 10단계 이미지는 개별 에셋이며 독자 효과는 별도 경량 레이어로 합성한다.
 */
export const getDragonStage = (level, speciesId = DEFAULT_DRAGON_SPECIES) => {
    const safeLevel = Math.min(10, Math.max(1, Math.floor(Number(level) || 1)));
    const species = getDragonSpecies(speciesId);
    const stage = DRAGON_STAGES[safeLevel - 1];
    return {
        ...stage,
        level: safeLevel,
        formLevel: safeLevel,
        species,
        speciesId: species.id,
        image: `${DRAGON_ASSET_PATH}/${species.id}/level-${safeLevel}.webp`,
        imageFilter: 'none',
        isMilestone: safeLevel === 1 || safeLevel === 3 || safeLevel === 7 || safeLevel === 10,
        isPlaceholder: false
    };
};

export const getReaderDragonEffect = (readerLevel) => {
    const rawLevel = typeof readerLevel === 'object' ? readerLevel?.level : readerLevel;
    const safeLevel = Math.min(7, Math.max(1, Math.floor(Number(rawLevel) || 1)));
    return READER_DRAGON_EFFECTS[safeLevel - 1];
};

export const canReselectDragonSpecies = (petData, writerLevel) => (
    Boolean(petData?.species)
    && Number(writerLevel || petData?.level || 1) >= 3
    && !petData?.speciesReselectedAt
);

/** 작가 칭호의 현재 단계·진행도를 드래곤 표시값으로 바꾼다. 저장된 예전 먹이 레벨은 쓰지 않는다. */
export const getDragonGrowthFromWriterLevel = (writerLevel) => {
    const level = Math.min(10, Math.max(1, Math.floor(Number(writerLevel?.level) || 1)));
    if (level >= 10 || !writerLevel?.next) return { level, progress: 100 };

    const from = Number(writerLevel.progressFrom || 0);
    const current = Number(writerLevel.progressValue || 0);
    const target = Number(writerLevel.next || 0);
    const range = Math.max(1, target - from);
    const progress = Math.round(((current - from) / range) * 100);

    return { level, progress: Math.min(100, Math.max(0, progress)) };
};

/** 실제 칭호와 관리용 테스트 칭호의 성장 확인 기록을 서로 섞지 않는다. */
export const getPendingDragonGrowth = (writerLevel, petData) => {
    if (!petData?.species) return null;

    const toLevel = Math.min(10, Math.max(1, Math.floor(Number(writerLevel?.level) || 1)));
    if (toLevel <= 1) return null;

    const acknowledgmentKey = writerLevel?.isTestOverride
        ? 'lastCelebratedTestWriterLevel'
        : 'lastCelebratedWriterLevel';
    const acknowledgedValue = petData ? Reflect.get(petData, acknowledgmentKey) : null;
    const acknowledgedLevel = Math.min(10, Math.max(1, Math.floor(Number(acknowledgedValue) || 1)));
    if (toLevel <= acknowledgedLevel) return null;

    return {
        fromLevel: Math.min(toLevel - 1, acknowledgedLevel),
        toLevel,
        isTestOverride: Boolean(writerLevel?.isTestOverride)
    };
};

const READER_SCENE_THEMES = new Map([
    ['light', {
        stage: 'rgba(40, 54, 82, .13)',
        stageEdge: 'rgba(255, 255, 255, .88)',
        contrastEdge: 'rgba(35, 43, 61, .42)',
        particleCore: '#FFFFFF'
    }],
    ['dark', {
        stage: 'rgba(255, 255, 255, .15)',
        stageEdge: 'rgba(255, 244, 199, .9)',
        contrastEdge: 'rgba(10, 15, 29, .68)',
        particleCore: '#FFFDF4'
    }],
    ['vivid', {
        stage: 'rgba(24, 31, 55, .2)',
        stageEdge: 'rgba(255, 255, 255, .92)',
        contrastEdge: 'rgba(18, 24, 43, .62)',
        particleCore: '#FFFFFF'
    }]
]);

/** 저장 ID는 예전 배경과 호환하지만, 화면에서는 모서리 프레임 테마로 사용한다. */
export const getReaderSceneTheme = (backgroundId) => {
    const background = Reflect.get(HIDEOUT_BACKGROUNDS, backgroundId) || HIDEOUT_BACKGROUNDS.default;
    const theme = READER_SCENE_THEMES.get(background.readerTone) || READER_SCENE_THEMES.get('light');
    return {
        '--dragon-reader-stage': theme.stage,
        '--dragon-reader-stage-edge': theme.stageEdge,
        '--dragon-reader-contrast-edge': theme.contrastEdge,
        '--dragon-reader-particle-core': theme.particleCore
    };
};

export const HIDEOUT_BACKGROUNDS = {
    default: { id: 'default', name: '기본 나무 프레임', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#A97848', textColor: '#5D4037', subColor: '#8D6E63', glow: 'rgba(169, 120, 72, 0.28)', readerTone: 'light' },
    volcano: { id: 'volcano', name: '🌋 용암 프레임', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', textColor: 'white', subColor: '#FFCCBC', price: 300, glow: 'rgba(255, 87, 34, 0.4)', readerTone: 'dark' },
    sky: { id: 'sky', name: '☁️ 구름 프레임', color: 'linear-gradient(180deg, #0288D1 0%, #E1F5FE 70%, #FFFFFF 100%)', border: '#81D4FA', textColor: '#01579B', subColor: '#0288D1', price: 500, glow: 'rgba(129, 212, 250, 0.4)', readerTone: 'vivid' },
    crystal: { id: 'crystal', name: '💎 수정 프레임', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', textColor: 'white', subColor: '#E1BEE7', price: 1000, glow: 'rgba(186, 104, 200, 0.4)', readerTone: 'dark' },
    storm: { id: 'storm', name: '🌩️ 번개 프레임', color: 'linear-gradient(180deg, #050A30 0%, #000C66 50%, #000000 100%)', border: '#7986CB', textColor: 'white', subColor: '#C5CAE9', price: 700, glow: 'rgba(121, 134, 203, 0.6)', readerTone: 'dark' },
    galaxy: { id: 'galaxy', name: '🌌 별자리 프레임', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#6679D9', textColor: 'white', subColor: '#E3F2FD', price: 500, glow: 'rgba(102, 121, 217, 0.4)', readerTone: 'dark' },
    legend: { id: 'legend', name: '✨ 전설의 황금 프레임', color: 'linear-gradient(135deg, #1A1A1A 0%, #4D342C 50%, #1A1A1A 100%)', border: '#D5A51E', textColor: '#FFD700', subColor: '#B8860B', price: 0, requiresMaxLevel: true, glow: 'rgba(213, 165, 30, 0.55)', readerTone: 'dark' }
};

export const getHideoutBackground = (backgroundId) => (
    Reflect.get(HIDEOUT_BACKGROUNDS, backgroundId) || HIDEOUT_BACKGROUNDS.default
);
