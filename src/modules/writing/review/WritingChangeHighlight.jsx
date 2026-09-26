import { useMemo } from 'react';
import { diffWritingText, segmentsForView } from './writingDiff.js';
import './writingChangeHighlight.css';

/**
 * 승인된 글의 처음 글 → 고친 글 비교(2026-09-26).
 *
 * `variant`
 *   - `merged`: 한 글 안에 형광펜(새로 쓰거나 고친 곳)과 가운데 줄(지운 곳)을 함께 — 전환형 비교 화면
 *   - `after` : 고친 글만, 바뀐 곳에 형광펜 — 나란히 보기의 오른쪽(최종 글)
 *   - `before`: 처음 글만, 지운 곳에 가운데 줄 — 나란히 보기의 왼쪽(처음 글)
 *
 * `enabled` 가 거짓(아직 승인 전)이면 지금까지처럼 그 글을 그대로 보여 준다 — 형광펜은 승인된 글에만 칠한다.
 * 글자 크기·줄 간격은 감싸는 자리의 것을 그대로 물려받는다(화면마다 글 모양이 달라서).
 */
const WritingChangeHighlight = ({ before, after, teacherText = null, variant = 'merged', enabled = true, showLegend = true, emptyText = '' }) => {
    // `teacherText`(교사 수정본)를 주면 선생님이 고쳐 준 곳은 하늘색 형광펜으로 따로 칠한다.
    const diff = useMemo(
        () => (enabled ? diffWritingText(before, after, { teacherText }) : null),
        [enabled, before, after, teacherText]
    );
    const plain = variant === 'before' ? before : after;
    // 너무 긴 글(`none`)·같은 글·줄바꿈만 바뀐 글(바뀐 자리 0)은 칠하지 않고 그대로 보여 준다.
    if (!diff || diff.changeCount === 0) return <>{plain || emptyText}</>;

    const segments = segmentsForView(diff.segments, variant);
    const teacherNote = diff.teacherChangeCount > 0 && variant !== 'before' ? ' · 하늘색: 선생님이 고쳐 준 곳' : '';
    const legend = variant === 'before'
        ? '가운데 줄: 고치면서 지운 곳'
        : variant === 'after'
            ? `형광펜: 새로 쓰거나 고친 곳${teacherNote}`
            : `형광펜: 새로 쓰거나 고친 곳${teacherNote} · 가운데 줄: 지운 곳`;

    return (
        <>
            {showLegend ? (
                <span className="writing-change__legend">
                    ✍️ 바뀐 곳 {diff.changeCount}군데 — {legend}
                </span>
            ) : null}
            <span className="writing-change__text">
                {segments.map((segment, index) => {
                    // 조각 순서는 글마다 고정이라 순번 키로 충분하다.
                    const key = `${index}-${segment.type}`;
                    if (segment.type === 'added') return <mark key={key} className="writing-change__added">{segment.text}</mark>;
                    if (segment.type === 'teacher') return <mark key={key} className="writing-change__teacher" title="선생님이 고쳐 준 곳">{segment.text}</mark>;
                    if (segment.type === 'removed') return <del key={key} className="writing-change__removed">{segment.text}</del>;
                    return <span key={key}>{segment.text}</span>;
                })}
            </span>
        </>
    );
};

export default WritingChangeHighlight;
