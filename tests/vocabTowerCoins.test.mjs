import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// 어휘의 탑 코인(2026-10-24): 70% 이상·8문제 이상으로 한 판을 마치면 1개, 하루 3개, 날이 지나도 남고 인형뽑기에서 쓴다.
const migration = await readFile('supabase/migrations/20261410_vocab_tower_coins.sql', 'utf8');

test('서버 규칙: 끝까지 마친 판, 정답률 70% 이상, 8문제 이상, 하루 3개, 판마다 한 번', () => {
    assert.match(migration, /NEW\.finish_reason IS DISTINCT FROM 'completed'/);
    assert.match(migration, /COALESCE\(NEW\.answer_count, 0\) < 8 OR NEW\.correct_count \* 10 < NEW\.answer_count \* 7/);
    assert.match(migration, /v_count >= 3/);
    assert.match(migration, /run_id UUID NOT NULL UNIQUE/);
    assert.match(migration, /ON CONFLICT \(run_id\) DO NOTHING/);
    // 지급이 실패해도 어휘의 탑 종료는 막히지 않는다
    assert.match(migration, /EXCEPTION WHEN OTHERS THEN/);
});

test('코인은 그날이 지나도 남고, 맞춤법 코인이 없을 때만 쓰며, 포인트로 살 수 없다', () => {
    assert.doesNotMatch(migration, /expires|expire_at|DELETE FROM public\.vocab_tower_coins/);
    assert.match(migration, /맞춤법 코인이 없으면 어휘의 탑 코인/);
    assert.match(migration, /ORDER BY coin\.created_at, coin\.id LIMIT 1 FOR UPDATE SKIP LOCKED/);
    assert.match(migration, /REVOKE ALL ON public\.vocab_tower_coins FROM PUBLIC, anon, authenticated/);
});

test('화면: 서버 값을 읽고, 코인이 있으면 학생이 인형뽑기를 열고 닫는다', async () => {
    const [session, screen, manifest, guide] = await Promise.all([
        readFile('src/modules/game/spelling-claw/clawServerSession.js', 'utf8'),
        readFile('src/modules/game/spelling-claw/ClawPlayScreen.jsx', 'utf8'),
        readFile('src/modules/game/vocab-tower/manifest.js', 'utf8'),
        readFile('src/modules/game/vocab-tower/towerGuide.js', 'utf8')
    ]);
    assert.match(session, /tower_coins_left/);
    assert.match(session, /towerCoinsLeft: Number\(data\?\.tower_coins_left\)/);
    assert.match(screen, /어휘의 탑 코인 <b>\{towerCoins\}<\/b>/);
    assert.match(screen, /인형뽑기 닫기/);
    assert.match(manifest, /eventType: 'vocab-tower\.coin_awarded'/);
    assert.match(guide, /어휘의 탑 코인으로 인형뽑기를 해요/);
});
