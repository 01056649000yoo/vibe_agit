import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';
import {
    GUIDE_CHAT_LIMITS,
    buildTeacherGuideSearchDocuments,
    getLocalTeacherGuideAnswer,
    searchTeacherGuides
} from '../src/guides/teacherGuideSearch.js';

const [assistant, center, dashboard, api, edge, migration, deployWorkflow] = await Promise.all([
    readFile('src/components/teacher/TeacherGuideAssistant.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherGuideCenter.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/lib/teacherGuideAssistantApi.js', 'utf8'),
    readFile('supabase/functions/vibe-ai/index.ts', 'utf8'),
    readFile('supabase/migrations/20261235_teacher_guide_ai_assistant.sql', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8')
]);

test('검색 색인은 기존 도움말 원본 전체를 포함하고 AI 후보 상한을 지킨다', () => {
    const documents = buildTeacherGuideSearchDocuments();
    assert.deepEqual(new Set(documents.map(({ guideRef }) => guideRef)), new Set(Object.keys(TEACHER_GUIDES)));
    const candidates = searchTeacherGuides('학생 접속 코드를 어디서 확인해?');
    assert.ok(candidates.length > 0 && candidates.length <= GUIDE_CHAT_LIMITS.candidateCount);
    assert.equal(candidates[0].guideRef, 'students');
    assert.ok(candidates.every(({ context }) => context.length <= GUIDE_CHAT_LIMITS.candidateChars));
    assert.ok(candidates.reduce((sum, item) => sum + item.context.length, 0) <= GUIDE_CHAT_LIMITS.contextChars);
});

test('위치가 분명한 질문은 AI 호출 없이 안내 이동 답변을 만든다', () => {
    const answer = getLocalTeacherGuideAnswer('학생 접속 코드는 어디에서 확인해?');
    assert.equal(answer?.guideRef, 'students');
    assert.equal(answer?.local, true);
    assert.match(assistant, /if \(localAnswer\)/);
    assert.match(assistant, /setAnswer\(localAnswer\)/);
});

test('관리자에게만 AI 길잡이를 표시하고 검증된 안내 이동만 연결한다', () => {
    assert.match(dashboard, /showAiAssistant=\{guideAiAvailability\?\.enabled === true\}/);
    assert.match(center, /showAiAssistant &&/);
    assert.match(center, /getJourneysForGuide\(guideId\)/);
    assert.match(api, /getTeacherGuide\(data\.guideRef\)/);
    assert.match(api, /getTeacherGuideSection\(guideRef, data\.sectionRef\)/);
    assert.match(api, /getTeacherGuideTarget\(guideRef\)/);
    assert.match(assistant, /remaining <= 0/);
    assert.match(assistant, /오늘 사용할 수 있는 AI 안내 5회/);
});

test('서버는 관리자 선공개와 질문·후보·출력 상한을 강제한다', () => {
    assert.match(edge, /'TEACHER_GUIDE_CHAT'/);
    assert.match(edge, /teacher_guide_ai_stage/);
    assert.match(edge, /actorRole !== 'ADMIN'/);
    assert.match(edge, /safeQuestion\.length > 200/);
    assert.match(edge, /candidates\.length > 3/);
    assert.match(edge, /slice\(0, 450\)/);
    assert.match(edge, /contextChars > 1200/);
    assert.match(edge, /TEACHER_GUIDE_CHAT' \? 120/);
    assert.match(edge, /Number\.isInteger\(parsed\.choice\)/);
    assert.match(edge, /release_teacher_guide_ai_request_v1/);
    assert.doesNotMatch(edge, /console\.log\([^\n]*(question|answer|candidates)/i);
});

test('DB는 한국 시간 하루 5회·분당 3회와 관리자 공개 전환을 강제한다', () => {
    assert.match(migration, /teacher_guide_ai_stage[\s\S]*admin_only/);
    assert.match(migration, /AT TIME ZONE 'Asia\/Seoul'/);
    assert.match(migration, /v_minute_count >= 3/);
    assert.match(migration, /v_daily_count >= 5/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /auth_user_role\(\) <> 'ADMIN'/);
    assert.match(migration, /p_stage NOT IN \('admin_only', 'public'\)/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.consume_teacher_guide_ai_request_v1/);
});

test('배포는 마이그레이션 롤백 검증과 적용을 앱 빌드보다 먼저 끝낸다', () => {
    const checkAt = deployWorkflow.indexOf('npm run migrate:check');
    const migrateAt = deployWorkflow.indexOf('npm run migrate\n');
    const buildAt = deployWorkflow.indexOf('docker build');
    assert.ok(checkAt >= 0 && migrateAt > checkAt && buildAt > migrateAt);
});
