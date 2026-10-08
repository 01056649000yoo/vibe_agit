import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { isShown, outcomeOf, redSpans, toCodePointIndex } from '../scripts/spelling-shadow.mjs';

test('JS 위치를 코드 포인트로 바꿔 파이썬 분석기와 맞춘다(그림 글자가 있어도)', () => {
    const text = '😀같은색';
    const map = toCodePointIndex(text);
    assert.equal(map[2], 1); // 😀 는 JS 에서 두 칸, 코드 포인트로 한 칸
    assert.equal(map[text.length], 4);
});

test('첫 제출본의 자리를 나중 글이 어떻게 했는지 가른다', () => {
    const item = { original: '같은색의', suggestion: '같은 색의' };
    assert.equal(outcomeOf(item, '같은 색의 옷'), 'fixed_as_suggested');
    assert.equal(outcomeOf(item, '비슷한 옷'), 'fixed_otherwise');
    assert.equal(outcomeOf(item, '같은색의 옷'), 'kept');
    assert.equal(outcomeOf(item, null), 'unknown');
});

test('빨간 줄 자리는 앱과 같은 검사로 구해 회색 줄과 겹치는지 본다', () => {
    const spans = redSpans('어제 숙제를 하지않고 되요', []);
    assert.ok(spans.length >= 2);
});

test('분석기는 네트워크를 쓰지 않고, 밤 작업은 60일이 지나면 지운다', async () => {
    const analyzer = await readFile('services/spelling-analyzer/analyze.py', 'utf8');
    assert.doesNotMatch(analyzer, /import (requests|urllib|socket|http)/);
    const shadow = await readFile('scripts/spelling-shadow.mjs', 'utf8');
    assert.match(shadow, /KEEP_DAYS = 60/);
    const plist = await readFile('ops/launchd/com.agit.spelling-shadow.plist', 'utf8');
    assert.match(plist, /<key>Hour<\/key>\s*<integer>4<\/integer>/);
    const migration = await readFile('supabase/migrations/20261380_spelling_shadow_suggestions.sql', 'utf8');
    assert.match(migration, /REVOKE ALL ON public\.spelling_shadow_suggestions FROM PUBLIC, anon, authenticated/);
});

const python = `${homedir()}/agit-kiwi/venv/bin/python`;
test('Kiwi 분석기: 띄어쓰기·붙여 쓰기·오타를 어절로 돌려주고, 오타가 있으면 그 어절의 띄어쓰기는 안 낸다', { skip: !existsSync(python) && 'Kiwi 가 설치된 맥미니에서만' }, () => {
    const result = spawnSync(python, ['-I', 'services/spelling-analyzer/analyze.py'], {
        input: `${JSON.stringify({ id: 1, text: '같은색의 옷을 입고 친구들 끼리 놀았다. 분노을 느꼈다.' })}\n`, encoding: 'utf8'
    });
    const { suggestions } = JSON.parse(result.stdout);
    const pick = (kind) => suggestions.filter((s) => s.kind === kind).map((s) => `${s.original}→${s.suggestion}`);
    assert.ok(pick('spacing_insert').includes('같은색의→같은 색의'));
    assert.ok(pick('spacing_remove').includes('친구들 끼리→친구들끼리'));
    assert.ok(pick('typo').includes('분노을→분노를'));
    assert.ok(!pick('spacing_insert').some((s) => s.startsWith('분노을')));
});

test('교차 확인: 오타는 사전이 같은 말일 때만, 꾸밈말+명사는 사전이 반대하면 빼되 본 적·한 척은 둔다', () => {
    assert.equal(isShown({ category: 'typo', hunspell: true, suggestion: '때문에' }, null), true);
    assert.equal(isShown({ category: 'typo', hunspell: null, suggestion: '차 샀다' }, null), false);
    assert.equal(isShown({ category: 'modifier_noun', hunspell: false, suggestion: '검은 색' }, null), false);
    assert.equal(isShown({ category: 'modifier_noun', hunspell: false, suggestion: '본 적이' }, null), true);
    assert.equal(isShown({ category: 'modifier_noun', hunspell: null, suggestion: '먹을 것' }, null), true);
    assert.equal(isShown({ category: 'particle_attach', hunspell: false, mecab: false, suggestion: '같다고' }, null), true);
    assert.equal(isShown({ category: 'particle_attach', hunspell: null, suggestion: '흰돌이가' }, 'proper_noun'), false);
    assert.equal(isShown({ category: 'other_spacing', hunspell: true, suggestion: '그 다음' }, null), false);
});

const hunspellReady = existsSync('/opt/homebrew/bin/hunspell') && existsSync(`${homedir()}/agit-kiwi/hunspell-ko/ko.dic`);
test('교차 확인 분석기: 진짜 오타(떄문에)는 사전도 같은 말, 꾸밈말+명사(먹을것을)는 MeCab 도 같은 말', { skip: !(existsSync(python) && hunspellReady) && 'hunspell 한국어 사전이 설치된 맥미니에서만' }, () => {
    const result = spawnSync(python, ['-I', 'services/spelling-analyzer/analyze.py'], {
        input: `${JSON.stringify({ id: 1, text: '떄문에 늦었다. 먹을것을 샀다.' })}\n`, encoding: 'utf8'
    });
    const { suggestions } = JSON.parse(result.stdout);
    const find = (original) => suggestions.find((s) => s.original === original);
    assert.equal(find('떄문에')?.hunspell, true);
    assert.equal(find('먹을것을')?.mecab, true);
});
