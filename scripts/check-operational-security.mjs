#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';

const stackRoot = '/Users/seunghyeonmaegmini/agit-supabase';
const functionsRoot = `${stackRoot}/volumes/functions`;
const expectedFunctions = new Set([
    '_shared', 'book-search', 'korean-dictionary-search', 'main',
    'send-feedback', 'verify-admin-mode', 'vibe-ai'
]);

const failures = [];
const mode = async (path) => (await stat(path)).mode & 0o777;

try {
    const compose = await readFile(`${stackRoot}/docker-compose.yml`, 'utf8');
    if (!compose.includes('127.0.0.1:${KONG_HTTP_PORT}:8000/tcp')
        || !compose.includes('127.0.0.1:${KONG_HTTPS_PORT}:8443/tcp')) {
        failures.push('Kong 포트가 127.0.0.1 전용이 아닙니다.');
    }
    if (await mode(`${stackRoot}/secrets.agit.env`) !== 0o600) {
        failures.push('secrets.agit.env 권한이 600이 아닙니다.');
    }
    for (const directory of ['/Users/seunghyeonmaegmini/backups', '/Users/seunghyeonmaegmini/backups/auto']) {
        if (await mode(directory) !== 0o700) failures.push(`${directory} 권한이 700이 아닙니다.`);
    }
    const entries = await readdir(functionsRoot, { withFileTypes: true });
    const deployed = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const unexpected = deployed.filter((name) => !expectedFunctions.has(name));
    const missing = [...expectedFunctions].filter((name) => !deployed.includes(name));
    if (unexpected.length) failures.push(`허용 목록 밖 Edge 함수: ${unexpected.join(', ')}`);
    if (missing.length) failures.push(`필수 Edge 함수 누락: ${missing.join(', ')}`);
} catch (error) {
    if (error?.code === 'ENOENT') {
        console.log('운영 맥미니 경로가 없어 운영 보안 검사를 건너뜁니다.');
        process.exit(0);
    }
    throw error;
}

if (failures.length) {
    failures.forEach((failure) => console.error(`실패: ${failure}`));
    process.exit(1);
}
console.log('운영 보안 기준 통과: Kong 로컬 바인딩, 파일 권한, Edge 함수 허용 목록');
