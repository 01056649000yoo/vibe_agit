import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
    SHELF_ROW_GAP,
    SHELF_ROW_MIN_HEIGHT,
    SHELF_ROW_PADDING_TOP,
    SHELF_ROW_PADDING_X,
    shelfPageIsFull,
    shelfPages
} from './shelfBookLayout';

/*
 * 나무 책장 한 칸 — 틀·책 꽂는 줄·아래 판자·넘기기 단추.
 *
 * 세 화면(학생 내 서재, 선생님의 학생 아지트 보기, 친구 공개 서재)이 같은 책장을 쓴다.
 *
 * 책은 `items` + `renderItem` 으로 꽂는다. 한 칸에는 그 책장 폭에 들어가는 만큼 꽂고(좁은 폰은 4~5권,
 * 넓은 선생님 화면은 15권 남짓), 넘치면 다음 칸으로 **옆으로 미끄러져** 넘어간다(2026-09-15 요청).
 * 옆으로 길게 스크롤하던 방식은 40~60권이 되면 찾기 힘들었다. 손가락으로 밀어도, 단추를 눌러도 넘어간다.
 * 꽉 찬 칸은 남는 몇 px 를 책 사이에 나눠 오른쪽이 비지 않는다("빈칸 없도록").
 *
 * 책이 없거나 읽는 중이면 그 안내를 children 으로 넘긴다 — 책장은 그것이 무엇인지 모른다.
 * `mode="list"` 면 같은 틀 안에 제목 목록을 세로로 쌓는다(넘기기 없음).
 */

const FRAME_STYLE = {
    margin: 0, overflow: 'hidden', borderWidth: '8px 8px 0', borderStyle: 'solid', borderColor: '#85502E',
    borderRadius: '8px 8px 0 0', background: 'linear-gradient(180deg,#E8CFAC 0%,#D9B582 100%)',
    boxShadow: 'inset 0 8px 16px rgba(67,37,18,.2), inset 5px 0 6px rgba(67,37,18,.12), inset -5px 0 6px rgba(67,37,18,.12)'
};

const ROW_STYLE = {
    minHeight: `${SHELF_ROW_MIN_HEIGHT}px`, display: 'flex', alignItems: 'flex-end', gap: `${SHELF_ROW_GAP}px`,
    padding: `${SHELF_ROW_PADDING_TOP}px ${SHELF_ROW_PADDING_X}px 0`, boxSizing: 'border-box'
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

const NAV_STYLE = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    padding: '6px 10px', background: 'rgba(80,44,22,.88)', color: '#F8E4C8'
};

const NAV_BUTTON_STYLE = {
    minHeight: '34px', padding: '6px 12px', border: '1px solid rgba(255,228,190,.35)', borderRadius: '10px',
    background: 'rgba(255,248,231,.12)', color: '#FFF3DD', fontFamily: 'inherit',
    fontSize: 'var(--ui-text-xs)', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap'
};

/** 손가락으로 이만큼 밀면 넘긴다. 책을 누르는 손떨림(몇 px)과는 구분된다. */
const SWIPE_PX = 48;

/** 책장 안 가운데에 띄우는 안내(읽는 중·책 없음). 책 대신 children 으로 꽂는다. */
export const BookshelfNotice = ({ icon, children }) => (
    <div style={{ alignSelf: 'center', width: '100%', margin: 'auto 0', textAlign: 'center', color: '#76563D' }}>
        {icon && <span aria-hidden="true" style={{ display: 'block', marginBottom: '6px', fontSize: '2rem' }}>{icon}</span>}
        <span style={{ fontSize: 'var(--ui-text-xs)', fontWeight: 850 }}>{children}</span>
    </div>
);

