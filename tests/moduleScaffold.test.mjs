import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { validateManifest } from '../src/modules/types.js';
import { PARTS, addToRegistry, buildModuleScaffold, validateScaffoldOptions } from '../scripts/moduleScaffold.mjs';

/*
 * 모듈 뼈대 도구(`npm run new:module`, 2026-09-27)가 계속 올바른 파일을 만드는지 지킨다.
 * 2026-09-27 에 만들어 보니 생성 검사가 레지스트리를 직접 불러와 Node 에서 깨졌고(확장자 없는 import),
 * 교사 화면이 쓰지 않는 값을 받아 lint 가 막았다. 그 두 가지를 다시 만들지 않게 모든 조합을 여기서 만든다.
 */
const combos = Object.keys(PARTS).flatMap((part) => ['teacher', 'student', 'both']
    .filter((audience) => !(part === 'tool' && audience === 'student'))
    .map((audience) => ({ id: `probe-${part}-${audience}`, name: '시험 모듈', part, audience, withDb: true, date: '2026-09-27' })));

test('모든 종류·대상 조합의 설정 파일이 모듈 규칙을 지키고 배포에서 숨는다', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'agit-scaffold-'));
    try {
        for (const combo of combos) {
            const files = buildModuleScaffold(combo);
            const manifest = files.find((file) => file.path.endsWith('/manifest.js'));
            const target = path.join(dir, `${combo.id}.mjs`);
            writeFileSync(target, manifest.content);
            const exported = Object.values(await import(pathToFileURL(target).href))[0];
            assert.deepEqual(validateManifest(exported), [], `${combo.id} 설정 파일이 규칙을 어깁니다.`);
            assert.equal(exported.available, false, `${combo.id} 가 배포(개발 서버 아님)에서 보입니다.`);
            assert.equal(exported.defaultEnabled, false);
            assert.equal(exported.performance.home, 'none');
            assert.equal(Boolean(exported.teacherEntry), combo.audience !== 'student');
            assert.equal(Boolean(exported.studentEntry), combo.audience !== 'teacher');
            if (combo.part === 'game') assert.ok(exported.playground?.pointLabel, '게임은 놀이터 카드 문구가 있어야 합니다.');
            if (combo.part === 'tool') assert.ok(exported.tool, '도구는 tool 정보가 있어야 합니다.');
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('생성 검사는 레지스트리를 직접 불러오지 않고, 화면은 쓰지 않는 값을 받지 않는다', () => {
    const files = buildModuleScaffold(combos.find((combo) => combo.part === 'tool' && combo.audience === 'both'));
    const moduleTest = files.find((file) => file.path.startsWith('tests/')).content;
    assert.doesNotMatch(moduleTest, /from '\.\.\/src\/modules\/registry\.js'/, 'registry.js 는 Node 에서 열리지 않습니다(확장자 없는 import).');
    const teacher = files.find((file) => file.path.endsWith('TeacherEntry.jsx')).content;
    assert.match(teacher, /TeacherEntry\(\{ activeClass, isMobile \}\)/);
    assert.match(teacher, /<TeacherPageTitle title=/, '교사 화면은 공통 제목을 씁니다.');
    assert.doesNotMatch(teacher + files.find((file) => file.path.endsWith('StudentEntry.jsx')).content, /#[0-9a-f]{3,6}\b/i, '색은 토큰만.');
});

test('마이그레이션 초안은 적용 도구가 읽지 않는 자리에 두고 보안 규칙을 담는다', () => {
    const files = buildModuleScaffold({ id: 'word-game', name: '낱말 놀이', part: 'game', audience: 'both', withDb: true });
    const draft = files.find((file) => file.path.endsWith('/word_game.sql'));
    assert.ok(draft.path.startsWith('supabase/migration-drafts/'), 'supabase/migrations/ 에 두면 채우기 전에 운영에 적용됩니다.');
    for (const rule of [/ENABLE ROW LEVEL SECURITY/, /REVOKE ALL ON TABLE public\.word_game_items FROM PUBLIC, anon, authenticated/,
        /SECURITY DEFINER\s+SET search_path = public/, /class\.teacher_id = auth\.uid\(\)/, /FROM PUBLIC, anon;/, /LIMIT 50/]) {
        assert.match(draft.content, rule);
    }
    assert.equal(buildModuleScaffold({ id: 'x', name: 'x', part: 'tool', audience: 'teacher' }).some((file) => file.path.includes('migration-drafts')), false);
});

test('레지스트리에 한 번만 더하고, 입력이 틀리면 까닭을 알려 준다', () => {
    const registry = readFileSync('src/modules/registry.js', 'utf8');
    const once = addToRegistry(registry, { id: 'reading-quiz', part: 'tool' });
    assert.match(once, /import \{ readingQuizManifest \} from '\.\/tool\/reading-quiz\/manifest';/);
    assert.equal(once.split('readingQuizManifest').length - 1, 2, '불러오기 한 줄 + 목록 한 줄');
    assert.equal(addToRegistry(once, { id: 'reading-quiz', part: 'tool' }), once, '두 번 더하지 않는다');
    assert.deepEqual(validateScaffoldOptions({ id: 'Bad_Id', name: '', part: 'x', audience: 'y' }).length, 4);
    assert.ok(validateScaffoldOptions({ id: 'tool-a', name: '도구', part: 'tool', audience: 'student' }).length, '도구는 교사 화면이 있어야 한다');
});
