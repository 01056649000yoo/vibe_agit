/**
 * 새 모듈 뼈대 만들기 — 순수 함수(2026-09-27). 파일에 쓰는 것은 `scripts/new-module.mjs` 가 한다.
 *
 * 알림장 모듈 하나를 넣을 때 20개 파일을 고쳤다(7cee1109). 사람이 기억해야 할 곳을 줄이려고, 폴더·설정 파일·화면 뼈대·
 * 검사·레지스트리 등록을 한 번에 만들고, 사람이 **판단해야 하는 곳**(도움말 글·기능 지도·보안·성능표)은 README 체크리스트로 남긴다.
 *
 * 지키는 규칙
 * - 기능 삭제보다 모듈화와 기본 OFF: `defaultEnabled: false`, 그리고 `available` 은 **개발 서버에서만 참**이라
 *   배포해도 교사·학생 화면에 나타나지 않는다(도구 모듈은 켜져 있으면 모든 교사에게 바로 보인다).
 * - 성능 약속(`performance`)은 가장 보수적인 값으로 시작한다(홈 추가 조회 0회·열 때만 읽기·RPC 쓰기·실시간 없음).
 * - DB 가 필요하면 마이그레이션 **초안**을 `supabase/migration-drafts/` 에 둔다. 적용 도구는 이 폴더를 읽지 않으므로
 *   채우기 전에 운영에 들어갈 일이 없다. 초안에는 이 저장소의 보안 규칙(RLS·권한 닫기·search_path·담임 확인)이 들어 있다.
 */

export const PARTS = Object.freeze({
    tool: { folder: 'tool', label: '학급운영도구' },
    game: { folder: 'game', label: '아지트 놀이터' },
    writing: { folder: 'writing', label: '글쓰기 확장' },
    community: { folder: 'community', label: '학급 커뮤니티' }
});

const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const camelOf = (id) => id.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
export const snakeOf = (id) => id.replace(/-/g, '_');
const pascalOf = (id) => camelOf(id).replace(/^./, (letter) => letter.toUpperCase());

/** 입력 확인. 문제가 있으면 사람이 읽을 이유 목록을 돌려준다. */
export const validateScaffoldOptions = ({ id, name, part, audience }) => {
    const problems = [];
    if (!ID_PATTERN.test(id || '')) problems.push('id 는 영어 소문자·숫자·하이픈만(예: reading-quiz)');
    if (!String(name || '').trim()) problems.push('name(화면 이름)이 없습니다');
    if (!Object.hasOwn(PARTS, part)) problems.push(`part 는 ${Object.keys(PARTS).join('·')} 중 하나`);
    if (!['student', 'teacher', 'both'].includes(audience)) problems.push('audience 는 student·teacher·both 중 하나');
    if (part === 'tool' && audience === 'student') problems.push('학급운영도구(tool)는 교사 화면이 있어야 합니다(audience teacher 또는 both)');
    return problems;
};

const hasTeacher = (audience) => audience !== 'student';
const hasStudent = (audience) => audience !== 'teacher';

const manifestFile = ({ id, name, part, audience, date }) => {
    const variable = `${camelOf(id)}Manifest`;
    const lines = [
        `/**`,
        ` * ${name} — \`npm run new:module\` 로 만든 뼈대(${date}). 남은 일은 같은 폴더 README.md 의 체크리스트.`,
        ` */`,
        `export const ${variable} = {`,
        `    id: '${id}',`,
        `    name: '${name.replace(/'/g, "\\'")}',`,
        `    description: '한 줄 설명을 적어 주세요',`,
        `    icon: '🧩',`,
        `    part: '${part}',`,
        `    audience: '${audience}',`,
        `    // 학급마다 교사가 켠다. 처음에는 꺼 둔다(기능 삭제보다 모듈화와 기본 OFF).`,
        `    defaultEnabled: false,`,
        `    // 다 만들 때까지 **개발 서버에서만** 보인다. 공개할 때 true 로 바꾸고 FEATURE_MAP·도움말을 같은 커밋에서 맞춘다.`,
        `    available: Boolean(import.meta.env?.DEV),`
    ];
    if (hasTeacher(audience)) lines.push(`    teacherEntry: () => import('./TeacherEntry.jsx'),`);
    if (hasStudent(audience)) lines.push(`    studentEntry: () => import('./StudentEntry.jsx'),`);
    if (part === 'tool') lines.push(`    tool: { order: 100, beta: true },`);
    if (part === 'game') {
        lines.push(`    playground: { economy: 'earn', pointLabel: '포인트를 모아요', ctaLabel: '시작하기', order: 100, entryMode: 'standard' },`);
        lines.push(`    management: { title: '${name.replace(/'/g, "\\'")} 관리', order: 100 },`);
    }
    lines.push(
        `    // 성능 약속(PERFORMANCE_HARNESS.md). 가장 보수적인 값에서 시작한다: 홈 추가 조회 0회, 열 때만 읽기,`,
        `    // 쓰기는 권한을 확인하는 RPC, 실시간 연결 없음, 첫 목록 50행 이하.`,
        `    performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 50 }`,
        `};`,
        ``
    );
    return lines.join('\n');
};

