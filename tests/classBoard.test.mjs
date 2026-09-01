/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  fitPlacementToImage,
  getDiagonalResizeScale,
  movePlacementByPixels,
  normalizePlacement,
  resizePlacementByPixels,
} from '../src/modules/tool/class-board/host/boardPlacement.js';
import {
  calculateClassBoardStageTransform,
  CLASS_BOARD_STAGE_HEIGHT,
  CLASS_BOARD_STAGE_WIDTH,
} from '../src/modules/tool/class-board/host/boardStage.js';
import { updateClassBoardWidgetPlacement } from '../src/modules/tool/class-board/host/widgetPlacement.js';
import {
  getClassBoardWidgetLayerState,
  moveClassBoardWidgetLayer,
} from '../src/modules/tool/class-board/host/widgetLayers.js';
import { getClipboardImageFile } from '../src/modules/tool/class-board/widgets/image/clipboardImage.js';
import { isClassBoardTextEntryTarget } from '../src/modules/tool/class-board/host/useClassBoardEscapeRemove.js';
import { calculateClassBoardSettingsAnchor } from '../src/modules/tool/class-board/presentation/useClassBoardSettingsAnchor.js';
import {
  createResponsiveTextSize,
  findLargestFittingTextSize,
  normalizeClassBoardTextBodySize,
  normalizeTextScale,
  shouldRefitClassBoardText,
} from '../src/modules/tool/class-board/widgets/text/textScale.js';
import { hasLiveWeatherLocation } from '../src/modules/tool/class-board/widgets/weather/weatherApi.js';
import { moveClassBoardTab, sortClassBoards } from '../src/modules/tool/class-board/navigation/tabOrder.js';

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

const [weatherApi, weatherSettings, timerSettings, pickerSettings, audioPlayer, textSettings, textScale, fittedTextHook,
  stageMigration, stageSmoke, caddy, escapeRemoveHook, settingsAnchorHook, layerControls, mainEntry,
  classBoardPreview, classBoardPreviewStyles, agentInstructions] = await Promise.all([
  read('src/modules/tool/class-board/widgets/weather/weatherApi.js'),
  read('src/modules/tool/class-board/widgets/weather/WeatherSettings.jsx'),
  read('src/modules/tool/class-board/widgets/timer/TimerSettings.jsx'),
  read('src/modules/tool/class-board/widgets/student-picker/StudentPickerSettings.jsx'),
  read('src/modules/tool/class-board/widgets/audio/audioPlayer.js'),
  read('src/modules/tool/class-board/widgets/text/TextSettings.jsx'),
  read('src/modules/tool/class-board/widgets/text/textScale.js'),
  read('src/modules/tool/class-board/widgets/text/useFittedClassBoardText.js'),
  read('supabase/migrations/20261219_class_board_stage_weather_audio.sql'),
  read('tests/sql/20261219_class_board_stage_weather_audio.smoke.sql'),
  read('Caddyfile.container'),
  read('src/modules/tool/class-board/host/useClassBoardEscapeRemove.js'),
  read('src/modules/tool/class-board/presentation/useClassBoardSettingsAnchor.js'),
  read('src/modules/tool/class-board/host/WidgetLayerControls.jsx'),
  read('src/main.jsx'),
  read('src/dev/ClassBoardPreview.jsx'),
  read('src/dev/ClassBoardPreview.css'),
  read('AGENTS.md'),
]);

