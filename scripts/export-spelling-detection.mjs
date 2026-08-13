import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
    ELEMENTARY_SPELLING_DETECTION_RULES
} from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';
import {
    SPELLING_QUICK_DETECTION_RULES
} from '../src/modules/writing/tools/spelling-lookup/spellingDetectionRules.js';

const outputUrl = new URL('../public/spelling/elementary-detection-v1.json', import.meta.url);
const outputPath = fileURLToPath(outputUrl);
const checkOnly = process.argv.includes('--check');

const payload = {
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

const serialized = `${JSON.stringify(payload, null, 2)}\n`;

if (checkOnly) {
    const current = await readFile(outputUrl, 'utf8').catch(() => '');
    if (current !== serialized) {
        throw new Error('공유 맞춤법 목록이 원본 규칙과 다릅니다. npm run spelling:export를 실행해 주세요.');
    }
    console.log(`공유 맞춤법 목록 확인: 빠른 규칙 ${payload.quickRules.length}개 · 기본 자료 ${payload.elementaryRules.length}개`);
} else {
    await mkdir(new URL('../public/spelling/', import.meta.url), { recursive: true });
    await writeFile(outputPath, serialized, 'utf8');
    console.log(`공유 맞춤법 목록 생성: ${outputPath}`);
}
