/**
 * "이 파일을 지키는 검사" 찾기 — 순수 함수. `npm run test:related`·`npm run recall` 이 쓴다.
 *
 * 왜 (2026-09-28): 작업 중에 전체 검사(1,400개)를 매번 돌리면 느려서 건너뛰게 된다. 바뀐 파일을 읽거나
 * 불러오는 검사만 먼저 몇 초 안에 돌리고, 전체는 푸시 전 검사가 돌린다(현행 그대로).
 *
 * 찾는 법: 검사 파일 본문에 그 파일의 **저장소 경로**(확장자 있든 없든)가 있거나, 흔하지 않은 **파일 이름**
 * (확장자 뺀 것, 8글자 이상)이 있으면 그 파일을 지키는 검사로 본다. 정확한 의존 그래프가 아니라
 * "먼저 돌려 볼 후보" 다 — 빠뜨려도 푸시 전 전체 검사가 잡는다.
 */

const MIN_NAME = 8;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const guardsFor = (file, tests) => {
    const noExt = file.replace(/\.[^./]+$/, '');
    const name = noExt.split('/').at(-1);
    // 확장자 뺀 경로는 폴더가 있을 때만 쓴다 — `package`·`AGENTS` 처럼 맨 이름은 아무 데나 걸린다.
    // 앞에 따옴표·괄호·빈칸이 있어야 한다 — 맨 위 `README.md` 가 `src/…/README.md` 에 걸리지 않게.
    const lead = String.raw`(^|['"\x60(\s])(\.\/|\.\.\/)?`;
    const patterns = [new RegExp(`${lead}${escape(file)}`, 'm')];
    if (noExt.includes('/')) patterns.push(new RegExp(`${lead}${escape(noExt)}(['"\x60.]|$)`, 'm'));
    // index·manifest 같은 흔한 이름은 이름만으로 찾으면 엉뚱한 것이 걸린다.
    if (name.length >= MIN_NAME && !/^(index|manifest|registry|README)$/i.test(name)) {
        patterns.push(new RegExp(`[/'"\`]${escape(name)}(\\.[a-z]+)?['"\`]`));
    }
    return Object.entries(tests)
        .filter(([testFile, text]) => testFile !== file && patterns.some((pattern) => pattern.test(text)))
        .map(([testFile]) => testFile)
        .sort();
};

/** 바뀐 파일 전체 → 돌릴 검사 파일(검사 파일 자신이 바뀌었으면 그것도). */
export const relatedTests = (files, tests) => {
    const set = new Set();
    for (const file of files) {
        if (tests[file] !== undefined) set.add(file);
        for (const guard of guardsFor(file, tests)) set.add(guard);
    }
    return [...set].sort();
};
