/**
 * 이어붙이기에서 새 작품이 쪽에 남으려면 그 쪽에 실려야 할 본문의 최소 몫.
 * 이보다 적게 실리면 그 작품은 통째로 다음 쪽에서 시작한다.
 */
export const ANTHOLOGY_MIN_BODY_RATIO = 0.3;

// The same measured DOM pages are used on screen and by the browser's selected paper size.
// No font shrinking; oversized paragraphs split at Unicode code point boundaries.
export function paginateAnthology(doc) {
    const source = doc.querySelector('#anthology-source');
    const output = doc.querySelector('#anthology-pages');
    output.replaceChildren();
    let count = 0;
    const page = (kind = '') => {
        if (++count > 1200) throw new Error('문집이 너무 깁니다. 여러 권으로 나눠 주세요.');
        const sheet = doc.createElement('section'); sheet.className = `anthology-page ${kind}`;
        const content = doc.createElement('div'); content.className = 'anthology-page-content'; sheet.append(content);
        const footer = doc.createElement('footer'); footer.className = 'anthology-page-number'; sheet.append(footer);
        output.append(sheet); return { sheet, content };
    };
    const fits = (node) => node.scrollHeight <= node.clientHeight + 1;
    /*
     * 담는 곳과 **재는 곳**이 다를 수 있다.
     *
     * 작품마다 새 쪽일 때는 둘이 같다. 이어붙이기일 때는 작품이 쪽 안의 제 상자에 담기므로,
     * 넘쳤는지는 **쪽 전체**를 재야 안다 — 상자만 재면 앞 작품이 차지한 자리를 못 본다.
     */
    const measureOf = (current) => current.measure || current.content;
    const flow = (blocks, start, continuation) => {
        let current = start();
        for (const original of blocks) {
            let block = original.cloneNode(true);
            while (block) {
                current.content.append(block);
                if (fits(measureOf(current))) break;
                block.remove();
                // Keep a paragraph/stanza whole when it fits a fresh page.
                // 이어붙이기에서 앞 작품이 이미 있는 쪽이면(`hasNeighbours`) 쪼개지 말고 다음 쪽으로 간다.
                if (current.content.childElementCount > current.fixed || current.hasNeighbours) { current = continuation(); continue; }
                const chars = Array.from(block.textContent);
                let lo = 0; let hi = chars.length;
                current.content.append(block);
                while (lo < hi) {
                    const mid = Math.ceil((lo + hi) / 2); block.textContent = chars.slice(0, mid).join('');
                    if (fits(measureOf(current))) lo = mid; else hi = mid - 1;
                }
                if (!lo && current.allowHeaderOnly) {
                    // 작은 판형의 긴 제목은 첫 쪽을 사용할 수 있다. 본문은 다음 쪽에서 시작한다.
                    block.remove();
                    if (!fits(measureOf(current))) throw new Error('작품 제목이 한 페이지를 넘습니다. 제목을 확인해 주세요.');
                    block = original.cloneNode(true); current = continuation(); continue;
                }
                if (!lo) throw new Error('표시할 수 없는 문집 내용이 있습니다. 제목과 본문을 확인해 주세요.');
                let cut = lo;
                for (let index = lo - 1; index >= lo * .75; index--) { if (/\s/u.test(Reflect.get(chars, index))) { cut = index + 1; break; } }
                block.textContent = chars.slice(0, cut).join('');
                const remaining = chars.slice(cut).join('');
                if (!remaining) break;
                block = original.cloneNode(false); block.textContent = remaining;
                current = continuation();
            }
        }
    };
    const cover = page('anthology-cover'); cover.sheet.dataset.design = source.querySelector('[data-cover]').dataset.design; cover.content.append(source.querySelector('[data-cover]').cloneNode(true));
    if (!fits(cover.content)) throw new Error('표지의 제목과 부제가 한 페이지를 넘습니다. 내용을 줄여 주세요.');
    const intro = source.querySelector('[data-introduction]');
    if (intro) flow([...intro.children], () => ({ ...page(), fixed: 0 }), () => ({ ...page(), fixed: 0 }));
    const tocStart = output.children.length;
    const tocRows = [...source.querySelectorAll('[data-toc-row]')];
    const tocPage = () => { const p = page('anthology-toc'); const h = doc.createElement('h1'); h.textContent = '차례'; p.content.append(h); return { ...p, fixed: 1 }; };
    flow(tocRows, tocPage, tocPage);
    const articles = [...source.querySelectorAll('.pdf-entry')];
    // 쪽 배치는 간지 유무로 추측하지 않는다. 간지 없는 이어붙이기도 같은 배치 엔진을 써야 한다.
    const dividers = new Map([...source.querySelectorAll('[data-divider]')]
        .map((node) => [Number(node.dataset.divider), node]));
    const continuous = source.dataset.layout === 'continuous';
    /*
     * 교사가 초안을 보고 "이 작품은 다음 쪽에서" 라고 정한 자리. 간지와 달리 쪽을 새로
     * 열기만 한다 — 목차는 다시 짤 때 저절로 맞춰지므로 따로 손댈 것이 없다.
     */
    const forcedBreaks = new Set([...source.querySelectorAll('[data-forced-break]')]
        .map((node) => Number(node.dataset.forcedBreak)));
    const pageNumberOf = (sheet) => [...output.children].indexOf(sheet) + 1;
    const setTocPage = (key, number) => {
        const row = [...output.querySelectorAll('[data-toc-row]')].find((item) => item.dataset.tocRow === String(key));
        if (row) row.querySelector('[data-page]').textContent = String(number);
        // 간지의 작품 목록도 같은 쪽번호를 쓴다 — 차례가 주제만 싣는 대신 여기서 찾는다.
        const dividerRow = [...output.querySelectorAll('[data-divider-row]')].find((item) => item.dataset.dividerRow === String(key));
        if (dividerRow) dividerRow.querySelector('[data-page]').textContent = String(number);
    };

    // 이어붙이기에서 지금 채우고 있는 쪽. 간지 뒤나 넘칠 때 새로 연다.
    let cursor = null;

    articles.forEach((article, index) => {
        const main = article.querySelector('main');
        let blocks;
        if (main.children.length) blocks = [...main.children].map((child) => { const copy = child.cloneNode(false); copy.textContent = child.textContent; return copy; });
        else blocks = main.textContent.split(/\n\s*\n/u).map((text) => { const p = doc.createElement('p'); p.textContent = text; return p; });

        if (!continuous) {
            setTocPage(index, output.children.length + 1);
            const first = () => {
                const p = page(); const wrapper = article.cloneNode(false); p.content.append(wrapper);
                for (const child of article.children) { if (child !== main && child.tagName !== 'FOOTER') wrapper.append(child.cloneNode(true)); }
                const body = main.cloneNode(false); wrapper.append(body);
                // Measure the whole available page, not the unbounded article element.
                p.content.classList.add('anthology-work'); p.content.dataset.format = article.className;
                const parts = [...wrapper.children]; wrapper.remove(); p.content.append(...parts);
                const header = [...p.content.children].filter((item) => item !== body); body.remove();
                p.content.classList.add(...main.classList); return { ...p, fixed: header.length, allowHeaderOnly: true };
            };
            const continuation = () => {
                const p = page(); p.content.classList.add('anthology-work', ...main.classList);
                const heading = doc.createElement('div'); heading.className = 'anthology-continuation'; heading.textContent = `${article.querySelector('h1')?.textContent || ''} · 이어서`;
                p.content.append(heading); return { ...p, fixed: 1 };
            };
            flow(blocks, first, continuation);
            return;
        }

        /*
         * 이어붙이기.
         *
         * 작품을 쪽 안의 제 상자(`anthology-work`)에 담아 **앞 작품 아래에 이어 붙인다.**
         * 상자를 쓰는 이유: 작품마다 갈래가 달라(산문·시) 글자 크기와 정렬이 다른데,
         * 쪽 하나에 그 규칙을 직접 걸면 한 쪽에 두 작품을 담을 수 없다.
         */
        if (forcedBreaks.has(index)) cursor = null;

        const divider = dividers.get(index);
        if (divider) {
            /*
             * 간지 = 주제 속표지. 이름과 그 주제의 작품 목록을 싣는다.
             *
             * 한 주제에 작품이 많으면 목록이 한 쪽을 넘는다(학급 전체가 같은 과제를 쓴 경우).
             * 그때는 이름만 둔 쪽에 이어 다음 쪽으로 목록을 넘긴다 — 넘친다고 막으면
             * 정작 큰 학급이 문집을 못 만든다.
             */
            const dividerTitle = divider.querySelector('h1');
            const dividerRows = [...(divider.querySelector('[data-divider-list]')?.children || [])];
            const dividerPage = (withTitle) => {
                const p = page('anthology-divider');
                if (withTitle && dividerTitle) p.content.append(dividerTitle.cloneNode(true));
                const list = doc.createElement('div'); list.setAttribute('data-divider-list', '');
                p.content.append(list);
                if (!fits(p.content)) throw new Error('주제 간지가 한 페이지를 넘습니다. 주제 이름을 줄여 주세요.');
                return { sheet: p.sheet, content: list, measure: p.content, fixed: 0 };
            };
            let firstSheet = null;
            flow(dividerRows, () => { const p = dividerPage(true); firstSheet = p.sheet; return p; }, () => dividerPage(false));
            if (!firstSheet) firstSheet = dividerPage(true).sheet;
            setTocPage(`g${index}`, pageNumberOf(firstSheet));
            cursor = null;
        }

        const openWork = (withHeader) => {
            const box = doc.createElement('div');
            box.className = `anthology-work ${[...main.classList].join(' ')}`.trim();
            box.dataset.format = article.className;
            if (withHeader) {
                for (const child of article.children) { if (child !== main && child.tagName !== 'FOOTER') box.append(child.cloneNode(true)); }
            } else {
                const heading = doc.createElement('div'); heading.className = 'anthology-continuation';
                heading.textContent = `${article.querySelector('h1')?.textContent || ''} · 이어서`;
                box.append(heading);
            }
            return box;
        };

        const place = (box) => {
            if (!cursor) cursor = page();
            const hadNeighbours = cursor.content.childElementCount > 0;
            cursor.content.append(box);
            if (!fits(cursor.content)) {
                box.remove();
                if (!hadNeighbours) throw new Error('작품 제목이 한 페이지를 넘습니다. 제목을 확인해 주세요.');
                cursor = page();
                cursor.content.append(box);
                if (!fits(cursor.content)) throw new Error('작품 제목이 한 페이지를 넘습니다. 제목을 확인해 주세요.');
            }
            return cursor.content.childElementCount > 1;
        };

        /*
         * 쪽 맨 아래에 **제목만**(또는 몇 줄만) 걸치는 것을 막는다.
         *
         * 처음에는 "제목 아래 세 줄 자리가 있나" 만 봤는데 그것으로는 모자랐다(2026-09-14 지적).
         * 이어붙이기에서는 앞 작품이 있는 쪽에서 **문단을 쪼개지 않는다.** 그래서 첫 문단이 긴 글은
         * 세 줄 자리가 있어도 문단째 다음 쪽으로 밀리고 제목만 남는다.
         *
         * 그래서 자리를 재지 않고 **이 쪽에 실제로 실릴 몫**을 잰다 — 본문을 다 붙여 보고 넘치는
         * 문단을 뒤에서부터 빼면, 남은 것이 이 쪽에 실릴 몫이다. 그 몫이 글 전체 본문의
         * `ANTHOLOGY_MIN_BODY_RATIO` 에 못 미치면 글을 통째로 다음 쪽으로 넘긴다.
         */
        const roomForBody = (box) => {
            if (!blocks.length) return true;
            const headerHeight = box.offsetHeight;
            const clones = blocks.map((block) => block.cloneNode(true));
            box.append(...clones);
            const whole = box.offsetHeight - headerHeight;
            for (let index = clones.length - 1; index >= 0 && !fits(cursor.content); index--) clones.at(index).remove();
            const placed = box.offsetHeight - headerHeight;
            clones.forEach((clone) => clone.remove());
            /*
             * 쪽보다 긴 글은 **한 쪽 몫**을 기준으로 잰다. 글 전체의 30% 를 그대로 요구하면
             * 여러 쪽짜리 글은 남은 자리가 아무리 넓어도 늘 다음 쪽으로 밀려, 이어붙이기인데
             * 쪽 아래가 통째로 비게 된다.
             */
            const need = Math.min(whole, cursor.content.clientHeight) * ANTHOLOGY_MIN_BODY_RATIO;
            return whole <= 0 || placed >= need;
        };

        const first = () => {
            const box = openWork(true);
            let hasNeighbours = place(box);
            if (hasNeighbours && !roomForBody(box)) {
                box.remove();
                cursor = page();
                hasNeighbours = place(box);
            }
            setTocPage(index, pageNumberOf(cursor.sheet));
            /*
             * `fixed` = 상자에 이미 들어 있는 것(제목·글쓴이·줄) 수.
             *
             * 0 으로 두면 첫 문단이 안 들어갈 때 `flow` 가 "이 쪽엔 이미 본문이 있다" 고 잘못 읽어
             * 문단을 쪼개지 않고 다음 쪽으로 보낸다. 그러면 **제목만 남은 쪽**이 생긴다 — 한 쪽을
             * 넘는 긴 문단이 그랬다(2026-09-14 지적). 제 쪽을 통째로 쓰는 글은 문단을 쪼개야 한다.
             */
            return { sheet: cursor.sheet, content: box, measure: cursor.content, fixed: box.childElementCount, hasNeighbours };
        };
        const continuation = () => {
            cursor = page();
            const box = openWork(false);
            cursor.content.append(box);
            return { sheet: cursor.sheet, content: box, measure: cursor.content, fixed: 1, hasNeighbours: false };
        };
        flow(blocks, first, continuation);
    });
    const colophon = page('anthology-colophon'); colophon.content.append(source.querySelector('[data-colophon]').cloneNode(true));
    [...output.children].forEach((sheet, index) => { sheet.querySelector('footer').textContent = `${index + 1}`; });
    source.remove();
    doc.documentElement.dataset.pages = String(count);
    doc.documentElement.dataset.tocPages = String([...output.children].filter((p) => p.classList.contains('anthology-toc')).length);
    doc.documentElement.dataset.tocStart = String(tocStart + 1);
    return count;
}
