import { createHash } from 'node:crypto';

// 적용 이력이 있는 SQL은 재생하지 않는다. 지정한 선행 파일의 변조도 조용히 넘기지 않는다.
export function planRollbackMigrations(migrations, applied) {
  return [...migrations].sort((a, b) => a.name.localeCompare(b.name)).filter(({ name, source }) => {
    if (!applied.has(name)) return true;
    const checksum = applied.get(name);
    if (checksum !== '(신규)' && checksum !== createHash('sha256').update(source).digest('hex')) {
      throw new Error(`적용된 선행 마이그레이션의 내용이 달라졌습니다: ${name}`);
    }
    return false;
  });
}
