import { performance } from 'node:perf_hooks';

const importStartedAt = performance.now();
const { findElementarySpellingIssues } = await import(
    '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js'
);
const importDuration = performance.now() - importStartedAt;

const sentence = '오늘은 학교에서 친구들과 책을 읽고 내 생각을 또박또박 적었어요. 그렇게 하면 안 되요. 숙제는 반듯이 해야 해요. ';
const text = sentence.repeat(Math.ceil(5000 / sentence.length)).slice(0, 5000);
const rounds = 5;
const iterationsPerRound = 5000;
const samples = [];

for (let index = 0; index < 500; index += 1) findElementarySpellingIssues(text);

for (let round = 0; round < rounds; round += 1) {
    const startedAt = performance.now();
    for (let index = 0; index < iterationsPerRound; index += 1) {
        findElementarySpellingIssues(text);
    }
    samples.push((performance.now() - startedAt) / iterationsPerRound);
}

const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
const maxAverage = 2;

console.log(`맞춤법 500개 초기 모듈 로드: ${importDuration.toFixed(2)}ms`);
console.log(`5,000자 검사: 평균 ${average.toFixed(3)}ms (${rounds}회 × ${iterationsPerRound.toLocaleString('ko-KR')}번)`);
console.log(`회차별: ${samples.map((sample) => `${sample.toFixed(3)}ms`).join(' · ')}`);

if (average > maxAverage) {
    console.error(`실패 — 5,000자 평균 검사 시간이 성능 한도 ${maxAverage}ms를 넘었습니다.`);
    process.exit(1);
}