const teacherEntryFile = ({ id, name, part }) => {
    const variable = `${camelOf(id)}Manifest`;
    // 호스트가 넘기는 값(쓰지 않는 값은 받지 않는다 — 문법 검사가 막는다):
    const hostProps = part === 'tool'
        ? '{ activeClass, teacherInfo, isMobile, module, onTeacherSchoolChange }'
        : '{ activeClass, isMobile, module, onCollapse }';
    const props = '{ activeClass, isMobile }';
    return `import TeacherPageTitle from '../../../components/teacher/TeacherPageTitle';
import { ${variable} } from './manifest.js';

/**
 * ${name} — 교사 화면 뼈대. 공통 제목(TeacherPageTitle)을 쓰고, 색·글자는 디자인 토큰(--ui-*)만 쓴다.
 * 데이터는 **이 화면이 열릴 때만** 읽는다(performance.load = 'on-open').
 * 호스트가 넘기는 값: ${hostProps} — 필요한 것만 꺼내 쓴다.
 */
export default function ${pascalOf(id)}TeacherEntry(${props}) {
    return (
        <section style={{ display: 'grid', gap: 'var(--ui-space-4)' }}>
            <TeacherPageTitle title={${variable}.name} guideTabId="${id}" />
            <p style={{ margin: 0, color: 'var(--ui-ink-muted)' }}>
                {activeClass?.name} · 여기에 교사 화면을 만듭니다{isMobile ? ' (좁은 화면)' : ''}.
            </p>
        </section>
    );
}
`;
};

const studentEntryFile = ({ id, name }) => `import StudentBackButton from '../../../components/student/StudentBackButton';

/**
 * ${name} — 학생 화면 뼈대. 공통 호스트 안에서 열리며 이 화면이 열릴 때만 자기 데이터를 읽는다.
 * 받는 값: { studentSession, isMobile, points, onPointsChange, onBack, module }
 * 포인트 지급·차감은 화면에서 직접 하지 말고 권한을 확인하는 RPC 로 한다.
 */
export default function ${pascalOf(id)}StudentEntry({ isMobile, onBack, module }) {
    return (
        <section style={{ display: 'grid', gap: 'var(--ui-space-4)', padding: isMobile ? 'var(--ui-space-4)' : 'var(--ui-space-6)' }}>
            <StudentBackButton onClick={onBack} />
            <h1 style={{ margin: 0, fontSize: 'var(--ui-text-2xl)' }}>{module?.icon} {module?.name}</h1>
            <p style={{ margin: 0, color: 'var(--ui-ink-muted)' }}>여기에 학생 화면을 만듭니다.</p>
        </section>
    );
}
`;

