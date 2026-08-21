import { HIDEOUT_BACKGROUNDS } from './presentation.js';

export const DRAGON_DECOR_SLOTS = [
    { id: 'wallpaper', name: '프레임', icon: '⌗', description: '중앙을 가리지 않는 네 모서리 장식' },
    { id: 'pedestal', name: '받침대', icon: '▱', description: '수호룡의 속성과 분위기를 살리는 자리' },
    { id: 'leftProp', name: '왼쪽 소품', icon: '◩', description: '수호룡 세계관과 어울리는 왼쪽 장식' },
    { id: 'rightProp', name: '오른쪽 소품', icon: '◪', description: '수호룡 세계관과 어울리는 오른쪽 장식' },
    { id: 'nameplate', name: '문패', icon: '▭', description: '친구에게 보여 줄 아지트 표식' }
];

export const DRAGON_DECOR_RARITIES = Object.freeze({
    starter: { id: 'starter', name: '입문', price: 300, requiredWriterLevel: 1 },
    common: { id: 'common', name: '일반', price: 700, requiredWriterLevel: 3 },
    rare: { id: 'rare', name: '희귀', price: 1500, requiredWriterLevel: 5 },
    hero: { id: 'hero', name: '영웅', price: 3000, requiredWriterLevel: 7 },
    legendary: { id: 'legendary', name: '전설', price: 0, requiredWriterLevel: 10, requiredReaderLevel: 7, acquisitionType: 'achievement' }
});

export const DRAGON_LEGENDARY_REWARD = Object.freeze({
    id: 'legendary-sanctuary',
    name: '전설의 황금 성소',
    requiredWriterLevel: 10,
    requiredReaderLevel: 7
});

export const DEFAULT_EQUIPPED_DECOR = Object.freeze({
    wallpaper: 'default',
    pedestal: 'pedestal-stone',
    leftProp: 'left-none',
    rightProp: 'right-none',
    nameplate: 'nameplate-simple'
});

// 문패 원본마다 장식이 차지하는 폭이 달라 글자를 놓을 수 있는 실제 안쪽 비율도 다르다.
// 이 값은 학생 아지트와 공방 미리보기가 함께 사용한다.
export const DRAGON_NAMEPLATE_TEXT_PROFILES = Object.freeze({
    simple: Object.freeze({ safeWidth: 0.64, centerY: 0.50 }),
    oak: Object.freeze({ safeWidth: 0.60, centerY: 0.50 }),
    brass: Object.freeze({ safeWidth: 0.50, centerY: 0.50 }),
    crystal: Object.freeze({ safeWidth: 0.54, centerY: 0.51 }),
    rune: Object.freeze({ safeWidth: 0.58, centerY: 0.50 }),
    celestial: Object.freeze({ safeWidth: 0.61, centerY: 0.57 }),
    ember: Object.freeze({ safeWidth: 0.53, centerY: 0.51 }),
    storm: Object.freeze({ safeWidth: 0.34, centerY: 0.54 }),
    legend: Object.freeze({ safeWidth: 0.38, centerY: 0.55 })
});

const getTextWeight = (value) => Array.from(String(value || '')).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.35;
    if (/[\u1100-\u11ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af]/u.test(character)) return total + 1;
    if (/[A-Z]/u.test(character)) return total + 0.76;
    return total + 0.6;
}, 0);

const clamp = (minimum, value, maximum) => Math.min(maximum, Math.max(minimum, value));

