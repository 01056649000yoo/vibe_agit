/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';

/*
 * 함수 **본문 최상단**에서, 아래에서 선언한 값을 위에서 바로 쓰는 것을 잡는다.
 *
 * 2026-08-28 관리자 대시보드가 흰 화면이 됐다. `urgentTabs` 가 `tabBadges` 를 썼는데 선언이
 * 90줄 뒤에 있었다. `const` 는 끌어올려지지 않으므로 **렌더 도중 그 자리에서 터진다**
 * (`Cannot access 'tabBadges' before initialization`). Vite 빌드도, ESLint 도, 회귀 565건도
 * 모두 통과했다 — 문법은 옳고 이름도 다 있으며, 어느 검사도 그 컴포넌트를 그려 보지 않기 때문이다.
 *
 * ESLint 의 `no-use-before-define` 으로는 갈라내지 못한다. 이 저장소의 위반 22건은 전부
 * **나중에 실행되는 자리**(콜백·이벤트 처리기)라 실제로는 안 터지는데 규칙은 둘을 구분하지 못한다.
 * 위험한 것은 오직 **같은 함수 본문에서 위아래가 뒤집힌, 바로 실행되는 초기화**뿐이다.
 * 그래서 구문 트리로 함수 범위를 나눠 그것만 본다.
 */

const collectFiles = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return collectFiles(full);
        return /\.(jsx|js)$/.test(entry.name) ? [full] : [];
    }));
    return nested.flat();
};

const parseSource = (source) => parse(source, {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: true
});

/*
 * 함수 몸통이 **지금 실행되는지** 나중인지를 가른다.
 *
 * `list.filter((x) => badges[x])` 의 몸통은 **지금** 돈다 — 아래에서 선언한 값을 쓰면 터진다.
 * `useCallback(() => save(), [])` 의 몸통은 나중에 돈다 — 순서가 뒤여도 괜찮다.
 * 이 둘을 못 가르면 검사가 쓸모없어진다(전부 걸리거나 전부 놓친다).
 */
const DEFERRED_CALLS = new Set([
    'useCallback', 'useMemo', 'useEffect', 'useLayoutEffect',
    'setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask',
    'then', 'catch', 'finally', 'addEventListener', 'debounce'
]);

const calleeName = (node) => {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
        return node.property?.name;
    }
    return undefined;
};

/** 함수 본문 하나를 훑어, 아래에서 선언한 이름을 **지금 실행되는 자리**에서 쓰는 곳을 모은다. */
const checkFunctionBody = (body, problems) => {
    const declaredAt = new Map();
    for (const statement of body) {
        if (statement.type !== 'VariableDeclaration' || statement.kind === 'var') continue;
        for (const declarator of statement.declarations) {
            if (declarator.id.type === 'Identifier') declaredAt.set(declarator.id.name, declarator.id.loc.start.line);
        }
    }

    const scan = (node, usedLine, deferred) => {
        if (!node || typeof node.type !== 'string') return;

        if (node.type === 'Identifier') {
            if (deferred) return;
            const declaredLine = declaredAt.get(node.name);
            if (declaredLine !== undefined && declaredLine > usedLine) {
                problems.push(`${usedLine}행이 ${declaredLine}행의 '${node.name}' 을 먼저 씀`);
            }
            return;
        }

        // 나중에 도는 자리에 넘긴 함수의 **몸통만** 미룬다. 의존성 배열 같은 나머지 인자는 지금 평가된다.
        if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
            const defersArguments = DEFERRED_CALLS.has(calleeName(node.callee));
            scan(node.callee, usedLine, deferred);
            for (const argument of node.arguments) {
                const isFunction = argument.type === 'ArrowFunctionExpression'
                    || argument.type === 'FunctionExpression';
                scan(argument, usedLine, deferred || (defersArguments && isFunction));
            }
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
            // `x.a` 와 `x?.a` 의 `a`, `{ a: 1 }` 의 `a` 는 값 참조가 아니다.
            if ((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression')
                && key === 'property' && !node.computed) continue;
            if (node.type === 'ObjectProperty' && key === 'key' && !node.computed) continue;
            if (Array.isArray(value)) value.forEach((child) => scan(child, usedLine, deferred));
            else if (value && typeof value === 'object') scan(value, usedLine, deferred);
        }
    };

    for (const statement of body) {
        if (statement.type !== 'VariableDeclaration' || statement.kind === 'var') continue;
        for (const declarator of statement.declarations) {
            if (!declarator.init) continue;
            // 이름에 함수를 바로 담는 것은 나중에 부르는 것이므로 순서가 뒤여도 괜찮다.
            if (declarator.init.type === 'ArrowFunctionExpression'
                || declarator.init.type === 'FunctionExpression') continue;
            scan(declarator.init, declarator.loc.start.line, false);
        }
    }
};

