import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const updateScript = readFileSync('scripts/openclaw-autoupdate.sh', 'utf8');

test('OpenClaw 업데이트 후 상태 스키마와 맞지 않는 구버전으로 자동 복귀하지 않는다', () => {
    assert.doesNotMatch(updateScript, /npm install -g "openclaw@\$installed"/);
    assert.doesNotMatch(updateScript, /write_status ROLLED_BACK/);
    assert.match(updateScript, /openclaw doctor --fix --non-interactive --yes/);
    assert.match(updateScript, /write_status NEEDS_ATTENTION/);
    assert.match(updateScript, /상태 마이그레이션 뒤 패키지·설정 자동 롤백은 금지/);
});
