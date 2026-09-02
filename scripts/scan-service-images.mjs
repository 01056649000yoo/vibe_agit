#!/usr/bin/env node

/**
 * 실행 중인 Docker 이미지를 tar로 하나씩 내보내 Trivy로 검사한다.
 * Trivy 컨테이너에는 Docker 소켓을 주지 않으며, DB에는 원본이 아닌 제한된 요약만 기록한다.
 *
 * 첫 기준 검사: npm run service:scan -- --force
 * 정기 실행:     npm run service:scan
 *   - 첫 기준이 없으면 실행하지 않는다.
 *   - 마지막 성공 검사로부터 30일이 지난 날에만 실행한다.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { getActiveFindingNotes, getExpiredFindingNotes } from '../src/constants/serviceFindingNotes.js';

const TRIVY_IMAGE = 'aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969';
const DOCKER = existsSync('/Applications/Docker.app/Contents/Resources/bin/docker')
    ? '/Applications/Docker.app/Contents/Resources/bin/docker'
    : 'docker';
const DB_CONTAINER = process.env.AGIT_DB_CONTAINER || 'agit-db';
const DB_USER = process.env.AGIT_DB_USER || 'supabase_admin';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const CONFIG_PATH = path.join(REPO_ROOT, 'ops/service-management/services.json');
const REPORT_ROOT = path.join(homedir(), 'Library/Application Support/Agit/service-scans');
const CACHE_ROOT = path.join(homedir(), 'Library/Caches/agit-trivy');
const force = process.argv.includes('--force');

const run = (command, args, options = {}) => execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options
});

const psql = (sql, input) => run(DOCKER, [
    'exec', '-i', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    ...(input ? [] : ['-t', '-A', '-c', sql])
], input ? { input } : {});

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
if (config.version !== 1 || !Number.isInteger(config.scanIntervalDays) || config.scanIntervalDays < 7) {
    throw new Error('서비스 관리 설정 버전 또는 검사 간격이 올바르지 않습니다.');
}

/*
 * 세지 않을 패키지.
 *
 * 왜 필요한가: 관리자 화면의 `지금 확인할 항목` 24건 중 12건이 `linux-libc-dev`(커널 헤더) 였다.
 * 컨테이너는 자기 커널을 띄우지 않고 호스트 커널을 쓴다 — 이미지 안의 커널 헤더는 실행되지 않으므로
 * 이미지를 고쳐 막을 수도, 이미지를 통해 공격당할 수도 없다. **진짜 조치할 11건이 여기 묻혀 있었다.**
 *
 * 규칙: 목록에 넣으려면 **이유를 함께 적어야 한다.** 그리고 조용히 지우지 않고 몇 건을 뺐는지
 * `ignored_count` 로 함께 기록해 화면에 `숨김 N건`으로 보여 준다. 원본 보고서에는 그대로 남는다.
 */
const ignoredPackages = new Map((config.ignoredPackages || []).map((entry) => {
    if (!entry || typeof entry.package !== 'string' || !entry.package.trim()
        || typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
        throw new Error('무시할 패키지는 이름과 10자 이상의 이유를 함께 적어야 합니다.');
    }
    return [entry.package.trim(), entry.reason.trim()];
}));
const isIgnoredPackage = (finding) => ignoredPackages.has(String(finding?.PkgName || ''));

/*
 * 확인해 보고 `해당 없음`으로 정리한 취약점(원본: src/constants/serviceFindingNotes.js).
 *
 * 검사기는 라이브러리가 들어 있는지만 볼 뿐 그 코드가 실행되는지는 못 본다. 그래서 SSH 를 켜지도
 * 않는 컨테이너에 SSH 인증 우회 CRITICAL 이 뜬다. 근거를 적어 두고 그 건은 세지 않는다.
 * **유효기간이 지난 판단은 다시 센다** — 구성은 바뀌고, 오늘의 근거가 반년 뒤에도 참이라는 보장은 없다.
 */
