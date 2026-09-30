import React, { useState } from 'react';
import TeacherEditRounds from '../modules/writing/review/TeacherEditRounds';
import WritingVersionSwitch, { WRITING_VIEW, useWritingVersion } from '../modules/writing/review/WritingVersionSwitch';

/*
 * 선생님 교정지 미리보기(2026-09-30). 빨간 펜 교정 부호와 회차별 좌우 비교를 DB 없이 띄운다.
 * 회차 두 개(1회차는 다시 낸 글이 있음, 2회차는 아직)와 회차 하나, 좁은 화면을 본다.
 */
const ROUNDS = [
    {
        round: 1,
        edited_at: '2026-09-28T02:00:00Z',
        base_title: '운동회',
        base_content: '오늘은 운동회 날이였다. 이어달리기를 할수 있어서 신났다.\n우리 반이 이겼 다. 그래서 그래서 기뻤다.',
        edited_title: '우리 반 운동회',
        edited_content: '오늘은 운동회 날이었다. 이어달리기를 할 수 있어서 정말 신났다.\n우리 반이 이겼다. 그래서 기뻤다.',
        next_content: '오늘은 운동회 날이었다. 이어달리기를 할 수 있어서 정말 신났다.\n우리 반이 끝까지 힘을 모아 이겼다. 그래서 친구들과 얼싸안고 기뻐했다.'
    },
    {
        round: 2,
        edited_at: '2026-09-30T01:00:00Z',
        base_title: '우리 반 운동회',
        base_content: '오늘은 운동회 날이었다. 이어달리기를 할 수 있어서 정말 신났다.\n우리 반이 끝까지 힘을 모아 이겼다. 그래서 친구들과 얼싸안고 기뻐했다.',
        edited_title: '우리 반 운동회',
        edited_content: '오늘은 운동회 날이었다. 이어달리기를 할 수 있어서 정말 신났다.\n우리 반이 끝까지 힘을 모아 이겼다. 친구들과 얼싸안고 기뻐했다. 내년에도 이기고 싶다.',
        next_content: null
    }
];

export default function TeacherEditRoundsPreview() {
    const [count, setCount] = useState(2);
    const rounds = ROUNDS.slice(0, count);
    const last = rounds[rounds.length - 1];
    const version = useWritingVersion({
        postId: 'preview-teacher-edits', before: ROUNDS[0].base_content, after: last.edited_content,
        approved: false, teacherEditRounds: count
    });
    return (
        <div style={{ padding: 16, background: 'var(--ui-page)', display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button type="button" aria-pressed={count === 2} onClick={() => setCount(2)}>두 번 고쳐 줌</button>
                <button type="button" aria-pressed={count === 1} onClick={() => setCount(1)}>한 번 고쳐 줌</button>
            </div>
            <section style={{ padding: 20, borderRadius: 16, background: 'var(--ui-surface)', border: '1px solid var(--ui-border)' }}>
                <WritingVersionSwitch {...version} onChange={version.setView} />
                {version.view === WRITING_VIEW.TEACHER
                    ? <TeacherEditRounds key={count} rounds={rounds} />
                    : <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{version.view === WRITING_VIEW.FINAL ? last.edited_content : ROUNDS[0].base_content}</div>}
            </section>
        </div>
    );
}
