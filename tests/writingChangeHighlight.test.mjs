import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { diffWritingText, getWritingCompareInfo, segmentsForView, tokenizeWords, WRITING_DIFF_MAX_CELLS } from '../src/modules/writing/review/writingDiff.js';

/*
 * 승인된 글의 처음 글 → 고친 글 비교(2026-09-26). 바뀐 곳에 형광펜, 지운 곳에 가운데 줄.
 * 비교 화면이 여섯 곳이라, 한 곳만 고치고 나머지가 옛 모양으로 남지 않게 한꺼번에 본다.
 */

const rebuild = (segments, keep) => segments.filter((s) => keep.includes(s.type)).map((s) => s.text).join('');

test('어절 단위로 새로 쓴 곳·지운 곳을 찾고, 조각을 이으면 원문이 그대로 나온다', () => {
    const before = '오늘은 운동장이 넓어 보였다. 이어달리기를 할수 있어서 신났다.';
    const after = '오늘은 웬지 운동장이 더 넓어 보였다. 이어달리기를 할 수 있어서 정말 신났다.';
    const result = diffWritingText(before, after);
    assert.equal(result.mode, 'word');
    assert.equal(result.changeCount, 4);
    assert.equal(rebuild(result.segments, ['same', 'added']), after, '고친 글이 되살아나지 않습니다.');
    assert.equal(rebuild(result.segments, ['same', 'removed']), before, '처음 글이 되살아나지 않습니다.');
    assert.deepEqual(result.segments.filter((s) => s.type === 'removed').map((s) => s.text), ['할수']);
});

test('같은 글·빈 처음 글·공백만 바뀐 글', () => {
    assert.deepEqual(diffWritingText('같다', '같다'), { mode: 'same', segments: [{ type: 'same', text: '같다' }], changeCount: 0 });
    const fresh = diffWritingText('', '새 글');
    assert.equal(fresh.changeCount, 1);
    assert.equal(rebuild(fresh.segments, ['same', 'added']), '새 글');
    // 줄바꿈만 늘어난 것은 바뀐 자리로 세지 않는다.
    assert.equal(diffWritingText('첫 줄\n둘째 줄', '첫 줄\n\n둘째 줄').changeCount, 0);
});

test('바뀐 어절 사이의 공백은 보여 줄 때만 형광펜에 붙이고, 두 원문은 그대로 되살아난다', () => {
    const before = '나는 밥을 먹고 학교에 갔다';
    const after = '나는 맛있는 저녁밥을 먹고 학교에 갔다';
    const result = diffWritingText(before, after);
    assert.equal(result.changeCount, 1);
    for (const variant of ['merged', 'after', 'before']) {
        const view = segmentsForView(result.segments, variant);
        const shown = view.map((s) => s.text).join('');
        if (variant === 'after') assert.equal(shown, after);
        if (variant === 'before') assert.equal(shown, before);
        if (variant === 'merged') assert.equal(shown, rebuild(result.segments, ['same', 'added', 'removed']));
    }
    const afterView = segmentsForView(result.segments, 'after');
    // `맛있는` 과 `저녁밥을` 사이 공백이 형광펜 밖으로 끊기지 않는다.
    const markedRun = afterView.map((s) => (s.type === 'added' ? s.text : '|')).join('');
    assert.match(markedRun, /맛있는 저녁밥을/, `형광펜이 어절마다 끊겼습니다: ${JSON.stringify(afterView)}`);
});

test('아주 긴 글은 멈추지 않고 줄 단위로 물러서거나 칠하지 않는다', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(' ');
    const other = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(' ');
    const started = Date.now();
    const result = diffWritingText(long, other);
    assert.ok(Date.now() - started < 1000, '긴 글 비교가 너무 오래 걸립니다.');
    assert.notEqual(result.mode, 'word', '상한을 넘었는데 어절 표를 만들었습니다.');
    assert.ok(tokenizeWords(long).length ** 2 > WRITING_DIFF_MAX_CELLS);
    // 운영에 있는 30만 자 글처럼 앞뒤가 거의 같으면 앞뒤를 잘라 내고 가운데만 견준다.
    const huge = '가 '.repeat(150_000);
    assert.equal(diffWritingText(huge, `${huge}끝`).changeCount, 1);
});

/*
 * 비교 보기 선택(2026-09-26): 회색 `📜 처음글과 비교하기` 단추 대신 형광펜색 띠(`처음 글에서 N군데 고쳤어요`)와
 * `최종 글 · 🖍️ 바뀐 곳 · 처음 글` 세 칸. 다섯 화면이 같은 부품을 쓰고, 학생 본인 글 두 곳만 처음 열 때 바뀐 곳으로 연다.
 */
const SWITCH_VIEWS = [
    ['src/components/student/MyShelfPostDetail.jsx', 'post?.is_confirmed', true],
    ['src/components/student/StudentWriting.jsx', 'isConfirmed', true],
    ['src/components/student/PostDetailModal.jsx', 'post?.is_confirmed', false],
    ['src/components/teacher/TeacherStudentAgitPostDetail.jsx', 'post?.is_confirmed', false],
    ['src/components/teacher/PostDetailViewer.jsx', 'selectedPost?.is_confirmed', false]
];

