#!/usr/bin/env node

/**
 * 학생 홈 RPC 부하 점검기.
 * 실제 학생 토큰 한 개로 읽기 전용 홈 조회만 반복한다. 운영 도메인은 명시적 허용 없이는 실행되지 않는다.
 */

const baseUrl = process.env.AGIT_LOAD_TEST_URL;
const anonKey = process.env.AGIT_LOAD_TEST_ANON_KEY;
const accessToken = process.env.AGIT_LOAD_TEST_ACCESS_TOKEN;
const targetUsers = Number(process.env.AGIT_LOAD_TEST_USERS || 1000);
const rampPerSecond = Number(process.env.AGIT_LOAD_TEST_RAMP_PER_SECOND || 50);
const durationSeconds = Number(process.env.AGIT_LOAD_TEST_DURATION_SECONDS || 600);

if (!baseUrl || !anonKey || !accessToken) {
  console.error('필수 환경변수: AGIT_LOAD_TEST_URL, AGIT_LOAD_TEST_ANON_KEY, AGIT_LOAD_TEST_ACCESS_TOKEN');
  process.exit(1);
}

const endpoint = new URL('/rest/v1/rpc/get_student_home_bootstrap_v1', baseUrl);
const isLocal = ['127.0.0.1', 'localhost'].includes(endpoint.hostname);
if (!isLocal && process.env.AGIT_LOAD_TEST_ALLOW_REMOTE !== 'I_UNDERSTAND_READ_ONLY_LOAD') {
  console.error('원격 서버 부하 테스트는 AGIT_LOAD_TEST_ALLOW_REMOTE=I_UNDERSTAND_READ_ONLY_LOAD 설정이 필요합니다.');
  process.exit(1);
}

if (!Number.isInteger(targetUsers) || targetUsers < 1 || targetUsers > 2000) {
  console.error('AGIT_LOAD_TEST_USERS는 1~2000 사이 정수여야 합니다.');
  process.exit(1);
}

const latencies = [];
let requests = 0;
let failures = 0;
let stopped = false;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestHome() {
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: '{}'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.arrayBuffer();
  } catch (error) {
    failures += 1;
    if (failures <= 5) console.error(`요청 실패: ${error.message}`);
  } finally {
    requests += 1;
    latencies.push(performance.now() - startedAt);
  }
}

async function virtualStudent(index) {
  while (!stopped) {
    await requestHome();
    // 모든 학생이 같은 순간 재조회하지 않도록 실제 앱과 같은 지터를 준다.
    await wait(3000 + ((index * 977) % 4000));
  }
}

const workers = [];
const rampStartedAt = Date.now();
for (let launched = 0; launched < targetUsers;) {
  const batch = Math.min(rampPerSecond, targetUsers - launched);
  for (let index = 0; index < batch; index += 1) workers.push(virtualStudent(launched + index));
  launched += batch;
  console.log(`접속 증가: ${launched}/${targetUsers}`);
  if (launched < targetUsers) await wait(1000);
}

const elapsedRampSeconds = Math.round((Date.now() - rampStartedAt) / 1000);
console.log(`${elapsedRampSeconds}초 동안 접속 증가 완료, ${durationSeconds}초 유지합니다.`);
await wait(durationSeconds * 1000);
stopped = true;
await Promise.all(workers);

latencies.sort((a, b) => a - b);
const percentile = (rate) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * rate))] || 0;
const failureRate = requests === 0 ? 1 : failures / requests;
const result = {
  users: targetUsers,
  requests,
  failures,
  failureRatePercent: Number((failureRate * 100).toFixed(3)),
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
  pass: failureRate < 0.01 && percentile(0.95) < 500
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 2;
