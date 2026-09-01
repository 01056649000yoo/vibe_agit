/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  fitPlacementToImage,
  movePlacementByPixels,
  normalizePlacement,
  resizePlacementByPixels,
} from '../src/modules/tool/class-board/host/boardPlacement.js';
import { getClipboardImageFile } from '../src/modules/tool/class-board/widgets/image/clipboardImage.js';
import { normalizeTextScale } from '../src/modules/tool/class-board/widgets/text/textScale.js';
import { hasLiveWeatherLocation } from '../src/modules/tool/class-board/widgets/weather/weatherApi.js';

const read = (path) => readFile(path, 'utf8');

const [
  registry, manifest, model, entry, canvas, frame, host, presentation, presentationEditPanel, imageApi, imageSettings,
  imagePasteHook, textWidget, imageWidget, styles, statusWidget, statusSettings, statusHook, pollPolicy, migration, freeformMigration,
  freeformSmoke, classroomWidgetsMigration, classroomWidgetsSmoke, tabs, weatherWidget, timerWidget, stopwatchWidget,
  pickerWidget, pickerManifest, hiddenTabs, boardApi, app, moduleRegistry, guides, guideRegistry, journeys, harness
] = await Promise.all([
  read('src/modules/tool/class-board/widgets/registry.js'),
  read('src/modules/tool/class-board/manifest.js'),
  read('src/modules/tool/class-board/classBoardModel.js'),
  read('src/modules/tool/class-board/TeacherEntry.jsx'),
  read('src/modules/tool/class-board/host/BoardCanvas.jsx'),
  read('src/modules/tool/class-board/host/InteractiveWidgetFrame.jsx'),
  read('src/modules/tool/class-board/host/WidgetHost.jsx'),
  read('src/modules/tool/class-board/ClassBoardPresentationPage.jsx'),
  read('src/modules/tool/class-board/presentation/PresentationEditPanel.jsx'),
  read('src/modules/tool/class-board/classBoardImageApi.js'),
  read('src/modules/tool/class-board/widgets/image/ImageSettings.jsx'),
  read('src/modules/tool/class-board/widgets/image/useClassBoardImagePaste.js'),
  read('src/modules/tool/class-board/widgets/text/TextWidget.jsx'),
  read('src/modules/tool/class-board/widgets/image/ImageWidget.jsx'),
  read('src/modules/tool/class-board/classBoard.css'),
  read('src/modules/tool/class-board/widgets/writing-status/WritingStatusWidget.jsx'),
  read('src/modules/tool/class-board/widgets/writing-status/WritingStatusSettings.jsx'),
  read('src/modules/tool/class-board/widgets/writing-status/useWritingStatus.js'),
  read('src/modules/tool/class-board/widgets/writing-status/pollPolicy.js'),
  read('supabase/migrations/20261216_class_board_module.sql'),
  read('supabase/migrations/20261217_class_board_freeform_daily_status.sql'),
  read('tests/sql/20261217_class_board_freeform_daily_status.smoke.sql'),
  read('supabase/migrations/20261218_class_board_tabs_and_classroom_widgets.sql'),
  read('tests/sql/20261218_class_board_tabs_and_classroom_widgets.smoke.sql'),
  read('src/modules/tool/class-board/navigation/ClassBoardTabs.jsx'),
  read('src/modules/tool/class-board/widgets/weather/WeatherWidget.jsx'),
  read('src/modules/tool/class-board/widgets/timer/TimerWidget.jsx'),
  read('src/modules/tool/class-board/widgets/stopwatch/StopwatchWidget.jsx'),
  read('src/modules/tool/class-board/widgets/student-picker/StudentPickerWidget.jsx'),
  read('src/modules/tool/class-board/widgets/student-picker/manifest.js'),
  read('src/modules/tool/class-board/navigation/HiddenClassBoardPanel.jsx'),
  read('src/modules/tool/class-board/classBoardApi.js'),
  read('src/App.jsx'),
  read('src/modules/registry.js'),
  read('src/constants/teacherGuides.js'),
  read('src/guides/teacherGuideRegistry.js'),
  read('src/guides/teacherGuideJourneys.js'),
  read('PERFORMANCE_HARNESS.md'),
]);

