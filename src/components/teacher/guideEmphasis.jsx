import React from 'react';

/*
 * 안내서 글에 쓰는 강조 표기를 화면 글자로 바꾼다 — `**굵게**` 와 `` `버튼 이름` ``.
 *
 * 안내서 본문과 동행 패널이 **같은 원문을 읽어** 보여 주므로, 그리는 방법도 한 곳이어야
 * 한 쪽만 고쳐져 별표가 그대로 보이는 일이 없다.
 */
export const renderEmphasis = (text) => String(text ?? '')
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((piece, index) => {
        if (piece.startsWith('**') && piece.endsWith('**')) {
            return <strong key={index}>{piece.slice(2, -2)}</strong>;
        }
        if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) {
            return <code key={index} className="teacher-guide__key">{piece.slice(1, -1)}</code>;
        }
        return <React.Fragment key={index}>{piece}</React.Fragment>;
    });

export default renderEmphasis;