test('비교 화면 다섯 곳이 같은 보기 선택을 쓰고, 형광펜은 승인된 글에만', async () => {
    for (const [file, approvedExpr, autoOpen] of SWITCH_VIEWS) {
        const source = await readFile(file, 'utf8');
        assert.match(source, /<WritingVersionSwitch \{\.\.\.version\} onChange=\{version\.setView\}/, `${file} 이 보기 선택을 쓰지 않습니다.`);
        const hook = source.slice(source.indexOf('useWritingVersion({'), source.indexOf('});', source.indexOf('useWritingVersion({')));
        assert.ok(hook.includes(`approved: Boolean(${approvedExpr})`), `${file} 이 승인 여부로 형광펜을 가르지 않습니다.`);
        assert.equal(hook.includes('autoOpenChanges: true'), autoOpen,
            autoOpen ? `${file} 은 학생 본인 글이라 처음 열 때 바뀐 곳으로 열어야 합니다.` : `${file} 은 자동으로 바뀐 곳을 열지 않습니다.`);
    }
    const viewer = await readFile('src/components/teacher/PostDetailViewer.jsx', 'utf8');
    assert.match(viewer, /layout="sideBySide"/, '글 자세히 보기는 처음·최종을 나란히 놓는 두 칸이다.');
});

test('옛 비교 단추 이름이 화면에 남지 않는다', async () => {
    const files = [...SWITCH_VIEWS.map(([file]) => file), 'src/constants/teacherGuides.js', 'src/components/student/studentGuide.js'];
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        assert.doesNotMatch(source, /최초글과 비교하기|처음글과 비교하기|처음 글과 비교하기|최신글만 보기|마지막글 보기|마지막 글\(수정본\) 보기/, `${file} 에 옛 단추 이름이 남았습니다.`);
    }
});

test('보기 선택 규칙: 같은 글이면 그리지 않고, 형광펜 칸은 승인된 글에 바뀐 곳이 있을 때만', () => {
    assert.equal(getWritingCompareInfo({ before: '같다', after: '같다', approved: true }).hasOriginal, false);
    assert.equal(getWritingCompareInfo({ before: '', after: '글', approved: true }).hasOriginal, false);
    // 제목만 바뀐 글은 처음 글을 볼 수는 있지만 본문 형광펜 칸은 열지 않는다.
    const titleOnly = getWritingCompareInfo({ before: '본문', after: '본문', beforeTitle: '옛 제목', afterTitle: '새 제목', approved: true });
    assert.deepEqual([titleOnly.hasOriginal, titleOnly.canShowChanges], [true, false]);
    const draft = getWritingCompareInfo({ before: '처음 글', after: '고친 글', approved: false });
    assert.deepEqual([draft.hasOriginal, draft.canShowChanges, draft.changeCount], [true, false, 0]);
    const approved = getWritingCompareInfo({ before: '처음 글', after: '고친 글', approved: true });
    assert.deepEqual([approved.canShowChanges, approved.changeCount], [true, 1]);
});

test('제출 현황 창의 나란히 보기와 크게 보기도 승인된 글에만 칠한다', async () => {
    for (const [file, name] of [['src/components/teacher/PostDetailViewer.jsx', 'selectedPost'], ['src/components/teacher/SubmissionStatusModal.jsx', 'post']]) {
        const source = await readFile(file, 'utf8');
        assert.match(source, new RegExp(`variant="before"\\s+enabled=\\{Boolean\\(${name}\\.is_confirmed\\)\\}`), `${file} 왼쪽(처음 글)`);
        assert.match(source, new RegExp(`variant="after"\\s+enabled=\\{Boolean\\(${name}\\.is_confirmed\\)\\}`), `${file} 오른쪽(최종 글)`);
        assert.match(source, /variant=\{presentationVersion === 'original' \? 'before' : 'after'\}\s+enabled=\{Boolean\([^}]*is_confirmed/, `${file} 크게 보기`);
    }
});

test('바뀐 자리가 없거나 너무 긴 글은 칠하지 않고 그대로 보여 준다', async () => {
    const component = await readFile('src/modules/writing/review/WritingChangeHighlight.jsx', 'utf8');
    // 줄바꿈만 바뀐 글에 `바뀐 곳 0군데` 안내와 빈칸 형광펜이 그려졌었다(2026-09-26 시험 화면에서 발견).
    assert.match(component, /if \(!diff \|\| diff\.changeCount === 0\) return/);
    assert.match(component, /enabled \? diffWritingText\(before, after\) : null/, '승인 전에는 비교를 계산하지 않습니다.');
});

test('형광펜 색은 토큰으로만 칠한다', async () => {
    const [css, tokens] = await Promise.all([
        readFile('src/modules/writing/review/writingChangeHighlight.css', 'utf8'),
        readFile('src/styles/design-system.css', 'utf8')
    ]);
    assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
    for (const token of ['--ui-highlight', '--ui-highlight-ink', '--ui-removed-ink']) {
        assert.match(tokens, new RegExp(`${token}:`), `${token} 토큰이 없습니다.`);
        assert.match(css, new RegExp(`var\\(${token}\\)`));
    }
});
