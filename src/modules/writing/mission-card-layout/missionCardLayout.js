import {
    CARD_SIZE_OPTIONS,
    DEFAULT_CARD_SIZE,
    getCardColumns,
    normalizeCardSize
} from '../../card-layout/cardSize.js';

export const MISSION_CARD_SIZE_STORAGE_KEY = 'teacher-mission-card-size-v1';
export const LEGACY_WRITING_CARD_LAYOUT_STORAGE_KEY = 'teacher-writing-card-layout-v1';
export const DEFAULT_MISSION_CARD_SIZE = DEFAULT_CARD_SIZE;
export const MISSION_CARD_SIZE_OPTIONS = CARD_SIZE_OPTIONS;
export const normalizeMissionCardSize = normalizeCardSize;

export const migrateLegacyMissionCardSize = (legacyLayout) => {
    if (legacyLayout?.density === 'compact' || Number(legacyLayout?.columns) >= 5) return 'small';
    return DEFAULT_MISSION_CARD_SIZE;
};

export const getMissionCardColumns = getCardColumns;
