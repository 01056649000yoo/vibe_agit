import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * 우리 반 스크린 `오늘 현황`의 자율 글(일기·독서록)은 제출과 선생님 확인을 따로 보인다(2026-09-30 선생님 요청).
 * 20261139 이후 자율 글의 완료 기록은 교사가 확인할 때 생겨, 예전 카드는 확인된 것만 세면서 "제출"이라 적었다.
 */

const widget = readFileSync('src/modules/tool/class-board/widgets/writing-status/WritingStatusWidget.jsx', 'utf8');
const migration = readFileSync('supabase/migrations/20261359_class_board_status_self_submitted.sql', 'utf8');

test('서버는 오늘 제출(학생·편)을 교사 확인과 따로 돌려주고, 20초 조회가 표를 훑지 않게 인덱스를 둔다', () => {
    for (const type of ['diary', 'reading_log']) {
        assert.match(migration, new RegExp(`post\\.self_writing_type = '${type}'\\s*\\n\\s*AND post\\.first_submitted_at >= v_today_start`));
    }
    assert.equal((migration.match(/'submittedStudentCount', \(/g) || []).length, 2);
    assert.equal((migration.match(/'submittedCount', \(/g) || []).length, 2);
    // 교사 확인(기존 값)은 뜻 그대로 — 완료 기록으로 센다.
    assert.match(migration, /'completedStudentCount', \([\s\S]*?claim\.reward_kind = 'completion'/);
    assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_student_posts_self_first_submitted\s*\n\s*ON public\.student_posts \(class_id, self_writing_type, first_submitted_at\)\s*\n\s*WHERE writing_context = 'self' AND is_submitted IS TRUE;/);
});

test('카드는 제출 줄과 선생님 확인 줄을 따로 그리고, 옛 서버면 확인 줄만 그린다', () => {
    const card = widget.slice(widget.indexOf('const DailyCard'), widget.indexOf('/** 칭호 이름은'));
    assert.match(card, /hasSubmitted = Number\.isFinite\(value\.submittedStudentCount\)/);
    assert.match(card, /hasSubmitted \? \([\s\S]*is-submitted[\s\S]*<span>제출<\/span>[\s\S]*value\.submittedCount/);
    assert.match(card, /is-confirmed[\s\S]*<span>선생님 확인<\/span>[\s\S]*value\.submissionCount/);
    assert.doesNotMatch(card, /오늘 \{value\.submissionCount \|\| 0\}편 제출/, '확인된 편수를 "제출"이라 적지 않는다');
});
