#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';

const stackRoot = '/Users/seunghyeonmaegmini/agit-supabase';
const functionsRoot = `${stackRoot}/volumes/functions`;
const kongConfigPath = `${stackRoot}/volumes/api/kong.yml`;
const stackEnvPath = `${stackRoot}/.env`;
const hostCaddyPath = '/etc/caddy/Caddyfile';
const repoCaddyPath = 'ops/caddy/Caddyfile.with-access-log';
const agitApiOrigin = 'https://api.xn--vz0ba242ncqcba79xhwx.site';
const agitApiLocalOrigin = 'http://127.0.0.1:8100';
const expectedHsts = 'max-age=31536000; includeSubDomains';
const expectedFunctions = new Set([
    '_shared', 'book-search', 'korean-dictionary-search', 'main',
    'send-feedback', 'verify-admin-mode', 'vibe-ai', 'neis-meal', 'spelling-weekly-review'
]);

// Allowed while staged locally; mandatory once its database migration is applied.
const stagedFunctions = new Set(['class-agit-public-read']);
const failures = [];
const mode = async (path) => (await stat(path)).mode & 0o777;
const hasAgitApiHsts = (caddyfile) => {
    const blockStart = caddyfile.indexOf('api.xn--vz0ba242ncqcba79xhwx.site {');
    if (blockStart < 0) return false;
    const proxyStart = caddyfile.indexOf('reverse_proxy 127.0.0.1:8100', blockStart);
    const headerStart = caddyfile.indexOf(`header Strict-Transport-Security "${expectedHsts}"`, blockStart);
    return proxyStart > blockStart && headerStart > blockStart && headerStart < proxyStart;
};
const envValue = (contents, key) => {
    const prefix = `${key}=`;
    const line = contents.split('\n').find((candidate) => candidate.startsWith(prefix));
    if (!line) return '';
    return line.slice(prefix.length).trim().replace(/^(["'])(.*)\1$/, '$2');
};
const hasKongTerminationRoute = (kongConfig, serviceName, path) => {
    const serviceMarker = `  - name: ${serviceName}\n`;
    const serviceStart = kongConfig.indexOf(serviceMarker);
    if (serviceStart < 0) return false;
    const nextService = kongConfig.indexOf('\n  - name:', serviceStart + serviceMarker.length);
    const block = kongConfig.slice(serviceStart, nextService < 0 ? undefined : nextService);
    return block.includes(`          - ${path}`)
        && block.includes('      - name: request-termination')
        && block.includes('          status_code: 403');
};

try {
    const [compose, kongConfig, stackEnv] = await Promise.all([
        readFile(`${stackRoot}/docker-compose.yml`, 'utf8'),
        readFile(kongConfigPath, 'utf8'),
        readFile(stackEnvPath, 'utf8'),
    ]);
    if (!compose.includes('127.0.0.1:${KONG_HTTP_PORT}:8000/tcp')
        || !compose.includes('127.0.0.1:${KONG_HTTPS_PORT}:8443/tcp')) {
        failures.push('Kong 포트가 127.0.0.1 전용이 아닙니다.');
    }
    const realtimeManagementRoutes = [
        ['realtime-v1-rest-openapi', '/realtime/v1/api/openapi'],
        ['realtime-v1-rest-tenants', '/realtime/v1/api/tenants'],
    ];
    for (const [serviceName, path] of realtimeManagementRoutes) {
        if (!hasKongTerminationRoute(kongConfig, serviceName, path)) {
            failures.push(`Kong의 Realtime 관리 경로 403 차단 누락: ${path}`);
        }
    }
    if (await mode(`${stackRoot}/secrets.agit.env`) !== 0o600) {
        failures.push('secrets.agit.env 권한이 600이 아닙니다.');
    }
    for (const directory of ['/Users/seunghyeonmaegmini/backups', '/Users/seunghyeonmaegmini/backups/auto']) {
        if (await mode(directory) !== 0o700) failures.push(`${directory} 권한이 700이 아닙니다.`);
    }
    const entries = await readdir(functionsRoot, { withFileTypes: true });
    const deployed = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const unexpected = deployed.filter((name) => !expectedFunctions.has(name) && !stagedFunctions.has(name));
    const missing = [...expectedFunctions].filter((name) => !deployed.includes(name));
    if (unexpected.length) failures.push(`허용 목록 밖 Edge 함수: ${unexpected.join(', ')}`);
    if (missing.length) failures.push(`필수 Edge 함수 누락: ${missing.join(', ')}`);
    const publicReaderMigration = spawnSync('docker', ['exec', 'agit-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atc',
        "SELECT EXISTS(SELECT 1 FROM public.applied_migrations WHERE filename='20261243_class_agit_frozen_public_reads.sql');"], { encoding: 'utf8', timeout: 10000 });
    if (publicReaderMigration.status !== 0) failures.push('외부 전시 조회 마이그레이션 적용 여부 확인 실패');
    else if (publicReaderMigration.stdout.trim() === 't' && !deployed.includes('class-agit-public-read')) failures.push('필수 Edge 함수 누락: class-agit-public-read');

    const [hostCaddy, repoCaddy] = await Promise.all([
        readFile(hostCaddyPath, 'utf8'),
        readFile(repoCaddyPath, 'utf8'),
    ]);
    if (!hasAgitApiHsts(hostCaddy)) failures.push('호스트 Caddy의 아지트 API HSTS가 누락됐습니다.');
    if (!hasAgitApiHsts(repoCaddy)) failures.push('저장소 Caddy 원본의 아지트 API HSTS가 누락됐습니다.');

    try {
        const response = await fetch(`${agitApiOrigin}/`, {
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
        });
        if (response.headers.get('strict-transport-security') !== expectedHsts) {
            failures.push('공개 아지트 API 응답의 HSTS가 운영 기준과 다릅니다.');
        }
    } catch (error) {
        failures.push(`공개 아지트 API HSTS 확인 실패: ${error instanceof Error ? error.message : String(error)}`);
    }

    const anonKey = envValue(stackEnv, 'ANON_KEY');
    if (!anonKey) {
        failures.push('Realtime 관리 경로 검사에 필요한 공개 anon 키 위치를 찾지 못했습니다.');
    } else {
        for (const [, path] of realtimeManagementRoutes) {
            try {
                const response = await fetch(`${agitApiLocalOrigin}${path}`, {
                    headers: { apikey: anonKey },
                    signal: AbortSignal.timeout(5000),
                });
                if (response.status !== 403) {
                    failures.push(`Realtime 관리 경로가 403이 아닙니다: ${path} (${response.status})`);
                }
            } catch (error) {
                failures.push(`Realtime 관리 경로 확인 실패 ${path}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
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
console.log('운영 보안 기준 통과: Kong 로컬 바인딩·Realtime 관리 경로 차단, 파일 권한, Edge 함수 허용 목록, 아지트 API HSTS');