export const getDragonNameplateTextLayout = (
    preview = 'simple',
    title = '나의 아지트',
    subtitle = '작가 수호룡',
    { compact = false, thumbnail = false } = {}
) => {
    const profile = Reflect.get(DRAGON_NAMEPLATE_TEXT_PROFILES, preview) || DRAGON_NAMEPLATE_TEXT_PROFILES.simple;
    const titleWeight = Math.max(1, getTextWeight(title));
    const subtitleWeight = Math.max(1, getTextWeight(subtitle));

    if (thumbnail) {
        const thumbnailWidth = profile.safeWidth * 92;
        const thumbnailSize = clamp(0.29, thumbnailWidth / titleWeight / 10, 0.37);
        return {
            '--nameplate-copy-width': `${thumbnailWidth.toFixed(1)}%`,
            '--nameplate-copy-top': `${(profile.centerY * 100).toFixed(1)}%`,
            '--nameplate-thumbnail-size': `${thumbnailSize.toFixed(3)}rem`
        };
    }

    const baseHeight = compact ? 27 : 24;
    const maximumHeight = compact ? 38 : 31;
    const baseTitleSize = compact ? 4.2 : 3.7;
    const horizontalPadding = 0.9;
    const requiredHeight = (titleWeight * baseTitleSize) / (2.5 * profile.safeWidth * horizontalPadding);
    const height = clamp(baseHeight, requiredHeight, maximumHeight);
    const fitScale = Math.min(1, maximumHeight / Math.max(requiredHeight, 1));
    const containerWidth = compact ? 96 : 76;
    const copyWidth = (2.5 * height * profile.safeWidth * horizontalPadding / containerWidth) * 100;
    const subtitleScale = Math.min(1, (copyWidth * containerWidth / 100) / Math.max(subtitleWeight * 2.6, 1));

    return {
        '--nameplate-height': `${height.toFixed(2)}%`,
        '--nameplate-copy-width': `${copyWidth.toFixed(2)}%`,
        '--nameplate-copy-top': `${(profile.centerY * 100).toFixed(1)}%`,
        '--nameplate-title-size': `${(baseTitleSize * fitScale).toFixed(2)}cqi`,
        '--nameplate-subtitle-size': `${(2.6 * Math.min(1, subtitleScale)).toFixed(2)}cqi`
    };
};

// `wallpaper`는 이미 저장된 학생 데이터와 RPC 호환을 위한 내부 키다. UI에서는 프레임으로 부른다.
const FRAME_ITEMS = Object.values(HIDEOUT_BACKGROUNDS).map((background, index) => ({
    ...background,
    slot: 'wallpaper',
    isDefault: background.id === 'default',
    rarity: background.id === 'legend' ? 'legendary' : background.rarity,
    sortOrder: index
}));

