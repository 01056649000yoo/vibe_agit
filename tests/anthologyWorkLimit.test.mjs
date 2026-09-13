import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CLASS_AGIT_LIMITS, isClassAgitChapterId } from '../src/modules/class-agit/policy.js';

const migration = readFileSync('supabase/migrations/20261289_anthology_work_limit_300.sql', 'utf8');
const guide = readFileSync('src/constants/teacherGuides.js', 'utf8');
const positionMigration = readFileSync('supabase/migrations/20261290_anthology_item_position_limit.sql', 'utf8');
const limit = CLASS_AGIT_LIMITS.anthologyWorks;

test('문집 수록 한도는 앱과 DB 가 같은 수를 쓴다', () => {
    /*
     * 2026-09-14: 100편 → 300편.
     *
     * 한 곳만 고치면 **조용히** 깨진다. 저장 검사만 올리면 교사는 300편을 담을 수 있는데
     * 조회 `LIMIT` 이 100이라 101편째부터 화면에서 사라지고, 어디에도 오류가 남지 않는다.
     * 그래서 네 자리를 한꺼번에 본다.
     */
    assert.equal(limit, 300);
    const places = [
        [`jsonb_array_length(p_payload->'items')>${limit}`, '저장할 때 작품 수'],
        [`jsonb_array_length(COALESCE(p_payload->'page_breaks',v_book.page_breaks)) > ${limit}`, '저장할 때 쪽 나누기 수'],
        [`NOT BETWEEN 1 AND ${limit}`, '확정할 때 작품 수'],
        [`ORDER BY i.position,i.id LIMIT ${limit}`, '교사 작업공간 조회'],
        [`ORDER BY w.ordinality LIMIT ${limit}`, '학생 서가 조회'],
        [`jsonb_array_length(page_breaks) <= ${limit}`, '쪽 나누기 표 제약'],
    ];
    places.forEach(([needle, where]) => assert.ok(migration.includes(needle), `${where} 가 ${limit} 이 아닙니다.`));
    // 교사에게 보이는 말도 같은 수여야 한다.
    assert.ok(migration.includes(`작품 수(최대 ${limit}편)`) && migration.includes(`1~${limit}편의 작품`));
});

test('학생 서가의 차례 id 가 마지막 작품까지 닿는다', () => {
    // `chapter-N` 규칙이 한도보다 작으면 마지막 작품들이 학생 화면에서 조용히 되돌아간다.
    assert.ok(isClassAgitChapterId(`chapter-${limit}`), `chapter-${limit} 을 받지 못합니다.`);
    assert.ok(!isClassAgitChapterId(`chapter-${limit + 1}`), '한도를 넘는 차례 id 를 받고 있습니다.');
});

test('300편을 담아도 저장 요청 크기 한도를 넘지 않는다', () => {
    /*
     * 요청 한도(`octet_length`)는 본문이 아니라 **목록**에 걸린다. 한 편이 원글 id(36자)와
     * 검사값(64자)이라 300편이면 그것만 41KB, 쪽 나누기까지 더하면 53KB다. 60KB 그대로 뒀다면
     * 교사가 300편을 담은 순간 저장이 막혔다.
     */
    const perItem = '{"sourceId":"00000000-0000-0000-0000-000000000000","sourceRevision":"' + 'a'.repeat(64) + '"},';
    const worst = perItem.length * limit + 40 * limit + 2000;
    const cap = Number(migration.match(/octet_length\(p_payload::TEXT\)>(\d+)/)[1]);
    // 여유를 1.5배는 둔다 — 제목·여는 글은 한글이라 한 글자가 3바이트고, 딱 맞춰 두면
    // 여는 글 몇 줄에 저장이 막힌다.
    assert.ok(cap > worst * 1.5, `요청 한도 ${cap} 이 가장 큰 저장 ${worst} 에 견줘 빠듯합니다.`);
});

test('활용 안내서가 두 한도를 상수에서 읽어 말한다', () => {
    /*
     * 2026-09-14 요청: 전시관과 책방의 한도가 다르니 도움말에 적는다.
     * 숫자를 손으로 적으면 한도를 올린 날 도움말만 옛날 수로 남는다 — 상수를 넣는다.
     */
    assert.match(guide, /한 권에 최대 \$\{CLASS_AGIT_LIMITS\.anthologyWorks\}편/);
    assert.match(guide, /글꽃 전시관\(\$\{CLASS_AGIT_LIMITS\.maxWorks\}편·\$\{CLASS_AGIT_LIMITS\.maxRooms\}실\)/);
});

test('작품 자리 번호 제약도 같은 한도를 쓴다', () => {
    /*
     * 2026-09-14 사고: 한도를 300으로 올린 당일, 교사가 **200편을 담자 저장이 막혔다.**
     *   new row for relation "class_agit_book_items" violates check constraint
     *   "class_agit_book_items_position_check"
     * 함수 안의 숫자와 `page_breaks` 제약만 훑고 **표 제약**을 놓쳤다. 전시 쪽 표들은
     * `class_agit_max_works_v1()` 을 불러 쓰는데 문집 표만 숫자가 박혀 있어 눈에 안 띄었다.
     *
     * 그래서 문집도 함수를 불러 쓰게 바꿨다 — 숫자를 박아 두면 다음에 또 잊는다.
     */
    assert.match(positionMigration, /CREATE OR REPLACE FUNCTION public\.class_agit_max_anthology_works_v1/);
    assert.match(positionMigration, new RegExp(`SELECT ${limit};`));
    assert.match(positionMigration, /CHECK \(position >= 1 AND position <= public\.class_agit_max_anthology_works_v1\(\)\)/);
    // 숫자를 도로 박아 두면 여기서 걸린다.
    assert.doesNotMatch(positionMigration, /position <= \d+/);
    // 한도 함수는 아무나 부르지 못한다 — 전시 쪽 `class_agit_max_works_v1` 과 같은 규칙이다.
    assert.match(positionMigration, /REVOKE ALL ON FUNCTION public\.class_agit_max_anthology_works_v1\(\) FROM PUBLIC,anon,authenticated,service_role;/);
});
