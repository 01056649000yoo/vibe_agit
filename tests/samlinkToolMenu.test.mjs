import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { samlinkManifest } from '../src/modules/tool/samlink/manifest.js';

const entry = await readFile('src/modules/tool/samlink/TeacherEntry.jsx', 'utf8');

test('쌤링크는 학급운영도구에서 QR 코드 관리 메뉴 안에 열린다', () => {
  assert.equal(samlinkManifest.id, 'samlink');
  assert.equal(samlinkManifest.name, 'QR 코드 관리');
  assert.match(samlinkManifest.description, /쌤링크.*QR 코드/);
  assert.equal(samlinkManifest.tool?.launchMode, 'embedded');
  assert.equal(samlinkManifest.tool?.href, 'https://샘링크.kr');
  assert.match(entry, /const SAMLINK_URL = 'https:\/\/샘링크\.kr'/);
  assert.match(entry, /title="쌤링크 수업 링크 관리"/);
});