/** 칸을 옆으로 넘기는 줄. 책 폭을 재려면 줄의 폭을 알아야 해서 부품을 따로 뒀다. */
const PagedRow = ({ items, renderItem, itemWidth, ariaLabel }) => {
    const rowRef = useRef(null);
    const [width, setWidth] = useState(0);
    // 몇 번째 칸인지는 "어느 책들의" 몇 번째인지와 함께 둔다. 탭을 바꿔 책들이 달라지면 저절로 첫 칸이다.
    const [pageState, setPageState] = useState({ items, page: 0 });
    const page = pageState.items === items ? pageState.page : 0;
    const setPage = useCallback((next) => setPageState({ items, page: next }), [items]);
    const swipe = useRef({ startX: null, swiped: false });

    useLayoutEffect(() => {
        const element = rowRef.current;
        if (!element) return undefined;
        const measure = () => setWidth(element.clientWidth);
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const pages = useMemo(() => shelfPages(items, width, itemWidth), [items, width, itemWidth]);
    const pageCount = pages.length;
    const current = Math.min(page, Math.max(0, pageCount - 1));

    const goTo = useCallback((next) => setPage(Math.max(0, Math.min(pageCount - 1, next))), [pageCount, setPage]);

    const onPointerDown = (event) => { swipe.current = { startX: event.clientX, swiped: false }; };
    const onPointerUp = (event) => {
        const { startX } = swipe.current;
        if (startX === null) return;
        const dx = event.clientX - startX;
        swipe.current.startX = null;
        if (Math.abs(dx) < SWIPE_PX) return;
        swipe.current.swiped = true;
        goTo(current + (dx < 0 ? 1 : -1));
    };
    // 밀고 난 손가락이 책 위에서 떨어지면 그 책이 열린다. 민 것은 누른 것이 아니다.
    const onClickCapture = (event) => {
        if (!swipe.current.swiped) return;
        swipe.current.swiped = false;
        event.stopPropagation();
        event.preventDefault();
    };

    return (
        <>
            <div
                ref={rowRef}
                role="list"
                aria-label={ariaLabel}
                style={{ overflow: 'hidden', touchAction: 'pan-y' }}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={() => { swipe.current.startX = null; }}
                onClickCapture={onClickCapture}
            >
                <motion.div
                    style={{ display: 'flex', width: '100%' }}
                    animate={{ x: `${-current * 100}%` }}
                    transition={{ type: 'spring', stiffness: 220, damping: 30, mass: 0.9 }}
                >
                    {pages.map((pageItems, index) => (
                        <div
                            key={index}
                            role="group"
                            aria-label={`${index + 1}번째 책장`}
                            aria-hidden={index !== current}
                            // 보이지 않는 칸의 책은 Tab 으로도 못 간다.
                            inert={index !== current}
                            style={{
                                ...ROW_STYLE, flex: '0 0 100%', minWidth: 0,
                                // 마지막이 아닌 칸은 다음 책이 안 들어가서 닫힌 칸이니 꽉 찬 것이다. 마지막 칸만 따로 본다.
                                justifyContent: index < pageCount - 1 || shelfPageIsFull(pageItems, width, itemWidth) ? 'space-between' : 'flex-start'
                            }}
                        >
                            {pageItems.map(renderItem)}
                        </div>
                    ))}
                </motion.div>
            </div>
            <div aria-hidden="true" style={BOARD_STYLE} />
            {pageCount > 1 && (
                <div style={NAV_STYLE}>
                    <button type="button" style={{ ...NAV_BUTTON_STYLE, visibility: current > 0 ? 'visible' : 'hidden' }} onClick={() => goTo(current - 1)}>
                        ‹ 앞 책장
                    </button>
                    <span aria-live="polite" style={{ fontSize: 'var(--ui-text-xs)', fontWeight: 900 }}>
                        {current + 1} / {pageCount} 책장
                    </span>
                    <button type="button" style={{ ...NAV_BUTTON_STYLE, visibility: current < pageCount - 1 ? 'visible' : 'hidden' }} onClick={() => goTo(current + 1)}>
                        다음 책장 ›
                    </button>
                </div>
            )}
        </>
    );
};

/**
 * @param items      꽂을 글들. 있으면 칸으로 나눠 넘긴다
 * @param renderItem 글 하나를 ShelfBook 으로 만드는 함수
 * @param itemWidth  글 하나의 책 폭(px). 안 주면 제목 규칙으로
 * @param children   책 대신 보여 줄 것(읽는 중·빈 책장·제목 목록)
 */
const Bookshelf = ({ id, ariaLabel, mode = 'books', items, renderItem, itemWidth, style, children }) => {
    const paged = mode === 'books' && Array.isArray(items) && items.length > 0 && typeof renderItem === 'function';
    return (
        <div style={{ ...FRAME_STYLE, ...style }}>
            <div id={id} role="tabpanel" aria-label={ariaLabel}>
                {paged ? (
                    <PagedRow items={items} renderItem={renderItem} itemWidth={itemWidth} ariaLabel={ariaLabel} />
                ) : (
                    <>
                        <div style={mode === 'books' ? ROW_STYLE : LIST_STYLE}>{children}</div>
                        <div aria-hidden="true" style={BOARD_STYLE} />
                    </>
                )}
            </div>
        </div>
    );
};

export default Bookshelf;
