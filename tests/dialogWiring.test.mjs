/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/*
 * 앱 안 창을 **부르고 그리지 않는 것**을 막는다.
 *
 * 왜 이 검사가 필요한가(2026-09-04):
 *   `ask()` 는 창의 단추가 눌려야 답을 돌려준다. 그런데 `useConfirmDialog()` 를 부르고
 *   `{confirmDialog}` 를 화면에 그리지 않으면 **창이 뜨지 않은 채 영원히 기다린다.**
 *   버튼을 눌렀는데 아무 일도 안 일어나고, 그 글은 잠긴 채로 남는다 —
 *   원래 고치려던 문제(눌러도 반응 없음)보다 **더 나쁘다.**
 *
 *   눈으로는 안 보인다. 창을 띄우는 상황을 실제로 만들어야만 드러나는데, 대부분 실패 경로라
 *   평소에는 지나간다. 그래서 기계가 본다.
 *
 * 규칙: 훅을 부른 파일은 둘 중 하나여야 한다.
 *   ① 자기가 `{confirmDialog}` 를 그린다, 또는
 *   ② 돌려주고(`return { confirmDialog }`) **그 파일을 쓰는 누군가가** 그린다.
 */

const SRC = 'src';

const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
    }));
    return files.flat();
};

const PAIRS = [
    { hook: 'useConfirmDialog', element: 'confirmDialog' },
    { hook: 'useNotice', element: 'notice' }
];

const returnsElement = (source, element) => (
    [...source.matchAll(/return\s*\{([\s\S]*?)\};/g)]
        .some((match) => (match[1].match(/\b\w+\b/g) || []).includes(element))
);

const importsModule = (source, moduleName) => (
    [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .some((match) => path.basename(match[1]) === moduleName)
);

const renamedElement = (source, element) => (
    [...source.matchAll(/\b(confirmDialog|notice)\s*:\s*(\w+)/g)]
        .find((match) => match[1] === element)?.[2] || null
);

test('앱 안 창을 부른 곳은 그 창을 반드시 화면에 그린다', async () => {
    const files = await walk(SRC);
    const sources = new Map();
    for (const file of files) sources.set(file, await readFile(file, 'utf8'));

    for (const { hook, element } of PAIRS) {
        const callers = [...sources].filter(([, source]) => source.includes(`${hook}()`));
        assert.ok(callers.length > 0, `${hook} 을(를) 쓰는 곳이 하나도 없다 — 검사가 헛돌고 있다`);

        for (const [file, source] of callers) {
            const rendersItself = source.includes(`{${element}}`);
            if (rendersItself) continue;

            // 돌려주기만 한다면, 그것을 쓰는 파일 중 하나가 반드시 그려야 한다.
            const returnsIt = returnsElement(source, element);
            assert.ok(returnsIt,
                `${file}: ${hook}() 을 부르고 ${element} 을(를) 그리지도 돌려주지도 않는다 — 창이 영원히 안 뜬다`);

            const moduleName = path.basename(file).replace(/\.(jsx?|mjs)$/, '');
            const consumers = [...sources].filter(([other, otherSource]) =>
                other !== file && importsModule(otherSource, moduleName));
            assert.ok(consumers.length > 0, `${file}: ${element} 을 돌려주는데 쓰는 곳이 없다`);
            /*
             * 쓰는 쪽이 이름을 바꿔 받을 수 있다 — 한 화면이 훅 둘의 창을 함께 그릴 때 그렇다
             * (예: `confirmDialog: dragonDialog`). 그때는 바뀐 이름으로 그렸는지 본다.
             */
            const rendersElement = ([, otherSource]) => {
                if (otherSource.includes(`{${element}}`)) return true;
                const renamed = renamedElement(otherSource, element);
                return Boolean(renamed && otherSource.includes(`{${renamed}}`));
            };
            assert.ok(
                consumers.some(rendersElement),
                `${file}: ${element} 을 돌려주지만 그리는 곳이 없다 — 창이 영원히 안 뜬다`
            );
        }
    }
});

/*
 * 창은 화면당 한 벌만 둔다. 부품마다 자기 창을 만들면 어느 것이 위에 뜰지 알 수 없고,
 * 앞의 물음이 뒤의 물음에 가려 답을 못 받는 일이 생긴다.
 * 그래서 `ask` 를 내려받는 부품은 자기 창을 만들지 않는다.
 */
test('창을 내려받는 부품은 자기 창을 따로 만들지 않는다', async () => {
    const files = await walk(SRC);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const receivesAsk = /^\s*(ask|notify)[,\s}]/m.test(source) && /\}\s*\)\s*=>/.test(source);
        if (!receivesAsk) continue;
        if (file.includes('useConfirmDialog') || file.includes('useNotice')) continue;
        assert.doesNotMatch(source, /useConfirmDialog\(\)/,
            `${file}: ask 를 내려받으면서 자기 확인 창도 만든다 — 창이 두 벌이 된다`);
    }
});
