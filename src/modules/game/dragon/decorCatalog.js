import { HIDEOUT_BACKGROUNDS } from './presentation.js';

export const DRAGON_DECOR_SLOTS = [
    { id: 'wallpaper', name: '프레임', icon: '⌗', description: '중앙을 가리지 않는 네 모서리 장식' },
    { id: 'pedestal', name: '받침대', icon: '▱', description: '수호룡의 속성과 분위기를 살리는 자리' },
    { id: 'leftProp', name: '왼쪽 소품', icon: '◩', description: '수호룡 세계관과 어울리는 왼쪽 장식' },
    { id: 'rightProp', name: '오른쪽 소품', icon: '◪', description: '수호룡 세계관과 어울리는 오른쪽 장식' },
    { id: 'nameplate', name: '문패', icon: '▭', description: '친구에게 보여 줄 아지트 표식' }
];

export const DEFAULT_EQUIPPED_DECOR = Object.freeze({
    wallpaper: 'default',
    pedestal: 'pedestal-stone',
    leftProp: 'left-none',
    rightProp: 'right-none',
    nameplate: 'nameplate-simple'
});

// `wallpaper`는 이미 저장된 학생 데이터와 RPC 호환을 위한 내부 키다. UI에서는 프레임으로 부른다.
const FRAME_ITEMS = Object.values(HIDEOUT_BACKGROUNDS).map((background, index) => ({
    ...background,
    slot: 'wallpaper',
    price: Number(background.price || 0),
    isDefault: background.id === 'default',
    requiredWriterLevel: background.requiresMaxLevel ? 10 : 1,
    sortOrder: index
}));

const DECOR_ITEMS = [
    { id: 'pedestal-stone', slot: 'pedestal', name: '다듬은 돌', price: 0, isDefault: true, preview: 'stone', sortOrder: 0 },
    { id: 'pedestal-oak', slot: 'pedestal', name: '참나무 단상', price: 180, preview: 'oak', sortOrder: 1 },
    { id: 'pedestal-cloud', slot: 'pedestal', name: '구름 받침', price: 320, preview: 'cloud', sortOrder: 2 },
    { id: 'pedestal-crystal', slot: 'pedestal', name: '수정 받침', price: 480, preview: 'crystal', sortOrder: 3 },
    { id: 'pedestal-rune', slot: 'pedestal', name: '고대 룬 단상', price: 520, preview: 'rune', sortOrder: 4 },
    { id: 'pedestal-moonstone', slot: 'pedestal', name: '달빛 월석', price: 560, preview: 'moonstone', sortOrder: 5 },
    { id: 'pedestal-ember', slot: 'pedestal', name: '불씨 대장간', price: 600, preview: 'ember', sortOrder: 6 },
    { id: 'pedestal-root', slot: 'pedestal', name: '고목 뿌리 둥지', price: 540, preview: 'root', sortOrder: 7 },

    { id: 'left-none', slot: 'leftProp', name: '비워 두기', price: 0, isDefault: true, preview: 'none', sortOrder: 0 },
    { id: 'left-bookshelf', slot: 'leftProp', name: '고대 용의 서가', price: 220, preview: 'dragon-library', sortOrder: 1 },
    { id: 'left-plant', slot: 'leftProp', name: '용숨결 새싹', price: 160, preview: 'breath-sprout', sortOrder: 2 },
    { id: 'left-lantern', slot: 'leftProp', name: '수호불꽃 등불', price: 260, preview: 'guardian-flame', sortOrder: 3 },
    { id: 'left-runestone', slot: 'leftProp', name: '기억의 룬석', price: 340, preview: 'rune-stone', sortOrder: 4 },

    { id: 'right-none', slot: 'rightProp', name: '비워 두기', price: 0, isDefault: true, preview: 'none', sortOrder: 0 },
    { id: 'right-desk', slot: 'rightProp', name: '이야기 제단', price: 260, preview: 'story-altar', sortOrder: 1 },
    { id: 'right-telescope', slot: 'rightProp', name: '별길 관측구', price: 360, preview: 'star-orb', sortOrder: 2 },
    { id: 'right-chest', slot: 'rightProp', name: '수호룡 보물함', price: 420, preview: 'dragon-hoard', sortOrder: 3 },
    { id: 'right-nest', slot: 'rightProp', name: '해츨링 둥지', price: 300, preview: 'hatchling-nest', sortOrder: 4 },

    { id: 'nameplate-simple', slot: 'nameplate', name: '기본 문패', price: 0, isDefault: true, preview: 'simple', sortOrder: 0 },
    { id: 'nameplate-oak', slot: 'nameplate', name: '참나무 문패', price: 120, preview: 'oak', sortOrder: 1 },
    { id: 'nameplate-brass', slot: 'nameplate', name: '황동 문패', price: 220, preview: 'brass', sortOrder: 2 },
    { id: 'nameplate-crystal', slot: 'nameplate', name: '수정 문패', price: 360, preview: 'crystal', sortOrder: 3 }
];

export const DRAGON_DECOR_ITEMS = [...FRAME_ITEMS, ...DECOR_ITEMS];

const ITEM_BY_ID = new Map(DRAGON_DECOR_ITEMS.map((item) => [item.id, item]));

export const getDragonDecorItem = (itemId) => ITEM_BY_ID.get(itemId) || null;

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

export const isDragonDecorOwned = (petData, itemId) => normalizeDragonDecor(petData).owned.has(itemId);
