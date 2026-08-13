import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    ELEMENTARY_SPELLING_DETECTION_RULES
} from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';
import {
    SPELLING_QUICK_DETECTION_RULES
} from '../src/modules/writing/tools/spelling-lookup/spellingDetectionRules.js';

const sharedCatalog = JSON.parse(await readFile(
    'public/spelling/elementary-detection-v1.json',
    'utf8'
));
const sharedLookupCatalog = JSON.parse(await readFile(
    'public/spelling/elementary-lookup-v1.json',
    'utf8'
));

test('연구소용 공유 맞춤법 목록은 아지트 원본 규칙과 같은 버전과 개수를 가진다', () => {
    assert.equal(sharedCatalog.version, 1);
    assert.equal(sharedCatalog.quickRules.length, SPELLING_QUICK_DETECTION_RULES.length);
    assert.equal(sharedCatalog.elementaryRules.length, ELEMENTARY_SPELLING_DETECTION_RULES.length);
    assert.equal(sharedLookupCatalog.version, 1);
    assert.equal(sharedLookupCatalog.lookupEntries.length, ELEMENTARY_SPELLING_DETECTION_RULES.length);
    assert.equal(sharedCatalog.elementaryRules.length, 500);
    assert.deepEqual(
        sharedCatalog.quickRules.map((rule) => rule.id),
        SPELLING_QUICK_DETECTION_RULES.map((rule) => rule.id)
    );
    assert.deepEqual(
        sharedCatalog.elementaryRules.map((rule) => rule.entryId),
        ELEMENTARY_SPELLING_DETECTION_RULES.map((rule) => rule.entryId)
    );
});

test('연구소 맞춤법 찾아보기는 아지트의 설명·예문·공식 출처를 그대로 공유한다', () => {
    const lookupEntry = sharedLookupCatalog.lookupEntries.find((entry) => entry.id === 'dwae-doe');
    assert.equal(lookupEntry.question, '돼요 / 되요');
    assert.equal(lookupEntry.answer, '돼요');
    assert.match(lookupEntry.explanation, /되어/);
    assert.equal(lookupEntry.examples.length, 2);
    assert.match(lookupEntry.source.label, /국립국어원/);
    assert.match(lookupEntry.source.url, /^https:\/\/stdict\.korean\.go\.kr\//);
    assert.ok(lookupEntry.searchable.includes('되요'));
});

test('공유 목록의 대표 오류와 문맥 규칙이 교정 정보까지 보존된다', () => {
    const quickRule = sharedCatalog.quickRules.find((rule) => rule.id === 'doeyo');
    assert.deepEqual(
        { source: quickRule.source, right: quickRule.right },
        { source: '되요', right: '돼요' }
    );

    const contextualRule = sharedCatalog.elementaryRules.find((rule) => rule.entryId === 'roseo-rosseo');
    assert.ok(contextualRule.patterns.some((pattern) => (
        pattern.text === '학생으로써'
        && pattern.target === '으로써'
        && pattern.right === '으로서'
    )));
});
