export const DEFAULT_CARD_SIZE = 'medium';

export const CARD_SIZE_OPTIONS = Object.freeze([
    Object.freeze({ id: 'small', label: '작게' }),
    Object.freeze({ id: 'medium', label: '보통' }),
    Object.freeze({ id: 'large', label: '크게' })
]);

const VALID_CARD_SIZES = new Set(CARD_SIZE_OPTIONS.map((option) => option.id));

const CARD_COLUMN_PRESETS = Object.freeze({
    small: 4,
    medium: 3,
    large: 2
});

export const normalizeCardSize = (value) => (
    VALID_CARD_SIZES.has(value) ? value : DEFAULT_CARD_SIZE
);

export const getCardColumns = (size) => CARD_COLUMN_PRESETS[normalizeCardSize(size)];
