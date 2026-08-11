import { COMPOUND_SPELLING_ENTRIES } from './compoundCatalog.js';
import { CONJUGATION_SPELLING_ENTRIES } from './conjugationCatalog.js';
import { GRAMMAR_SPELLING_ENTRIES } from './grammarCatalog.js';
import { LOANWORD_SPELLING_ENTRIES } from './loanwordCatalog.js';
import { MEANING_SPELLING_ENTRIES } from './meaningCatalog.js';
import { WORD_SPELLING_ENTRIES } from './wordCatalog.js';

export {
    SPELLING_CATEGORY_DEFINITIONS,
    SPELLING_DETECTION_MODES,
    getSpellingCategoryDefinition
} from './schema.js';

const orderedEntries = [
    ...GRAMMAR_SPELLING_ENTRIES,
    ...CONJUGATION_SPELLING_ENTRIES,
    ...MEANING_SPELLING_ENTRIES,
    ...WORD_SPELLING_ENTRIES,
    ...COMPOUND_SPELLING_ENTRIES,
    ...LOANWORD_SPELLING_ENTRIES
].sort((left, right) => left.sortOrder - right.sortOrder);

const seenIds = new Set();
const seenSortOrders = new Set();
const duplicateIds = [];
const duplicateSortOrders = [];
for (const entry of orderedEntries) {
    if (seenIds.has(entry.id)) duplicateIds.push(entry.id);
    if (seenSortOrders.has(entry.sortOrder)) duplicateSortOrders.push(entry.sortOrder);
    seenIds.add(entry.id);
    seenSortOrders.add(entry.sortOrder);
}
if (duplicateIds.length > 0 || duplicateSortOrders.length > 0) {
    throw new Error(
        `맞춤법 카탈로그의 id 또는 sortOrder가 겹칩니다: ${[
            ...duplicateIds,
            ...duplicateSortOrders
        ].join(', ')}`
    );
}

export const ELEMENTARY_SPELLING_CATALOG = Object.freeze(orderedEntries);

export const ELEMENTARY_SPELLING_CATEGORY_COUNTS = Object.freeze(
    ELEMENTARY_SPELLING_CATALOG.reduce((counts, entry) => ({
        ...counts,
        [entry.categoryId]: (counts[entry.categoryId] || 0) + 1
    }), {})
);