const DECOR_ITEMS = [
    { id: 'pedestal-stone', slot: 'pedestal', name: '다듬은 돌', isDefault: true, preview: 'stone', sortOrder: 0 },
    { id: 'pedestal-oak', slot: 'pedestal', name: '참나무 단상', rarity: 'starter', theme: 'forest', preview: 'oak', sortOrder: 1 },
    { id: 'pedestal-cloud', slot: 'pedestal', name: '구름 받침', rarity: 'starter', theme: 'sky', preview: 'cloud', sortOrder: 2 },
    { id: 'pedestal-root', slot: 'pedestal', name: '고목 뿌리 둥지', rarity: 'common', theme: 'forest', preview: 'root', sortOrder: 3 },
    { id: 'pedestal-ember', slot: 'pedestal', name: '불씨 대장간', rarity: 'common', theme: 'ember', preview: 'ember', sortOrder: 4 },
    { id: 'pedestal-crystal', slot: 'pedestal', name: '수정 받침', rarity: 'rare', theme: 'crystal', preview: 'crystal', sortOrder: 5 },
    { id: 'pedestal-moonstone', slot: 'pedestal', name: '달빛 월석', rarity: 'rare', theme: 'moon', preview: 'moonstone', sortOrder: 6 },
    { id: 'pedestal-rune', slot: 'pedestal', name: '고대 룬 단상', rarity: 'hero', theme: 'rune', preview: 'rune', sortOrder: 7 },
    { id: 'pedestal-celestial', slot: 'pedestal', name: '천상의 별빛 옥좌', rarity: 'hero', theme: 'celestial', preview: 'celestial', sortOrder: 8 },
    { id: 'pedestal-legend', slot: 'pedestal', name: '황금 수호왕좌', rarity: 'legendary', theme: 'legend', preview: 'legend', sortOrder: 9 },

    { id: 'left-none', slot: 'leftProp', name: '비워 두기', isDefault: true, preview: 'none', sortOrder: 0 },
    { id: 'left-plant', slot: 'leftProp', name: '용심장 수정 군락', rarity: 'starter', theme: 'crystal', preview: 'dragonheart-crystals', image: '/assets/dragons/decor/left-dragonheart-crystals.webp', sortOrder: 1 },
    { id: 'left-cloud-harp', slot: 'leftProp', name: '구름 노래 하프', rarity: 'starter', theme: 'sky', preview: 'cloud-harp', image: '/assets/dragons/decor/left-cloud-harp.webp', sortOrder: 2 },
    { id: 'left-bookshelf', slot: 'leftProp', name: '용의 연대기 기록대', rarity: 'common', theme: 'forest', preview: 'dragon-chronicle', image: '/assets/dragons/decor/left-chronicle-lectern.webp', sortOrder: 3 },
    { id: 'left-lantern', slot: 'leftProp', name: '수호불꽃 화로', rarity: 'common', theme: 'ember', preview: 'guardian-brazier', image: '/assets/dragons/decor/left-guardian-brazier.webp', sortOrder: 4 },
    { id: 'left-runestone', slot: 'leftProp', name: '선조의 룬석', rarity: 'rare', theme: 'rune', preview: 'ancestor-runestone', image: '/assets/dragons/decor/left-ancestor-runestone.webp', sortOrder: 5 },
    { id: 'left-moonwell', slot: 'leftProp', name: '달빛 기억의 샘', rarity: 'rare', theme: 'moon', preview: 'moonwell', image: '/assets/dragons/decor/left-moonwell.webp', sortOrder: 6 },
    { id: 'left-storm-spire', slot: 'leftProp', name: '폭풍소환 봉화', rarity: 'hero', theme: 'storm', preview: 'storm-spire', image: '/assets/dragons/decor/left-storm-spire.webp', sortOrder: 7 },
    { id: 'left-royal-banner', slot: 'leftProp', name: '황금 수호 깃발', rarity: 'legendary', theme: 'legend', preview: 'royal-banner', image: '/assets/dragons/decor/left-royal-banner.webp', sortOrder: 8 },

    { id: 'right-none', slot: 'rightProp', name: '비워 두기', isDefault: true, preview: 'none', sortOrder: 0 },
    { id: 'right-nest', slot: 'rightProp', name: '해츨링 꿈둥지', rarity: 'starter', theme: 'sky', preview: 'hatchling-dream-nest', image: '/assets/dragons/decor/right-hatchling-nest.webp', sortOrder: 1 },
    { id: 'right-desk', slot: 'rightProp', name: '교감의 날개석', rarity: 'starter', theme: 'rune', preview: 'bond-shrine', image: '/assets/dragons/decor/right-bond-shrine.webp', sortOrder: 2 },
    { id: 'right-forest-spring', slot: 'rightProp', name: '숲 정령의 샘', rarity: 'common', theme: 'forest', preview: 'forest-spring', image: '/assets/dragons/decor/right-forest-spring.webp', sortOrder: 3 },
    { id: 'right-chest', slot: 'rightProp', name: '수호룡 보물고', rarity: 'common', theme: 'ember', preview: 'dragon-vault', image: '/assets/dragons/decor/right-treasure-vault.webp', sortOrder: 4 },
    { id: 'right-crystal-egg', slot: 'rightProp', name: '월광 수정알', rarity: 'rare', theme: 'crystal', preview: 'crystal-egg', image: '/assets/dragons/decor/right-crystal-egg.webp', sortOrder: 5 },
    { id: 'right-telescope', slot: 'rightProp', name: '별자리 천구의', rarity: 'rare', theme: 'celestial', preview: 'celestial-orrery', image: '/assets/dragons/decor/right-celestial-orrery.webp', sortOrder: 6 },
    { id: 'right-ember-anvil', slot: 'rightProp', name: '용불꽃 모루', rarity: 'hero', theme: 'ember', preview: 'ember-anvil', image: '/assets/dragons/decor/right-ember-anvil.webp', sortOrder: 7 },
    { id: 'right-golden-relic', slot: 'rightProp', name: '황금 수호관 유물', rarity: 'legendary', theme: 'legend', preview: 'golden-relic', image: '/assets/dragons/decor/right-golden-relic.webp', sortOrder: 8 },

    { id: 'nameplate-simple', slot: 'nameplate', name: '어린 수호자의 문패', isDefault: true, preview: 'simple', image: '/assets/dragons/nameplates/nameplate-simple.webp', sortOrder: 0 },
    { id: 'nameplate-oak', slot: 'nameplate', name: '숲의 뿌리 문패', rarity: 'starter', theme: 'forest', preview: 'oak', image: '/assets/dragons/nameplates/nameplate-oak.webp', sortOrder: 1 },
    { id: 'nameplate-brass', slot: 'nameplate', name: '황동 용날개 문패', rarity: 'common', theme: 'sky', preview: 'brass', image: '/assets/dragons/nameplates/nameplate-brass.webp', sortOrder: 2 },
    { id: 'nameplate-crystal', slot: 'nameplate', name: '월광 수정 문패', rarity: 'common', theme: 'crystal', preview: 'crystal', image: '/assets/dragons/nameplates/nameplate-crystal.webp', sortOrder: 3 },
    { id: 'nameplate-rune', slot: 'nameplate', name: '고대 룬 문패', rarity: 'common', theme: 'rune', preview: 'rune', image: '/assets/dragons/nameplates/nameplate-rune.webp', sortOrder: 4 },
    { id: 'nameplate-celestial', slot: 'nameplate', name: '별자리 천구 문패', rarity: 'common', theme: 'celestial', preview: 'celestial', image: '/assets/dragons/nameplates/nameplate-celestial.webp', sortOrder: 5 },
    { id: 'nameplate-ember', slot: 'nameplate', name: '용암 심장 문패', rarity: 'rare', theme: 'ember', preview: 'ember', image: '/assets/dragons/nameplates/nameplate-ember.webp', sortOrder: 6 },
    { id: 'nameplate-storm', slot: 'nameplate', name: '폭풍 용날개 문패', rarity: 'rare', theme: 'storm', preview: 'storm', image: '/assets/dragons/nameplates/nameplate-storm.webp', sortOrder: 7 },
    { id: 'nameplate-legend', slot: 'nameplate', name: '전설의 황금 문패', rarity: 'legendary', theme: 'legend', preview: 'legend', image: '/assets/dragons/nameplates/nameplate-legend.webp', sortOrder: 8 }
];

