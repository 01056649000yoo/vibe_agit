export const MISSION_CARD_SIZE_STORAGE_KEY = 'teacher-mission-card-size-v1';
export const LEGACY_WRITING_CARD_LAYOUT_STORAGE_KEY = 'teacher-writing-card-layout-v1';
export const DEFAULT_MISSION_CARD_SIZE = 'medium';

export const MISSION_CARD_SIZE_OPTIONS = Object.freeze([
    Object.freeze({ id: 'small', label: '작게' }),
    Object.freeze({ id: 'medium', label: '보통' }),
    Object.freeze({ id: 'large', label: '크게' })
]);

const VALID_MISSION_CARD_SIZES = new Set(MISSION_CARD_SIZE_OPTIONS.map((option) => option.id));

const COLUMN_PRESETS = Object.freeze({
    small: Object.freeze({ split: 2, full: 4 }),
    medium: Object.freeze({ split: 2, full: 3 }),
    large: Object.freeze({ split: 1, full: 2 })
});

export const normalizeMissionCardSize = (value) => (
    VALID_MISSION_CARD_SIZES.has(value) ? value : DEFAULT_MISSION_CARD_SIZE
);

export const migrateLegacyMissionCardSize = (legacyLayout) => {
    if (legacyLayout?.density === 'compact' || Number(legacyLayout?.columns) >= 5) return 'small';
    return DEFAULT_MISSION_CARD_SIZE;
};

export const getMissionCardColumns = (size, splitView) => {
    const preset = COLUMN_PRESETS[normalizeMissionCardSize(size)];
    return splitView ? preset.split : preset.full;
};
