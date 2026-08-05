const DRAGON_ASSET_PATH = '/assets/dragons';

const DRAGON_STAGES = [
    { name: '잠든 이야기의 알', formLevel: 1, variant: 'base', aura: 'none', imageScale: 0.9, imageFilter: 'saturate(0.9)' },
    { name: '깨어나는 이야기의 알', formLevel: 1, variant: 'awakened', aura: 'soft', imageScale: 0.98, imageFilter: 'saturate(1.12) brightness(1.05)' },
    { name: '글을 만난 아기 용', formLevel: 2, variant: 'base', aura: 'soft', imageScale: 0.94, imageFilter: 'saturate(0.95)' },
    { name: '호기심 많은 아기 용', formLevel: 2, variant: 'awakened', aura: 'blue', imageScale: 1.02, imageFilter: 'saturate(1.18) brightness(1.04)' },
    { name: '서재를 지키는 어린 용', formLevel: 3, variant: 'base', aura: 'blue', imageScale: 0.96, imageFilter: 'saturate(1.02)' },
    { name: '날개를 펼친 이야기 용', formLevel: 3, variant: 'awakened', aura: 'violet', imageScale: 1.05, imageFilter: 'saturate(1.22) brightness(1.04)' },
    { name: '빛나는 문양의 수호룡', formLevel: 4, variant: 'base', aura: 'violet', imageScale: 0.98, imageFilter: 'saturate(1.05)' },
    { name: '작가의 수호룡', formLevel: 4, variant: 'awakened', aura: 'gold', imageScale: 1.06, imageFilter: 'saturate(1.24) brightness(1.05)' },
    { name: '지혜로운 수호룡', formLevel: 5, variant: 'base', aura: 'gold', imageScale: 1, imageFilter: 'saturate(1.08)' },
    { name: '전설의 작가 수호룡', formLevel: 5, variant: 'awakened', aura: 'legend', imageScale: 1.08, imageFilter: 'saturate(1.3) brightness(1.08)' }
];

/**
 * 드래곤의 화면 표현은 모듈 한곳에서 관리한다.
 * 단계 이미지·이름이나 아지트 배경을 바꾸면 전체 드래곤 방과 나의 아지트 슬롯이 함께 따라간다.
 */
export const getDragonStage = (level) => {
    const safeLevel = Math.min(10, Math.max(1, Math.floor(Number(level) || 1)));
    const stage = DRAGON_STAGES[safeLevel - 1];
    return {
        ...stage,
        level: safeLevel,
        image: `${DRAGON_ASSET_PATH}/dragon_stage_${stage.formLevel}.webp`,
        isMilestone: safeLevel % 2 === 1,
        isPlaceholder: false
    };
};

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

export const HIDEOUT_BACKGROUNDS = {
    default: { id: 'default', name: '기본 초원', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#FFF176', textColor: '#5D4037', subColor: '#8D6E63', glow: 'rgba(255, 241, 118, 0.3)' },
    volcano: { id: 'volcano', name: '🌋 화산 동굴', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', textColor: 'white', subColor: '#FFCCBC', price: 300, glow: 'rgba(255, 87, 34, 0.4)' },
    sky: { id: 'sky', name: '☁️ 천상 전당', color: 'linear-gradient(180deg, #0288D1 0%, #E1F5FE 70%, #FFFFFF 100%)', border: '#81D4FA', textColor: '#01579B', subColor: '#0288D1', price: 500, glow: 'rgba(129, 212, 250, 0.4)' },
    crystal: { id: 'crystal', name: '💎 수정 궁전', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', textColor: 'white', subColor: '#E1BEE7', price: 1000, glow: 'rgba(186, 104, 200, 0.4)' },
    storm: { id: 'storm', name: '🌩️ 번개 폭풍', color: 'linear-gradient(180deg, #050A30 0%, #000C66 50%, #000000 100%)', border: '#7986CB', textColor: 'white', subColor: '#C5CAE9', price: 700, glow: 'rgba(121, 134, 203, 0.6)' },
    galaxy: { id: 'galaxy', name: '🌌 달빛 은하수', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#90CAF9', textColor: 'white', subColor: '#E3F2FD', price: 500, glow: 'rgba(144, 202, 249, 0.4)' },
    legend: { id: 'legend', name: '✨ 천상의 황금성소', color: 'linear-gradient(135deg, #1A1A1A 0%, #4D342C 50%, #1A1A1A 100%)', border: '#FFD700', textColor: '#FFD700', subColor: '#B8860B', price: 0, requiresMaxLevel: true, glow: 'rgba(255, 215, 0, 0.9)' }
};

export const getHideoutBackground = (backgroundId) => (
    Reflect.get(HIDEOUT_BACKGROUNDS, backgroundId) || HIDEOUT_BACKGROUNDS.default
);
