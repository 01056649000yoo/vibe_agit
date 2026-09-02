import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 줄바꿈은 항상 `\n` 으로 맞춰서 읽는다.
 *
 * 저장소에는 `\n` 으로 들어 있지만 윈도우에서 받으면 `\r\n` 으로 바뀐다. 아래 검사들은 여러 줄에
 * 걸친 모양을 `\n` 으로 견주므로, 그대로 두면 **윈도우에서 작업하는 사람은 푸시 자체가 막힌다**
 * (2026-08-25에 실제로 막혔다). 검사가 보려는 것은 줄바꿈 방식이 아니라 배포 절차의 모양이다.
 */
const readText = async (path) => (await readFile(path, 'utf8')).split('\r\n').join('\n');

const [workflow, dockerfile, dockerignore, caddy, localDeploy, preflight, trimCache, trimPlist] = await Promise.all([
    readText('.github/workflows/deploy.yml'),
    readText('Dockerfile'),
    readText('.dockerignore'),
    readText('Caddyfile.container'),
    readText('scripts/deploy-local.sh'),
    readText('scripts/preflight-disk.sh'),
    readText('scripts/trim-docker-cache.sh'),
    readText('ops/launchd/com.agit.docker-cache-trim.plist')
]);

test('로컬 배포도 CI와 같은 일을 한다 — 앱과 Edge 함수를 함께 맞춘다', () => {
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
    assert.match(localDeploy, /volumes\/functions\/neis-meal/);
    assert.match(localDeploy, /cmp -s "\$NEIS_FN_SRC" "\$NEIS_FN_DST"/);
    assert.match(localDeploy, /install -m 0644 "\$NEIS_FN_SRC" "\$NEIS_FN_DST"/);
    assert.match(localDeploy, /functions\/v1\/neis-meal/);
    assert.match(localDeploy, /NEIS_EDGE_CODE" = "401"/);
    // 파일이 둘인 함수는 하나만 맞으면 지시문과 판정 버전이 어긋난다. 자동 배포에만 있고
    // 로컬 배포에 없어서 손으로 올리면 옛 판이 남았다(2026-08-28).
    assert.match(localDeploy, /volumes\/functions\/spelling-weekly-review/);
    assert.match(localDeploy, /for FILE in index\.ts reviewCore\.js/);
    assert.match(localDeploy, /functions\/v1\/spelling-weekly-review/);
    assert.match(localDeploy, /WEEKLY_EDGE_CODE" = "401"/);
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
    assert.match(workflow, /volumes\/functions\/neis-meal/);
    assert.match(workflow, /install -m 0644 supabase\/functions\/neis-meal\/index\.ts/);
    assert.match(workflow, /http:\/\/127\.0\.0\.1:8100\/functions\/v1\/neis-meal/);
    assert.match(workflow, /\[ "\$neis_edge_code" = "401" \]/);
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

test('배포 관문은 맥 디스크뿐 아니라 도커 안쪽 공간도 본다', () => {
    // 이 맥의 도커 데이터는 외장 SSD 위 32GB 상한 파일 안에 있다. 맥이 93GB 남아도 도커는 찰 수 있고,
    // 실제로 하루치 빌드로 57%까지 갔다. 맥 디스크만 보는 관문은 그 위험을 못 본다.
    assert.match(preflight, /trim-docker-cache\.sh/);
    assert.match(preflight, /docker exec .* df -P \//);
    assert.match(preflight, /DOCKER_USE" -ge 90/);

    // 캐시만 지운다 — 이미지·컨테이너·볼륨을 지우면 되돌릴 수 없는 것이 사라진다
    assert.match(trimCache, /docker builder prune -a -f/);
    assert.doesNotMatch(trimCache, /docker system prune|image prune|volume prune|-a -f --volumes/);

    // 기준을 넘을 때만 비운다(사용률·캐시 크기 두 갈래)
    assert.match(trimCache, /MAX_USE_PCT="\$\{1:-\d+\}"/);
    assert.match(trimCache, /MAX_CACHE_GB="\$\{2:-\d+\}"/);
    assert.match(trimCache, /기준 안이라 그대로 둡니다/);

    // 배포 밖에서 빌드한 날도 훑는 그물이 있다
    assert.match(trimPlist, /com\.agit\.docker-cache-trim/);
    assert.match(trimPlist, /scripts\/trim-docker-cache\.sh/);
    assert.match(trimPlist, /StartCalendarInterval/);
});
