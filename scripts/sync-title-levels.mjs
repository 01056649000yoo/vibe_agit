/**
 * 칭호 기준을 한 곳에서만 고치게 만드는 도구.
 *
 * 작가·독자 칭호 기준은 원래 **두 곳**에 같은 숫자가 있었다 —
 *   · 화면: `src/constants/writerLevels.js` (동기적으로 필요해서 상수여야 한다)
 *   · DB : `dragon_writer_level()` / `dragon_reader_level()`
 *          (학기 마감 때 그 시점의 칭호를 스냅샷에 **얼려 두는** 데 쓴다.
 *           이 값은 나중에 기준을 바꿔도 지난 학기 기록이 소급해서 바뀌지 않게 하는 장치라
 *           그냥 지울 수 없다.)
 *
 * 그래서 상수를 **원본**으로 두고 DB 함수를 여기서 **생성**한다. 숫자를 두 번 적는 일이 없어진다.
 *
 *   node scripts/sync-title-levels.mjs --check   기준이 어긋났는지 본다(어긋나면 실패)
 *   node scripts/sync-title-levels.mjs --write   새 마이그레이션 파일을 만든다
 *
 * `--check` 는 배포 전 검사에 넣어 두었다. 상수만 고치고 DB 를 잊으면 학기 마감 스냅샷에
 * 옛 기준이 찍혀 **작별 편지의 칭호가 화면과 어긋난다.** 그 조합은 눈으로 잡기 어렵다.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
    DIARY_LEVELS,
    READER_LEVELS,
    READING_LEVELS,
    WRITER_LEVELS
} from '../src/constants/writerLevels.js';

const DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const CONTAINER = 'agit-db';

/** 상수 배열 → `CASE ... END` 본문. 높은 단계부터 검사한다(첫 참이 답이 되도록). */
const buildWriterBody = () => {
    const rows = [...WRITER_LEVELS]
        .filter((item) => item.level > 1)
        .sort((a, b) => b.level - a.level)
        .map((item) => (item.criterion === 'posts'
            ? `        WHEN COALESCE(p_posts, 0) >= ${item.from} THEN ${item.level}`
            : `        WHEN COALESCE(p_chars, 0) >= ${item.from} THEN ${item.level}`));
    return [
        '    SELECT CASE',
        `        WHEN p_override BETWEEN 1 AND ${WRITER_LEVELS.length} THEN p_override`,
        ...rows,
        '        ELSE 1',
        '    END;'
    ].join('\n');
};

const buildReaderBody = () => {
    const rows = [...READER_LEVELS]
        .filter((item) => item.level > 1)
        .sort((a, b) => b.level - a.level)
        .map((item) => `        WHEN COALESCE(p_score, 0) >= ${item.from} THEN ${item.level}`);
    return [
        '    SELECT CASE',
        `        WHEN p_override BETWEEN 1 AND ${READER_LEVELS.length} THEN p_override`,
        ...rows,
        '        ELSE 1',
        '    END;'
    ].join('\n');
};

const buildDiaryBody = () => {
    const rows = [...DIARY_LEVELS]
        .filter((item) => item.level > 1)
        .sort((a, b) => b.level - a.level)
        .map((item) => `        WHEN COALESCE(p_days, 0) >= ${item.from} THEN ${item.level}`);
    return [
        '    SELECT CASE',
        ...rows,
        '        ELSE 1',
        '    END;'
    ].join('\n');
};

const buildReadingBody = () => {
    const rows = [...READING_LEVELS]
        .filter((item) => item.level > 1)
        .sort((a, b) => b.level - a.level)
        .map((item) => `        WHEN COALESCE(p_logs, 0) >= ${item.logsFrom} THEN ${item.level}`);
    return [
        '    SELECT CASE',
        ...rows,
        '        ELSE 1',
        '    END;'
    ].join('\n');
};

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

const readDeployed = (name) => {
    try {
        return execFileSync(DOCKER, [
            'exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA',
            '-c', `SELECT prosrc FROM pg_proc WHERE proname='${name}'`
        ], { encoding: 'utf8' });
    } catch {
        return null;
    }
};

const TARGETS = [
    { name: 'dragon_writer_level', body: buildWriterBody(), label: '작가' },
    { name: 'dragon_reader_level', body: buildReaderBody(), label: '소통' },
    { name: 'dragon_diary_level', body: buildDiaryBody(), label: '기록가' },
    { name: 'dragon_reading_level', body: buildReadingBody(), label: '독서가' }
];

