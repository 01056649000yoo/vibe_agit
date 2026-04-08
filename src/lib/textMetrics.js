// Remove invisible formatting characters that can inflate length
// while keeping normal spaces and line breaks intact.
export const stripInvisibleChars = (value = '') =>
    value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');

export const countContentChars = (value = '') =>
    stripInvisibleChars(value).length;

