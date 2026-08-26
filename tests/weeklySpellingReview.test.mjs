import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    buildKnownSpellingIndex,
    mergeWeeklySpellingSources,
    normalizeSpellingValue,
    prepareWeeklyReviewCandidates
} from '../scripts/run-weekly-spelling-review.mjs';

const [runner, migration, panel, plist, lookupPayload, detectionPayload] = await Promise.all([
    readFile('scripts/run-weekly-spelling-review.mjs', 'utf8'),
    readFile('supabase/migrations/20261179_weekly_spelling_review.sql', 'utf8'),
    readFile('src/components/admin/AdminSpellingPromotionPanel.jsx', 'utf8'),
    readFile('ops/launchd/com.agit.weekly-spelling-review.plist', 'utf8'),
    readFile('public/spelling/elementary-lookup-v1.json', 'utf8').then(JSON.parse),
    readFile('public/spelling/elementary-detection-v1.json', 'utf8').then(JSON.parse)
]);

test('주간 검수는 AI·검색·교사 자료를 합치되 같은 표현의 검색 근거를 교정 후보에 보탠다', () => {
    const merged = mergeWeeklySpellingSources({
        ai_findings: [{ expression: '않되', correction: '안 돼', hit_count: 4, class_count: 2 }],
        searched: [{ expression: '않되', search_count: 7, class_count: 3 }, { expression: '새후보', search_count: 2, class_count: 1 }],
        teacher_entries: [{ expression: '않되', correction: '안 돼', hit_count: 1, class_count: 1 }]
    });
    assert.equal(merged.length, 2);
    const combined = merged.find((item) => item.expression === '않되');
    assert.deepEqual(combined.source_kinds, ['ai', 'search', 'teacher']);
    assert.equal(combined.hit_count, 7);
    assert.equal(combined.class_count, 3);
    assert.equal(combined.primary_source, 'ai');
});

test('기본 500개와 공통 자료의 정확 일치는 코드에서 제외하고 유사 자료는 3개만 붙인다', () => {
    const known = buildKnownSpellingIndex(lookupPayload, detectionPayload, [{
        wrong_expression: '공통오타', correct_expression: '공통 교정', label: '공통'
    }]);
    assert.ok(known.aliases.size >= 500);
    const builtIn = lookupPayload.lookupEntries[0];
    assert.ok(known.aliases.has(normalizeSpellingValue(builtIn.answer)));

    const prepared = prepareWeeklyReviewCandidates({
        ai_findings: [
            { expression: builtIn.answer, correction: '다른 값', hit_count: 5, class_count: 2 },
            { expression: '공통오타', correction: '공통 교정', hit_count: 2, class_count: 1 },
            { expression: '처음보는오타', correction: '처음 보는 오타', hit_count: 3, class_count: 2 }
        ],
        searched: [], teacher_entries: []
    }, known);
    assert.equal(prepared.knownFilteredCount, 2);
    assert.equal(prepared.candidates.length, 1);
    assert.ok(prepared.candidates[0].similar_matches.length <= 3);
    assert.match(prepared.candidates[0].review_key, /^[a-f0-9]{64}$/);
});

test('AI에는 전체 카탈로그 대신 후보와 유사 항목만 보내고 구조화 출력을 강제한다', () => {
    const requestBlock = runner.match(/const reviewWithOpenAI[\s\S]*?const cleanReview/)?.[0] || '';
    assert.ok(requestBlock);
    assert.match(runner, /similar_matches: candidate\.similar_matches/);
    assert.match(runner, /response_format:[\s\S]*type: 'json_schema'/);
    assert.match(runner, /strict: true/);
    assert.match(runner, /additionalProperties: false/);
    assert.match(runner, /MAX_CANDIDATES = 200/);
    assert.match(runner, /AI_BATCH_SIZE = 12/);
    assert.doesNotMatch(requestBlock, /lookupPayload|detectionPayload|lookupEntries|elementaryRules/);
    assert.match(runner, /cached_reviews/);
    assert.match(runner, /cache_hit: cacheHit/);
});

test('주간 원장과 AI 캐시는 브라우저에 직접 공개하지 않고 관리자 RPC만 제공한다', () => {
    assert.match(migration, /ALTER TABLE public\.spelling_weekly_review_runs ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON public\.spelling_weekly_review_items FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(migration, /session_user <> 'supabase_admin'.*auth\.role\(\)/s);
    assert.match(migration, /auth_user_role\(\) <> 'ADMIN'/);
    assert.match(migration, /jsonb_array_length\(p_items\) > 200/);
    assert.doesNotMatch(migration, /student_posts|student_id|class_id UUID/);
});

test('관리자 화면은 주간 검수 결과와 캐시 절약 수를 보여 주고 관리자 선택 뒤에만 게시한다', () => {
    assert.match(panel, /admin_get_spelling_promotion_workspace_v3/);
    assert.match(panel, /admin_publish_weekly_spelling_entry_v1/);
    assert.match(panel, /admin_reject_weekly_spelling_entry_v1/);
    assert.match(panel, /AI 새 검수/);
    assert.match(panel, /이전 결과 재사용/);
    assert.match(panel, /유사 자료 최대 3개/);
    assert.doesNotMatch(panel, /getElementarySpellingEntries|admin_get_spelling_promotion_workspace_v2/);
});

test('예약 작업은 매주 월요일 05:10 한 번 실행한다', () => {
    assert.match(plist, /<key>Weekday<\/key>\s*<integer>2<\/integer>/);
    assert.match(plist, /<key>Hour<\/key>\s*<integer>5<\/integer>/);
    assert.match(plist, /<key>Minute<\/key>\s*<integer>10<\/integer>/);
    assert.match(plist, /run-weekly-spelling-review\.mjs/);
});