const [tabOrder, tabOrderMigration, tabOrderSmoke, teacherDashboard, teacherDashboardStyles,
  devLab, devLabRegistry, devLabReadme] = await Promise.all([
  read('src/modules/tool/class-board/navigation/tabOrder.js'),
  read('supabase/migrations/20261220_class_board_tab_order_and_default.sql'),
  read('tests/sql/20261220_class_board_tab_order_and_default.smoke.sql'),
  read('src/components/teacher/TeacherDashboard.jsx'),
  read('src/components/teacher/TeacherDashboard.css'),
  read('src/dev/DevLab.jsx'),
  read('src/dev/devLabRegistry.js'),
  read('src/dev/README.md'),
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

test('화면 반복 수정은 DB 없는 로컬 미리보기에서 확인하고 명시한 마감 때만 배포한다', () => {
  assert.match(mainEntry, /import\.meta\.env\.DEV[\s\S]*class-board-preview[\s\S]*ClassBoardPreview\.jsx/);
  assert.match(classBoardPreview, /개발 전용 · DB 연결 없음/);
  assert.match(classBoardPreview, /<BoardCanvas[\s\S]*editable[\s\S]*onPlacementChange=\{updatePlacement\}/);
  assert.match(classBoardPreview, /<WidgetSettingsHost[\s\S]*onChange=\{updateConfig\}/);
  assert.match(classBoardPreview, /짧은 안내[\s\S]*여러 줄[\s\S]*긴 본문/);
  assert.match(classBoardPreview, /createWidgetInstance\('weather'[\s\S]*바깥 활동하기 좋은 날이에요/);
  assert.match(classBoardPreview, /<ClassBoardTabs[\s\S]*onReorder=\{reorderLocalBoards\}[\s\S]*onSetDefault=\{setLocalDefault\}/);
  assert.match(classBoardPreview, /활용 안내서[\s\S]*우리 반 스크린[\s\S]*정보 수정/);
  assert.match(classBoardPreview, /openedDefaultBoard[\s\S]*<BoardCanvas board=\{openedDefaultBoard\} presentation editable=\{false\}/);
  assert.doesNotMatch(classBoardPreview, /classBoardApi|supabase|\.save\(/);
  assert.match(classBoardPreviewStyles, /grid-template-columns:minmax\(0,1fr\) 300px/);
  assert.match(agentInstructions, /사용자가 \*\*`배포`·`마무리`·`확정`을 명시하기 전까지\*\*[\s\S]*작업트리에만 수정/);
  assert.match(agentInstructions, /운영 배포를 미리보기[\s\S]*수단으로 쓰지 않는다/);
  assert.match(agentInstructions, /다른 컴퓨터로 이어갈 때는 배포 없이 동기화[\s\S]*\[skip ci\][\s\S]*origin\/main/);
  assert.match(agentInstructions, /단순히 `수정해 줘`·`적용해 줘`[\s\S]*`동기화`는 원격 저장 승인[\s\S]*외부 배포 승인으로 해석하지 않는다/);
});

test('개발 실험실은 개발 서버에서만 실제 컴포넌트 시나리오를 DB 없이 반복 실행한다', () => {
  assert.match(mainEntry, /import\.meta\.env\.DEV[\s\S]*dev-lab[\s\S]*DevLab\.jsx/);
  assert.match(devLabRegistry, /lazy\(\(\) => import\('\.\/ClassBoardPreview\.jsx'\)\)/);
  assert.match(devLabRegistry, /id: 'class-board'/);
  assert.match(devLab, /DEV_LAB_SCENARIOS\.map/);
  assert.match(devLab, /PC[\s\S]*태블릿[\s\S]*모바일/);
  assert.match(devLab, /setResetKey/);
  assert.match(devLab, /<Scenario key=/);
  assert.match(devLabReadme, /운영 화면의 컴포넌트를 그대로 불러오고 화면을 복사하지 않는다/);
  assert.match(devLabReadme, /classBoardApi.*supabase.*운영 데이터 클라이언트/);
  assert.match(devLabReadme, /migrate:check/);
});

test('첫 스크린은 고정 16:9 좌표계 안에서 오늘 현황을 접어도 자료 크기를 유지한다', () => {
  assert.match(model, /version: 3, preset: 'freeform-stage-7-3'/);
  assert.match(model, /createWidgetInstance\('text'/);
  assert.match(model, /createWidgetInstance\('image'/);
  assert.match(model, /createWidgetInstance\('writing-status'/);
  assert.match(canvas, /sidebarCollapsed[\s\S]*aria-expanded=\{!sidebarCollapsed\}/);
  assert.match(canvas, /오늘 현황 펼치기[\s\S]*오늘 현황 접기/);
  assert.match(canvas, /is-sidebar-collapsed/);
  assert.match(styles, /\.class-board-viewport\s*\{[^}]*aspect-ratio:16\/9/);
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
  assert.match(frame, /data-board-resize-axis=\{resizeAxis \|\| undefined\}/);
  assert.match(frame, /data-board-resize-scale=\{resizeAxis === 'both' \? resizeScale : undefined\}/);
  assert.match(frame, /getDiagonalResizeScale\(gesture\.startPlacement, next\)/);
  assert.match(frame, /type === 'resize-x'[\s\S]*setResizeAxis\('x'\)[\s\S]*type === 'resize-y'[\s\S]*setResizeAxis\('y'\)[\s\S]*setResizeAxis\('both'\)/);
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

test('스크린 탭은 새 탭까지 좌우로 재정렬하고 별표 기본 화면을 상단에서 바로 연다', () => {
  const items = [{ id: 'a' }, { id: 'draft' }, { id: 'b' }];
  assert.deepEqual(moveClassBoardTab(items, 'draft', 'b').map((item) => item.id), ['a', 'b', 'draft']);
  assert.equal(moveClassBoardTab(items, 'missing', 'a'), items);
  assert.deepEqual(sortClassBoards([
    { id: 'b', displayOrder: 2 },
    { id: 'a', displayOrder: 0 },
  ]).map((item) => item.id), ['a', 'b']);
  assert.match(tabOrder, /moveClassBoardTab/);
  assert.match(tabs, /draggable=\{!disabled\}/);
  assert.match(tabs, /onDragStart[\s\S]*onDragOver[\s\S]*onDrop/);
  assert.match(tabs, /Alt\+←\/→/);
  assert.match(tabs, /item\.isDefault \? '★' : '☆'/);
  assert.match(tabs, /onSetDefault\(item\)/);
  assert.match(entry, /draftIndex=\{draftIndex\}/);
  assert.match(entry, /classBoardApi\.reorder\(activeClass\.id, savedIds\)/);
  assert.match(entry, /classBoardApi\.setDefault\(nextDefault\.id\)/);
  assert.match(boardApi, /p_tab_position/);
  assert.match(boardApi, /reorder_teacher_class_boards_v1/);
  assert.match(boardApi, /set_teacher_default_class_board_v1/);
  assert.match(boardApi, /get_teacher_default_class_board_v1/);
  assert.match(tabOrderMigration, /ADD COLUMN IF NOT EXISTS display_order INTEGER/);
  assert.match(tabOrderMigration, /ADD COLUMN IF NOT EXISTS is_default BOOLEAN/);
  assert.match(tabOrderMigration, /idx_class_boards_one_default_per_class/);
  assert.match(tabOrderMigration, /CREATE OR REPLACE FUNCTION public\.reorder_teacher_class_boards_v1/);
  assert.match(tabOrderMigration, /CREATE OR REPLACE FUNCTION public\.set_teacher_default_class_board_v1/);
  assert.match(tabOrderMigration, /CREATE OR REPLACE FUNCTION public\.get_teacher_default_class_board_v1/);
  assert.match(tabOrderMigration, /class\.teacher_id = auth\.uid\(\) OR public\.auth_user_role\(\) = 'ADMIN'/);
  assert.match(tabOrderSmoke, /별표로 지정한 스크린이 기본 화면 조회에 반영되지 않았습니다/);
  assert.match(tabOrderSmoke, /드래그 탭 순서 또는 기본 별표가 작업공간에 유지되지 않았습니다/);
  assert.match(teacherDashboard, /GuideInfoButton[\s\S]*teacher-class-board-shortcut[\s\S]*⚙️ 정보 수정/);
  assert.match(teacherDashboard, /import\('\.\.\/\.\.\/modules\/tool\/class-board\/classBoardApi'\)/);
  assert.match(teacherDashboard, /classBoardApi\.getDefault\(activeClass\.id\)/);
  assert.match(teacherDashboard, /popup=yes[\s\S]*window\.screen\.availWidth[\s\S]*window\.screen\.availHeight/);
  assert.match(teacherDashboard, /window\.open\('about:blank', 'class-board-presentation', popupFeatures\)/);
  assert.match(teacherDashboard, /`\/class-board\/\$\{result\.boardId\}\?fullscreen=1`/);
  assert.match(teacherDashboardStyles, /\.teacher-class-board-shortcut/);
  assert.match(guides, /탭은 마우스로 좌우 드래그[\s\S]*Alt\+←\/→[\s\S]*빈 별표[\s\S]*상단의 `우리 반 스크린` 버튼[\s\S]*전체화면/);
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
  assert.match(frame, /if \(gesture\.changed\) \{[\s\S]*onPlacementChange/);
  assert.match(host, /dragHandleProps[\s\S]*<View[\s\S]*dragHandleProps=\{dragHandleProps\}/);
  assert.match(textWidget, /<article\s+\{\.\.\.dragHandleProps\}/);
  assert.match(imageWidget, /<div \{\.\.\.dragHandleProps\}/);
  assert.match(imageWidget, /<figure \{\.\.\.dragHandleProps\}/);
  assert.match(imageWidget, /<img draggable=\{false\}/);
  assert.match(styles, /\[data-board-drag-surface="true"\][\s\S]*cursor:grab/);
  assert.match(entry, /이미지나 텍스트 자체를 드래그해 옮기고/);
  assert.match(presentationEditPanel, /이미지나 텍스트는 마우스로 옮길 수 있습니다/);
  assert.match(guides, /이미지·텍스트는 본체를[\s\S]*제목과 내용이 칸을 가장 크게 채우도록 자동 정렬[\s\S]*오른쪽 손잡이는 글자 크기를 유지하고 줄바꿈만[\s\S]*아래쪽 손잡이는 보이는 줄 수[\s\S]*오른쪽 아래 모서리는 글씨 크기/);
});

test('선택한 위젯은 두 편집 화면에서 Esc로 제거하되 입력 중에는 보존한다', () => {
  assert.equal(isClassBoardTextEntryTarget({ closest: () => ({ tagName: 'INPUT' }) }), true);
  assert.equal(isClassBoardTextEntryTarget({ closest: () => null }), false);
  assert.match(escapeRemoveHook, /event\.key !== 'Escape'/);
  assert.match(escapeRemoveHook, /event\.repeat[\s\S]*event\.isComposing[\s\S]*isClassBoardTextEntryTarget\(event\.target\)/);
  assert.match(escapeRemoveHook, /window\.addEventListener\('keydown', removeWithEscape\)/);
  assert.match(escapeRemoveHook, /window\.removeEventListener\('keydown', removeWithEscape\)/);
  assert.match(entry, /useClassBoardEscapeRemove\([\s\S]*enabled: Boolean\(selectedInstance\) && !saving && !pastingImage/);
  assert.match(presentation, /useClassBoardEscapeRemove\([\s\S]*enabled: editing && Boolean\(selectedInstance\) && !saving && !pastingImage/);
  assert.match(frame, /aria-keyshortcuts=\{editable && selected \? 'Escape' : undefined\}/);
  assert.match(entry, /위젯을 선택한 뒤 Esc를 누르면 화면에서 뺄 수 있습니다/);
  assert.match(presentationEditPanel, /선택한 자료는 Esc로 뺄 수 있고/);
  assert.match(guides, /선택한 자료는 `Esc` 또는 `빼기`로 화면에서 뺀/);
});

test('열린 스크린 설정창은 선택 위젯 오른쪽을 따라가고 빈 화면에서 닫힌다', () => {
  assert.deepEqual(calculateClassBoardSettingsAnchor(
    { right: 620.2, top: 240.8 },
    { width: 1280, height: 800 }
  ), {
    top: 240,
    left: 633,
    width: 340,
    maxHeight: 550,
  });
  assert.deepEqual(calculateClassBoardSettingsAnchor(
    { right: 900, top: 760 },
    { width: 1280, height: 800 }
  ), {
    top: 610,
    left: 912,
    width: 340,
    maxHeight: 180,
  });
  assert.match(frame, /data-board-instance-id=\{instance\.instanceId\}/);
  assert.match(settingsAnchorHook, /requestAnimationFrame/);
  assert.match(settingsAnchorHook, /ResizeObserver/);
  assert.match(settingsAnchorHook, /event\.buttons !== 0/);
  assert.match(settingsAnchorHook, /window\.addEventListener\('resize'/);
  assert.match(settingsAnchorHook, /window\.removeEventListener\('resize'/);
  assert.match(presentation, /useClassBoardSettingsAnchor\([\s\S]*selectedInstanceId/);
  assert.match(presentation, /settingsAnchorStyle=\{settingsAnchorStyle\}/);
  assert.match(presentation, /onClearSelection=\{clearSelection\}/);
  assert.match(canvas, /event\.target === event\.currentTarget[\s\S]*onClearSelection/);
  assert.match(presentationEditPanel, /is-anchored[\s\S]*is-positioning/);
  assert.match(presentationEditPanel, /style=\{settingsAnchorStyle \|\| undefined\}/);
  assert.match(styles, /\.class-board-presentation-settings\.is-positioning\s*\{[^}]*visibility:hidden/);
  assert.doesNotMatch(styles, /\.class-board-presentation-settings\s*\{[^}]*right:calc\(30%/);
  assert.match(guides, /설정창이 해당 위젯 오른쪽에 붙어 함께 움직이고[\s\S]*빈 화면이나 닫기/);
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
  assert.match(presentation, /autoFullscreen[\s\S]*fullscreenPrompt/);
  assert.match(presentation, /화면을 한 번 눌러 전체화면 시작/);
  assert.match(styles, /\.class-board-presentation-fullscreen-prompt/);
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

test('열린 스크린은 설정 화면과 같은 16:9 논리 화면을 비율대로 확대한다', () => {
  const layoutStart = styles.indexOf('.class-board-presentation-page {');
  const layoutEnd = styles.indexOf('.class-board-presentation-state {');
  const presentationLayout = styles.slice(layoutStart, layoutEnd);

  assert.notEqual(layoutStart, -1);
  assert.notEqual(layoutEnd, -1);
  assert.match(presentationLayout, /class-board-presentation-page \{[^}]*padding:0;/);
  assert.match(presentationLayout, /class-board-presentation-stage \{[^}]*width:100%; height:100%;/);
  assert.match(presentationLayout, /class-board-presentation-page \.class-board-viewport \{[^}]*width:100%; height:100%; aspect-ratio:auto;/);
  assert.doesNotMatch(presentationLayout, /class-board-presentation-page \.class-board-canvas[^}]*padding:0/);
  assert.match(guides, /설정 화면과 같은 16:9 화면[\s\S]*비율을 유지/);
  assert.match(guides, /같은 1600×900 논리 화면[\s\S]*글자 크기와 줄바꿈은 두 화면에서 같게 유지/);
});

test('스크린은 임시 편집 모드에서 텍스트·이미지를 추가하고 저장 또는 취소한다', () => {
  assert.match(presentation, /✏️ 화면 편집/);
  assert.match(presentation, /fullscreen \? ' is-fullscreen' : ''/);
  assert.match(styles, /\.class-board-presentation-page\.is-fullscreen \.class-board-presentation-editbar__state\s*\{[^}]*display:none/);
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
  assert.match(guides, /전체화면에서는 편집 중에도 상단의 `화면 편집 중` 안내가 숨겨/);
  assert.doesNotMatch(presentation, /optimizeClassBoardImage|uploadClassBoardImage|<TextWidget|<ImageWidget/);
  assert.match(canvas, /interactionEnabled = editable \?\? !presentation/);
  assert.match(canvas, /imagePathKey[\s\S]*\.sort\(\)/);
  assert.ok(canvas.includes(".join('\\n')"));
});

test('스크린 편집 뒤 대시보드로 돌아오면 서버의 최신 보드를 다시 읽는다', () => {
  assert.match(entry, /loadWorkspace = useCallback\(async \(\{ background = false \} = \{\}\)/);
  assert.match(entry, /workspaceRevision[\s\S]*item\.revision[\s\S]*item\.isActive/);
  assert.match(entry, /background && workspaceRevision\(nextBoards\) === workspaceRevision\(boardsRef\.current\)/);
  assert.match(entry, /refreshWhenReturning[\s\S]*dirtyRef\.current[\s\S]*busyRef\.current/);
  assert.match(entry, /event\?\.type === 'pageshow' && !event\.persisted/);
  assert.match(entry, /lastReturnRefreshRef\.current < 750/);
  assert.match(entry, /loadWorkspace\(\{ background: true \}\)/);
  assert.match(entry, /addEventListener\('focus', refreshWhenReturning\)/);
  assert.match(entry, /addEventListener\('pageshow', refreshWhenReturning\)/);
  assert.match(entry, /addEventListener\('visibilitychange', refreshWhenReturning\)/);
  assert.match(entry, /removeEventListener\('focus', refreshWhenReturning\)/);
  assert.match(entry, /removeEventListener\('pageshow', refreshWhenReturning\)/);
  assert.match(entry, /removeEventListener\('visibilitychange', refreshWhenReturning\)/);
  assert.match(guides, /열린 스크린에서 내용을 저장하고 기존 대시보드 탭으로 돌아오면 최신 탭 내용이 자동으로 반영/);
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

test('수업 위젯은 바깥 여백과 조작부를 줄이고 핵심 정보를 남은 프레임에 채운다', () => {
  assert.match(styles, /\.class-board-text\s*\{[^}]*padding:0/);
  assert.match(styles, /\.class-board-weather\s*\{[^}]*gap:0[^}]*align-items:stretch[^}]*padding:0/);
  assert.match(styles, /\.class-board-weather__icon\s*\{[^}]*width:100%; height:100%[^}]*48cqmin/);
  assert.match(styles, /\.class-board-weather>div\s*\{[^}]*display:flex[^}]*justify-content:center[^}]*height:100%/);
  assert.match(styles, /\.class-board-weather>div>span\s*\{[^}]*9cqmin/);
  assert.match(styles, /\.class-board-weather h2\s*\{[^}]*flex:0 0 auto[^}]*18cqmin/);
  assert.match(styles, /\.class-board-weather p\s*\{[^}]*8cqmin/);
  assert.match(styles, /\.class-board-clock\s*\{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(styles, /\.class-board-picker\s*\{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto auto/);
  assert.match(styles, /\.class-board-clock>strong\s*\{[^}]*width:100%; height:100%[^}]*26cqmin/);
  assert.match(styles, /\.class-board-picker>strong\s*\{[^}]*width:100%; height:100%[^}]*20cqmin/);
  assert.match(styles, /\.class-board-clock>div,\.class-board-picker>div\s*\{[^}]*width:100%/);
  assert.match(styles, /\.class-board-status\s*\{[^}]*padding:16px 14px/);
});

test('텍스트는 수동 배율 없이 실제 내용을 여백 없이 맞추고 프레임 변경에 다시 반응한다', () => {
  assert.match(textSettings, /오른쪽은 줄바꿈[\s\S]*아래쪽은 보이는 줄 수[\s\S]*모서리는 글씨 크기/);
  assert.doesNotMatch(textSettings, /<legend>글씨 크기<\/legend>|aria-pressed|TEXT_SCALE_OPTIONS/);
  assert.match(textWidget, /--class-board-text-heading-size[\s\S]*createResponsiveTextSize\(1\.5, 5\)/);
  assert.match(textWidget, /useFittedClassBoardText\(config\)[\s\S]*ref=\{textRef\}/);
  assert.match(styles, /container-type:size[\s\S]*--class-board-text-heading-size[\s\S]*7\.5cqi \+ 7\.5cqb/);
  assert.match(styles, /\.class-board-text h2\s*\{[^}]*margin:0[^}]*overflow-wrap:anywhere[^}]*line-height:1/);
  assert.match(styles, /\.class-board-text__body\s*\{[^}]*overflow-wrap:anywhere[^}]*line-height:1\.05/);
  assert.doesNotMatch(styles, /class-board-text h2[^}]*font-size:clamp\([^}]*4rem/);
  assert.doesNotMatch(styles, /class-board-text__body[^}]*font-size:clamp\([^}]*2\.6rem/);
  assert.match(fittedTextHook, /scrollWidth <= element\.clientWidth[\s\S]*scrollHeight <= element\.clientHeight/);
  assert.match(fittedTextHook, /maximumSize = Math\.max\([\s\S]*element\.clientWidth,[\s\S]*element\.clientHeight/);
  assert.match(fittedTextHook, /findLargestFittingTextSize\([\s\S]*CLASS_BOARD_TEXT_MIN_BODY_PX, maximumSize\)/);
  assert.doesNotMatch(fittedTextHook, /getTextFillRatio|fontScale/);
  assert.match(fittedTextHook, /new ResizeObserver\(\(\) => scheduleFit\(false\)\)/);
  assert.match(fittedTextHook, /closest\('\[data-board-frame\]'\)[\s\S]*shouldRefitClassBoardText\(resizeAxis, force\)/);
  assert.match(fittedTextHook, /requestAnimationFrame\(fitText\)[\s\S]*resizeObserver\?\.disconnect\(\)/);
  assert.match(fittedTextHook, /normalizeClassBoardTextBodySize\(bodySize\)[\s\S]*applyTextSize\(element, savedBodySize\)/);
  assert.match(textSettings, /resetFittedSize[\s\S]*delete next\.bodySize/);
  assert.match(frame, /startTextBodySize[\s\S]*textBodySize: gesture\.startTextBodySize \* scale/);
  assert.match(model, /export \{ updateClassBoardWidgetPlacement \} from '\.\/host\/widgetPlacement'/);
  assert.equal(shouldRefitClassBoardText(undefined), false);
  assert.equal(shouldRefitClassBoardText('x'), false);
  assert.equal(shouldRefitClassBoardText('y'), false);
  assert.equal(shouldRefitClassBoardText('both'), false);
  assert.equal(shouldRefitClassBoardText('x', true), true);
  assert.doesNotMatch(fittedTextHook, /window\.addEventListener\('resize', fitAfterWindowResize\)/);
  assert.equal(getDiagonalResizeScale({ width: 30, height: 20 }, { width: 60, height: 40 }), 2);
  assert.equal(getDiagonalResizeScale({ width: 30, height: 20 }, { width: 15, height: 10 }), 0.5);
  assert.equal(normalizeTextScale(0.2), 0.8);
  assert.equal(normalizeTextScale(1.25), 1.25);
  assert.equal(normalizeTextScale(4), 1.5);
  assert.equal(normalizeClassBoardTextBodySize(undefined), null);
  assert.equal(normalizeClassBoardTextBodySize(44.12), 44);
  assert.equal(normalizeClassBoardTextBodySize(1200), 900);
  assert.equal(findLargestFittingTextSize((size) => size <= 48.6), 48.5);
  assert.equal(findLargestFittingTextSize(() => false), 12);
  assert.equal(createResponsiveTextSize(1, 5), 'calc(5cqi + 5cqb)');
  assert.equal(createResponsiveTextSize(1.25, 3.25), 'calc(4.063cqi + 4.063cqb)');

  const board = {
    widgets: [{
      instanceId: 'text-1',
      widgetId: 'text',
      placement: { x: 2, y: 3, width: 30, height: 40 },
      config: { heading: '안내', body: '내용' },
    }],
  };
  const horizontal = updateClassBoardWidgetPlacement(
    board,
    'text-1',
    { x: 2, y: 3, width: 45, height: 40 },
    { resizeAxis: 'x' }
  );
  assert.equal(horizontal.widgets[0].config.bodySize, undefined);
  const diagonal = updateClassBoardWidgetPlacement(
    board,
    'text-1',
    { x: 2, y: 3, width: 45, height: 60 },
    { resizeAxis: 'both', textBodySize: 38.62 }
  );
  assert.equal(diagonal.widgets[0].config.bodySize, 38.5);
});

test('편집 화면과 전체화면은 같은 1600×900 논리 캔버스를 균일하게 확대한다', () => {
  assert.equal(CLASS_BOARD_STAGE_WIDTH, 1600);
  assert.equal(CLASS_BOARD_STAGE_HEIGHT, 900);
  assert.deepEqual(calculateClassBoardStageTransform(800, 450), { scale: 0.5, x: 0, y: 0 });
  assert.deepEqual(calculateClassBoardStageTransform(1000, 450), { scale: 0.5, x: 100, y: 0 });
  assert.deepEqual(calculateClassBoardStageTransform(800, 600), { scale: 0.5, x: 0, y: 75 });
  assert.match(canvas, /calculateClassBoardStageTransform[\s\S]*class-board-viewport__surface/);
  assert.match(styles, /\.class-board-viewport__surface\s*\{[^}]*width:1600px; height:900px[^}]*transform-origin:top left/);
  assert.match(styles, /\.class-board-presentation-page \.class-board-viewport\s*\{[^}]*width:100%; height:100%; aspect-ratio:auto/);
  assert.doesNotMatch(styles, /class-board-presentation-page \.class-board-canvas[^}]*padding:0/);
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

test('오늘 현황은 최상위에 고정하고 자유 위젯은 두 편집 화면에서 층을 이동한다', () => {
  const board = {
    widgets: [
      { instanceId: 'back', zone: 'content', order: 10, visible: true },
      { instanceId: 'middle', zone: 'content', order: 20, visible: true },
      { instanceId: 'front', zone: 'content', order: 30, visible: true },
      { instanceId: 'status', zone: 'sidebar', order: 10, visible: true },
    ],
  };
  assert.deepEqual(getClassBoardWidgetLayerState(board, 'middle'), {
    position: 2,
    total: 3,
    canMoveBackward: true,
    canMoveForward: true,
  });
  const movedForward = moveClassBoardWidgetLayer(board, 'middle', 1);
  assert.deepEqual(
    movedForward.widgets.filter((widget) => widget.zone === 'content').map((widget) => [widget.instanceId, widget.order]),
    [['back', 10], ['middle', 30], ['front', 20]]
  );
  assert.equal(movedForward.widgets.find((widget) => widget.instanceId === 'status').order, 10);
  assert.equal(moveClassBoardWidgetLayer(board, 'back', -1), board);
  assert.match(styles, /\.class-board-canvas__content\s*\{[^}]*z-index:1/);
  assert.match(styles, /\.class-board-canvas__sidebar\s*\{[^}]*z-index:2/);
  assert.match(frame, /placementStyle\(draftPlacement, instance\.order\)/);
  assert.doesNotMatch(frame, /selected \? 1001/);
  assert.match(layerControls, /한 층 뒤로[\s\S]*한 층 앞으로[\s\S]*오늘 현황은 항상 가장 앞/);
  assert.match(entry, /<WidgetLayerControls[\s\S]*onMove=\{moveSelected\}/);
  assert.match(presentationEditPanel, /<WidgetLayerControls[\s\S]*onMove=\{onMoveLayer\}/);
  assert.match(presentation, /moveClassBoardWidgetLayer\(current, selectedInstanceId, direction\)/);
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
