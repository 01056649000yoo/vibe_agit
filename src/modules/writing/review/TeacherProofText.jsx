import { useMemo } from 'react';
import { buildProofMarks, PROOF_MARK_LEGEND } from './proofMarks.js';
import './teacherEditRounds.css';

/**
 * 빨간 펜 교정지 한 장(2026-09-30). 고치기 전 학생 글 위에 선생님이 고친 것을 교정 부호로 얹는다.
 *   - 고치기: 틀린 말에 빨간 줄, 그 위에 고친 말     - 넣기: ∧ 위에 넣은 말
 *   - 지우기: 빨간 줄                                - 띄어 쓰기 ∨ · 붙여 쓰기 ⌒
 * 고친 말은 `<ruby>` 로 얹어 줄이 바뀌어도 제자리를 지킨다. 글자 크기는 감싸는 자리의 것을 물려받는다.
 */
const TeacherProofText = ({ before, after, showLegend = true }) => {
    const proof = useMemo(() => buildProofMarks(before, after), [before, after]);
    if (proof.changeCount === 0) return <span className="teacher-proof__text">{after || before}</span>;
    const used = new Set(proof.segments.map((segment) => segment.kind));
    return (
        <>
            <span className="teacher-proof__text">
                {proof.segments.map((segment, index) => {
                    // 조각 순서는 글마다 고정이라 순번 키로 충분하다.
                    const key = `${index}-${segment.kind}`;
                    switch (segment.kind) {
                        case 'replace':
                            return (
                                <ruby key={key} className="teacher-proof__replace">
                                    <del>{segment.from}</del>
                                    <rt>{segment.to}</rt>
                                </ruby>
                            );
                        case 'insert':
                            return (
                                <ruby key={key} className="teacher-proof__insert">
                                    <span className="teacher-proof__mark" aria-hidden="true">∧</span>
                                    <rt><ins>{segment.text}</ins></rt>
                                </ruby>
                            );
                        case 'delete':
                            return <del key={key} className="teacher-proof__delete">{segment.text}</del>;
                        case 'split':
                            return <span key={key} className="teacher-proof__mark" title="띄어 쓰기">∨</span>;
                        case 'join':
                            return <span key={key} className="teacher-proof__mark" title="붙여 쓰기">⌒</span>;
                        default:
                            return <span key={key}>{segment.text}</span>;
                    }
                })}
            </span>
            {showLegend ? (
                <span className="teacher-proof__legend">
                    {PROOF_MARK_LEGEND.filter((item) => used.has(item.kind)).map((item) => (
                        <span key={item.kind}><b>{item.mark}</b> {item.label}</span>
                    ))}
                </span>
            ) : null}
        </>
    );
};

export default TeacherProofText;
