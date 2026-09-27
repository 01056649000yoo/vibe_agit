#!/usr/bin/env node
/**
 * 새 모듈 뼈대를 만든다(2026-09-27).
 *
 *   npm run new:module -- --id reading-quiz --name "읽기 퀴즈" --part tool --audience teacher
 *   npm run new:module -- --id word-game --name "낱말 놀이" --part game --audience both --db
 *   ... --dry   만들 파일만 보여 주고 쓰지 않는다
 *
 *   --part      tool(학급운영도구) · game(아지트 놀이터) · writing(글쓰기 확장) · community(학급 커뮤니티)
 *   --audience  teacher · student · both
 *   --db        마이그레이션·스모크 **초안**을 supabase/migration-drafts/ 에 만든다(적용 도구가 읽지 않는 자리)
 *
 * 만든 뒤에는 모듈 폴더의 README.md 체크리스트를 따른다. 규칙은 scripts/moduleScaffold.mjs 머리말.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PARTS, addToRegistry, buildModuleScaffold, validateScaffoldOptions } from './moduleScaffold.mjs';

const REGISTRY = 'src/modules/registry.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
};

const options = {
    id: value('id'),
    name: value('name'),
    part: value('part'),
    audience: value('audience') || 'teacher',
    withDb: flag('db')
};

const problems = validateScaffoldOptions(options);
if (problems.length) {
    console.error(`뼈대를 만들 수 없습니다:\n- ${problems.join('\n- ')}\n\n예) npm run new:module -- --id reading-quiz --name "읽기 퀴즈" --part tool --audience teacher`);
    process.exit(1);
}

const moduleDir = `src/modules/${PARTS[options.part].folder}/${options.id}`;
const registrySource = readFileSync(REGISTRY, 'utf8');
if (existsSync(moduleDir) || registrySource.includes(`id: '${options.id}'`)) {
    console.error(`이미 있습니다: ${moduleDir} — 다른 id 를 쓰세요(덮어쓰지 않습니다).`);
    process.exit(1);
}

const files = buildModuleScaffold(options);
const existing = files.filter((file) => existsSync(file.path));
if (existing.length) {
    console.error(`이미 있는 파일이 있어 멈춥니다(덮어쓰지 않습니다):\n- ${existing.map((file) => file.path).join('\n- ')}`);
    process.exit(1);
}

console.log(`${options.name}(${options.id}) · ${PARTS[options.part].label} · ${options.audience}`);
for (const file of files) console.log(`  + ${file.path}`);
console.log(`  ~ ${REGISTRY} (불러오기 한 줄 + 목록 한 줄)`);

if (flag('dry')) {
    console.log('\n--dry: 아무것도 쓰지 않았습니다.');
    process.exit(0);
}

for (const file of files) {
    mkdirSync(path.dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
}
writeFileSync(REGISTRY, addToRegistry(registrySource, options));

console.log(`
만들었습니다. 다음 순서:
  1. node --test tests/${files.find((file) => file.path.startsWith('tests/')).path.slice('tests/'.length)} tests/extensionRegistries.test.mjs
  2. npm run dev 로 화면 확인(개발 서버에서만 보입니다)
  3. ${moduleDir}/README.md 의 "채울 것" 체크리스트`);
