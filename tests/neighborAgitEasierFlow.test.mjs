import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 모두의 아지트 쓰기 쉽게(2026-09-25, v1.6).
 *
 *  1. 초대 코드 하나로 남은 자리만큼 여러 반이 7일 동안 신청한다(20261348). 코드는 여전히 해시로만 남는다.
 *  2. 코드·안내문 복사 단추, 쉬운 말(새 모임 만들기·받은 초대 코드로 들어가기).
 *  3. 학생 입장이 닫혀 있으면 위에서 바로 연다. 참여 중에는 큰 머리글을 한 줄로 줄인다. 탭 번호를 뺀다.
 *  4. 문집 도서관은 세 탭, 게시 기한·방문록 최소는 ⚙️ 설정 창.
 *  5. 학생: 방 안에서는 머리글 한 줄, `친구 글 읽기`.
 */
const [sql, entry, inviteBox, books, student, studentCss] = await Promise.all([
    readFile('supabase/migrations/20261348_neighbor_multi_use_invite.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/InviteCodeBox.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/books/TeacherBooksPanel.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.css', 'utf8')
]);

test('초대 코드: 7일, 남은 자리만큼, 새 코드를 만들면 이전 코드는 멈춘다', () => {
    assert.match(sql, /CHECK \(max_uses BETWEEN 1 AND 20 AND use_count BETWEEN 0 AND max_uses\)/);
    assert.match(sql, /v_expires_at TIMESTAMPTZ := NOW\(\) \+ INTERVAL '7 days'/);
    assert.match(sql, /GREATEST\(1, 10 - count\(\*\)\)::SMALLINT INTO v_max_uses[\s\S]*?status IN \('active', 'pending'\)/);
    assert.match(sql, /SET status = 'cancelled', cancelled_at = NOW\(\)\s+WHERE space_id = p_space_id AND status = 'active'/);
    // 원문은 여전히 저장하지 않는다.
    assert.match(sql, /extensions\.digest\(convert_to\(v_normalized, 'UTF8'\), 'sha256'\)/);
    assert.doesNotMatch(sql, /invite_key\s+TEXT|INSERT INTO public\.neighbor_invites \([^)]*invite_key/);
});

test('신청할 때마다 한 자리씩 쓰고, 다 써야 사용됨이 된다', () => {
    assert.match(sql, /SET use_count = use_count \+ 1,\s+status = CASE WHEN use_count \+ 1 >= max_uses THEN 'used' ELSE status END/);
    // 성공하면 잘못 넣은 기록을 비운다(반복 대입 제한은 그대로).
    assert.match(sql, /DELETE FROM public\.neighbor_invite_attempts WHERE user_id = v_user_id;/);
});

test('초대 코드 상자: 코드·안내문 복사, 한 번만 보인다는 안내, 복사 실패 문구', () => {
    assert.match(inviteBox, /navigator\.clipboard\.writeText\(text\)/);
    assert.match(inviteBox, /'코드 복사'/);
    assert.match(inviteBox, /'안내문 복사'/);
    assert.match(inviteBox, /받은 초대 코드로 들어가기/);
    assert.match(inviteBox, /코드는 지금 한 번만 보여요/);
    assert.match(inviteBox, /복사하지 못했어요/);
    // 준비 화면과 공간 관리 창이 같은 상자를 쓴다.
    assert.equal((entry.match(/<InviteCodeBox invite=\{invite\} spaceName=\{workspace\.space\.name\} \/>/g) || []).length, 2);
    assert.doesNotMatch(entry, /초대키/);
});

test('교사 화면: 쉬운 이름, 정본 상한, 학생 입장 안내, 참여 중 머리글 줄이기, 탭 번호 없음', () => {
    assert.match(entry, /새 모임 만들기/);
    assert.match(entry, /받은 초대 코드로 들어가기/);
    assert.match(entry, /참여 신청하기/);
    assert.doesNotMatch(entry, /(>=|<) 4\b/);
    assert.match(entry, /activeMemberships\.length >= NEIGHBOR_AGIT_LIMITS\.maxClassesPerSpace/);
    // 두 반 이상일 때만 연다(서버도 두 반 미만이면 막는다).
    assert.match(entry, /!workspace\.space\.student_access_enabled && activeMemberships\.length >= 2 && \(/);
    assert.match(entry, /className="neighbor-teacher__access-callout"/);
    assert.match(entry, /isReady && workspace\?\.space\?\.my_status === 'active' \? ' is-compact' : ''/);
    assert.doesNotMatch(entry, /label: '[①②③]/);
});

test('문집 도서관: 세 탭과 ⚙️ 설정 창', () => {
    assert.match(books, /useState\('mine'\)/);
    for (const label of ['📚 우리 반 문집', '✍️ 방문록', '🏫 둘러보기']) assert.ok(books.includes(label), label);
    assert.match(books, /onClick=\{\(\) => setSettingsFor\(book\)\}>⚙️ 설정</);
    assert.match(books, /<Modal[^>]*isOpen=\{Boolean\(settingsBook\)\}/);
});

test('학생: 방 안에서는 머리글 한 줄, 활동 글은 친구 글 읽기', () => {
    assert.match(student, /neighbor-student-page__header\$\{activeSection === null \? '' : ' is-compact'\}/);
    assert.match(studentCss, /\.neighbor-student-page__header\.is-compact p \{ display: none; \}/);
    assert.match(student, />친구 글 읽기<\/Button>/);
    assert.doesNotMatch(student, /활동 글 보기/);
});

test('머리글 줄이기가 도움말 단추 글자를 숨기지 않는다(2026-09-25 제보: 빈 네모)', async () => {
    const css = await readFile('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');
    // 머리글 안 모든 span 을 건드리면 GuideInfoButton 안의 💡·도움말 글자까지 숨겨지거나 색이 바뀐다.
    assert.doesNotMatch(css, /\.neighbor-teacher__header(\.is-compact)? span/);
    assert.match(css, /\.neighbor-teacher__header\.is-compact > div:first-child > span/);
    assert.match(entry, /<TeacherGuideButton tabId="neighbor-agit" variant="help" \/>/);
});
