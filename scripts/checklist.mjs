#!/usr/bin/env node

/**
 * 이번 변경에서 **사람만 아는 것**을 짚어 준다.
 *
 * 왜 필요한가:
 *   규칙은 `AGENTS.md` 에 다 있는데 200줄이라 매번 훑다 보면 건너뛴다.
 *   성능표·홈 조회·폴링·N+1 같은 것은 검사 322개가 이미 배포를 막으므로 외울 필요가 없다.
 *   기계가 못 잡는 것만 여기서 알려 준다 — **바뀐 파일에 해당하는 것만** 뜬다.
 *
 * 특히 자주 나던 실수 하나를 자동으로 본다:
 *   **고친 파일을 부르는 다른 곳을 안 고치고 끝내는 것.**
 *   공지 팝업이 그랬다 — 화면 조회·부트스트랩·창 내보내기 셋 중 하나만 빠져도
 *   오류 없이 조용히 아무 일도 안 일어난다.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const run = (cmd, args) => {
    try {
        // stderr 는 버린다 — 도구가 없을 때 나는 안내가 확인표에 섞이면 읽기 어렵다.
        return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
};

const has = (cmd) => Boolean(run(process.platform === 'win32' ? 'where' : 'which', [cmd]));

// --- 무엇이 바뀌었나 ---------------------------------------------------------
// 아직 안 올린 커밋 + 작업 트리 변경을 함께 본다. "지금 손댄 것" 전부가 대상이다.
// 기준은 아직 안 올린 것 전부(origin/main 대비). 더 넓게 보려면 CHECKLIST_BASE 로 바꾼다
// (예: CHECKLIST_BASE=HEAD~5 npm run checklist).
const baseRef = process.env.CHECKLIST_BASE
    || (run('git', ['rev-parse', '--verify', '--quiet', 'origin/main']) ? 'origin/main' : 'HEAD');
const changed = new Set([
    ...run('git', ['diff', '--name-only', baseRef]).split('\n'),
    ...run('git', ['diff', '--name-only', '--cached']).split('\n'),
    ...run('git', ['ls-files', '--others', '--exclude-standard']).split('\n')
].map((line) => line.trim()).filter(Boolean));

if (changed.size === 0) {
    console.log('바뀐 것이 없습니다. 확인할 것도 없습니다.');
    process.exit(0);
}

const notes = [];
const pick = (test) => [...changed].filter(test).sort();

// --- 1) 밀린 마이그레이션 ----------------------------------------------------
// 화면은 새것인데 DB가 옛것이면 기능이 통째로 실패한다. 순서를 지켜야 한다.
const migrationsDir = 'supabase/migrations';
const dockerHere = has('docker');
let pending = [];

if (dockerHere && existsSync(migrationsDir)) {
    // 맥미니처럼 DB에 닿는 곳에서는 진짜 답을 준다.
    const appliedRaw = run('docker', [
        'exec', '-i', process.env.AGIT_DB_CONTAINER || 'agit-db',
        'psql', '-U', process.env.AGIT_DB_USER || 'supabase_admin', '-d', 'postgres',
        '-t', '-A', '-c', 'SELECT filename FROM public.applied_migrations;'
    ]);
    if (appliedRaw) {
        const applied = new Set(appliedRaw.split('\n').map((s) => s.trim()).filter(Boolean));
        pending = readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql') && !applied.has(f))
            .sort();
    }
} else {
    // 다른 기기에서는 "이번에 새로 만든 것" 만 알 수 있다. 이미 올렸지만 적용 안 된 것은 못 본다.
    pending = pick((f) => f.startsWith(`${migrationsDir}/`) && f.endsWith('.sql'))
        .map((f) => path.basename(f));
}

if (pending.length > 0) {
    notes.push({
        level: '⚠️',
        title: `마이그레이션 ${pending.length}개 — **배포 전에** 맥미니에서 적용`,
        lines: [
            ...pending.slice(0, 6),
            pending.length > 6 ? `… 외 ${pending.length - 6}개` : '',
            '',
            'cd ~/vibe_agit && git pull && npm run migrate',
            dockerHere ? '' : '(이 기기에서는 새로 만든 것만 보입니다. 정확한 답은 맥미니의 npm run migrate:status)'
        ].filter(Boolean)
    });
}

// --- 2) 화면 변경 → 브라우저로 열어 보기 --------------------------------------
// 2026-08-18 덱마스터가 선언보다 먼저 쓴 변수로 죽었다. 빌드도 린트도 통과했다.
const screens = pick((f) => /^src\/.*\.(jsx|css)$/.test(f));
if (screens.length > 0) {
    notes.push({
        level: '⚠️',
        title: `화면 파일 ${screens.length}개 변경 — 브라우저로 한 번 열어 보셨나요?`,
        lines: screens.slice(0, 6).map((f) => path.basename(f))
            .concat(screens.length > 6 ? [`… 외 ${screens.length - 6}개`] : [])
    });
}

// --- 3) 고친 파일을 부르는 다른 곳 --------------------------------------------
// 이번 정리의 핵심. 한 곳만 고치고 끝내는 것을 막는다.
const sourceChanged = pick((f) => /^src\/.*\.(jsx|js|ts|tsx)$/.test(f));
const callers = [];
for (const file of sourceChanged) {
    const stem = path.basename(file).replace(/\.(jsx|js|ts|tsx)$/, '');
    if (stem === 'index') continue;
    // 이 파일을 import 하는 다른 파일을 찾는다(자기 자신과 이번에 함께 고친 것은 뺀다).
    const hits = run('git', ['grep', '-l', '-E', `from ['"].*/${stem}['"]`, '--', 'src'])
        .split('\n').map((s) => s.trim())
        .filter((s) => s && s !== file && !changed.has(s));
    if (hits.length > 0) callers.push({ file: path.basename(file), hits });
}
if (callers.length > 0) {
    notes.push({
        level: '🔗',
        title: '고친 파일을 부르는 곳이 남아 있습니다 — 함께 고쳐야 하는지 보세요',
        lines: callers.slice(0, 5).flatMap(({ file, hits }) => [
            `${file} ← ${hits.length}곳`,
            ...hits.slice(0, 3).map((h) => `    ${h}`)
        ])
    });
}

