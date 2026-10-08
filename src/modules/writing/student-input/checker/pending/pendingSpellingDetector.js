/** 검토 중 맞춤법 자료로 밑줄 자리를 찾는다 — 기본 자료와 같은 찾기 장치(catalogDetector). */
import { createCatalogDetector } from '../catalogDetector.js';
import { PENDING_SPELLING_ENTRIES } from './pendingSpellingEntries.js';

const PENDING_DETECTOR = createCatalogDetector(PENDING_SPELLING_ENTRIES, { idPrefix: 'pending', source: 'pending' });

export const PENDING_SPELLING_DETECTION_RULES = PENDING_DETECTOR.rules;
export const findPendingSpellingIssues = (value, limit = 50) => PENDING_DETECTOR.find(value, limit);
