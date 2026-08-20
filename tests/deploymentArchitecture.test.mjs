import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const [workflow, dockerfile, dockerignore, caddy, localDeploy] = await Promise.all([
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('Dockerfile', 'utf8'),
    readFile('.dockerignore', 'utf8'),
    readFile('Caddyfile.container', 'utf8'),
    readFile('scripts/deploy-local.sh', 'utf8')
]);

test('로컬 배포도 CI와 같은 일을 한다 — 앱과 AI 함수를 함께 맞춘다', () => {
    // `vibe-ai` 는 앱 이미지 밖(맥미니 폴더)에서 돌기 때문에 따로 복사해야 반영된다.
    // 로컬 배포에만 이 단계가 없으면 "앱은 새것, 함수는 옛것"이 되고 200이 떠서 성공처럼 보인다.
    assert.match(localDeploy, /volumes\/functions\/vibe-ai\/index\.ts/);
    assert.match(localDeploy, /cmp -s "\$FN_SRC" "\$FN_DST"/);
    assert.match(localDeploy, /install -m 0644 "\$FN_SRC" "\$FN_DST"/);
    // 바꾼 뒤에는 컨테이너 상태와 응답까지 본다(CI 의 Verify 와 같은 기준).
    assert.match(localDeploy, /docker inspect -f '\{\{\.State\.Status\}\}' agit-edge-functions/);
    assert.match(localDeploy, /functions\/v1\/vibe-ai/);
    assert.match(localDeploy, /EDGE_CODE" = "400"/);
    // 되돌릴 사본을 남긴다 — 이 폴더는 git 밖이라 복구 수단이 사본뿐이다.
    assert.match(localDeploy, /cp "\$FN_DST" "\$FN_DST\.bak-/);
});

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
    assert.match(workflow, /docker compose up -d --no-deps --force-recreate functions/);
    assert.match(workflow, /docker inspect -f '\{\{\.State\.Status\}\}' agit-edge-functions/);
    assert.match(workflow, /http:\/\/127\.0\.0\.1:8100\/functions\/v1\/vibe-ai/);
    assert.match(workflow, /\[ "\$edge_code" = "400" \]/);
    assert.match(dockerfile, /npm run test:all/);
    assert.doesNotMatch(dockerignore, /^scripts\/\*/m);
    assert.doesNotMatch(dockerignore, /^\*\.md$/m);
    assert.match(dockerfile, /FROM caddy:2-alpine AS runner/);
    assert.match(caddy, /try_files \{path\} \/index\.html/);
});

test('러너는 배포 뒤 빌드 캐시를 상한 안으로만 정리한다', () => {
    assert.match(workflow, /name: Trim docker build cache\n\s*if: always\(\)\n\s*continue-on-error: true/);
    assert.match(workflow, /docker builder prune -f --max-used-space 6GB/);
    // 전체 삭제는 다음 배포를 콜드 빌드로 만들고, system prune은 다른 프로젝트의 볼륨·네트워크까지 지운다.
    assert.doesNotMatch(workflow, /docker builder prune -a/);
    assert.doesNotMatch(workflow, /docker system prune/);
    assert.doesNotMatch(workflow, /docker image prune -a/);
});

test('저장소 배포 경로에는 Vercel 호스팅 설정이 없다', async () => {
    await assert.rejects(access('vercel.json'), { code: 'ENOENT' });
    assert.doesNotMatch(workflow, /vercel/i);
    assert.doesNotMatch(dockerfile, /vercel/i);
});
