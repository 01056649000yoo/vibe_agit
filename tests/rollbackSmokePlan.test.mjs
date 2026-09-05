import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { planRollbackMigrations } from '../scripts/lib/rollback-smoke-plan.mjs';

const first = { name: '01.sql', source: 'CREATE FUNCTION first();' };
const next = { name: '02.sql', source: 'ALTER FUNCTION first() RENAME TO next;' };
test('현재 스키마에서는 적용된 CREATE/RENAME을 다시 실행하지 않는다', () => {
  const applied = new Map([[first.name, createHash('sha256').update(first.source).digest('hex')]]);
  assert.deepEqual(planRollbackMigrations([next, first], applied), [next]);
});
test('선행 SQL이 미적용이면 파일 순서로 함께 검증한다', () => {
  assert.deepEqual(planRollbackMigrations([next, first], new Map()), [first, next]);
});
test('적용된 SQL 내용이 바뀌면 검사를 중단한다', () => {
  assert.throws(() => planRollbackMigrations([first], new Map([[first.name, 'wrong']])), /내용이 달라/);
});