/**
 * 기존 상품 ID·가격·소유권은 그대로 두고, 학생에게는 완성된 공간을 목표로 보여 준다.
 * 컬렉션에 포함되지 않은 유료 상품은 슬롯별 3개의 `시그니처 단품`으로 취급한다.
 */
export const DRAGON_DECOR_COLLECTIONS = Object.freeze([
    {
        id: 'forest-archive',
        name: '고목 기록실',
        summary: '오래된 기록과 숲의 생명력이 머무는 서재',
        mark: 'ARCHIVE 01',
        accent: '#70895c',
        items: {
            wallpaper: 'forest',
            pedestal: 'pedestal-root',
            leftProp: 'left-bookshelf',
            rightProp: 'right-forest-spring',
            nameplate: 'nameplate-oak'
        },
        displayNames: {
            forest: '고목 기록실 프레임',
            'pedestal-root': '고목 뿌리 단상',
            'left-bookshelf': '연대기 기록대',
            'right-forest-spring': '숲 정령의 샘',
            'nameplate-oak': '고목 기록실 문패'
        }
    },
    {
        id: 'moon-crystal',
        name: '월광 수정실',
        summary: '달빛과 수정의 잔광이 흐르는 고요한 방',
        mark: 'LUNAR 02',
        accent: '#8277bd',
        items: {
            wallpaper: 'crystal',
            pedestal: 'pedestal-moonstone',
            leftProp: 'left-moonwell',
            rightProp: 'right-crystal-egg',
            nameplate: 'nameplate-crystal'
        },
        displayNames: {
            crystal: '월광 수정실 프레임',
            'pedestal-moonstone': '달빛 월석 단상',
            'left-moonwell': '달빛 기억의 샘',
            'right-crystal-egg': '월광 수정알',
            'nameplate-crystal': '월광 수정실 문패'
        }
    },
    {
        id: 'dragon-forge',
        name: '용불꽃 대장간',
        summary: '검은 강철과 용의 불씨가 살아 있는 제작소',
        mark: 'FORGE 03',
        accent: '#b15b36',
        items: {
            wallpaper: 'volcano',
            pedestal: 'pedestal-ember',
            leftProp: 'left-lantern',
            rightProp: 'right-ember-anvil',
            nameplate: 'nameplate-ember'
        },
        displayNames: {
            volcano: '용불꽃 대장간 프레임',
            'pedestal-ember': '불씨 대장간 단상',
            'left-lantern': '수호불꽃 화로',
            'right-ember-anvil': '용불꽃 모루',
            'nameplate-ember': '용암 심장 문패'
        }
    },
    {
        id: 'ancient-rune',
        name: '고대 룬 성소',
        summary: '선조의 문양과 교감의 기운이 깨어나는 성소',
        mark: 'RUNE 04',
        accent: '#3f8f92',
        items: {
            wallpaper: 'rune',
            pedestal: 'pedestal-rune',
            leftProp: 'left-runestone',
            rightProp: 'right-desk',
            nameplate: 'nameplate-rune'
        },
        displayNames: {
            rune: '고대 룬 성소 프레임',
            'pedestal-rune': '고대 룬 단상',
            'left-runestone': '선조의 룬석',
            'right-desk': '교감의 날개석',
            'nameplate-rune': '고대 룬 성소 문패'
        }
    },
    {
        id: 'celestial-observatory',
        name: '별자리 관측실',
        summary: '별의 궤도와 밤하늘을 읽는 수호룡의 관측소',
        mark: 'ORBIT 05',
        accent: '#5669a8',
        items: {
            wallpaper: 'galaxy',
            pedestal: 'pedestal-celestial',
            leftProp: 'left-cloud-harp',
            rightProp: 'right-telescope',
            nameplate: 'nameplate-celestial'
        },
        displayNames: {
            galaxy: '별자리 관측실 프레임',
            'pedestal-celestial': '천상의 별빛 옥좌',
            'left-cloud-harp': '별바람 구름 하프',
            'right-telescope': '별자리 천구의',
            'nameplate-celestial': '별자리 관측실 문패'
        }
    },
    {
        id: DRAGON_LEGENDARY_REWARD.id,
        name: DRAGON_LEGENDARY_REWARD.name,
        summary: '쓰는 힘과 읽는 마음을 모두 완성한 수호자에게 주는 선물',
        mark: 'LEGEND 06',
        accent: '#b8860b',
        acquisitionType: 'achievement',
        requiredWriterLevel: DRAGON_LEGENDARY_REWARD.requiredWriterLevel,
        requiredReaderLevel: DRAGON_LEGENDARY_REWARD.requiredReaderLevel,
        items: {
            wallpaper: 'legend',
            pedestal: 'pedestal-legend',
            leftProp: 'left-royal-banner',
            rightProp: 'right-golden-relic',
            nameplate: 'nameplate-legend'
        },
        displayNames: {
            legend: '전설의 황금 성소 프레임',
            'pedestal-legend': '황금 수호왕좌',
            'left-royal-banner': '황금 수호 깃발',
            'right-golden-relic': '황금 수호관 유물',
            'nameplate-legend': '전설의 황금 문패'
        }
    }
].map((collection) => Object.freeze({
    ...collection,
    items: Object.freeze({ ...collection.items }),
    displayNames: Object.freeze({ ...collection.displayNames })
})));

