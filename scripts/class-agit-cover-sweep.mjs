#!/usr/bin/env node
/**
 * 글꽃 책방 표지 그림 매주 정리(2026-10-06, 선생님 결정: 문집이 있는 동안만 보관, 문집을 지우면 함께 삭제).
 *
 *   node scripts/class-agit-cover-sweep.mjs            그 문집이 없어진(학급 삭제 포함) 표지 그림을 지운다
 *   node scripts/class-agit-cover-sweep.mjs --dry-run  지울 개수만 보여 준다
 *
 * 평소에는 선생님이 문집을 지울 때 화면이 바로 지운다(releaseApi.bookAction 'delete'). 이 정리는 그때 실패했거나
 * 학급 삭제처럼 문집이 한꺼번에 사라진 경우를 맡는다. 저장소가 파일 방식이라 DB 줄이 아니라 저장소 기능으로 지운다.
 * 목록은 DB 함수 `class_agit_orphan_cover_paths_v1`(service_role 전용, 20261370).
 * 비밀 값(service_role 키)은 ~/agit-supabase/.env 에서 그때 읽고 출력하지 않는다.
 * LaunchAgent: ops/launchd/com.agit.class-agit-cover-sweep.plist (일요일 05:40)
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const HOME = homedir();
const BASE = process.env.AGIT_SUPABASE_URL || 'http://127.0.0.1:8100';
const STATUS = path.join(HOME, 'backups/auto/class-agit-cover-sweep-status.txt');
const dryRun = process.argv.includes('--dry-run');

const env = Object.fromEntries(readFileSync(path.join(HOME, 'agit-supabase/.env'), 'utf8').split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; }));
const KEY = env.SERVICE_ROLE_KEY;
if (!KEY) { console.error('service_role 키를 찾지 못했습니다(~/agit-supabase/.env).'); process.exit(1); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const status = (line) => {
    try { mkdirSync(path.dirname(STATUS), { recursive: true }); appendFileSync(STATUS, `${line}\n`); } catch { /* 기록 실패는 정리 결과를 바꾸지 않는다 */ }
};
const stamp = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');

try {
    const response = await fetch(`${BASE}/rest/v1/rpc/class_agit_orphan_cover_paths_v1`, { method: 'POST', headers, body: '{}' });
    if (!response.ok) throw new Error(`목록을 읽지 못했습니다(${response.status}).`);
    const paths = (await response.json()).map((row) => (typeof row === 'string' ? row : row.class_agit_orphan_cover_paths_v1)).filter(Boolean);
    if (dryRun) {
        console.log(`지울 표지 그림 ${paths.length}개(시험 — 지우지 않음)`);
        process.exit(0);
    }
    let removed = 0;
    for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100);
        const del = await fetch(`${BASE}/storage/v1/object/class-agit-covers`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: batch }) });
        if (!del.ok) throw new Error(`지우기 실패(${del.status}).`);
        removed += batch.length;
    }
    console.log(`문집이 없어진 표지 그림 ${removed}개를 지웠습니다.`);
    status(`PASS ${stamp} removed=${removed}`);
} catch (error) {
    console.error(error.message);
    status(`FAILED ${stamp} ${error.message}`);
    process.exit(1);
}