const readmeFile = ({ id, name, part, audience, withDb, date }) => `# ${name} (\`${id}\`)

\`npm run new:module\` 로 만든 뼈대(${date}). 이미 된 것과 **사람이 판단해서 채울 것**을 나눠 적는다.

## 이미 된 것
- [x] 폴더·설정 파일(\`manifest.js\`)·${[hasTeacher(audience) && '교사 화면', hasStudent(audience) && '학생 화면'].filter(Boolean).join('·')} 뼈대
- [x] 레지스트리(\`src/modules/registry.js\`) 등록 — \`tests/extensionRegistries.test.mjs\` 가 빠짐을 막는다
- [x] 기본 검사 \`tests/${camelOf(id)}Module.test.mjs\`(설정 규칙·등록·배포에서 숨김)
- [x] 배포해도 숨김: \`available\` 은 개발 서버에서만 참, \`defaultEnabled: false\`
${withDb ? `- [x] 마이그레이션 초안 \`supabase/migration-drafts/${snakeOf(id)}.sql\` + 스모크 초안(적용 도구가 읽지 않는 자리)\n` : ''}
## 채울 것 (공개 전에 모두)
- [ ] \`manifest.js\` 의 \`description\`·\`icon\`${part === 'game' ? '·`playground` 문구' : ''}${part === 'tool' ? '·`tool.order`' : ''}
- [ ] 화면: 공용 부품(\`components/common\`)·토큰만, 글자 0.8rem 이상(\`docs/wiki/DESIGN_GUIDE.md\`)
- [ ] 성능표: \`PERFORMANCE_HARNESS.md\` "콘텐츠를 추가할 때 반드시 적는 성능표"에 한 줄(홈 조회·열 때 요청 수·쓰기 RPC)
${withDb ? `- [ ] DB: 초안을 고친 뒤 \`supabase/migrations/<다음 번호>_${snakeOf(id)}.sql\` 로, 스모크는 \`tests/sql/<같은 이름>.smoke.sql\` 로 옮기고 \`npm run migrate:check\`
- [ ] 보안: \`SECURITY_HARNESS.md\` 에 경계 한 단락(누가 읽고 누가 쓰는지), \`npm run check:rpc-surface\`
` : ''}- [ ] 교사 도움말: \`src/constants/teacherGuides.js\` 에 \`'${id}'\` 안내, \`src/guides/teacherGuideRegistry.js\` 에 화면 연결${part === 'tool' ? `(\`{ tab: 'tools', tool: '${id}' }\`)` : ''}
${hasStudent(audience) ? `- [ ] 학생 도움말: \`src/components/student/studentGuide.js\` (설명 44자 이내)\n` : ''}- [ ] 시험 화면: \`src/dev/devLabRegistry.js\` 에 DB 없는 장면(빈 자료·보통·많은 자료·오류)
- [ ] 공개: \`available: true\`, \`FEATURE_MAP.md\` 줄 + 변경 기록, \`WORKLOG.md\`·\`ROADMAP.md\`
`;

const moduleTestFile = ({ id, part }) => {
    const variable = `${camelOf(id)}Manifest`;
    return `import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateManifest } from '../src/modules/types.js';
import { ${variable} } from '../src/modules/${PARTS[part].folder}/${id}/manifest.js';

// \`npm run new:module\` 이 만든 기본 검사. 모듈이 자라면 기능 검사를 이 파일에 더한다.
// 레지스트리는 확장자 없이 불러와 Node 에서 직접 열리지 않으므로 등록은 글로 확인한다(tests/extensionRegistries.test.mjs 와 같은 방식).
test('${id}: 설정 규칙을 지키고 레지스트리에 있다', () => {
    assert.deepEqual(validateManifest(${variable}), []);
    const registry = readFileSync('src/modules/registry.js', 'utf8');
    assert.ok(registry.includes("'./${PARTS[part].folder}/${id}/manifest'") && registry.split('${variable}').length - 1 >= 2, '레지스트리에 없습니다.');
});

test('${id}: 공개 전에는 배포에서 숨고 학급 기본값은 꺼져 있다', () => {
    assert.equal(${variable}.defaultEnabled, false);
    // 검사(Node)에는 개발 서버 표시가 없어 거짓이어야 한다. 공개할 때 이 검사를 함께 고친다.
    assert.equal(${variable}.available, false);
    assert.equal(${variable}.performance.realtime, 'none');
});
`;
};

