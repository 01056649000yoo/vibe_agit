/*
 * 목차(차례) 편집의 순수 규칙. 화면(.jsx) 밖에 둔 이유는 `node --test` 가 직접 부르기 위해서다.
 *
 * 2026-09-15 "차례를 수정하는 화면이 불편하다" — 한 줄에 단추가 여섯이고 ↑↓ 로 한 칸씩만 움직였다.
 * 100편이면 90번을 5번으로 올리는 데 85번을 눌러야 했다. 끌어서 놓기·번호로 옮기기·맨 위/아래를 둔다.
 */

/** 한 편을 from 자리에서 to 자리로 옮긴 새 배열. 자리는 0부터이고 범위 밖이면 끝으로 붙인다. 같은 자리면 그대로. */
export const moveBookItem = (items, from, to) => {
    const list = Array.isArray(items) ? [...items] : [];
    if (from < 0 || from >= list.length) return list;
    const target = Math.max(0, Math.min(list.length - 1, Math.floor(to)));
    if (target === from) return list;
    const [item] = list.splice(from, 1);
    list.splice(target, 0, item);
    return list;
};

/** 사람이 적는 번호(1부터)를 자리로. 숫자가 아니거나 비었으면 null. */
export const parseOrderNumber = (value, length) => {
    const number = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(number) || number < 1) return null;
    return Math.min(number, Math.max(1, length)) - 1;
};

/** 묶기 기준에 따른 묶음 이름. 직접 정한 순서에는 묶음이 없다. */
export const bookItemGroupLabel = (item, grouping) => {
    if (grouping === 'author') return item?.author || '지은이 없음';
    if (grouping === 'topic') return item?.group || '주제 없음';
    return null;
};

/** 제목·지은이·주제에서 찾는다. 빈 검색어면 모두. 자리(index)는 전체 순서 기준이라 옮기기에 그대로 쓴다. */
export const findBookItems = (items, query) => {
    const needle = String(query ?? '').trim().toLocaleLowerCase('ko-KR');
    const list = Array.isArray(items) ? items : [];
    return list.map((item, index) => ({ item, index })).filter(({ item }) => !needle
        || `${item.title || ''} ${item.author || ''} ${item.group || ''}`.toLocaleLowerCase('ko-KR').includes(needle));
};

/** 원글을 다시 봐야 하는 작품인가 — 바뀌었거나, 사라졌거나, 철회됐다. */
export const bookItemNeedsReview = (item) => Boolean(item?.sourceChanged || item?.unavailable || item?.revoked);
