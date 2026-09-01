/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  movePlacementByPixels,
  normalizePlacement,
  resizePlacementByPixels,
} from '../src/modules/tool/class-board/host/boardPlacement.js';

const read = (path) => readFile(path, 'utf8');

const [
  registry, manifest, model, entry, canvas, frame, host, presentation, imageApi,
  statusWidget, statusSettings, statusHook, pollPolicy, migration, freeformMigration,
  freeformSmoke, app, moduleRegistry, guides, guideRegistry, journeys, harness
] = await Promise.all([
  read('src/modules/tool/class-board/widgets/registry.js'),
  read('src/modules/tool/class-board/manifest.js'),
  read('src/modules/tool/class-board/classBoardModel.js'),
  read('src/modules/tool/class-board/TeacherEntry.jsx'),
  read('src/modules/tool/class-board/host/BoardCanvas.jsx'),
  read('src/modules/tool/class-board/host/InteractiveWidgetFrame.jsx'),
  read('src/modules/tool/class-board/host/WidgetHost.jsx'),
  read('src/modules/tool/class-board/ClassBoardPresentationPage.jsx'),
  read('src/modules/tool/class-board/classBoardImageApi.js'),
  read('src/modules/tool/class-board/widgets/writing-status/WritingStatusWidget.jsx'),
  read('src/modules/tool/class-board/widgets/writing-status/WritingStatusSettings.jsx'),
  read('src/modules/tool/class-board/widgets/writing-status/useWritingStatus.js'),
  read('src/modules/tool/class-board/widgets/writing-status/pollPolicy.js'),
  read('supabase/migrations/20261216_class_board_module.sql'),
  read('supabase/migrations/20261217_class_board_freeform_daily_status.sql'),
  read('tests/sql/20261217_class_board_freeform_daily_status.smoke.sql'),
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
  assert.match(manifest, /beta: true/);
  assert.match(moduleRegistry, /classBoardManifest/);
  assert.match(registry, /textWidgetManifest[\s\S]*imageWidgetManifest[\s\S]*writingStatusWidgetManifest/);
  assert.match(registry, /projectorSafe/);
  assert.match(host, /lazy\(manifest\.load\)/);
  assert.match(host, /WidgetBoundary/);
  assert.doesNotMatch(canvas, /widgetId\s*===|switch\s*\(.*widgetId/);
  assert.doesNotMatch(entry, /<TextWidget|<ImageWidget|<WritingStatusWidget/);
});

test('첫 스크린은 70:30 화면의 자유 배치 자료와 고정 현황으로 시작한다', () => {
  assert.match(model, /preset: 'freeform-7-3'/);
  assert.match(model, /createWidgetInstance\('text'/);
  assert.match(model, /createWidgetInstance\('image'/);
  assert.match(model, /createWidgetInstance\('writing-status'/);
  assert.match(canvas, /renderContent\(\)[\s\S]*renderSidebar\(\)/);
  assert.match(entry, /왼쪽 자료 70% · 오른쪽 오늘의 현황 30%/);
  assert.match(entry, /이동 손잡이[\s\S]*가로·세로 크기[\s\S]*핀/);
  assert.match(frame, /setPointerCapture/);
  assert.match(frame, /resize-x[\s\S]*resize-y[\s\S]*resize-both/);
  assert.match(frame, /aria-pressed=\{draftPlacement\.pinned\}/);
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

test('발표용 현황은 미션 이름표와 일일 자율 글 집계를 20초 가시 화면 폴링으로 표시한다', () => {
  assert.match(statusWidget, /제출자/);
  assert.match(statusWidget, /미제출자/);
  assert.match(statusWidget, /오늘의 자율 글/);
  assert.match(statusWidget, /일기/);
  assert.match(statusWidget, /독서록/);
  assert.match(statusWidget, /글 내용은 공개하지 않습니다/);
  assert.match(statusSettings, /현재 진행 미션 \(가장 최근\)/);
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
  assert.match(freeformMigration, /teacher_assignment_submission_board_snapshot_v2/);
  assert.match(freeformMigration, /submitterNames/);
  assert.match(freeformMigration, /nonSubmitterNames/);
  assert.match(freeformMigration, /dailyWriting/);
  assert.match(freeformMigration, /writing_type IN \('diary', 'reading_log'\)/);
  assert.match(freeformMigration, /file_size_limit = 2097152/);
  assert.match(migration, /image\/webp[\s\S]*image\/jpeg/);
  assert.match(migration, /Class_Board_Assets_Select_V1[\s\S]*Class_Board_Assets_Insert_V1[\s\S]*Class_Board_Assets_Delete_V1/);
  assert.match(freeformSmoke, /자유 배치 좌표·핀 상태/);
  assert.match(freeformSmoke, /미션 제출자·미제출자 이름 수/);
  assert.match(freeformSmoke, /화면 경계를 벗어난 자유 배치/);
  assert.match(imageApi, /createSignedUrls/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_EDGE = 1920/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_SOURCE_BYTES = 30 \* 1024 \* 1024/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_STORED_BYTES = 2 \* 1024 \* 1024/);
  assert.match(imageApi, /\['image\/webp', 'image\/jpeg'\]\.includes\(file\.type\)/);
  assert.doesNotMatch(imageApi, /getPublicUrl/);
});

test('자유 배치 계산은 이동·크기 조절 모두 화면 경계와 최소 크기를 지킨다', () => {
  const base = normalizePlacement({ x: 10, y: 10, width: 40, height: 30, pinned: false });
  assert.deepEqual(movePlacementByPixels(base, 900, 900, { width: 1000, height: 1000 }), {
    x: 60, y: 70, width: 40, height: 30, pinned: false,
  });
  assert.deepEqual(resizePlacementByPixels(base, -900, -900, { width: 1000, height: 1000 }), {
    x: 10, y: 10, width: 16, height: 16, pinned: false,
  });
  assert.deepEqual(resizePlacementByPixels(base, 900, 900, { width: 1000, height: 1000 }), {
    x: 10, y: 10, width: 90, height: 90, pinned: false,
  });
});

test('새 교사 도구의 도움말과 전체 활용 안내서 이동 경로가 함께 등록된다', () => {
  assert.match(entry, /TeacherGuideButton tabId="class-board"/);
  assert.match(guides, /'class-board'/);
  assert.match(guideRegistry, /'class-board': \{ tab: 'tools', tool: 'class-board' \}/);
  assert.match(journeys, /step\('class-board'/);
});
