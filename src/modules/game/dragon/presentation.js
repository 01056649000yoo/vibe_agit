const DRAGON_ASSET_PATH = '/assets/dragons';

/**
 * 드래곤의 화면 표현은 모듈 한곳에서 관리한다.
 * 단계 이미지·이름이나 아지트 배경을 바꾸면 전체 드래곤 방과 나의 아지트 슬롯이 함께 따라간다.
 */
export const getDragonStage = (level) => {
    const safeLevel = Number(level || 1);
    if (safeLevel >= 5) return { name: '전설의 수호신룡', image: `${DRAGON_ASSET_PATH}/dragon_stage_5.webp`, isPlaceholder: false };
    if (safeLevel === 4) return { name: '불을 내뿜는 성장한 용', image: `${DRAGON_ASSET_PATH}/dragon_stage_4.webp`, isPlaceholder: false };
    if (safeLevel === 3) return { name: '푸른 빛의 어린 용', image: `${DRAGON_ASSET_PATH}/dragon_stage_3.webp`, isPlaceholder: false };
    if (safeLevel === 2) return { name: '갓 태어난 용', image: `${DRAGON_ASSET_PATH}/dragon_stage_2.webp`, isPlaceholder: false };
    return { name: '신비로운 알', image: `${DRAGON_ASSET_PATH}/dragon_stage_1.webp`, isPlaceholder: false };
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
