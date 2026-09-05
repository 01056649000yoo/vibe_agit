// The same measured DOM pages are used on screen and by the browser's A4 printer.
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
    const flow = (blocks, start, continuation) => {
        let current = start();
        for (const original of blocks) {
            let block = original.cloneNode(true);
            while (block) {
                current.content.append(block);
                if (fits(current.content)) break;
                block.remove();
                // Keep a paragraph/stanza whole when it fits a fresh page.
                if (current.content.childElementCount > current.fixed) { current = continuation(); continue; }
                const chars = Array.from(block.textContent);
                let lo = 0; let hi = chars.length;
                current.content.append(block);
                while (lo < hi) {
                    const mid = Math.ceil((lo + hi) / 2); block.textContent = chars.slice(0, mid).join('');
                    if (fits(current.content)) lo = mid; else hi = mid - 1;
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
    const cover = page('anthology-cover'); cover.content.append(source.querySelector('[data-cover]').cloneNode(true));
    if (!fits(cover.content)) throw new Error('표지의 제목과 부제가 한 페이지를 넘습니다. 내용을 줄여 주세요.');
    const intro = source.querySelector('[data-introduction]');
    if (intro) flow([...intro.children], () => ({ ...page(), fixed: 0 }), () => ({ ...page(), fixed: 0 }));
    const tocStart = output.children.length;
    const tocRows = [...source.querySelectorAll('[data-toc-row]')];
    const tocPage = () => { const p = page('anthology-toc'); const h = doc.createElement('h1'); h.textContent = '차례'; p.content.append(h); return { ...p, fixed: 1 }; };
    flow(tocRows, tocPage, tocPage);
    const articles = [...source.querySelectorAll('.pdf-entry')];
    articles.forEach((article, index) => {
        const startNumber = output.children.length + 1;
        const row = [...output.querySelectorAll('[data-toc-row]')].find((item) => item.dataset.tocRow === String(index));
        row.querySelector('[data-page]').textContent = String(startNumber);
        const main = article.querySelector('main');
        let blocks;
        if (main.children.length) blocks = [...main.children].map((child) => { const copy = child.cloneNode(false); copy.textContent = child.textContent; return copy; });
        else blocks = main.textContent.split(/\n\s*\n/u).map((text) => { const p = doc.createElement('p'); p.textContent = text; return p; });
        const first = () => {
            const p = page(); const wrapper = article.cloneNode(false); p.content.append(wrapper);
            for (const child of article.children) { if (child !== main && child.tagName !== 'FOOTER') wrapper.append(child.cloneNode(true)); }
            const body = main.cloneNode(false); wrapper.append(body);
            // Measure the whole available page, not the unbounded article element.
            p.content.classList.add('anthology-work'); p.content.dataset.format = article.className;
            const parts = [...wrapper.children]; wrapper.remove(); p.content.append(...parts);
            const header = [...p.content.children].filter((item) => item !== body); body.remove();
            p.content.classList.add(...main.classList); return { ...p, fixed: header.length };
        };
        const continuation = () => {
            const p = page(); p.content.classList.add('anthology-work', ...main.classList);
            const heading = doc.createElement('div'); heading.className = 'anthology-continuation'; heading.textContent = `${article.querySelector('h1')?.textContent || ''} · 이어서`;
            p.content.append(heading); return { ...p, fixed: 1 };
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
