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
// eslint-disable-next-line security/detect-non-literal-fs-filename -- 호출부는 이 파일의 고정된 배포 파일 경로 8개뿐이다.
const readText = async (path) => (await readFile(path, 'utf8')).split('\r\n').join('\n');

const [workflow, dockerfile, dockerignore, caddy, localDeploy, preflight, trimCache, trimPlist, runApp, buildApp, syncShared] = await Promise.all([
    readText('.github/workflows/deploy.yml'),
    readText('Dockerfile'),
    readText('.dockerignore'),
    readText('Caddyfile.container'),
    readText('scripts/deploy-local.sh'),
    readText('scripts/preflight-disk.sh'),
    readText('scripts/trim-docker-cache.sh'),
    readText('ops/launchd/com.agit.docker-cache-trim.plist'),
    readText('scripts/run-agit-app.sh'),
    readText('scripts/build-agit-app.sh'),
    readText('scripts/sync-edge-shared.sh')
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
    // 만드는 방법 자체는 scripts/build-agit-app.sh 에 모았다.
    assert.match(workflow, /bash scripts\/build-agit-app\.sh/);
    assert.match(buildApp, /docker build[\s\S]*-t agit-app:prod \./);
    // 띄우는 방법 자체는 scripts/run-agit-app.sh 에 모았다(굳히기 옵션은 아래 전용 검사가 지킨다).
    assert.match(workflow, /bash scripts\/run-agit-app\.sh/);
    assert.match(runApp, /--name "\$NAME"[\s\S]*--restart unless-stopped/);
    assert.match(runApp, /HOST_PORT="\$\{2:-8300\}"/);
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

    // 기준을 넘을 때만 통째로 비운다(사용률·캐시 크기 두 갈래)
    assert.match(trimCache, /MAX_USE_PCT="\$\{1:-\d+\}"/);
    assert.match(trimCache, /MAX_CACHE_GB="\$\{2:-\d+\}"/);
    assert.match(trimCache, /기준 안이라 그대로 둡니다/);

    /*
     * 묵은 캐시는 기준과 상관없이 늘 지운다 (2026-09-10).
     *   캐시는 쓰레기가 아니라 다음 빌드를 빠르게 하는 재료다. 그래서 통째로 비우지 않고
     *   `until` 로 "이틀 넘게 아무 빌드도 손대지 않은 것"만 고른다. 최근 배포가 만든 캐시는
     *   남으므로 배포가 느려지지 않는다. `-a`(전부)를 여기에 쓰면 그 뜻이 사라진다.
     */
    assert.match(trimCache, /STALE_AFTER="\$\{3:-\d+h\}"/);
    assert.match(trimCache, /docker builder prune -f --filter "until=\$\{STALE_AFTER\}"/);
    assert.doesNotMatch(trimCache, /prune -a[^\n]*--filter "until=/);

    // 배포 밖에서 빌드한 날도 훑는 그물이 있다
    assert.match(trimPlist, /com\.agit\.docker-cache-trim/);
    assert.match(trimPlist, /scripts\/trim-docker-cache\.sh/);
    assert.match(trimPlist, /StartCalendarInterval/);
});

test('앱 컨테이너를 띄우는 자리는 하나뿐이고, 굳히기가 빠지지 않는다', () => {
    // 왜 이 검사가 있나 (2026-09-09 보안 점검 P2):
    //   `docker run ... agit-app` 이 로컬 배포와 자동 배포 두 곳에 따로 있었다. 한쪽에만 굳히기를
    //   넣으면 어느 경로로 배포했느냐에 따라 root 로 돌기도 하고 아니기도 하는데, 둘 다 "배포 성공"이라
    //   말하므로 눈으로는 절대 알 수 없다. 그래서 자리를 하나로 모으고 여기서 지킨다.
    for (const [name, text] of [['자동 배포', workflow], ['로컬 배포', localDeploy]]) {
        assert.match(text, /bash scripts\/run-agit-app\.sh/, `${name}가 공용 실행 스크립트를 쓰지 않는다`);
        assert.doesNotMatch(text, /docker run[^\n]*--name agit-app/, `${name}에 직접 docker run 이 남아 있다`);
    }

    // 굳히기 옵션이 하나라도 빠지면 막는다. 샘링크·자비스와 같은 수준을 유지한다.
    for (const flag of [
        '--user 1000:1000',
        '--read-only',
        '--cap-drop ALL',
        '--security-opt no-new-privileges',
        '--memory 256m'
    ]) {
        assert.ok(runApp.includes(flag), `run-agit-app.sh 에 ${flag} 가 없다`);
    }

    // caddy 실행 파일에 setcap 이 박혀 있어, 이 권한이 없으면 no-new-privileges 와 겹쳐
    // 컨테이너가 실행조차 못 하고 죽는다. 굳히려다 앱을 내리는 일을 막는다.
    assert.ok(runApp.includes('--cap-add NET_BIND_SERVICE'),
        'NET_BIND_SERVICE 가 없으면 caddy 가 실행되지 않는다');

    // 비root 로 돌리려면 1024 미만 포트를 열 수 없다. 세 곳의 포트가 함께 움직여야 한다.
    assert.match(caddy, /^:8080 \{/m, '컨테이너 Caddy 가 8080 을 듣지 않는다');
    assert.match(dockerfile, /^EXPOSE 8080$/m, 'Dockerfile 의 EXPOSE 가 8080 이 아니다');
    assert.match(runApp, /127\.0\.0\.1:\$\{HOST_PORT\}:8080/, '컨테이너 안쪽 연결 포트가 8080 이 아니다');
});

test('되돌릴 지점은 덮어쓰기 전에 남긴다', () => {
    // 왜 이 검사가 있나 (2026-09-09):
    //   전에는 빌드가 끝난 뒤 `docker tag agit-app:prod agit-app:$(date)` 를 했다. 그 시점의
    //   `prod` 는 방금 만든 **새 이미지**라, 주석이 말하는 "되돌릴 지점"이 되지 못했다.
    //   게다가 자동 배포에는 그 태그마저 없었다 — 주 배포 경로에 되돌릴 표가 아예 없었다.
    for (const [name, text] of [['자동 배포', workflow], ['로컬 배포', localDeploy]]) {
        assert.match(text, /bash scripts\/build-agit-app\.sh/, `${name}가 공용 빌드 스크립트를 쓰지 않는다`);
        assert.doesNotMatch(text, /docker build[^\n]*-t agit-app/, `${name}에 직접 docker build 가 남아 있다`);
        assert.doesNotMatch(text, /docker tag agit-app/, `${name}에 직접 태그가 남아 있다`);
    }

    // 태그가 `docker build` 보다 **앞**에 있어야 덮어쓰기 전 이미지를 가리킨다.
    // 주석에도 `docker build` 라는 글자가 나오므로, 줄 맨 앞에서 시작하는 **명령**만 본다.
    const tagAt = buildApp.search(/^\s*docker tag agit-app:prod/m);
    const buildAt = buildApp.search(/^\s*docker build\b/m);
    assert.ok(tagAt > -1, '되돌림 태그를 남기지 않는다');
    assert.ok(buildAt > -1, '이미지를 만들지 않는다');
    assert.ok(tagAt < buildAt, '되돌림 태그가 빌드 뒤에 있으면 새 이미지를 가리켜 쓸모가 없다');

    // 첫 빌드에는 이전 이미지가 없다. 없다고 배포가 멈추면 안 된다.
    assert.match(buildApp, /docker image inspect agit-app:prod/);
});

test('함수들이 함께 쓰는 파일은 각 함수보다 먼저, 두 경로에서 같이 올라간다', () => {
    /*
     * 왜 이 검사가 있나 (2026-09-10):
     *   AI 모델 이름을 `supabase/functions/_shared/model.js` 한 곳으로 모았다. 이 파일은 각 함수
     *   폴더 **밖**에 있어서, 함수만 올리고 이걸 빠뜨리면 함수가 import 에서 죽는다.
     *   로컬에는 파일이 있어 **로컬 검사로는 절대 못 잡는** 종류의 사고다.
     */
    for (const [name, text] of [['자동 배포', workflow], ['로컬 배포', localDeploy]]) {
        assert.match(text, /bash scripts\/sync-edge-shared\.sh/, `${name}가 공유 파일을 올리지 않는다`);
        // 함수 본체보다 **먼저** 올라가야 한다. 순서가 뒤집히면 한 번은 깨진 채로 뜬다.
        assert.ok(text.indexOf('sync-edge-shared.sh') < text.indexOf('vibe-ai/index.ts'),
            `${name}에서 공유 파일이 함수보다 나중에 올라간다`);
    }

    // 올린 뒤 실제로 읽히는지 확인한다. import 가 깨지면 함수는 400 이 아니라 500 을 준다.
    assert.match(syncShared, /functions\/v1\/vibe-ai/);
    assert.match(syncShared, /"\$shared_status" = "400"/);
    // 이 폴더는 git 밖이라 사본이 유일한 복구 수단이다.
    assert.match(syncShared, /\.bak-\$\(date/);
});
