/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const attachmentPath = path.join(root, 'public', 'downloads', 'school-operations-committee-agenda.hwpx');

test('로그인 화면에서 학습지원소프트웨어 공개 안내 페이지로 연결된다', async () => {
  const [landing, app, store, index] = await Promise.all([
    read('src/components/layout/LandingPage.jsx'),
    read('src/App.jsx'),
    read('src/store/useAppStore.js'),
    read('index.html'),
  ]);

  assert.match(landing, /href="\/learning-support-software"/);
  assert.match(index, /href="\/learning-support-software"/);
  assert.match(store, /path === '\/learning-support-software'[\s\S]*return 'learning-support-software'/);
  assert.match(store, /학습지원소프트웨어 선정기준 안내 \| 끄적끄적 아지트/);
  assert.match(app, /import LearningSupportSoftwareGuide/);
  assert.match(app, /directPath === 'learning-support-software'[\s\S]*<LearningSupportSoftwareGuide/);
});

test('안내 페이지에 제품 개요, 개인정보보호 9개 기준, 공개 증빙과 내려받기 링크가 있다', async () => {
  const guide = await read('src/components/layout/LearningSupportSoftwareGuide.jsx');
  const criteriaIds = [...guide.matchAll(/id: '(\d-\d)'/g)].map((match) => match[1]);

  assert.deepEqual(criteriaIds, ['1-1', '1-2', '1-3', '2-1', '3-1', '4-1', '5-1', '5-2', '5-3']);
  assert.match(guide, /교과 콘텐츠가 담겨 있지 않은 비교과용 에듀테크 서비스/);
  assert.match(guide, /글쓰기 활동을 기반으로 한 학급 경영 및 게이미피케이션 플랫폼/);
  assert.match(guide, /href="\/privacy"/);
  assert.match(guide, /href="\/downloads\/school-operations-committee-agenda\.hwpx"/);
  assert.match(guide, /download="학교운영위원회_안건_상정_자료\.hwpx"/);
});

test('학교운영위원회 HWPX 첨부는 제공된 원본 파일과 같은 바이너리다', async () => {
  const attachment = await readFile(attachmentPath);
  const hash = createHash('sha256').update(attachment).digest('hex');

  assert.ok(attachment.length > 90_000);
  assert.equal(attachment.subarray(0, 2).toString('ascii'), 'PK');
  assert.equal(hash, '278534a949575c0da78aa3876df0541a4b875dca8461bf733efd8a73ed7ba742');
});