const activeNoteIds = new Set(getActiveFindingNotes().map((note) => note.id));
const expiredNotes = getExpiredFindingNotes();
if (expiredNotes.length > 0) {
    console.log(`⚠ 유효기간이 지난 '해당 없음' 판단 ${expiredNotes.length}건은 다시 셉니다: `
        + expiredNotes.map((note) => note.id).join(', '));
}
const isNotApplicable = (finding) => activeNoteIds.has(String(finding?.VulnerabilityID || ''));
const isIgnoredFinding = (finding) => isIgnoredPackage(finding) || isNotApplicable(finding);

const latestSuccessful = psql(`
    SELECT finished_at FROM public.system_service_scan_runs
    WHERE status = 'PASS' ORDER BY finished_at DESC LIMIT 1;
`).trim();
if (!force && !latestSuccessful) {
    console.log('첫 기준 검사 전입니다. 관리자 요청 뒤 --force로 첫 검사를 실행합니다.');
    process.exit(0);
}
if (!force && latestSuccessful) {
    const elapsedDays = (Date.now() - new Date(latestSuccessful).getTime()) / 86400000;
    if (Number.isFinite(elapsedDays) && elapsedDays < config.scanIntervalDays) {
        console.log(`정기 검사 시점 전입니다. 마지막 성공 검사 후 ${Math.floor(elapsedDays)}일 경과.`);
        process.exit(0);
    }
}

run(DOCKER, ['info'], { stdio: ['ignore', 'ignore', 'pipe'] });
run(DOCKER, ['image', 'inspect', TRIVY_IMAGE], { stdio: ['ignore', 'ignore', 'pipe'] });
mkdirSync(REPORT_ROOT, { recursive: true, mode: 0o700 });
mkdirSync(CACHE_ROOT, { recursive: true, mode: 0o700 });

const exposureRank = { internal: 0, lan: 1, unknown: 2, public: 3 };

/**
 * 우리가 고칠 수 있는 이미지인가.
 *
 * 상류(supabase/·kong/ 등) 이미지의 CVE 는 우리가 손댈 수 없다. 그런데 `긴급` 숫자에
 * 함께 섞이면 매 분기 "조치해야 할 것"처럼 보인다. 2026-08-30 첫 점검에서 긴급 23건이
 * 나왔는데 실제로 우리가 할 수 있는 일은 0건이었다.
 * 그래서 원본에 이 표시를 남겨 다음 점검 때 바로 갈라 볼 수 있게 한다.
 */
const UPSTREAM_PREFIXES = [
    'supabase/', 'kong/', 'postgrest/', 'darthsim/', 'curlimages/',
    'caddy:', 'caddy@', 'postgres:', 'node:', 'alpine', 'aquasec/'
];
function isUpstreamImage(ref) {
    const name = String(ref || '').toLowerCase();
    return UPSTREAM_PREFIXES.some((prefix) => name.startsWith(prefix));
}
const inferExposure = (inspect) => {
    const bindings = Object.values(inspect.HostConfig?.PortBindings || {}).flat().filter(Boolean);
    if (bindings.some((binding) => binding.HostIp === '0.0.0.0' || binding.HostIp === '::' || !binding.HostIp)) return 'lan';
    return 'internal';
};

const containers = run(DOCKER, ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}'])
    .trim().split('\n').filter(Boolean).map((line) => {
        const [id, name, imageRef] = line.split('\t');
        const inspect = JSON.parse(run(DOCKER, ['inspect', id]))[0];
        const configured = Object.hasOwn(config.services, name) ? Reflect.get(config.services, name) : null;
        return {
            id,
            name,
            imageRef,
            imageId: inspect.Image,
            group: configured?.group || 'other',
            exposure: configured?.exposure || inferExposure(inspect)
        };
    });
if (containers.length === 0) throw new Error('실행 중인 Docker 컨테이너가 없습니다.');

