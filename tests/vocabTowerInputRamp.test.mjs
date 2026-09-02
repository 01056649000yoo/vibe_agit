import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
    'supabase/migrations/20261210_vocab_tower_floor_input_ramp.sql',
    'utf8'
);
const smoke = await readFile(
    'tests/sql/20261210_vocab_tower_floor_input_ramp.smoke.sql',
    'utf8'
);
const fullRolloutMigration = await readFile(
    'supabase/migrations/20261221_vocab_tower_practice_policy_full_rollout.sql',
    'utf8'
);
const fullRolloutSmoke = await readFile(
    'tests/sql/20261221_vocab_tower_practice_policy_full_rollout.smoke.sql',
    'utf8'
);

test('층별 직접 입력 상한은 서버 함수 한 곳에서 0·0·1·1·2·2·3·3·4·5로 오른다', () => {
    assert.match(migration, /FUNCTION public\.vocab_tower_v2_practice_input_slots_v1/);
    assert.match(migration, /WHEN 1 THEN ARRAY\[\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 2 THEN ARRAY\[\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 3 THEN ARRAY\[10\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 4 THEN ARRAY\[9\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 5 THEN ARRAY\[7, 11\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 6 THEN ARRAY\[6, 10\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 7 THEN ARRAY\[5, 8, 11\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 8 THEN ARRAY\[4, 8, 12\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 9 THEN ARRAY\[4, 6, 9, 12\]::SMALLINT\[\]/);
    assert.match(migration, /WHEN 10 THEN ARRAY\[4, 6, 8, 10, 12\]::SMALLINT\[\]/);
});

test('새 정책은 판 시작 때 스냅샷되고 관리자 테스트 학급에만 먼저 열린다', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS practice_policy_version SMALLINT NOT NULL DEFAULT 1/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.vocab_tower_practice_policy_classes/);
    assert.match(migration, /ALTER TABLE public\.vocab_tower_practice_policy_classes ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.vocab_tower_practice_policy_classes[\s\S]*authenticated, service_role/);
    assert.match(migration, /profile\.role = 'ADMIN'/);
    assert.match(migration, /class\.name = '테스트'/);
    assert.match(migration, /CREATE TRIGGER snapshot_vocab_tower_practice_policy_v1[\s\S]*BEFORE INSERT ON public\.vocab_tower_runs/);
});

test('개인 연습만 층별 슬롯을 쓰고 기존 판과 공식 도전은 유지한다', () => {
    assert.match(migration, /v_run\.practice_policy_version = 1\s*\n\s*OR v_sequence = ANY\(public\.vocab_tower_v2_practice_input_slots_v1/);
    assert.match(migration, /NOT v_is_retry\s*\n\s*AND v_learning_state IN \('familiar', 'mastered'\)/);
    assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.start_my_vocab_tower_master_v1/);
    assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.start_my_vocab_master_summit_v1/);
    assert.match(smoke, /floor 1 must stay choice-only/);
    assert.match(smoke, /floor 10 input slots must be 4,6,8,10,12/);
});

test('정책 2 전체 공개는 현재 학급을 채우고 미래 학급도 자동 등록한다', () => {
    assert.match(fullRolloutMigration, /INSERT INTO public\.vocab_tower_practice_policy_classes[\s\S]*SELECT class\.id, 2[\s\S]*FROM public\.classes class/);
    assert.match(fullRolloutMigration, /FUNCTION public\.register_vocab_tower_practice_policy_v2_for_class_v1/);
    assert.match(fullRolloutMigration, /AFTER INSERT ON public\.classes/);
    assert.match(fullRolloutMigration, /REVOKE ALL ON FUNCTION public\.register_vocab_tower_practice_policy_v2_for_class_v1\(\)[\s\S]*authenticated, service_role/);
    assert.doesNotMatch(fullRolloutMigration, /UPDATE public\.vocab_tower_runs/);
    assert.match(fullRolloutSmoke, /all existing classes must use vocab practice policy 2/);
    assert.match(fullRolloutSmoke, /future class policy registration trigger is missing/);
});
