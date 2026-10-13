import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PENDING_CONDITION = /WHERE play\.class_id = p_class_id AND play\.status = 'done'\s+AND prize\.value ->> 'kind' = 'gift' AND NOT \(prize\.value \? 'given_at'\)/;

test('아직 안 준 선물 배지는 뽑기 내역의 아직 안 준 선물과 같은 조건으로 센다', async () => {
    const [badge, history] = await Promise.all([
        readFile('supabase/migrations/20261398_spelling_claw_gift_badge.sql', 'utf8'),
        readFile('supabase/migrations/20261364_spelling_claw_gift_handover.sql', 'utf8')
    ]);
    assert.match(history, PENDING_CONDITION, '뽑기 내역의 조건이 바뀌었으면 배지도 함께 바꾼다');
    assert.match(badge, PENDING_CONDITION);
    // 메뉴를 그릴 때마다 불리므로 권한이 없으면 오류 대신 0.
    assert.match(badge, /RETURN jsonb_build_object\('count', 0\);/);
    assert.match(badge, /REVOKE ALL ON FUNCTION public\.get_teacher_spelling_claw_gift_badge_v1\(UUID\) FROM PUBLIC, anon;/);
});

test('대시보드는 선물 배지를 아지트 놀이터 메뉴와 인형뽑기 메뉴에 같은 수로 띄운다', async () => {
    const [dashboard, gameManager, cards, manager] = await Promise.all([
        readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
        readFile('src/components/teacher/GameManager.jsx', 'utf8'),
        readFile('src/modules/game/teacher/RegisteredGameModuleCards.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/TeacherManager.jsx', 'utf8')
    ]);
    assert.match(dashboard, /supabase\.rpc\('get_teacher_spelling_claw_gift_badge_v1', \{ p_class_id: activeClass\.id \}\)/);
    assert.match(dashboard, /playground: clawGiftBadge/);
    assert.match(dashboard, /moduleBadges=\{\{ 'spelling-claw': clawGiftBadge \}\}/);
    assert.match(dashboard, /window\.addEventListener\(CLAW_GIFTS_CHANGED_EVENT, refresh\)/);
    assert.match(gameManager, /moduleBadges=\{moduleBadges\}/);
    assert.match(cards, /<TeacherCountBadge count=\{Number\(moduleBadges\[module\.id\]\) \|\| 0\}/);
    // `줬어요` 를 누르면 배지가 바로 줄어든다.
    assert.match(manager, /if \(error\) \{[^\n]*줬어요를 남기지 못했어요[^\n]*\}\s+notifyClawGiftsChanged\(\);/);
});
