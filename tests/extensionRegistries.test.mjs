import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/*
 * 확장 지점 등록 누락 검사(2026-09-27).
 *
 * 새 기능은 폴더 하나 + 설정 파일(manifest.js) 하나로 붙지만, **목록(registry)에 한 줄 더하는 것을 잊으면**
 * 코드는 있는데 화면에 아무 데도 안 나온다. 확장 지점이 네 곳이고 각자 목록을 따로 가져서, 폴더를 훑어
 * 설정 파일마다 "불러오기 한 줄 + 목록에 이름 한 줄" 이 다 있는지 한꺼번에 본다.
 */
const FAMILIES = [
    { name: '우리 반 스크린 위젯', root: 'src/modules/tool/class-board/widgets', registry: 'src/modules/tool/class-board/widgets/registry.js' },
    { name: '글쓰기 글 종류', root: 'src/modules/writing/mission-types', registry: 'src/modules/writing/mission-types/registry.js' },
    { name: '글쓰기 도구', root: 'src/modules/writing/tools', registry: 'src/modules/writing/tools/registry.js' },
    // 기능 모듈은 위 세 곳을 뺀 나머지 모든 manifest.js 다.
    { name: '기능 모듈', root: 'src/modules', registry: 'src/modules/registry.js' }
];

const allManifests = readdirSync('src/modules', { recursive: true })
    .filter((file) => path.basename(file) === 'manifest.js')
    .map((file) => path.join('src/modules', file).split(path.sep).join('/'));

const familyOf = (file) => FAMILIES.find((family) => file.startsWith(`${family.root}/`));

const exportedName = (file) => {
    const match = readFileSync(file, 'utf8').match(/export const ([A-Za-z0-9_]+)\s*=/);
    return match?.[1] || null;
};

test('확장 지점 설정 파일이 모두 제 목록에 등록돼 있다', () => {
    const missing = [];
    for (const file of allManifests) {
        const family = familyOf(file);
        const name = exportedName(file);
        assert.ok(name, `${file} 이 설정을 내보내지 않습니다(export const 이름 = {...}).`);
        const registry = readFileSync(family.registry, 'utf8');
        const relative = `./${path.relative(path.dirname(family.registry), path.dirname(file)).split(path.sep).join('/')}/manifest`;
        const imported = registry.includes(`'${relative}'`) || registry.includes(`'${relative}.js'`);
        // 이름이 불러오기 줄 밖에서도 한 번 더 나와야 목록에 들어간 것이다.
        const used = registry.split(name).length - 1 >= 2;
        if (!imported || !used) missing.push(`${family.name}: ${file} (${name}) → ${family.registry}`);
    }
    assert.deepEqual(missing, [], `목록에 등록하지 않은 설정 파일이 있습니다:\n${missing.join('\n')}`);
});

test('검사가 네 확장 지점을 모두 본다 — 폴더가 옮겨지면 여기서 먼저 알린다', () => {
    for (const family of FAMILIES) {
        const count = allManifests.filter((file) => familyOf(file) === family).length;
        assert.ok(count > 0, `${family.name}(${family.root}) 에서 설정 파일을 하나도 찾지 못했습니다 — 경로가 바뀌었나요?`);
    }
});
