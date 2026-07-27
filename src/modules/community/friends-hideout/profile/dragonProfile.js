export const HIDEOUT_BACKGROUNDS = {
    default: { id: 'default', name: '기본 초원', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#FFF176', textColor: '#5D4037', subColor: '#8D6E63', glow: 'rgba(255, 241, 118, 0.3)' },
    volcano: { id: 'volcano', name: '🌋 화산 동굴', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', textColor: 'white', subColor: '#FFCCBC', glow: 'rgba(255, 87, 34, 0.4)' },
    sky: { id: 'sky', name: '☁️ 천상 전당', color: 'linear-gradient(135deg, #B3E5FC 0%, #E1F5FE 100%)', border: '#4FC3F7', textColor: '#01579B', subColor: '#0288D1', glow: 'rgba(79, 195, 247, 0.3)' },
    crystal: { id: 'crystal', name: '💎 수정 궁전', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', textColor: 'white', subColor: '#E1BEE7', glow: 'rgba(186, 104, 200, 0.4)' },
    storm: { id: 'storm', name: '🌩️ 번개 폭풍', color: 'linear-gradient(135deg, #1A237E 0%, #000000 100%)', border: '#7986CB', textColor: 'white', subColor: '#C5CAE9', glow: 'rgba(121, 134, 203, 0.5)' },
    galaxy: { id: 'galaxy', name: '🌌 달빛 은하수', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#90CAF9', textColor: 'white', subColor: '#E3F2FD', glow: 'rgba(144, 202, 249, 0.4)' },
    legend: { id: 'legend', name: '🌈 무지개 성소', color: 'linear-gradient(135deg, #FF9A9E 0%, #FAD0C4 99%, #FAD0C4 100%)', border: '#FFD700', textColor: '#D81B60', subColor: '#AD1457', glow: 'rgba(255, 215, 0, 0.6)' }
};

export const normalizeFriendPet = (petData) => ({
    name: '친구 드래곤',
    level: 1,
    background: 'default',
    exp: 0,
    ...(petData || {})
});

export const getHideoutBackground = (backgroundId) => (
    Object.values(HIDEOUT_BACKGROUNDS).find((background) => background.id === backgroundId) || HIDEOUT_BACKGROUNDS.default
);

export const getDragonStage = (level) => {
    const basePath = '/assets/dragons';
    if (level >= 5) return { name: '전설의 수호신룡', image: `${basePath}/dragon_stage_5.webp` };
    if (level === 4) return { name: '불을 내뿜는 성장한 용', image: `${basePath}/dragon_stage_4.webp` };
    if (level === 3) return { name: '푸른 빛의 어린 용', image: `${basePath}/dragon_stage_3.webp` };
    if (level === 2) return { name: '갓 태어난 용', image: `${basePath}/dragon_stage_2.webp` };
    return { name: '신비로운 알', image: `${basePath}/dragon_stage_1.webp` };
};