const migrationDraftFile = ({ id, name }) => {
    const table = `${snakeOf(id)}_items`;
    return `-- ${name}(${id}) 마이그레이션 초안 — \`npm run new:module\` 이 만든 틀. 고친 뒤 supabase/migrations/<다음 번호>_${snakeOf(id)}.sql 로 옮긴다.
-- 이 저장소의 보안 규칙이 들어 있다: 표는 RLS 를 켜고 직접 권한을 모두 닫는다, 읽기·쓰기는 SECURITY DEFINER RPC 로만,
-- 함수마다 SET search_path, 교사는 담당 학급(classes.teacher_id = auth.uid())만, 학생은 students.auth_id = auth.uid() 로 자기 학급만,
-- anon 에 열지 않는다, WHERE 없는 UPDATE/DELETE 를 두지 않는다(authenticator 의 safeupdate).

BEGIN;

CREATE TABLE IF NOT EXISTS public.${table} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    created_by UUID NOT NULL,
    body JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (pg_column_size(body) <= 16384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_${table}_class_created ON public.${table} (class_id, created_at DESC);

ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated;

-- 교사: 담당 학급의 목록(열 때만, 최대 50행 — manifest performance.maxInitialRows 와 같게)
CREATE OR REPLACE FUNCTION public.get_${snakeOf(id)}_items_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '[보안] 교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes class WHERE class.id = p_class_id AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '[보안] 담당 학급이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', item.id, 'body', item.body, 'created_at', item.created_at) ORDER BY item.created_at DESC)
        FROM (
            SELECT * FROM public.${table} WHERE class_id = p_class_id ORDER BY created_at DESC LIMIT 50
        ) item
    ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.get_${snakeOf(id)}_items_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_${snakeOf(id)}_items_v1(UUID) TO authenticated;

COMMIT;
`;
};

const smokeDraftFile = ({ id }) => `-- ${id} 스모크 초안(전부 롤백된다). 마이그레이션과 함께 tests/sql/<같은 이름>.smoke.sql 로 옮긴다.
DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_${snakeOf(id)}_items_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon 이 ${id} 목록 함수를 부를 수 있습니다.';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${snakeOf(id)}_items'::regclass) THEN
        RAISE EXCEPTION '${snakeOf(id)}_items 에 RLS 가 꺼져 있습니다.';
    END IF;
    -- TODO: 다른 학급 교사·학생·anon 으로 흉내 내어 거절되는지(20261352 스모크 참고).
END;
$$;
`;

/**
 * 만들 파일 목록. 이미 있는 파일은 CLI 가 덮어쓰지 않는다.
 * @returns {{ path: string, content: string }[]}
 */
export const buildModuleScaffold = ({ id, name, part, audience, withDb = false, date = new Date().toISOString().slice(0, 10) }) => {
    const dir = `src/modules/${PARTS[part].folder}/${id}`;
    const options = { id, name, part, audience, withDb, date };
    const files = [
        { path: `${dir}/manifest.js`, content: manifestFile(options) },
        { path: `${dir}/README.md`, content: readmeFile(options) },
        { path: `tests/${camelOf(id)}Module.test.mjs`, content: moduleTestFile(options) }
    ];
    if (hasTeacher(audience)) files.push({ path: `${dir}/TeacherEntry.jsx`, content: teacherEntryFile(options) });
    if (hasStudent(audience)) files.push({ path: `${dir}/StudentEntry.jsx`, content: studentEntryFile(options) });
    if (withDb) {
        files.push({ path: `supabase/migration-drafts/${snakeOf(id)}.sql`, content: migrationDraftFile(options) });
        files.push({ path: `supabase/migration-drafts/${snakeOf(id)}.smoke.sql`, content: smokeDraftFile(options) });
    }
    return files;
};

/**
 * 레지스트리에 불러오기 한 줄과 목록 한 줄을 더한 새 글을 돌려준다. 이미 있으면 그대로.
 */
export const addToRegistry = (source, { id, part }) => {
    const variable = `${camelOf(id)}Manifest`;
    const importPath = `./${PARTS[part].folder}/${id}/manifest`;
    if (source.includes(`'${importPath}'`)) return source;
    const importLines = [...source.matchAll(/^import \{ [A-Za-z0-9_]+ \} from '\.\/[^']+\/manifest';$/gm)];
    const lastImport = importLines.at(-1);
    if (!lastImport) throw new Error('레지스트리에서 manifest 불러오기 줄을 찾지 못했습니다.');
    const importEnd = lastImport.index + lastImport[0].length;
    let next = `${source.slice(0, importEnd)}\nimport { ${variable} } from '${importPath}';${source.slice(importEnd)}`;
    const arrayStart = next.indexOf('const manifests = [');
    const arrayEnd = next.indexOf('\n];', arrayStart);
    if (arrayStart < 0 || arrayEnd < 0) throw new Error('레지스트리의 manifests 목록을 찾지 못했습니다.');
    next = `${next.slice(0, arrayEnd)}\n  ${variable}, // src/modules/${PARTS[part].folder}/${id}/ (new:module, 공개 전)${next.slice(arrayEnd)}`;
    return next;
};