const [weatherApi, weatherSettings, timerSettings, pickerSettings, audioPlayer, textSettings, textScale,
  stageMigration, stageSmoke, caddy] = await Promise.all([
  read('src/modules/tool/class-board/widgets/weather/weatherApi.js'),
  read('src/modules/tool/class-board/widgets/weather/WeatherSettings.jsx'),
  read('src/modules/tool/class-board/widgets/timer/TimerSettings.jsx'),
  read('src/modules/tool/class-board/widgets/student-picker/StudentPickerSettings.jsx'),
  read('src/modules/tool/class-board/widgets/audio/audioPlayer.js'),
  read('src/modules/tool/class-board/widgets/text/TextSettings.jsx'),
  read('src/modules/tool/class-board/widgets/text/textScale.js'),
  read('supabase/migrations/20261219_class_board_stage_weather_audio.sql'),
  read('tests/sql/20261219_class_board_stage_weather_audio.smoke.sql'),
  read('Caddyfile.container'),
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

test('첫 스크린은 고정 16:9 좌표계 안에서 오늘 현황을 접어도 자료 크기를 유지한다', () => {
  assert.match(model, /version: 3, preset: 'freeform-stage-7-3'/);
  assert.match(model, /createWidgetInstance\('text'/);
  assert.match(model, /createWidgetInstance\('image'/);
  assert.match(model, /createWidgetInstance\('writing-status'/);
  assert.match(canvas, /sidebarCollapsed[\s\S]*aria-expanded=\{!sidebarCollapsed\}/);
  assert.match(canvas, /오늘 현황 펼치기[\s\S]*오늘 현황 접기/);
  assert.match(canvas, /is-sidebar-collapsed/);
  assert.match(styles, /\.class-board-canvas\s*\{[^}]*aspect-ratio:16\/9/);
  assert.match(styles, /\.class-board-canvas__content\s*\{[^}]*width:100%;[^}]*height:100%/);
  assert.match(styles, /\.class-board-canvas__sidebar\s*\{[^}]*position:absolute;[^}]*width:calc\(30% - 12px\)/);
  assert.match(styles, /\.class-board-canvas\.is-sidebar-collapsed \.class-board-canvas__sidebar\s*\{/);
  assert.match(entry, /오늘 현황을 접어도 자료의 위치와 크기는 그대로 유지/);
  assert.match(model, /migrateLegacyContentPlacement[\s\S]*x: Number\(placement\?\.x \|\| 0\) \* LEGACY_CONTENT_STAGE_RATIO[\s\S]*width: Number\(placement\?\.width \|\| 0\) \* LEGACY_CONTENT_STAGE_RATIO/);
  assert.match(stageMigration, /v_layout_version = 3[\s\S]*freeform-stage-7-3/);
  assert.match(stageSmoke, /허용 범위를 넘은 텍스트 크기/);
  assert.match(entry, /Ctrl\+V로 붙여넣으면 원본 비율[\s\S]*드래그해 옮기고[\s\S]*크기를 조절/);
  assert.match(frame, /setPointerCapture/);
  assert.match(frame, /resize-x[\s\S]*resize-y[\s\S]*resize-both/);
  assert.match(frame, /aria-pressed=\{draftPlacement\.pinned\}/);
  assert.match(tabs, /＋ 새 탭[\s\S]*저장[\s\S]*삭제/);
  assert.match(entry, /beforeunload/);
  assert.match(entry, /p_expected_revision|classBoardApi\.save/);
});

test('저장한 스크린은 상단 탭으로 전환하고 각각 독립적으로 수정한다', () => {
  assert.match(entry, /<ClassBoardTabs[\s\S]*boards=\{boards\}[\s\S]*currentBoard=\{board\}/);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{selected\}/);
  assert.match(tabs, /onSelect\(item\)/);
  assert.match(tabs, /수정 중/);
  assert.match(tabs, /className="class-board-tabs__actions"[\s\S]*＋ 새 탭[\s\S]*저장[\s\S]*삭제[\s\S]*복제[\s\S]*복구/);
  assert.match(entry, /onCreate=\{createBoard\}[\s\S]*onSave=[\s\S]*onDelete=[\s\S]*onDuplicate=[\s\S]*onOpenDeleted=/);
  assert.match(entry, /탭 이름/);
  assert.doesNotMatch(entry, /class-board-toolbar__actions/);
  assert.doesNotMatch(entry, /현재 탭 저장|탭에서 숨기기|복제해서 새 탭/);
  assert.doesNotMatch(entry, /<select[^>]*value=\{board\?\.id/);
});

test('예전 보관으로 숨겨진 스크린은 담당 교사가 상단 탭으로 복구한다', () => {
  assert.match(entry, /classBoardApi\.getHidden/);
  assert.match(tabs, /aria-controls="class-board-hidden-tabs-panel"[\s\S]*aria-expanded=\{deletedPanelOpen\}/);
  assert.match(entry, /classBoardApi\.restore\(boardId\)[\s\S]*상단 탭으로 복구했습니다/);
  assert.match(hiddenTabs, /삭제한 탭 복구/);
  assert.match(hiddenTabs, /예전 `보관` 또는 `삭제`/);
  assert.match(hiddenTabs, /상단 탭으로 복구/);
  assert.match(boardApi, /get_teacher_archived_class_boards_v1/);
  assert.match(boardApi, /restore_teacher_class_board_v1/);
  assert.match(classroomWidgetsMigration, /CREATE OR REPLACE FUNCTION public\.get_teacher_archived_class_boards_v1/);
  assert.match(classroomWidgetsMigration, /CREATE OR REPLACE FUNCTION public\.restore_teacher_class_board_v1/);
  assert.match(classroomWidgetsMigration, /board\.archived_at IS NOT NULL[\s\S]*class\.teacher_id = auth\.uid\(\)/);
  assert.match(classroomWidgetsMigration, /SET archived_at = NULL,[\s\S]*is_active = TRUE/);
  assert.match(classroomWidgetsSmoke, /숨긴 스크린이 복구 목록에 나타나지 않았습니다/);
  assert.match(classroomWidgetsSmoke, /숨긴 스크린이 활성 상단 탭으로 복구되지 않았습니다/);
});

test('텍스트와 이미지는 본문 자체를 마우스로 드래그해 이동하고 핀 상태를 지킨다', () => {
  assert.match(frame, /MOVE_START_THRESHOLD_PX = 3/);
  assert.match(frame, /contentDragProps = editable && !draftPlacement\.pinned/);
  assert.match(frame, /dragHandleProps=\{contentDragProps\}/);
  assert.match(frame, /if \(gesture\.changed\) onPlacementChange/);
  assert.match(host, /dragHandleProps[\s\S]*<View[\s\S]*dragHandleProps=\{dragHandleProps\}/);
  assert.match(textWidget, /<article\s+\{\.\.\.dragHandleProps\}/);
  assert.match(imageWidget, /<div \{\.\.\.dragHandleProps\}/);
  assert.match(imageWidget, /<figure \{\.\.\.dragHandleProps\}/);
  assert.match(imageWidget, /<img draggable=\{false\}/);
  assert.match(styles, /\[data-board-drag-surface="true"\][\s\S]*cursor:grab/);
  assert.match(entry, /이미지나 텍스트 자체를 드래그해 옮기고/);
  assert.match(presentationEditPanel, /이미지나 텍스트는 마우스로 옮길 수 있습니다/);
  assert.match(guides, /이미지·텍스트는 본체를[\s\S]*테두리로 가로·세로 크기를 바꾸면 위젯 내용도 칸에 맞춰 함께 변하며/);
});

test('캡처 이미지는 Ctrl+V로 붙여넣고 실제 비율에 맞춰 교체 또는 추가한다', () => {
  const clipboardFile = { type: 'image/png', size: 1000 };
  assert.equal(getClipboardImageFile({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => clipboardFile },
    ],
  }), clipboardFile);
  assert.equal(getClipboardImageFile({ items: [], files: [{ type: 'text/plain' }] }), null);

  assert.match(imagePasteHook, /window\.addEventListener\('paste'/);
  assert.match(imagePasteHook, /event\.preventDefault\(\)/);
  assert.match(imagePasteHook, /prepareAndUploadClassBoardImage/);
  assert.match(imagePasteHook, /getPasteContext/);
  assert.match(imageApi, /prepareAndUploadClassBoardImage[\s\S]*optimizeClassBoardImage[\s\S]*uploadClassBoardImage/);
  assert.match(imageSettings, /prepareAndUploadClassBoardImage/);
  assert.match(model, /findImagePasteTarget[\s\S]*selected\?\.widgetId === 'image'[\s\S]*!widget\.config\?\.path/);
  assert.match(model, /getClassBoardImagePasteError[\s\S]*한 번 저장[\s\S]*imageManifest\.maxInstances/);
  const pasteModel = model.slice(model.indexOf('export const applyPastedClassBoardImage'));
  const newImageBranchIndex = pasteModel.indexOf('const contentWidgets');
  assert.match(pasteModel.slice(0, newImageBranchIndex), /updateClassBoardWidgetConfig[\s\S]*fitToImage/);
  assert.match(pasteModel.slice(newImageBranchIndex), /createWidgetInstance\('image'[\s\S]*fitPlacementToImage/);
  assert.match(entry, /useClassBoardImagePaste[\s\S]*applyPastedClassBoardImage/);
  assert.match(presentation, /useClassBoardImagePaste[\s\S]*applyPastedClassBoardImage/);
  assert.match(entry, /Ctrl\+V로 붙여넣으면 원본 비율에 맞춰 추가/);
  assert.match(presentationEditPanel, /Ctrl\+V로 붙여넣으면 원본 비율에 맞춰/);
  assert.match(guides, /Ctrl\+V[\s\S]*빈 이미지 칸 또는 새 이미지 칸에 원본 비율/);
});

test('스크린은 별도 교사 전용 경로이며 저장한 위젯만 전체화면으로 그린다', () => {
  assert.match(app, /getClassBoardPresentationId[\s\S]*\{36\}/);
  assert.match(app, /profile\.role !== 'ADMIN' && !profile\.is_approved/);
  assert.match(app, /ClassBoardPresentationPage boardId=/);
  assert.match(presentation, /getPresentation\(boardId\)/);
  assert.match(presentation, /requestFullscreen/);
  assert.match(presentation, /<BoardCanvas[\s\S]*presentation/);
  assert.match(entry, />스크린 열기 ↗<\/button>/);
  assert.doesNotMatch(entry, /발표 화면 열기/);
  assert.match(presentation, /<h1 className="class-board-presentation-class-name">\{data\.class\?\.name \|\| '우리 반'\}<\/h1>/);
  assert.doesNotMatch(presentation, /<h1>\{data\.board\.title\}<\/h1>/);
  assert.match(styles, /\.class-board-presentation-class-name\s*\{[^}]*font-size:clamp\(1\.6rem,3vw,3rem\)/);
  assert.match(presentation, /<ModalCloseButton label="우리 반 스크린 닫기"/);
  assert.match(presentationEditPanel, /<ModalCloseButton[\s\S]*label="자료 설정 닫기"/);
  assert.match(guides, /`스크린 열기`/);
  assert.doesNotMatch(guides, /발표 화면/);
  assert.doesNotMatch(presentation, /student_name|studentName|student_statuses|recent_submissions/);
});

test('스크린은 임시 편집 모드에서 텍스트·이미지를 추가하고 저장 또는 취소한다', () => {
  assert.match(presentation, /✏️ 화면 편집/);
  assert.match(presentation, /draftBoard/);
  assert.match(presentation, /beforeunload/);
  assert.match(presentation, /classBoardApi\.save/);
  assert.match(presentation, /editable=\{editing\}/);
  assert.match(presentation, /getAddableWidgets[\s\S]*defaultPlacement\.zone === 'content'/);
  assert.match(presentation, /createWidgetInstance\(widgetId/);
  assert.match(presentation, /저장하지 않은 변경을 모두 취소/);
  assert.match(presentationEditPanel, /WidgetSettingsHost/);
  assert.match(presentationEditPanel, /manifest\.name\} 추가/);
  assert.match(presentationEditPanel, /저장하지 않은 변경이 있어요/);
  assert.match(presentationEditPanel, /위치에 핀 꽂기/);
  assert.match(presentationEditPanel, /자료 삭제/);
  assert.doesNotMatch(presentation, /optimizeClassBoardImage|uploadClassBoardImage|<TextWidget|<ImageWidget/);
  assert.match(canvas, /interactionEnabled = editable \?\? !presentation/);
  assert.match(canvas, /imagePathKey[\s\S]*\.sort\(\)/);
  assert.ok(canvas.includes(".join('\\n')"));
});

test('스크린 현황은 미션 이름표와 일일 자율 글 집계를 20초 가시 화면 폴링으로 표시한다', () => {
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
  assert.match(canvas, /!sidebarCollapsed \? <div[^>]+className="class-board-canvas__sidebar-content">\{renderSidebar\(\)\}<\/div> : null/);
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
  assert.match(classroomWidgetsMigration, /file_size_limit = 1048576/);
  assert.match(migration, /image\/webp[\s\S]*image\/jpeg/);
  assert.match(migration, /Class_Board_Assets_Select_V1[\s\S]*Class_Board_Assets_Insert_V1[\s\S]*Class_Board_Assets_Delete_V1/);
  assert.match(freeformSmoke, /자유 배치 좌표·핀 상태/);
  assert.match(freeformSmoke, /미션 제출자·미제출자 이름 수/);
  assert.match(freeformSmoke, /화면 경계를 벗어난 자유 배치/);
  assert.match(imageApi, /createSignedUrls/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_EDGE = 1920/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_SOURCE_BYTES = 30 \* 1024 \* 1024/);
  assert.match(imageApi, /CLASS_BOARD_IMAGE_MAX_STORED_BYTES = 1 \* 1024 \* 1024/);
  assert.match(imageSettings, /1920px·1MB 이하/);
  assert.match(imageApi, /\['image\/webp', 'image\/jpeg'\]\.includes\(file\.type\)/);
  assert.doesNotMatch(imageApi, /getPublicUrl/);
});

test('날씨·타이머·스톱워치·학생 뽑기는 필요한 때만 실행하고 서버 저장 경계를 지킨다', () => {
  assert.match(registry, /weatherWidgetManifest[\s\S]*timerWidgetManifest[\s\S]*stopwatchWidgetManifest[\s\S]*studentPickerWidgetManifest/);
  assert.match(classroomWidgetsMigration, /'weather', 'timer', 'stopwatch', 'student-picker'/);
  assert.match(classroomWidgetsMigration, /WHEN 'weather'[\s\S]*WHEN 'timer'[\s\S]*WHEN 'stopwatch'[\s\S]*WHEN 'student-picker'/);
  assert.match(classroomWidgetsSmoke, /수업 위젯 네 종류가 한 스크린에 저장되지 않았습니다/);
  assert.match(weatherWidget, /getCurrentWeather/);
  assert.match(weatherSettings, /searchWeatherLocations/);
  assert.match(weatherApi, /https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/);
  assert.match(weatherApi, /countryCode', 'KR'/);
  assert.match(weatherApi, /WEATHER_CACHE_TTL_MS = 30 \* 60 \* 1000/);
  assert.equal(hasLiveWeatherLocation({ weatherSource: 'live', latitude: null, longitude: null }), false);
  assert.equal(hasLiveWeatherLocation({ weatherSource: 'live', latitude: 37.566, longitude: 126.978 }), true);
  assert.equal(hasLiveWeatherLocation({ weatherSource: 'live', latitude: '37.566', longitude: '126.978' }), false);
  assert.doesNotMatch(`${weatherWidget}\n${weatherSettings}\n${weatherApi}`, /navigator\.geolocation|setInterval/);
  assert.match(caddy, /connect-src[^;]*https:\/\/api\.open-meteo\.com[^;]*https:\/\/geocoding-api\.open-meteo\.com/);
  assert.match(timerWidget, /window\.setTimeout/);
  assert.match(timerWidget, /playTimerAlarm/);
  assert.match(timerSettings, /TIMER_SOUND_OPTIONS[\s\S]*type="range"/);
  assert.match(stopwatchWidget, /window\.setTimeout/);
  assert.doesNotMatch(`${timerWidget}\n${stopwatchWidget}`, /setInterval/);
  assert.match(pickerManifest, /requestBudget: \{ initial: 1, refreshMs: null, realtime: false, maxRows: 100 \}/);
  assert.match(pickerWidget, /classBoardApi\.getRoster\(classId\)/);
  assert.match(pickerWidget, /totalSteps = 20[\s\S]*progress \* progress \* 300/);
  assert.match(pickerWidget, /playPickerTick[\s\S]*playPickerSelected/);
  assert.match(pickerSettings, /soundEnabled[\s\S]*type="range"/);
  assert.match(audioPlayer, /AudioContext[\s\S]*TIMER_SEQUENCES/);
  assert.match(classroomWidgetsMigration, /get_teacher_class_board_roster_v1[\s\S]*LIMIT 100/);
  assert.match(classroomWidgetsMigration, /class\.teacher_id = auth\.uid\(\) OR public\.auth_user_role\(\) = 'ADMIN'/);
  assert.doesNotMatch(classroomWidgetsMigration.slice(classroomWidgetsMigration.indexOf("'names'")), /'student_id'|'auth_id'|'student_code'/);
  assert.match(stageMigration, /WHEN 'weather'[\s\S]*weatherSource[\s\S]*WHEN 'timer'[\s\S]*alarmVolume[\s\S]*WHEN 'student-picker'[\s\S]*soundVolume/);
  assert.match(stageSmoke, /범위를 벗어난 날씨 좌표[\s\S]*타이머 소리 크기[\s\S]*뽑기 소리 크기/);
});

test('수업 위젯은 자유 배치 프레임 전체를 쓰고 프레임 크기에 맞춰 함께 변형된다', () => {
  assert.match(styles, /\.class-board-widget-frame--freeform\s*\{[^}]*container-type:size/);
  assert.match(styles, /\.class-board-widget-frame--medium:not\(\.class-board-widget-frame--freeform\)/);
  assert.doesNotMatch(styles, /\.class-board-widget-frame--(?:small|medium|large)\s*\{/);
  const responsiveWidgets = styles.slice(
    styles.indexOf('.class-board-weather {'),
    styles.indexOf('.class-board-checkbox-field')
  );
  assert.match(responsiveWidgets, /\.class-board-weather\s*\{[^}]*height:100%;[^}]*overflow:hidden/);
  assert.match(responsiveWidgets, /\.class-board-clock,\.class-board-picker\s*\{[^}]*height:100%;[^}]*overflow:hidden/);
  assert.match(responsiveWidgets, /cqmin/);
  assert.equal(responsiveWidgets.includes('vw'), false);
  assert.match(responsiveWidgets, /\.class-board-clock>div,\.class-board-picker>div\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('텍스트는 프리셋으로 크기를 고르고 위젯 크기에 같은 비율로 반응한다', () => {
  assert.match(textScale, /0\.8[\s\S]*1\.25[\s\S]*1\.5/);
  assert.match(textSettings, /글씨 크기[\s\S]*aria-pressed[\s\S]*칸을 키우거나 줄이면/);
  assert.match(textWidget, /--class-board-text-heading-size[\s\S]*cqmin/);
  assert.match(styles, /container-type:size[\s\S]*--class-board-text-heading-size/);
  assert.equal(normalizeTextScale(0.2), 0.8);
  assert.equal(normalizeTextScale(1.25), 1.25);
  assert.equal(normalizeTextScale(4), 1.5);
});

test('자유 배치 계산은 이동·크기 조절 모두 화면 경계와 최소 크기를 지킨다', () => {
  const base = normalizePlacement({ x: 10, y: 10, width: 40, height: 30, pinned: false });
  assert.deepEqual(movePlacementByPixels(base, 900, 900, { width: 1000, height: 1000 }), {
    x: 60, y: 70, width: 40, height: 30, pinned: false,
  });
  assert.deepEqual(resizePlacementByPixels(base, -900, -900, { width: 1000, height: 1000 }), {
    x: 10, y: 10, width: 11.2, height: 16, pinned: false,
  });
  assert.deepEqual(resizePlacementByPixels(base, 900, 900, { width: 1000, height: 1000 }), {
    x: 10, y: 10, width: 90, height: 90, pinned: false,
  });
});

test('이미지 업로드는 실제 비율로 위젯을 자동 맞추고 이후 자유 크기 조절을 유지한다', () => {
  const base = normalizePlacement({ x: 10, y: 10, width: 40, height: 30, pinned: false });
  assert.deepEqual(fitPlacementToImage(base, 1600, 800, { width: 1000, height: 500 }), {
    x: 10, y: 10, width: 40, height: 40, pinned: false,
  });
  assert.deepEqual(fitPlacementToImage(base, 800, 1600, { width: 1000, height: 500 }), {
    x: 10, y: 10, width: 22.5, height: 90, pinned: false,
  });
  assert.match(imageSettings, /fitToImage: \{ width: image\.width, height: image\.height \}/);
  assert.match(model, /updateClassBoardWidgetConfig[\s\S]*fitPlacementToImage/);
  assert.match(entry, /canvasContentRef[\s\S]*updateClassBoardWidgetConfig[\s\S]*contentRef=\{canvasContentRef\}/);
  assert.match(presentation, /canvasContentRef[\s\S]*updateClassBoardWidgetConfig[\s\S]*contentRef=\{canvasContentRef\}/);
  assert.match(canvas, /ref=\{contentRef\}/);
  assert.match(frame, /resize-x[\s\S]*resize-y[\s\S]*resize-both/);
});

test('새 교사 도구의 도움말과 전체 활용 안내서 이동 경로가 함께 등록된다', () => {
  assert.match(entry, /TeacherGuideButton tabId="class-board"/);
  assert.match(guides, /'class-board'/);
  assert.match(guideRegistry, /'class-board': \{ tab: 'tools', tool: 'class-board' \}/);
  assert.match(journeys, /step\('class-board'/);
});