const imagesById = new Map();
for (const container of containers) {
    const current = imagesById.get(container.imageId) || {
        imageId: container.imageId,
        imageRef: container.imageRef,
        containers: new Set(),
        groups: new Set(),
        exposure: 'internal'
    };
    current.containers.add(container.name);
    current.groups.add(container.group);
    if (exposureRank[container.exposure] > exposureRank[current.exposure]) current.exposure = container.exposure;
    imagesById.set(container.imageId, current);
}

/*
 * 고정한 검사기를 먼저 내려받는다.
 *
 * 2026-09-02에 실제로 겪은 일: 배포 워크플로가 도커 빌드 캐시를 정리하면서 이 이미지를 지웠고,
 * 다음 검사가 `No such image` 로 시작도 못 하고 끝났다. 월 1회만 도는 작업이라 조용히 밀렸을 것이다.
 * 이미 있으면 아무 일도 하지 않으며, **다이제스트 고정은 그대로**라 내려받는 것이 바뀌지는 않는다.
 */
try {
    run(DOCKER, ['pull', '--quiet', TRIVY_IMAGE], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
    throw new Error(`고정한 검사기 이미지를 준비하지 못했습니다: ${String(error.stderr || error.message).trim()}`);
}

const versionOutput = run(DOCKER, ['run', '--rm', TRIVY_IMAGE, '--version']);
const scannerVersion = versionOutput.match(/Version:\s*([A-Za-z0-9._+-]+)/)?.[1];
if (!scannerVersion) throw new Error('Trivy 버전을 확인하지 못했습니다.');

const startedAt = new Date();
const runKey = `service-scan-${startedAt.toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
const tempRoot = mkdtempSync('/private/tmp/agit-service-scan.');
const rawScans = [];
const summaries = [];
let failedImages = 0;
let vulnerabilityDbUpdatedAt = '';

try {
    let index = 0;
    for (const image of imagesById.values()) {
        index += 1;
        const archiveName = `image-${index}.tar`;
        const archivePath = path.join(tempRoot, archiveName);
        process.stdout.write(`[${index}/${imagesById.size}] ${image.imageRef} 검사 중 ... `);
        let report;
        try {
            run(DOCKER, ['save', '-o', archivePath, image.imageId], { stdio: ['ignore', 'ignore', 'pipe'] });
            const output = run(DOCKER, [
                'run', '--rm',
                '-v', `${tempRoot}:/scan:ro`,
                '-v', `${CACHE_ROOT}:/root/.cache/trivy`,
                TRIVY_IMAGE,
                'image', '--input', `/scan/${archiveName}`,
                '--format', 'json', '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL',
                '--no-progress', '--list-all-pkgs=false'
            ], { stdio: ['ignore', 'pipe', 'pipe'] });
            report = JSON.parse(output);
            console.log('완료');
        } catch (error) {
            failedImages += 1;
            report = { error: String(error.stderr || error.message).slice(0, 1000) };
            console.log('실패');
        } finally {
            if (existsSync(archivePath)) rmSync(archivePath);
        }

        if (!vulnerabilityDbUpdatedAt && report.Metadata?.UpdatedAt) vulnerabilityDbUpdatedAt = report.Metadata.UpdatedAt;
        const allFindings = (report.Results || []).flatMap((result) => result.Vulnerabilities || []);
        const ignored = allFindings.filter(isIgnoredFinding).length;
        const vulnerabilities = allFindings.filter((finding) => !isIgnoredFinding(finding));
        const critical = vulnerabilities.filter((finding) => finding.Severity === 'CRITICAL').length;
        const high = vulnerabilities.filter((finding) => finding.Severity === 'HIGH').length;
        const fixable = vulnerabilities.filter((finding) => Boolean(finding.FixedVersion)).length;
        const urgent = image.exposure === 'public'
            ? vulnerabilities.filter((finding) => finding.Severity === 'CRITICAL' && Boolean(finding.FixedVersion)).length
            : 0;
        const attention = vulnerabilities.filter((finding) => Boolean(finding.FixedVersion)).length;
        const digest = image.imageId.toLowerCase();
        const imageKey = digest.replace(/^sha256:/, '');
        summaries.push({
            image_key: imageKey,
            image_ref: image.imageRef,
            image_digest: digest,
            service_group: [...image.groups].sort().join(','),
            exposure: image.exposure,
            container_count: image.containers.size,
            critical_count: critical,
            high_count: high,
            fixable_count: fixable,
            urgent_count: urgent,
            attention_count: attention,
            ignored_count: ignored
        });
        rawScans.push({
            image_ref: image.imageRef,
            // true 면 상류 이미지 — 우리가 고칠 수 없고 "지켜보기" 대상이다.
            upstream: isUpstreamImage(image.imageRef),
            image_digest: digest,
            containers: [...image.containers].sort(),
            service_groups: [...image.groups].sort(),
            exposure: image.exposure,
            report
        });
    }

    const finishedAt = new Date();
    const rawDocument = JSON.stringify({
        run_key: runKey,
        scanner: { name: 'trivy', version: scannerVersion, image: TRIVY_IMAGE },
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        scans: rawScans
    });
    const compressed = gzipSync(rawDocument, { level: 9 });
    const reportHash = createHash('sha256').update(rawDocument).digest('hex');
    const reportPath = path.join(REPORT_ROOT, `${runKey}.json.gz`);
    writeFileSync(reportPath, compressed, { mode: 0o600 });

    const totals = summaries.reduce((result, image) => ({
        critical: result.critical + image.critical_count,
        high: result.high + image.high_count,
        fixable: result.fixable + image.fixable_count,
        urgent: result.urgent + image.urgent_count,
        attention: result.attention + image.attention_count,
        ignored: result.ignored + image.ignored_count
    }), { critical: 0, high: 0, fixable: 0, urgent: 0, attention: 0, ignored: 0 });
    const payload = {
        run_key: runKey,
        status: failedImages > 0 ? 'FAIL' : 'PASS',
        scanner_name: 'trivy',
        scanner_version: scannerVersion,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        vulnerability_db_updated_at: vulnerabilityDbUpdatedAt,
        critical_count: totals.critical,
        high_count: totals.high,
        fixable_count: totals.fixable,
        urgent_count: totals.urgent,
        attention_count: totals.attention,
        ignored_count: totals.ignored,
        detail_code: failedImages > 0 ? 'image_scan_failed' : 'scan_complete',
        raw_report_sha256: reportHash,
        images: summaries
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    psql(null, `SELECT public.record_service_scan_v1(
        convert_from(decode('${encodedPayload}', 'base64'), 'UTF8')::JSONB
    );\n`);
    console.log(`서비스 이미지 검사 기록 완료: 이미지 ${summaries.length}개 · CRITICAL ${totals.critical} · HIGH ${totals.high} · 긴급 ${totals.urgent} · 이유를 적어 뺀 것 ${totals.ignored}`);

// 우리가 실제로 손댈 수 있는 것이 몇 건인지 따로 알려 준다.
{
    const ours = rawScans.filter((scan) => !scan.upstream);
    const oursUrgent = ours.reduce((sum, scan) => {
        // 원장과 같은 기준으로 센다 — 이유를 적어 뺀 것은 여기서도 빼야 두 숫자가 어긋나지 않는다.
        const vulns = (scan.report?.Results || []).flatMap((r) => r.Vulnerabilities || [])
            .filter((finding) => !isIgnoredFinding(finding));
        return sum + (scan.exposure === 'public'
            ? vulns.filter((v) => v.Severity === 'CRITICAL' && v.FixedVersion).length
            : 0);
    }, 0);
    console.log(`  이 가운데 우리 이미지(${ours.length}개)의 긴급: ${oursUrgent}건 — 나머지는 상류 대기`);
}    if (failedImages > 0) process.exitCode = 1;
} finally {
    if (tempRoot.startsWith('/private/tmp/agit-service-scan.')) rmSync(tempRoot, { recursive: true, force: true });
}
