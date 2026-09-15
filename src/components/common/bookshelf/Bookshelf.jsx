import React from 'react';
import { SHELF_ROW_MIN_HEIGHT, SHELF_ROW_PADDING_TOP } from './shelfBookLayout';

/*
 * 나무 책장 한 칸 — 틀·책 꽂는 줄·아래 판자.
 *
 * 세 화면(학생 내 서재, 선생님의 학생 아지트 보기, 친구 공개 서재)이 같은 책장을 쓴다.
 * 책(ShelfBook)은 children 으로 꽂는다. 책이 없거나 읽는 중이면 그 안내를 children 으로 넘긴다 —
 * 책장은 그것이 책인지 안내인지 모른다. `mode="list"` 면 같은 틀 안에 제목 목록을 세로로 쌓는다.
 */

const FRAME_STYLE = {
    margin: 0, overflow: 'hidden', border: '8px solid #85502E', borderBottom: 0,
    borderRadius: '8px 8px 0 0', background: 'linear-gradient(180deg,#E8CFAC 0%,#D9B582 100%)',
    boxShadow: 'inset 0 8px 16px rgba(67,37,18,.2), inset 5px 0 6px rgba(67,37,18,.12), inset -5px 0 6px rgba(67,37,18,.12)'
};

const ROW_STYLE = {
    minHeight: `${SHELF_ROW_MIN_HEIGHT}px`, display: 'flex', alignItems: 'flex-end', gap: '5px',
    padding: `${SHELF_ROW_PADDING_TOP}px 12px 0`, overflowX: 'auto', overscrollBehaviorX: 'contain',
    scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box'
};

const LIST_STYLE = {
    minHeight: '182px', maxHeight: '282px', display: 'flex', flexDirection: 'column', gap: '6px',
    padding: '10px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box'
};

const BOARD_STYLE = {
    height: '17px', borderTop: '2px solid #B97943', borderBottom: '4px solid #552C18',
    background: 'linear-gradient(180deg,#A96838 0%,#7E4525 58%,#60331C 100%)',
    boxShadow: '0 -3px 6px rgba(57,29,14,.2), 0 5px 8px rgba(57,29,14,.28)'
};

/** 책장 안 가운데에 띄우는 안내(읽는 중·책 없음). 책 대신 children 으로 꽂는다. */
export const BookshelfNotice = ({ icon, children }) => (
    <div style={{ alignSelf: 'center', width: '100%', margin: 'auto 0', textAlign: 'center', color: '#76563D' }}>
        {icon && <span aria-hidden="true" style={{ display: 'block', marginBottom: '6px', fontSize: '2rem' }}>{icon}</span>}
        <span style={{ fontSize: 'var(--ui-text-xs)', fontWeight: 850 }}>{children}</span>
    </div>
);

const Bookshelf = ({ id, ariaLabel, mode = 'books', hasItems = true, hint, style, children }) => (
    <div style={{ ...FRAME_STYLE, ...style }}>
        <div id={id} role="tabpanel" aria-label={ariaLabel}>
            <div role={hasItems ? 'list' : undefined} style={mode === 'books' ? ROW_STYLE : LIST_STYLE}>
                {children}
            </div>
        </div>
        <div aria-hidden="true" style={BOARD_STYLE} />
        {hint && (
            <p style={{
                margin: 0, padding: '7px 12px 8px', background: 'rgba(80,44,22,.88)', color: '#F8E4C8',
                fontSize: 'var(--ui-text-xs)', fontWeight: 800, textAlign: 'center'
            }}>
                {hint}
            </p>
        )}
    </div>
);

export default Bookshelf;
