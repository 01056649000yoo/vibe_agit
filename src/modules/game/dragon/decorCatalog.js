import { HIDEOUT_BACKGROUNDS } from './presentation.js';

export const DRAGON_DECOR_SLOTS = [
    { id: 'wallpaper', name: '벽지', icon: '▧', description: '아지트의 전체 분위기' },
    { id: 'pedestal', name: '받침대', icon: '▱', description: '수호룡이 머무는 자리' },
    { id: 'leftProp', name: '왼쪽 소품', icon: '◩', description: '왼쪽 공간의 작은 장식' },
    { id: 'rightProp', name: '오른쪽 소품', icon: '◪', description: '오른쪽 공간의 작은 장식' },
    { id: 'nameplate', name: '문패', icon: '▭', description: '친구에게 보여 줄 아지트 표식' }
];

export const DEFAULT_EQUIPPED_DECOR = Object.freeze({
    wallpaper: 'default',
    pedestal: 'pedestal-stone',
    leftProp: 'left-none',
    rightProp: 'right-none',
    nameplate: 'nameplate-simple'
});

const WALLPAPER_ITEMS = Object.values(HIDEOUT_BACKGROUNDS).map((background, index) => ({
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

    { id: 'left-none', slot: 'leftProp', name: '비워 두기', price: 0, isDefault: true, preview: 'none', sortOrder: 0 },
    { id: 'left-bookshelf', slot: 'leftProp', name: '작은 책장', price: 220, preview: 'bookshelf', sortOrder: 1 },
    { id: 'left-plant', slot: 'leftProp', name: '초록 화분', price: 160, preview: 'plant', sortOrder: 2 },
    { id: 'left-lantern', slot: 'leftProp', name: '이야기 등불', price: 260, preview: 'lantern', sortOrder: 3 },

    { id: 'right-none', slot: 'rightProp', name: '비워 두기', price: 0, isDefault: true, preview: 'none', sortOrder: 0 },
    { id: 'right-desk', slot: 'rightProp', name: '작가의 책상', price: 260, preview: 'desk', sortOrder: 1 },
    { id: 'right-telescope', slot: 'rightProp', name: '별빛 망원경', price: 360, preview: 'telescope', sortOrder: 2 },
    { id: 'right-chest', slot: 'rightProp', name: '보물 상자', price: 420, preview: 'chest', sortOrder: 3 },

    { id: 'nameplate-simple', slot: 'nameplate', name: '기본 문패', price: 0, isDefault: true, preview: 'simple', sortOrder: 0 },
    { id: 'nameplate-oak', slot: 'nameplate', name: '참나무 문패', price: 120, preview: 'oak', sortOrder: 1 },
    { id: 'nameplate-brass', slot: 'nameplate', name: '황동 문패', price: 220, preview: 'brass', sortOrder: 2 },
    { id: 'nameplate-crystal', slot: 'nameplate', name: '수정 문패', price: 360, preview: 'crystal', sortOrder: 3 }
];

export const DRAGON_DECOR_ITEMS = [...WALLPAPER_ITEMS, ...DECOR_ITEMS];

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