const COLLECTION_BY_ID = new Map(DRAGON_DECOR_COLLECTIONS.map((collection) => [collection.id, collection]));
const COLLECTION_BY_ITEM_ID = new Map();
DRAGON_DECOR_COLLECTIONS.forEach((collection) => {
    Object.values(collection.items).forEach((itemId) => {
        COLLECTION_BY_ITEM_ID.set(itemId, collection);
    });
});

export const DRAGON_DECOR_ITEMS = [...FRAME_ITEMS, ...DECOR_ITEMS].map((item) => {
    const collection = COLLECTION_BY_ITEM_ID.get(item.id);
    const rarity = Reflect.get(DRAGON_DECOR_RARITIES, item.rarity);
    const normalizedItem = {
        ...item,
        price: item.isDefault ? 0 : Number(rarity?.price || 0),
        requiredWriterLevel: Number(rarity?.requiredWriterLevel || 1),
        requiredReaderLevel: Number(rarity?.requiredReaderLevel || 1),
        acquisitionType: rarity?.acquisitionType || 'shop'
    };
    if (!collection) return normalizedItem;
    return {
        ...normalizedItem,
        catalogName: item.name,
        name: collection.displayNames[item.id] || item.name,
        collectionId: collection.id,
        collectionName: collection.name
    };
});