// --- 4) git 밖 설치가 필요한 것 -----------------------------------------------
const scripts = pick((f) => f.startsWith('scripts/') && f.endsWith('.sh'));
if (scripts.length > 0) {
    notes.push({
        level: '⚠️',
        title: '호스트 스크립트가 바뀌었습니다 — 맥미니에 걸어야 실제로 돕니다',
        lines: [...scripts.map((f) => path.basename(f)), '', '설치 순서는 ADMIN_DASHBOARD_GUIDE.md 또는 WORKLOG 참고']
    });
}

// --- 5) 기록 ------------------------------------------------------------------
// 문서만 바꿔도 기록은 남긴다 — git 밖 절차(맥미니 설치 등)는 WORKLOG 에만 남는다.
const toolingChanged = pick((f) => f.startsWith('scripts/') || f.startsWith('supabase/') || (f.startsWith('docs/') && f.endsWith('.md'))).length > 0;
const codeTouched = sourceChanged.length > 0 || pending.length > 0 || toolingChanged;
if (codeTouched && !changed.has('WORKLOG.md')) {
    notes.push({
        level: '⚠️',
        title: 'WORKLOG.md 가 아직 안 바뀌었습니다',
        lines: ['배경·변경·검증·남은 일을 맨 위에 한 항목 남깁니다.', 'git 밖(맥미니) 변경도 여기에만 남습니다.']
    });
}

// --- 6) 새 검사는 되돌려서 확인했나 --------------------------------------------
const newTests = pick((f) => f.startsWith('tests/') && f.endsWith('.mjs'));
if (newTests.length > 0) {
    notes.push({
        level: '🧪',
        title: '새 검사가 **진짜로 잡는지** 확인하셨나요?',
        lines: [
            ...newTests.map((f) => path.basename(f)),
            '',
            '일부러 코드를 되돌려 검사가 실패하는 것까지 봐야 합니다.',
            '통과만 하고 아무것도 안 보는 검사가 실제로 나온 적이 있습니다.'
        ]
    });
}

// --- 출력 ---------------------------------------------------------------------
console.log(`\n📋 이번 변경 확인표 — 파일 ${changed.size}개\n`);
if (notes.length === 0) {
    console.log('  사람이 따로 볼 것은 없습니다. 나머지는 검사가 봅니다.\n');
    process.exit(0);
}
for (const [index, note] of notes.entries()) {
    console.log(`${note.level}  ${index + 1}. ${note.title}`);
    for (const line of note.lines) console.log(line ? `      ${line}` : '');
    console.log('');
}
console.log('  성능표·홈 조회·폴링·N+1·권한 경계는 검사가 이미 배포를 막습니다. 여기 없으면 신경 쓰지 않아도 됩니다.\n');
