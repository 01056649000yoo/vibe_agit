/* eslint-disable security/detect-object-injection -- 조각 종류 이름은 이 파일 안에서 정한 두 값(student·teacher)뿐이다. */
import { useMemo } from 'react';
import { countAttributedChanges } from './writingAttribution.js';
import './writingChangeHighlight.css';

/**
 * 누가 고쳤는지 색으로 가른 비교 글(2026-10-20, 교사 글 자세히 보기의 `처음 글과 나란히`).
 * `items` 는 `attributeWritingChanges` 의 결과.
 *   - `before`: 처음 글. 고치며 지운 곳에 가운데 줄 — 학생이 지운 곳은 회색, 선생님이 지운 곳은 빨간색
 *   - `after` : 지금 글. 새로 쓰거나 고친 곳에 형광펜 — 학생은 노랑, 선생님은 빨강
 * 글자 크기·줄 간격은 감싸는 자리의 것을 물려받는다.
 */
const classOf = (item, variant) => {
    if (variant === 'before') return item.removedBy ? `del-${item.removedBy}` : '';
    return item.author === 'orig' ? '' : `mark-${item.author}`;
};

const WritingAttributedText = ({ items, variant = 'after', showLegend = true }) => {
    const counts = useMemo(() => countAttributedChanges(items), [items]);
    const pieces = useMemo(() => {
        const visible = items.filter((item) => (variant === 'before' ? item.author === 'orig' : !item.removedBy));
        const classes = visible.map((item) => classOf(item, variant));
        // 칠한 두 조각 사이가 공백뿐이면 그 공백도 같은 색으로 칠해 형광펜이 어절마다 끊기지 않게 한다(보여 줄 때만).
        return visible.map((item, index) => {
            const bridges = !classes[index] && /^\s+$/.test(item.text) && index > 0 && index < visible.length - 1
                && classes[index - 1] && classes[index - 1] === classes[index + 1];
            return { text: item.text, kind: bridges ? classes[index - 1] : classes[index] };
        });
    }, [items, variant]);

    const total = counts.student + counts.teacher;
    return (
        <>
            {showLegend && total > 0 ? (
                <span className="writing-change__legend">
                    ✍️ 바뀐 곳 {total}군데 —{' '}
                    {counts.student > 0 ? <><mark className="writing-attr__mark-student">학생이 고친 곳 {counts.student}</mark>{' '}</> : null}
                    {counts.teacher > 0 ? <><mark className="writing-attr__mark-teacher">선생님이 고친 곳 {counts.teacher}</mark>{' '}</> : null}
                    · 가운데 줄: 지운 곳{variant === 'before' ? '(색은 지운 사람)' : ' (처음 글 쪽에 보여요)'}
                </span>
            ) : null}
            <span className="writing-change__text">
                {pieces.map((piece, index) => {
                    // 조각 순서는 글마다 고정이라 순번 키로 충분하다.
                    const key = `${index}-${piece.kind || 'same'}`;
                    if (piece.kind.startsWith('mark-')) return <mark key={key} className={`writing-attr__${piece.kind}`}>{piece.text}</mark>;
                    if (piece.kind.startsWith('del-')) return <del key={key} className={`writing-attr__${piece.kind}`}>{piece.text}</del>;
                    return <span key={key}>{piece.text}</span>;
                })}
            </span>
        </>
    );
};

export default WritingAttributedText;