const ITEM_BY_ID = new Map(DRAGON_DECOR_ITEMS.map((item) => [item.id, item]));

export const getDragonDecorItem = (itemId) => ITEM_BY_ID.get(itemId) || null;

export const getDragonDecorCollection = (collectionId) => COLLECTION_BY_ID.get(collectionId) || null;

export const getDragonDecorCollectionForItem = (itemId) => COLLECTION_BY_ITEM_ID.get(itemId) || null;

export const getDragonDecorCollectionItems = (collectionId) => {
    const collection = getDragonDecorCollection(collectionId);
    if (!collection) return [];
    return DRAGON_DECOR_SLOTS
        .map((slot) => getDragonDecorItem(collection.items[slot.id]))
        .filter(Boolean);
};

export const getDragonLegendaryRewardItems = () => (
    getDragonDecorCollectionItems(DRAGON_LEGENDARY_REWARD.id)
);

export const hasDragonLegendaryReward = (petData = {}) => {
    const { owned } = normalizeDragonDecor(petData);
    return getDragonLegendaryRewardItems().every((item) => owned.has(item.id));
};

export const getDragonDecorItemsForSlot = (slotId) => (
    DRAGON_DECOR_ITEMS
        .filter((item) => item.slot === slotId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
);

export const normalizeDragonDecor = (petData = {}) => {
    const storedEquipped = petData?.equippedDecor && typeof petData.equippedDecor === 'object'
        ? petData.equippedDecor
        : {};
    const equipped = { ...DEFAULT_EQUIPPED_DECOR };

    DRAGON_DECOR_SLOTS.forEach(({ id: slotId }) => {
        const legacyValue = slotId === 'wallpaper' ? petData?.background : null;
        const candidate = Reflect.get(storedEquipped, slotId) || legacyValue || Reflect.get(equipped, slotId);
        const item = getDragonDecorItem(candidate);
        if (item?.slot === slotId) Reflect.set(equipped, slotId, item.id);
    });

    const owned = new Set(DRAGON_DECOR_ITEMS.filter((item) => item.isDefault).map((item) => item.id));
    const storedOwned = Array.isArray(petData?.ownedDecorItems) ? petData.ownedDecorItems : [];
    const legacyWallpapers = Array.isArray(petData?.ownedItems) ? petData.ownedItems : [];
    [...storedOwned, ...legacyWallpapers].forEach((itemId) => {
        if (ITEM_BY_ID.has(itemId)) owned.add(itemId);
    });
    Object.values(equipped).forEach((itemId) => owned.add(itemId));

    return { equipped, owned };
};
