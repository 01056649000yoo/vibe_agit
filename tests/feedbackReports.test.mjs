/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    FEEDBACK_CATEGORIES,
    buildFeedbackContent,
    buildFeedbackTitle,
    describeFeedbackCategory,
    describeFeedbackStatus
} from '../src/modules/feedback/feedbackCategories.js';

const read = (path) => readFile(path, 'utf8');

/*
 * 2026-08-21: 선생님 203명에 제보 0건이었다. 제목·내용 두 칸이 백지라 낱말 하나 틀린 것을
 * 알리려 해도 제목을 지어내야 했다. 종류를 먼저 고르게 하고 제목은 앱이 만든다.
 */
test('제목은 선생님이 짓지 않고 고른 종류와 쓴 내용으로 앱이 만든다', () => {
    const title = buildFeedbackTitle('correction', { place: '어휘의 탑', wrong: '가늠하다 뜻풀이' });
    assert.match(title, /내용이 틀렸어요/);
    assert.match(title, /어휘의 탑/);
    assert.match(title, /가늠하다/);

    // 서버가 2~120자를 요구한다. 아무것도 안 썼어도 종류 이름으로 최소 길이를 넘겨야 한다.
    const bare = buildFeedbackTitle('bug', {});
    assert.ok(bare.length >= 2 && bare.length <= 120, `제목 길이가 범위를 벗어난다: ${bare.length}`);

    // 길게 써도 잘려서 서버 상한을 넘지 않아야 한다.
    const long = buildFeedbackTitle('correction', { place: '어휘의 탑', wrong: '가'.repeat(300) });
    assert.ok(long.length <= 120, `긴 제목이 잘리지 않았다: ${long.length}`);
});

test('종류마다 나눠 받은 칸이 하나의 본문으로 합쳐진다', () => {
    const correction = buildFeedbackContent('correction', {
        place: '어휘의 탑', wrong: '가늠하다', right: '헤아리다'
    });
    assert.match(correction, /\[어디서\] 어휘의 탑/);
    assert.match(correction, /\[틀린 내용\] 가늠하다/);
    assert.match(correction, /\[맞는 내용\] 헤아리다/);

    const bug = buildFeedbackContent('bug', { tried: '전학생 추가', happened: '저장이 안 됨' });
    assert.match(bug, /\[무엇을 하려다\] 전학생 추가/);
    assert.match(bug, /\[어떻게 됐나\] 저장이 안 됨/);

    // 자유 서술은 쓴 그대로 간다.
    assert.equal(buildFeedbackContent('idea', { content: '이런 기능이요' }), '이런 기능이요');
});

test('옛 제보와 모르는 값도 이름이 비지 않는다', () => {
    // 종류 없이 들어온 예전 제보가 목록에서 빈칸으로 보이면 안 된다.
    assert.equal(describeFeedbackCategory(undefined).label, '기타');
    assert.equal(describeFeedbackCategory('없는종류').label, '기타');
    assert.equal(describeFeedbackStatus('open').label, '접수됨');
    assert.equal(describeFeedbackStatus('in_progress').label, '확인 중');
    assert.equal(describeFeedbackStatus('done').label, '처리 완료');
});

test('내용 정정이 첫 번째 종류다', () => {
    // 어휘·맞춤법 자료가 수백 개라 선생님이 가장 많이 발견하는 것이 내용 오류이고,
    // 그 제보가 관리자 검수 화면으로 이어진다.
    assert.equal(FEEDBACK_CATEGORIES[0].id, 'correction');
    assert.equal(FEEDBACK_CATEGORIES.length, 4);
});

test('제보는 RPC 로만 들어가고 종류·맥락·답장이 서버 계약에 있다', async () => {
    const migration = await read('supabase/migrations/20261148_feedback_reports_category_and_reply.sql');

    // 종류·상태는 정해진 값만 받는다. 화면이 자유 문자열을 보내 표가 흐려지면 안 된다.
    assert.ok(migration.includes("CHECK (category IN ('correction', 'bug', 'idea', 'howto', 'other'))"));
    assert.ok(migration.includes("CHECK (status IN ('open', 'in_progress', 'done'))"));

    // 맥락은 화면이 만드는 값이라 서버가 크기를 막는다.
    assert.match(migration, /char_length\(v_context::TEXT\) > 2000/);

    // 답장은 관리자만, 그리고 답장 내용이 실제로 바뀔 때만 시각을 새로 찍는다.
    assert.match(migration, /admin_reply_feedback_v1/);
    assert.match(migration, /관리자만 답장할 수 있습니다/);
    assert.match(migration, /WHEN v_reply IS NOT NULL AND v_reply IS DISTINCT FROM admin_reply THEN NOW\(\)/);

    // 익명에게는 어느 것도 열지 않는다.
    for (const fn of ['submit_teacher_feedback_v2', 'get_my_feedback_reports_v1', 'admin_reply_feedback_v1']) {
        assert.ok(migration.includes(`REVOKE ALL ON FUNCTION public.${fn}`), `${fn} 의 REVOKE 가 없다`);
    }
});

test('선생님 화면은 답장을 실제로 연 뒤에만 읽음으로 표시한다', async () => {
    const modal = await read('src/components/teacher/FeedbackModal.jsx');

    // 창을 열자마자 표시하면 답장을 못 본 채 배지만 사라진다.
    assert.ok(modal.includes("if (!isOpen || tab !== 'history' || unreadReplies === 0) return undefined;"));
    assert.ok(modal.includes("supabase.rpc('mark_my_feedback_replies_seen_v1')"));

    // 제목 칸은 없어야 한다 — 앱이 만든다.
    assert.ok(modal.includes('buildFeedbackTitle(categoryId, fields)'));
    // 맥락을 함께 보낸다.
    assert.ok(modal.includes('p_context: buildFeedbackContext({ category: categoryId })'));
});

test('관리자 답장은 표를 직접 고치지 않고 RPC 한 곳으로 모은다', async () => {
    const list = await read('src/components/admin/AdminFeedbackList.jsx');

    // 답장 시각을 서버가 쥐어야 선생님 쪽 배지와 어긋나지 않는다.
    assert.ok(list.includes("supabase.rpc('admin_reply_feedback_v1'"));
    assert.doesNotMatch(list, /\.update\(\{ status/);
});
