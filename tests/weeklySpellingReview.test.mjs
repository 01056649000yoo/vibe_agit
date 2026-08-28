import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    buildKnownSpellingIndex,
    mergeWeeklySpellingSources,
    normalizeSpellingValue,
    prepareWeeklyReviewCandidates
} from '../scripts/run-weekly-spelling-review.mjs';

const [runner, reviewCore, edgeFunction, deployWorkflow, intakeMigration, candidateMigration, resumeMigration, resumableIntakeMigration, progressMigration, candidateSmoke, migration, panel, plist, lookupPayload, detectionPayload] = await Promise.all([
    readFile('scripts/run-weekly-spelling-review.mjs', 'utf8'),
    readFile('supabase/functions/spelling-weekly-review/reviewCore.js', 'utf8'),
    readFile('supabase/functions/spelling-weekly-review/index.ts', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('supabase/migrations/20261188_spelling_weekly_intake.sql', 'utf8'),
    readFile('supabase/migrations/20261189_spelling_intake_candidate_review.sql', 'utf8'),
    readFile('supabase/migrations/20261190_spelling_weekly_review_resume.sql', 'utf8'),
    readFile('supabase/migrations/20261191_spelling_intake_resumable.sql', 'utf8'),
    readFile('supabase/migrations/20261192_spelling_weekly_progress.sql', 'utf8'),
    readFile('tests/sql/20261189_spelling_intake_candidate_review.smoke.sql', 'utf8'),
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
    // 상한은 두 실행 경로(엣지 함수·되돌림 스크립트)가 함께 쓰는 원본에 있다.
    assert.match(reviewCore, /MAX_CANDIDATES = 200/);
    assert.match(reviewCore, /AI_BATCH_SIZE = 12/);
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

test('관리자 실행 엣지 함수는 관리자만 통과시키고 실패한 회차를 반드시 기록한다', () => {
    assert.match(edgeFunction, /auth\.getUser\(\)/);
    assert.match(edgeFunction, /\.from\('profiles'\)[\s\S]{0,120}\.select\('role'\)/);
    assert.match(edgeFunction, /profile\?\.role !== 'ADMIN'/);
    // 실패를 안 남기면 회차가 running 인 채로 두 시간 동안 다시 못 누른다.
    assert.match(edgeFunction, /fail_spelling_weekly_review_v1/);
    assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('엣지 함수는 거르는 계산을 다시 쓰지 않고 원본을 가져다 쓴다', () => {
    assert.match(edgeFunction, /from '\.\/reviewCore\.js'/);
    assert.match(edgeFunction, /buildKnownSpellingIndex/);
    assert.match(edgeFunction, /prepareWeeklyReviewCandidates/);
    // 같은 계산을 두 벌 두면 화면으로 돌린 결과와 되돌림 스크립트 결과가 갈라진다.
    assert.doesNotMatch(edgeFunction, /const buildKnownSpellingIndex|const prepareWeeklyReviewCandidates|const mergeWeeklySpellingSources/);
    assert.doesNotMatch(reviewCore, /node:crypto|node:fs|Deno\.|require\(/);
});

test('엣지 함수와 되돌림 스크립트는 같은 지시문·같은 상한으로 AI를 부른다', () => {
    for (const source of [runner, edgeFunction]) {
        assert.match(source, /초등학생용 맞춤법 공통 자료 후보를 검수한다\./);
        assert.match(source, /response_format:[\s\S]{0,200}type: 'json_schema'/);
        assert.match(source, /strict: true/);
        assert.match(source, /max_tokens: 5000/);
        assert.match(source, /temperature: 0/);
    }
    // 완료 요약의 칸 이름이 어긋나면 관리자 화면의 수가 조용히 0 이 된다.
    for (const key of ['collected_count', 'known_filtered_count', 'cache_hit_count', 'ai_reviewed_count']) {
        assert.match(runner, new RegExp(key));
        assert.match(edgeFunction, new RegExp(key));
    }
});

test('엣지 함수는 학생이 받는 것과 같은 카탈로그를 주소에서 받아 온다', () => {
    // 번들에 사본을 넣으면 배포 시점이 어긋나 학생 화면과 검수 기준이 달라진다.
    assert.match(edgeFunction, /spelling\/elementary-lookup-v1\.json/);
    assert.match(edgeFunction, /spelling\/elementary-detection-v1\.json/);
    assert.match(edgeFunction, /SPELLING_CATALOG_ORIGIN/);
});

test('쌓인 양 조회는 관리자 전용이고 실행 함수와 같은 기준으로 센다', () => {
    assert.match(intakeMigration, /auth_user_role\(\) <> 'ADMIN'/);
    assert.match(intakeMigration, /REVOKE ALL ON FUNCTION public\.admin_get_spelling_weekly_intake_v1\(\) FROM PUBLIC, anon/);
    // start 함수와 같은 기준 시각·같은 걸러내기를 써야 화면의 수와 실제 검수 대상이 맞는다.
    assert.match(intakeMigration, /status IN \('ready', 'empty'\)/);
    assert.match(intakeMigration, /corpus\.matched IS FALSE/);
    assert.match(intakeMigration, /spelling_common_reviews/);
    // 이번 주 회차가 없을 때 can_run 이 NULL 로 새면 화면이 버튼을 못 정한다.
    assert.match(intakeMigration, /NOT COALESCE\(/);
    // 읽기만 한다.
    assert.doesNotMatch(intakeMigration, /INSERT INTO|UPDATE public\.|DELETE FROM/);
});

test('관리자 화면은 쌓인 양을 보여 주고 관리자가 눌러야 AI가 돈다', () => {
    assert.match(panel, /admin_get_spelling_weekly_intake_v1/);
    assert.match(panel, /functions\.invoke\('spelling-weekly-review'/);
    // 여기서 처음으로 학생 표현이 외부 AI 로 나간다. 확인 없이 나가면 안 된다.
    assert.match(panel, /window\.confirm\([\s\S]{0,400}AI 검수에 보냅니다/);
    assert.match(panel, /실제 AI 호출과 비용이 발생합니다/);
    // 이미 끝난 주를 눌러도 헛돌지 않게 화면이 이유를 말해야 한다.
    assert.match(panel, /already_finished/);
    assert.match(panel, /disabled=\{running \|\| loading \|\| !intake\.can_run \|\| total === 0\}/);
    // 자동 실행을 전제한 옛 안내가 남아 있으면 안 된다.
    assert.doesNotMatch(panel, /매주 월요일 05:10에 첫 결과가/);
});

test('배포가 엣지 함수의 두 파일을 함께 올린다', () => {
    // index.ts 만 올리면 reviewCore.js 를 import 하다가 함수가 죽는다.
    assert.match(deployWorkflow, /spelling-weekly-review\/index\.ts/);
    assert.match(deployWorkflow, /spelling-weekly-review\/reviewCore\.js/);
});

test('원자료 목록은 관리자 전용 읽기이고 실행 함수와 같은 기준으로 고른다', () => {
    assert.match(candidateMigration, /auth_user_role\(\) <> 'ADMIN'/);
    assert.match(candidateMigration, /REVOKE ALL ON FUNCTION public\.admin_get_spelling_intake_candidates_v1/);
    // start 함수와 같은 기준 시각·같은 걸러내기를 써야 목록과 실제 검수 대상이 맞는다.
    assert.match(candidateMigration, /status IN \('ready', 'empty'\)/);
    assert.match(candidateMigration, /spelling_common_reviews/);
    // 목록과 총 개수는 각자 세므로 **두 곳 다** 같은 걸러내기를 써야 한다.
    // 한쪽만 고치면 "78건" 이라고 써 놓고 12건만 보여 주는 식으로 어긋난다.
    assert.equal((candidateMigration.match(/corpus\.matched IS FALSE/g) || []).length, 2);
    assert.equal((candidateMigration.match(/char_length\(corpus\.expression\) BETWEEN 2 AND 15/g) || []).length, 2);
    // 목록은 읽기만 한다 — 쓰기는 빼기 함수만 한다.
    assert.doesNotMatch(
        candidateMigration.match(/admin_get_spelling_intake_candidates_v1[\s\S]*?\$\$;/)?.[0] || '',
        /INSERT INTO|DELETE FROM|UPDATE public\./
    );
});

test('빼기는 되돌릴 수 있고 이미 게시된 후보는 건드리지 않는다', () => {
    assert.match(candidateMigration, /admin_set_spelling_candidate_excluded_v1/);
    // 새 표를 만들지 않고 기존 결정 원장에 남긴다 — start 함수가 이미 그 행을 보고 건너뛴다.
    assert.match(candidateMigration, /decision = 'rejected'/);
    assert.match(candidateMigration, /'restored'/);
    // 게시된 것을 빼면 common_entry_id 를 잃어 자료의 출처가 끊긴다.
    // 주석이 아니라 **실제로 되돌려 보내는 값**인지 본다.
    assert.match(candidateMigration, /v_existing = 'published'[\s\S]{0,120}RETURN jsonb_build_object\('status', 'published_locked'\)/);
    assert.match(candidateSmoke, /published_locked/);
    assert.match(candidateSmoke, /되돌리기가 안 됐다/);
});

test('관리자 화면은 AI에 보내기 전에 두 출처의 원자료를 훑어보게 한다', () => {
    assert.match(panel, /admin_get_spelling_intake_candidates_v1/);
    assert.match(panel, /admin_set_spelling_candidate_excluded_v1/);
    // 학생이 낸 두 출처를 모두 고를 수 있어야 한다. 한쪽만 있으면 다른 쪽은 통째로 나간다.
    assert.match(panel, /onOpenList\('ai'\)/);
    assert.match(panel, /onOpenList\('search'\)/);
    assert.match(panel, /뺀 것 보기/);
    assert.match(panel, /되돌리기/);
    // AI 를 거치지 않는 직접 등록은 기존 공통 게시 RPC 를 그대로 쓴다.
    assert.match(panel, /admin_publish_common_spelling_entry_v1/);
    assert.match(panel, /직접 등록/);
});

/*
 * 2026-08-28 첫 실행이 통째로 날아갔다. 작업자 제한이 60초인데 후보 155건은 AI 를 13번 불러야 해서
 * supervisor 가 작업자를 끊었고, 끊기는 방식이라 함수의 오류 처리도 못 돌아 회차가 `running` 에
 * 멈췄다. `finish_` 가 결과와 캐시를 한꺼번에 쓰기 때문에 이미 낸 AI 비용도 하나도 안 남았다.
 * 다시는 이렇게 잃지 않도록 세 가지를 고정한다.
 */
test('한 번에 못 끝낼 검수는 시간을 남기고 멈춰 이어서 돌린다', () => {
    // 시간이 남아 있을 때만 다음 배치를 시작한다.
    assert.match(edgeFunction, /Date\.now\(\) - startedAt < BATCH_BUDGET_MS/);
    // 예산과 AI 호출 제한을 더해도 작업자 제한(60초) 안이어야 한다.
    const budget = Number(edgeFunction.match(/BATCH_BUDGET_MS = ([\d_]+)/)?.[1]?.replace(/_/g, ''));
    const openAiTimeout = Number(edgeFunction.match(/reviewWithOpenAI[\s\S]*?AbortSignal\.timeout\(([\d_]+)\)/)?.[1]?.replace(/_/g, ''));
    assert.ok(Number.isFinite(budget) && Number.isFinite(openAiTimeout), '예산과 AI 호출 제한을 못 읽었다');
    assert.ok(budget + openAiTimeout <= 55_000,
        `예산 ${budget}ms + AI 호출 ${openAiTimeout}ms 가 작업자 제한 60초에 너무 가깝다`);
    // 남은 것이 있으면 회차를 열어 둔 채 돌려보낸다.
    assert.match(edgeFunction, /done: false/);
    assert.match(edgeFunction, /remaining: fresh\.length - offset/);
});

test('배치마다 결과를 캐시에 적립해 끊겨도 낸 비용이 남는다', () => {
    // finish_ 는 맨 끝에 한 번뿐이라, 중간 적립이 없으면 끊길 때 전부 날아간다.
    assert.match(edgeFunction, /save_spelling_weekly_ai_cache_v1/);
    assert.match(edgeFunction, /database_cache_failed/);
    assert.match(resumeMigration, /CREATE OR REPLACE FUNCTION public\.save_spelling_weekly_ai_cache_v1/);
    assert.match(resumeMigration, /ON CONFLICT \(review_key\) DO UPDATE SET/);
    // 서버 역할만 적립할 수 있다.
    assert.match(resumeMigration, /session_user <> 'supabase_admin'[\s\S]{0,80}service_role/);
    assert.match(resumeMigration, /GRANT EXECUTE ON FUNCTION public\.save_spelling_weekly_ai_cache_v1\(JSONB\) TO service_role/);
});

test('이어 부르는 호출은 같은 회차를 이어받는다', () => {
    // 이어받지 못하면 already_running 에 막혀 두 시간 동안 아무것도 못 한다.
    assert.match(resumeMigration, /p_allow_resume BOOLEAN DEFAULT FALSE/);
    assert.match(resumeMigration, /IF NOT COALESCE\(p_allow_resume, FALSE\) THEN[\s\S]{0,120}'already_running'/);
    assert.match(edgeFunction, /p_allow_resume: true/);
    // 인자가 늘었으므로 옛 서명을 지워야 호출이 갈리지 않는다.
    assert.match(resumeMigration, /DROP FUNCTION IF EXISTS public\.start_spelling_weekly_review_v1\(DATE, TEXT\)/);
    // 화면은 덩어리마다 끝났는지 보고, 안 끝났으면 이어서 부른다.
    assert.match(panel, /result\.done !== false/);
    assert.match(panel, /이어서 하는 중이에요/);

    /*
     * 돌다 만 회차가 관리자를 가두면 안 된다. `can_run` 이 `running` 을 막으면 단추가 잠겨
     * "지금 검수가 돌고 있습니다" 만 뜨고 아무것도 못 하게 된다(2026-08-28 실제로 갇혔다).
     */
    assert.match(resumableIntakeMigration, /'can_run', COALESCE\(v_current\.status, ''\) NOT IN \('ready', 'empty'\)/);
    assert.match(resumableIntakeMigration, /'is_resuming'/);
    assert.doesNotMatch(resumableIntakeMigration, /can_run[\s\S]{0,200}status = 'running'/);
    assert.match(panel, /is_resuming/);
    assert.match(panel, /이어서 검수하기/);
});

test('응답이 안 와도 화면이 굳지 않는다', () => {
    // 작업자가 끊기면 응답이 아예 안 온다. 기다림에 끝이 없으면 단추가 그대로 굳는다.
    assert.match(panel, /REVIEW_CALL_TIMEOUT_MS/);
    assert.match(panel, /callWithTimeout\(/);
    // 작업자 제한(60초)보다는 길게 기다려야 정상 응답을 헛되이 버리지 않는다.
    const wait = Number(panel.match(/REVIEW_CALL_TIMEOUT_MS = ([\d_]+)/)?.[1]?.replace(/_/g, ''));
    assert.ok(wait > 60_000 && wait <= 120_000, `기다리는 시간이 이상하다: ${wait}ms`);
});

test('눌러 가며 하는 동안 어디까지 왔는지 화면에 남는다', () => {
    // 알림은 목록 새로고침이 지우고, 새로 고치면 사라진다. 그래서 진행 수를 원장에 적고 카드가 읽는다.
    assert.match(progressMigration, /CREATE OR REPLACE FUNCTION public\.update_spelling_weekly_progress_v1/);
    // 이미 끝난 회차의 최종 집계를 덮어쓰면 안 된다.
    assert.match(progressMigration, /AND run\.status = 'running'/);
    assert.match(progressMigration, /'current_total_count'/);
    assert.match(progressMigration, /'current_done_count'/);
    // 엣지 함수가 배치마다 적는다.
    assert.match(edgeFunction, /update_spelling_weekly_progress_v1/);
    // 화면은 카드에 계속 보여 주고, 검수 뒤 새로고침이 알림을 지우지 않는다.
    assert.match(panel, /admin-spelling__intake-progress/);
    assert.match(panel, /load\(\{ keepNotice: true \}\)/);
    assert.match(panel, /if \(!keepNotice\) setNotice\(null\)/);
});

test('검수는 끊어서 하되 스스로 이어 돌고 세울 수 있다', () => {
    // 매번 누르는 것이 번거롭다는 지적. 덩어리 사이에서 화면을 새로 읽어 막대를 움직인 뒤 이어 부른다.
    assert.match(panel, /for \(let pass = 1; pass <= MAX_REVIEW_PASSES/);
    assert.match(panel, /이어서 하는 중이에요/);
    // 이어 부르기 전에 반드시 화면을 새로 읽는다. 안 그러면 막대가 끝날 때까지 안 움직인다.
    assert.match(panel, /이어서 하는 중이에요[\s\S]{0,300}await load\(\{ keepNotice: true \}\)[\s\S]{0,160}stopRef\.current/);
    // 도는 중에도 세울 수 있어야 한다.
    assert.match(panel, /여기서 멈추기/);
    assert.match(panel, /stopRef\.current = true/);
});
