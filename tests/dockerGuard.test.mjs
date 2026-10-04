import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 진짜 docker 대신 받은 인자를 그대로 찍는 가짜를 쓴다(`inspect` 는 ID → 이름 흉내).
const dir = mkdtempSync(path.join(tmpdir(), 'docker-guard-'));
const fake = path.join(dir, 'docker');
writeFileSync(fake, '#!/bin/bash\nif [ "$1" = inspect ] && [ "$2" = --format ]; then [ "$4" = abc123 ] && echo /jarvis-caddy; exit 0; fi\necho "REAL $*"\n');
chmodSync(fake, 0o755);
const guard = path.resolve('ops/docker-guard/docker');
// 앞문은 맥미니의 bash 스크립트다. 배포 이미지(alpine, bash 없음) 안 검사에서는 건너뛴다(2026-10-05 자동 배포 실패).
const skip = existsSync('/bin/bash') ? false : '/bin/bash 가 없는 환경(배포 이미지)';

const run = (args, { openclaw = true } = {}) => {
    const env = { PATH: process.env.PATH, HOME: dir, AGIT_DOCKER_REAL: fake };
    if (openclaw) env.OPENCLAW_SERVICE_MARKER = 'openclaw';
    const result = spawnSync('/bin/bash', [guard, ...args], { env, encoding: 'utf8' });
    return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
};

test('오픈클로가 부르면 세 앱의 재시작·종료·삭제를 막는다(이름·ID·container 꼴·compose)', { skip }, () => {
    for (const args of [
        ['restart', 'jarvis-caddy'], ['stop', 'agit-app'], ['kill', 'samlink-app'], ['rm', '-f', 'agit-db'],
        ['container', 'restart', 'agit-kong'], ['--context', 'default', 'restart', 'jarvis-frontend'], ['restart', 'abc123'],
        ['pause', 'agit-auth'], ['update', '--restart=no', 'samlink-cleanup'],
        ['compose', 'restart'], ['compose', '-f', 'x.yml', 'down'], ['compose', 'up', '-d'], ['system', 'prune', '-f'], ['container', 'prune'],
        ['exec', 'agit-app', 'kill', '1'], ['exec', 'jarvis-frontend', 'sh', '-c', 'pkill node']
    ]) {
        const result = run(args);
        assert.equal(result.code, 77, `막혀야 함: docker ${args.join(' ')}`);
        assert.match(result.err, /재시작·종료할 수 없어요/);
        assert.equal(result.out, '', '진짜 docker 를 부르면 안 됨');
    }
});

test('오픈클로라도 읽기·조회·지키지 않는 컨테이너 일은 그대로 넘긴다', { skip }, () => {
    for (const args of [
        ['ps'], ['logs', '--tail', '5', 'agit-app'], ['exec', 'agit-db', 'psql', '-U', 'postgres', '-c', 'select 1'],
        ['inspect', 'agit-app'], ['restart', 'some-other-container'], ['compose', 'ps'], ['stats', '--no-stream']
    ]) {
        const result = run(args);
        assert.equal(result.code, 0, `넘겨야 함: docker ${args.join(' ')}`);
        assert.equal(result.out, `REAL ${args.join(' ')}`);
    }
});

test('오픈클로가 아니면(선생님·Claude·자동 배포) 무엇이든 그대로 진짜 docker', { skip }, () => {
    for (const args of [['restart', 'jarvis-caddy'], ['compose', 'up', '-d'], ['rm', '-f', 'agit-db']]) {
        const result = run(args, { openclaw: false });
        assert.equal(result.code, 0);
        assert.equal(result.out, `REAL ${args.join(' ')}`);
    }
    const source = readFileSync(guard, 'utf8');
    assert.match(source, /PROTECTED='\^\/\?\(agit-\|jarvis\|samlink\)'/);
});
