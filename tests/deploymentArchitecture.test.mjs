import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const [workflow, dockerfile, caddy] = await Promise.all([
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('Dockerfile', 'utf8'),
    readFile('Caddyfile.container', 'utf8')
]);

test('main 푸시는 맥미니 self-hosted 러너의 단일 배포 작업을 시작한다', () => {
    assert.match(workflow, /push:\s*[\s\S]*?branches:\s*\[main\]/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /group:\s*deploy-main/);
    assert.match(workflow, /cancel-in-progress:\s*false/);
    assert.match(workflow, /runs-on:\s*self-hosted/);
});

test('러너는 검증된 Docker 이미지를 agit-app으로 교체하고 로컬 응답을 확인한다', () => {
    assert.match(workflow, /docker build[\s\S]*-t agit-app:prod \./);
    assert.match(workflow, /docker run -d --name agit-app --restart unless-stopped -p 127\.0\.0\.1:8300:80 agit-app:prod/);
    assert.match(workflow, /curl[\s\S]*http:\/\/127\.0\.0\.1:8300\//);
    assert.match(dockerfile, /npm run test:architecture && npm run test:security:static && npm run test:deployment/);
    assert.match(dockerfile, /FROM caddy:2-alpine AS runner/);
    assert.match(caddy, /try_files \{path\} \/index\.html/);
});

test('저장소 배포 경로에는 Vercel 호스팅 설정이 없다', async () => {
    await assert.rejects(access('vercel.json'), { code: 'ENOENT' });
    assert.doesNotMatch(workflow, /vercel/i);
    assert.doesNotMatch(dockerfile, /vercel/i);
});
