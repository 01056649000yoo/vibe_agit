import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 2026-10-12 모두의 아지트 점검(Codex 독립 검토를 코드로 확인): 응답이 늦게 오면 다른 글·활동·반·문집에 붙던 것.
const read = (file) => readFile(`src/modules/community/neighbor-agit/${file}`, 'utf8');

test('교사 화면: 활동 공개 후보·글 상세는 요청 번호로 옛 응답을 버리고, 후보 조회 실패가 자동 반복되지 않는다', async () => {
    const teacher = await read('TeacherEntry.jsx');
    assert.match(teacher, /activityCandidatesRequestRef\.current === requestId\) setActivityCandidates/);
    assert.match(teacher, /postDetailRequestRef\.current === requestId\) setPostDetail/);
    assert.match(teacher, /postDetailRequestRef\.current \+= 1;\s*setPostDetail\(null\)/);
    assert.match(teacher, /!galleryCandidates && !galleryLoading && !galleryLoadFailed/);
});

test('학생 화면: 활동·문집·반을 바꾼 뒤 늦게 온 옛 응답을 버린다', async () => {
    const student = await read('StudentEntry.jsx');
    assert.match(student, /activityRequestRef\.current === requestId\) setActivityFeed/);
    assert.match(student, /requestedActivityId !== selectedActivityIdRef\.current/);
    const books = await read('books/StudentBooksPanel.jsx');
    assert.match(books, /openIdRef\.current !== sharedBookId\) return/);
    assert.match(books, /openIdRef\.current !== targetBookId\) return/);
    const gallery = await read('gallery/StudentGalleryPanel.jsx');
    assert.match(gallery, /galleryRequestRef\.current === requestId\) setGallery/);
});

test('탈퇴한 학급의 글·댓글은 학생이 댓글을 달 수 없고 교사 상세에도 나오지 않는다(20261397)', async () => {
    const sql = await readFile('supabase/migrations/20261397_neighbor_left_class_content_hardening.sql', 'utf8');
    assert.match(sql, /owner_membership\.class_id = v_shared\.class_id[\s\S]*owner_membership\.status = 'active'/);
    assert.match(sql, /membership\.status = 'active'\s*WHERE comment\.shared_post_id = p_shared_post_id/);
    assert.match(sql, /CASE WHEN shared\.status = 'published' THEN post\.title/);
});
