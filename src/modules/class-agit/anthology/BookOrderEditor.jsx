import { Fragment, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import Button from '../../../components/common/Button.jsx';
import { BOOK_PAGE_LAYOUTS, getBookPageLayout } from '../designs.js';
import { sortBookItems } from './contract.js';
import { bookItemGroupLabel, bookItemNeedsReview, findBookItems, moveBookItem, parseOrderNumber } from './orderModel.js';

/*
 * 4단계 · 목차 정하기.
 *
 * 2026-09-15 "차례를 수정하는 화면이 불편하다. 목차를 더 직관적으로 보고 쉽게 편집할 수 있게."
 * 전에는 3단계(작품 담기) 아래에 차례가 붙어 있었고, 한 줄이 136px·단추 여섯에 100편이 680px 상자 안에서
 * 따로 스크롤됐다 — 상자 끝에서 휠이 넘치면 화면 전체가 내려갔다. ↑↓ 는 한 칸씩만 움직였다.
 *
 * 지금은
 *   · 한 편이 한 줄(번호·제목·지은이·주제). 목록은 화면 스크롤을 그대로 쓴다(안쪽 상자 없음).
 *   · 직접 정한 순서에서는 ≡ 손잡이를 끌어 놓는다(터치 포함). 학생별·주제별로 묶으면 묶음 제목이 줄 사이에 선다.
 *   · 멀리 옮길 때는 ⋯ 메뉴의 `N번으로 옮기기`·`맨 위로`·`맨 아래로`. ↑↓ 는 그대로 한 칸.
 *   · 제목·이름으로 찾기. 찾는 동안은 끌기를 끈다(보이는 순서와 실제 순서가 달라 헷갈린다).
 *   · 읽기·원글 재확인·초안에서 빼기·수록 철회는 ⋯ 메뉴 안이다. 한 줄에 단추를 늘어놓지 않는다.
 */

const GROUPINGS = [
    { id: 'custom', label: '직접 정한 순서' },
    { id: 'author', label: '학생별' },
    { id: 'topic', label: '주제별' },
];

function RowMenu({ item, index, count, locked, busy, dirty, onRead, onRefresh, onMoveTo, onRemove, onWithdraw }) {
    const details = useRef(null);
    const [target, setTarget] = useState('');
    const close = () => { if (details.current) details.current.open = false; };
    const run = (task) => () => { close(); task(); };
    const jump = (event) => {
        event.preventDefault();
        const to = parseOrderNumber(target, count);
        if (to === null) return;
        close(); setTarget(''); onMoveTo(index, to);
    };
    return <details ref={details} className="book-order__menu">
        <summary aria-label={`${item.title} 더 보기`} title="더 보기">⋯</summary>
        <div className="book-order__menu-sheet" role="group" aria-label={`${item.title} 작업`}>
            <form className="book-order__jump" onSubmit={jump}>
                <label>번호로 옮기기<input type="number" inputMode="numeric" min={1} max={count} value={target} disabled={locked}
                    placeholder={`1~${count}`} onChange={(event) => setTarget(event.target.value)} /></label>
                <Button variant="outline" size="sm" type="submit" disabled={locked || parseOrderNumber(target, count) === null}>옮기기</Button>
            </form>
            <Button variant="ghost" size="sm" type="button" disabled={locked || index === 0} onClick={run(() => onMoveTo(index, 0))}>맨 위로</Button>
            <Button variant="ghost" size="sm" type="button" disabled={locked || index === count - 1} onClick={run(() => onMoveTo(index, count - 1))}>맨 아래로</Button>
            <Button variant="ghost" size="sm" type="button" onClick={run(() => onRead(item))}>읽기</Button>
            <Button variant="ghost" size="sm" type="button" disabled={locked || !item.sourceId} onClick={run(() => onRefresh(item))}>원글 재확인</Button>
            <Button variant="ghost" size="sm" type="button" disabled={locked} onClick={run(() => onRemove(index))}>초안에서 빼기</Button>
            {item.itemId && <Button variant="ghost" size="sm" type="button" disabled={busy || dirty || item.revoked} onClick={run(() => onWithdraw(item))}>수록 철회</Button>}
        </div>
    </details>;
}

function RowBody({ item, index, count, locked, draggable, dragControls, onStep, onRead, hideAuthor = false, ...menu }) {
    return <>
        {draggable
            ? <button type="button" className="book-order__handle" aria-label={`${item.title} 끌어서 옮기기`} title="끌어서 옮기기"
                disabled={locked} onPointerDown={(event) => { event.preventDefault(); dragControls.start(event); }}>≡</button>
            : <span className="book-order__handle is-off" aria-hidden="true">·</span>}
        <span className="book-order__number">{index + 1}</span>
        <button type="button" className="book-order__title" onClick={() => onRead(item)} title="읽기">
            <strong>{item.title}</strong>
            <small>{hideAuthor ? item.group : `${item.author}${item.group ? ` · ${item.group}` : ''}`}</small>
        </button>
        {bookItemNeedsReview(item) && <span className="book-order__flag class-agit-error">원글 재확인 필요</span>}
        <span className="book-order__steps">
            <Button variant="outline" type="button" size="sm" aria-label={`${item.title} 위로`} disabled={locked || index === 0} onClick={() => onStep(index, -1)}>↑</Button>
            <Button variant="outline" type="button" size="sm" aria-label={`${item.title} 아래로`} disabled={locked || index === count - 1} onClick={() => onStep(index, 1)}>↓</Button>
        </span>
        <RowMenu item={item} index={index} count={count} locked={locked} onRead={onRead} {...menu} />
    </>;
}

/* 끌어서 옮기는 줄. 손잡이를 잡았을 때만 끌린다 — 줄 전체를 잡게 하면 단추를 누르다 끌린다. */
function DraggableRow({ item, ...rest }) {
    const dragControls = useDragControls();
    return <Reorder.Item as="li" className="book-order__row" value={item} dragListener={false} dragControls={dragControls} whileDrag={{ scale: 1.01, boxShadow: '0 8px 20px rgba(0,0,0,.15)' }}>
        <RowBody item={item} draggable dragControls={dragControls} {...rest} />
    </Reorder.Item>;
}

export default function BookOrderEditor({ book, locked, busy, dirty, onEdit, onRead, onRefresh, onWithdraw }) {
    const [query, setQuery] = useState('');
    const items = book.items;
    const personal = book.book_type === 'personal';
    const count = items.length;
    const shown = findBookItems(items, query);
    const filtering = query.trim() !== '';
    // 끌기는 "지금 보이는 순서 = 실제 순서" 일 때만 뜻이 있다.
    const draggable = book.grouping === 'custom' && !filtering && !locked;
    const setOrder = (next) => onEdit({ ...book, grouping: 'custom', items: next });
    const moveTo = (from, to) => setOrder(moveBookItem(items, from, to));
    const step = (index, delta) => moveTo(index, index + delta);
    const remove = (index) => onEdit({ ...book, items: items.filter((_, i) => i !== index) });
    const rowProps = { count, locked, busy, dirty, hideAuthor: personal, onStep: step, onMoveTo: moveTo, onRead, onRefresh, onRemove: remove, onWithdraw };

    return <section className="book-order" aria-label="목차 정하기">
        <div className="book-order__toolbar">
            <label>작품 묶기<select value={book.grouping} disabled={locked} onChange={(event) => onEdit({ ...book, grouping: event.target.value, items: sortBookItems(items, event.target.value) })}>
                {GROUPINGS.filter((entry) => !personal || entry.id !== 'author').map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select></label>
            <label>쪽 배치<select value={getBookPageLayout(book.page_layout).id} disabled={locked} onChange={(event) => onEdit({ ...book, page_layout: event.target.value })}>
                {BOOK_PAGE_LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
            </select></label>
            <label className="book-order__search">찾기<input value={query} maxLength={80} placeholder={personal ? '제목 · 주제' : '제목 · 학생 이름 · 주제'} onChange={(event) => setQuery(event.target.value)} /></label>
            <span className="book-order__count">{filtering ? `${shown.length}편 찾음 · ` : ''}차례 {count}편</span>
        </div>
        <p className="anthology-hint">{getBookPageLayout(book.page_layout).hint}{' '}
            {book.grouping === 'custom' ? '≡ 를 끌어 놓거나 ↑↓, ⋯ 메뉴의 번호로 옮기기로 순서를 정합니다.' : `${GROUPINGS.find((entry) => entry.id === book.grouping)?.label}로 묶여 있습니다. 한 편을 옮기면 직접 정한 순서로 바뀝니다.`}</p>

        {count === 0 && <p className="class-agit-empty">아직 담은 작품이 없습니다. 3단계에서 학생 글이나 전시 작품을 담아 주세요.</p>}
        {count > 0 && filtering && !shown.length && <p className="class-agit-empty">이 말이 들어간 제목·이름·주제가 없습니다.</p>}

        {draggable
            ? <Reorder.Group as="ol" axis="y" className="book-order__list" values={items} onReorder={setOrder}>
                {items.map((item, index) => <DraggableRow key={item.itemId || item.sourceId} item={item} index={index} {...rowProps} />)}
            </Reorder.Group>
            : <ol className="book-order__list">
                {shown.map(({ item, index }, at) => {
                    const label = bookItemGroupLabel(item, book.grouping);
                    const previous = at > 0 ? bookItemGroupLabel(shown[at - 1].item, book.grouping) : null;
                    return <Fragment key={item.itemId || item.sourceId}>
                        {label !== null && label !== previous && <li className="book-order__group" aria-hidden="true">{label}</li>}
                        <li className="book-order__row"><RowBody item={item} index={index} {...rowProps} /></li>
                    </Fragment>;
                })}
            </ol>}
    </section>;
}
