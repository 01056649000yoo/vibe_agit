import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
    ELEMENTARY_SPELLING_DETECTION_RULES,
    getElementarySpellingEntries
} from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';
import {
    SPELLING_QUICK_DETECTION_RULES
} from '../src/modules/writing/tools/spelling-lookup/spellingDetectionRules.js';

const detectionOutputUrl = new URL('../public/spelling/elementary-detection-v1.json', import.meta.url);
const lookupOutputUrl = new URL('../public/spelling/elementary-lookup-v1.json', import.meta.url);
const detectionOutputPath = fileURLToPath(detectionOutputUrl);
const lookupOutputPath = fileURLToPath(lookupOutputUrl);
const checkOnly = process.argv.includes('--check');
const lookupEntries = getElementarySpellingEntries();

const detectionPayload = {
    version: 1,
    quickRules: SPELLING_QUICK_DETECTION_RULES.map((rule) => ({
        id: rule.id,
        entryId: rule.entryId || rule.id,
        label: rule.label || `${rule.wrong} / ${rule.right}`,
        wrong: rule.wrong,
        right: rule.right,
        lookup: rule.lookup || rule.right,
        source: rule.source
    })),
    elementaryRules: ELEMENTARY_SPELLING_DETECTION_RULES.map((rule) => ({
        id: rule.id,
        entryId: rule.entryId,
        label: rule.label,
        patterns: rule.patterns.map((pattern) => ({
            text: pattern.text,
            target: pattern.target || pattern.text,
            ...(Number.isInteger(pattern.targetOffset) ? { targetOffset: pattern.targetOffset } : {}),
            right: pattern.right,
            lookup: pattern.lookup || pattern.right
        }))
    }))
};

const lookupPayload = {
    version: 1,
    lookupEntries: lookupEntries.map((entry) => ({
        id: entry.id,
        question: entry.question,
        answer: entry.answer,
        learningLabel: entry.learningLabel,
        category: entry.category,
        subcategory: entry.subcategory,
        explanation: entry.explanation,
        examples: entry.examples,
        searchable: entry.searchable,
        source: entry.source
    }))
};

const detectionSerialized = `${JSON.stringify(detectionPayload, null, 2)}\n`;
const lookupSerialized = `${JSON.stringify(lookupPayload, null, 2)}\n`;

// 저장소에는 `\n` 으로 들어 있지만 윈도우에서 받으면 `\r\n` 이 된다. 줄바꿈 방식이 다르다고
// "규칙과 다르다" 고 막으면 윈도우에서는 빌드가 통째로 안 된다(2026-08-25에 실제로 막혔다).
const readNormalized = async (url) => (await readFile(url, 'utf8').catch(() => '')).split('\r\n').join('\n');

if (checkOnly) {
    const [currentDetection, currentLookup] = await Promise.all([
        readNormalized(detectionOutputUrl),
        readNormalized(lookupOutputUrl)
    ]);
    if (currentDetection !== detectionSerialized || currentLookup !== lookupSerialized) {
        throw new Error('공유 맞춤법 목록이 원본 규칙과 다릅니다. npm run spelling:export를 실행해 주세요.');
    }
    console.log(`공유 맞춤법 목록 확인: 빠른 규칙 ${detectionPayload.quickRules.length}개 · 밑줄 ${detectionPayload.elementaryRules.length}개 · 검색 ${lookupPayload.lookupEntries.length}개`);
} else {
    await mkdir(new URL('../public/spelling/', import.meta.url), { recursive: true });
    await Promise.all([
        writeFile(detectionOutputPath, detectionSerialized, 'utf8'),
        writeFile(lookupOutputPath, lookupSerialized, 'utf8')
    ]);
    console.log(`공유 맞춤법 목록 생성: ${detectionOutputPath}, ${lookupOutputPath}`);
}