/**
 * 기준 숫자를 **따로 베껴 쓴 함수**가 있는지 본다.
 * 2026-08-18에 `buy_my_dragon_decor`·`acknowledge_my_dragon_growth` 가 같은 숫자를 들고 있는 것을
 * 뒤늦게 찾았다. 그대로 뒀으면 기준을 바꿔도 이 둘만 옛 기준으로 판정해,
 * 화면에는 `대문호`인데 소품은 안 열리는 어긋남이 생겼을 것이다.
 */
const findInlinedCopies = () => {
    const marks = WRITER_LEVELS.filter((l) => l.criterion === 'chars' && l.from > 0).map((l) => l.from);
    const probe = marks.slice(-3).map((n) => `prosrc LIKE '%${n}%'`).join(' OR ');
    try {
        const out = execFileSync(DOCKER, [
            'exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA',
            '-c', `SELECT proname FROM pg_proc WHERE (${probe}) AND proname <> 'dragon_writer_level'`
        ], { encoding: 'utf8' });
        return out.split('\n').map((v) => v.trim()).filter(Boolean);
    } catch {
        return null;
    }
};

const mode = process.argv.includes('--write') ? 'write' : 'check';

if (mode === 'check') {
    let failed = false;
    for (const target of TARGETS) {
        const deployed = readDeployed(target.name);
        if (deployed === null) {
            console.log(`· ${target.label} 칭호: DB 를 읽지 못해 건너뜁니다(${target.name}).`);
            continue;
        }
        if (normalize(deployed) === normalize(target.body)) {
            console.log(`✓ ${target.label} 칭호 기준 일치 (${target.name})`);
        } else {
            failed = true;
            console.error(`\n✗ ${target.label} 칭호 기준이 어긋났습니다 — ${target.name}`);
            console.error('  상수(src/constants/writerLevels.js) 기준:');
            console.error(target.body);
            console.error('  DB 에 적용된 것:');
            console.error(deployed.trimEnd());
            console.error('\n  → node scripts/sync-title-levels.mjs --write 로 마이그레이션을 만들고 적용하세요.\n');
        }
    }
    const copies = findInlinedCopies();
    if (copies === null) {
        console.log('· 인라인 복사본 검사: DB 를 읽지 못해 건너뜁니다.');
    } else if (copies.length > 0) {
        failed = true;
        console.error(`\n✗ 기준 숫자를 따로 들고 있는 함수가 있습니다: ${copies.join(', ')}`);
        console.error('  → 그 함수가 public.dragon_writer_level(...) 을 부르도록 고치세요.');
        console.error('     두면 기준을 바꿔도 그 함수만 옛 기준으로 판정합니다.\n');
    } else {
        console.log('✓ 기준 숫자를 따로 들고 있는 함수 없음');
    }

    process.exit(failed ? 1 : 0);
}

// --write: 상수에서 만든 본문으로 마이그레이션 파일을 쓴다.
const requestedStamp = process.argv.find((argument) => argument.startsWith('--stamp='))?.split('=')[1];
if (requestedStamp && !/^\d{8}$/.test(requestedStamp)) {
    throw new Error('--stamp는 YYYYMMDD 형식이어야 합니다.');
}
const stamp = requestedStamp || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const file = `supabase/migrations/${stamp}_sync_title_levels.sql`;
const sql = `-- 칭호 기준 동기화 — **손으로 고치지 마세요.**
-- \`src/constants/writerLevels.js\` 를 고친 뒤
-- \`node scripts/sync-title-levels.mjs --write\` 로 다시 만듭니다.
--
-- 화면과 DB 가 같은 기준을 봐야 하는 이유: DB 쪽은 학기 마감 때 그 시점의 칭호를
-- 스냅샷에 얼려 두는 데 쓰인다. 어긋나면 작별 편지의 칭호가 화면과 달라진다.

BEGIN;

CREATE OR REPLACE FUNCTION public.dragon_writer_level(
    p_chars BIGINT,
    p_posts BIGINT,
    p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
${buildWriterBody()}
$$;

CREATE OR REPLACE FUNCTION public.dragon_reader_level(
    p_score BIGINT,
    p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
${buildReaderBody()}
$$;

CREATE OR REPLACE FUNCTION public.dragon_diary_level(p_days BIGINT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
${buildDiaryBody()}
$$;

CREATE OR REPLACE FUNCTION public.dragon_reading_level(p_logs BIGINT, p_books BIGINT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
${buildReadingBody()}
$$;

COMMENT ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) IS
    '독서가 칭호는 교사가 확인한 독서록 편수로만 계산한다. p_books는 기존 호출 호환을 위해만 유지한다.';

REVOKE ALL ON FUNCTION public.dragon_diary_level(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dragon_diary_level(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) TO service_role;

COMMIT;
`;
writeFileSync(file, sql);
console.log(`마이그레이션을 만들었습니다: ${file}`);
console.log('적용: npm run migrate');