/** 파일 안의 모든 함수를 찾기 위한 단순 순회. 값 참조 판단은 위 `scan` 이 따로 한다. */
const walk = (node, visit) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
        if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
};

const findRenderOrderProblems = (source) => {
    const problems = [];
    walk(parseSource(source).program, (node) => {
        const isFunction = node.type === 'FunctionDeclaration'
            || node.type === 'FunctionExpression'
            || node.type === 'ArrowFunctionExpression';
        if (isFunction && node.body?.type === 'BlockStatement') checkFunctionBody(node.body.body, problems);
    });
    return problems;
};

test('함수 안에서 나중에 선언한 값을 먼저 쓰지 않는다', async () => {
    const files = await collectFiles('src');
    assert.ok(files.length > 100, `검사할 파일을 찾지 못했다(${files.length}개)`);

    const failures = [];
    for (const file of files) {
        const problems = findRenderOrderProblems(await readFile(file, 'utf8'));
        if (problems.length) failures.push(`${file}\n    ${[...new Set(problems)].join('\n    ')}`);
    }

    assert.deepEqual(failures, [], [
        '',
        '렌더 도중 터지는 순서입니다. `const` 는 끌어올려지지 않습니다:',
        ...failures.map((entry) => `  ${entry}`),
        '',
        '선언을 쓰는 곳보다 위로 옮기세요.',
        ''
    ].join('\n'));
});

test('검사 자체가 그 패턴을 잡고, 안전한 것은 놓아둔다', () => {
    // 이 검사의 값어치는 전부 여기 걸려 있다. 조용히 아무것도 안 잡게 되는 것을 막는다.
    const broken = 'const S = () => {\n'
        + '  const urgent = list.filter((i) => badges[i.id] > 0);\n'
        + '  const badges = useMemo(() => ({}), []);\n'
        + '};';
    assert.equal(findRenderOrderProblems(broken).length, 1, '선언 전 사용을 잡지 못한다');

    // 순서가 옳으면 잡지 않는다.
    const fine = 'const S = () => {\n'
        + '  const badges = useMemo(() => ({}), []);\n'
        + '  const urgent = list.filter((i) => badges[i.id] > 0);\n'
        + '};';
    assert.deepEqual(findRenderOrderProblems(fine), []);

    // 화살표 **몸통 안**은 나중에 실행되므로 순서가 뒤여도 괜찮다.
    const deferred = 'const S = () => {\n'
        + '  const open = useCallback(() => save(), []);\n'
        + '  const save = useCallback(() => {}, []);\n'
        + '};';
    assert.deepEqual(findRenderOrderProblems(deferred), []);

    /*
     * 다만 **의존성 배열은 즉시 평가된다.** `useCallback(() => save(), [save])` 에서 `save` 가
     * 아래에 있으면 그 자리에서 터진다. 몸통 안과 달리 이건 진짜 버그이므로 잡아야 한다.
     */
    const deps = 'const S = () => {\n'
        + '  const open = useCallback(() => save(), [save]);\n'
        + '  const save = useCallback(() => {}, []);\n'
        + '};';
    assert.equal(findRenderOrderProblems(deps).length, 1, '의존성 배열의 선언 전 사용을 놓친다');

    // 서로 다른 함수의 같은 이름은 남남이다. 이것을 못 가르면 오탐으로 뒤덮인다.
    const separate = 'function a(value) {\n  const date = new Date(value);\n  return date;\n}\n'
        + 'function b(seconds) {\n  const value = Number(seconds);\n  return value;\n}';
    assert.deepEqual(findRenderOrderProblems(separate), []);

    // `x?.name` 의 `name` 은 값 참조가 아니다. 이것을 못 가르면 흔한 코드가 전부 걸린다.
    const optional = 'const S = (props) => {\n'
        + '  const saved = props?.stanzas ?? [];\n'
        + '  const stanzas = [...saved];\n'
        + '  return stanzas;\n'
        + '};';
    assert.deepEqual(findRenderOrderProblems(optional), []);
});
