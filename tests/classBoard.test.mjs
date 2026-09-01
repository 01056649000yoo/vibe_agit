/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

const [
  registry, manifest, model, entry, canvas, host, presentation, imageApi,
  statusWidget, statusSettings, statusHook, pollPolicy, migration, smoke, app,
  moduleRegistry, guides, guideRegistry, journeys, harness
] = await Promise.all([
  read('src/modules/tool/class-board/widgets/registry.js'),
  read('src/modules/tool/class-board/manifest.js'),
  read('src/modules/tool/class-board/classBoardModel.js'),
  read('src/modules/tool/class-board/TeacherEntry.jsx'),
  read('src/modules/tool/class-board/host/BoardCanvas.jsx'),
  read('src/modules/tool/class-board/host/WidgetHost.jsx'),
  read('src/modules/tool/class-board/ClassBoardPresentationPage.jsx'),
  read('src/modules/tool/class-board/classBoardImageApi.js'),
  read('src/modules/tool/class-board/widgets/writing-status/WritingStatusWidget.jsx'),
  read('src/modules/tool/class-board/widgets/writing-status/WritingStatusSettings.jsx'),
  read('src/modules/tool/class-board/widgets/writing-status/useWritingStatus.js'),
  read('src/modules/tool/class-board/widgets/writing-status/pollPolicy.js'),
  read('supabase/migrations/20261216_class_board_module.sql'),
  read('tests/sql/20261216_class_board_module.smoke.sql'),
  read('src/App.jsx'),
  read('src/modules/registry.js'),
  read('src/constants/teacherGuides.js'),
  read('src/guides/teacherGuideRegistry.js'),
  read('src/guides/teacherGuideJourneys.js'),
  read('PERFORMANCE_HARNESS.md'),
]);

test('우리 반 스크린은 교사 도구로 지연 등록되고 셸과 위젯 레지스트리를 분리한다', () => {
  assert.match(manifest, /id: 'class-board'/);
  assert.match(manifest, /part: 'tool'/);
  assert.match(manifest, /load: 'on-open'/);
  assert.match(manifest, /writes: 'rpc'/);
  assert.match(manifest, /realtime: 'none'/);
  assert.match(manifest, /maxInitialRows: 20/);
  assert.match(moduleRegistry, /classBoardManifest/);
  assert.match(registry, /textWidgetManifest[\s\S]*imageWidgetManifest[\s\S]*writingStatusWidgetManifest/);
  assert.match(registry, /projectorSafe/);
  assert.match(host, /lazy\(manifest\.load\)/);
  assert.match(host, /WidgetBoundary/);
  assert.doesNotMatch(canvas, /widgetId\s*===|switch\s*\(.*widgetId/);
  assert.doesNotMatch(entry, /<TextWidget|<ImageWidget|<WritingStatusWidget/);
});

test('첫 스크린은 고정 70:30 배치의 텍스트·이미지·글쓰기 현황으로 시작한다', () => {
  assert.match(model, /preset: 'split-8-4'/);
  assert.match(model, /createWidgetInstance\('text'/);
  assert.match(model, /createWidgetInstance\('image'/);
  assert.match(model, /createWidgetInstance\('writing-status'/);
  assert.match(canvas, /renderZone\('content'\)[\s\S]*renderZone\('sidebar'\)/);
  assert.match(entry, /왼쪽 자료 70% · 오른쪽 현황 30%/);
  assert.match(entry, /새 스크린[\s\S]*복제[\s\S]*보관/);
  assert.match(entry, /beforeunload/);
  assert.match(entry, /p_expected_revision|classBoardApi\.save/);
});

test('발표 화면은 별도 교사 전용 경로이며 저장한 위젯만 전체화면으로 그린다', () => {
  assert.match(app, /getClassBoardPresentationId[\s\S]*\{36\}/);
  assert.match(app, /profile\.role !== 'ADMIN' && !profile\.is_approved/);
  assert.match(app, /ClassBoardPresentationPage boardId=/);
  assert.match(presentation, /getPresentation\(boardId\)/);
  assert.match(presentation, /requestFullscreen/);
  assert.match(presentation, /<BoardCanvas[\s\S]*presentation/);
  assert.doesNotMatch(presentation, /student_name|studentName|student_statuses|recent_submissions/);
});

test('발표용 글쓰기 현황은 이름 없이 집계만 표시하고 20초 가시 화면 폴링을 지킨다', () => {
  assert.match(statusWidget, /제출 글/);
  assert.match(statusWidget, /학생 \$\{submitted\}\/\$\{status\?\.totalStudents/);
  assert.match(statusWidget, /학생 이름과 글 내용은 이 화면에 표시하지 않습니다/);
  assert.match(statusSettings, /진행 중인 과제 전체/);
  assert.match(statusSettings, /missionOptions/);
  assert.match(pollPolicy, /CLASS_BOARD_STATUS_REFRESH_MS = 20_000/);
  assert.match(pollPolicy, /30_000, 60_000, 120_000/);
  assert.match(statusHook, /document\.visibilityState === 'hidden'/);
  assert.match(statusHook, /runningScopeRef\.current/);
  assert.match(statusHook, /visibilitychange/);
  assert.match(statusHook, /window\.setTimeout/);
  assert.doesNotMatch(statusHook, /setInterval|\.channel\(|postgres_changes/);
  assert.match(harness, /우리 반 스크린/);
});

test('보드·사진·현황은 담당 교사 RPC와 비공개 Storage 경계를 사용한다', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.class_boards/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.class_boards FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /class\.teacher_id = auth\.uid\(\) OR public\.auth_user_role\(\) = 'ADMIN'/);
  assert.match(migration, /validate_class_board_payload_v1/);
  assert.match(migration, /JSONB_ARRAY_LENGTH\(COALESCE\(p_widgets/);
  assert.match(migration, /LIMIT 20/);
  assert.match(migration, /teacher_assignment_submission_board_snapshot_v2\(p_class_id, p_mission_id, 20, 1\)/);
  assert.match(migration, /'class-board-assets', 'class-board-assets', FALSE, 1048576/);
  assert.match(migration, /image\/webp[\s\S]*image\/jpeg/);
  assert.match(migration, /Class_Board_Assets_Select_V1[\s\S]*Class_Board_Assets_Insert_V1[\s\S]*Class_Board_Assets_Delete_V1/);
  assert.match(smoke, /기존 제출 집계와 다르거나 개인정보/);
  assert.match(smoke, /학생이 교사용 우리 반 스크린 작업공간/);
  assert.match(imageApi, /createSignedUrls/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_EDGE = 1920/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_STORED_BYTES = 1024 \* 1024/);
  assert.doesNotMatch(imageApi, /getPublicUrl/);
});

test('새 교사 도구의 도움말과 전체 활용 안내서 이동 경로가 함께 등록된다', () => {
  assert.match(entry, /TeacherGuideButton tabId="class-board"/);
  assert.match(guides, /'class-board'/);
  assert.match(guideRegistry, /'class-board': \{ tab: 'tools', tool: 'class-board' \}/);
  assert.match(journeys, /step\('class-board'/);
});
