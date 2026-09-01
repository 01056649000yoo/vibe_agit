import { getClassBoardWidget, getClassBoardWidgets } from './widgets/registry';
import { fitPlacementToImage, normalizePlacement } from './host/boardPlacement';
export { updateClassBoardWidgetPlacement } from './host/widgetPlacement';

const randomId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const CLASS_BOARD_LAYOUT = Object.freeze({ version: 3, preset: 'freeform-stage-7-3' });
export const LEGACY_CONTENT_STAGE_RATIO = 0.7;

export const migrateLegacyContentPlacement = (placement) => ({
  ...placement,
  x: Number(placement?.x || 0) * LEGACY_CONTENT_STAGE_RATIO,
  width: Number(placement?.width || 0) * LEGACY_CONTENT_STAGE_RATIO,
});

export const createWidgetInstance = (widgetId, order = 10, placementIndex = 0) => {
  const manifest = getClassBoardWidget(widgetId);
  if (!manifest) throw new Error('지원하지 않는 위젯입니다.');
  const basePlacement = manifest.defaultPlacement.placement;
  const cascade = basePlacement ? Math.min(placementIndex, 6) * 2.5 : 0;
  return {
    instanceId: randomId(),
    widgetId: manifest.id,
    version: manifest.version,
    zone: manifest.defaultPlacement.zone,
    order,
    size: manifest.defaultPlacement.size,
    ...(basePlacement ? {
      placement: normalizePlacement({
        ...basePlacement,
        x: basePlacement.x + cascade,
        y: basePlacement.y + cascade,
      }, basePlacement),
    } : {}),
    visible: true,
    config: manifest.createDefaultConfig(),
  };
};

export const createDefaultClassBoard = (className = '') => ({
  id: null,
  title: `${className || '우리 반'} 오늘의 스크린`,
  layout: { ...CLASS_BOARD_LAYOUT },
  widgets: [
    createWidgetInstance('text', 10),
    createWidgetInstance('image', 20),
    createWidgetInstance('writing-status', 10),
  ],
  revision: null,
  isActive: true,
  isDefault: false,
  displayOrder: 0,
});

export const normalizeClassBoard = (board) => {
  let contentIndex = 0;
  const layoutVersion = Number(board?.layout?.version) || 1;
  const widgets = Array.isArray(board?.widgets)
    ? board.widgets.filter((widget) => Boolean(getClassBoardWidget(widget?.widgetId))).map((widget) => {
      const manifest = getClassBoardWidget(widget.widgetId);
      if (widget.zone !== 'content') return widget;
      const fallback = manifest.defaultPlacement.placement;
      const cascade = Math.min(contentIndex, 6) * 2.5;
      contentIndex += 1;
      const placement = layoutVersion < CLASS_BOARD_LAYOUT.version && widget.placement
        ? migrateLegacyContentPlacement(widget.placement)
        : widget.placement;
      return {
        ...widget,
        placement: normalizePlacement(placement, {
          ...fallback,
          x: fallback.x + cascade,
          y: fallback.y + cascade,
        }),
      };
    })
    : [];
  return {
    ...board,
    layout: { ...CLASS_BOARD_LAYOUT },
    widgets,
  };
};

export const getAddableWidgets = (instances) => getClassBoardWidgets().filter((manifest) => (
  manifest.maxInstances === undefined
  || instances.filter((instance) => instance.widgetId === manifest.id).length < manifest.maxInstances
));

export const updateClassBoardWidgetConfig = (
  board,
  instanceId,
  config,
  options = {},
  contentBounds
) => {
  if (!board) return board;
  return {
    ...board,
    widgets: board.widgets.map((widget) => {
      if (widget.instanceId !== instanceId) return widget;
      const fitToImage = options?.fitToImage;
      return {
        ...widget,
        config,
        ...(fitToImage ? {
          placement: fitPlacementToImage(
            widget.placement,
            fitToImage.width,
            fitToImage.height,
            contentBounds
          ),
        } : {}),
      };
    }),
  };
};

const findImagePasteTarget = (board, selectedInstanceId) => {
  const selected = board?.widgets.find((widget) => widget.instanceId === selectedInstanceId);
  if (selected?.widgetId === 'image') return selected;
  return board?.widgets.find((widget) => widget.widgetId === 'image' && !widget.config?.path) || null;
};

export const CLASS_BOARD_IMAGE_PASTE_FAILED_MESSAGE = '붙여넣은 이미지를 화면에 추가하지 못했습니다.';

export const getClassBoardImagePasteNotice = (replaced) => replaced
  ? '선택한 이미지를 붙여넣은 캡처로 교체하고 비율에 맞춰 조정했습니다.'
  : '붙여넣은 캡처를 이미지 비율에 맞춰 화면에 추가했습니다.';

export const getClassBoardImagePasteError = (board, selectedInstanceId) => {
  if (!board?.id) return '캡처 이미지를 붙여넣기 전에 스크린을 한 번 저장해 주세요.';
  if (findImagePasteTarget(board, selectedInstanceId)) return '';
  const imageManifest = getClassBoardWidget('image');
  const imageCount = board.widgets.filter((widget) => widget.widgetId === 'image').length;
  if (imageCount >= imageManifest.maxInstances) {
    return `이미지는 한 스크린에 최대 ${imageManifest.maxInstances}개까지 넣을 수 있습니다.`;
  }
  return '';
};

export const applyPastedClassBoardImage = (
  board,
  selectedInstanceId,
  image,
  contentBounds
) => {
  const validationError = getClassBoardImagePasteError(board, selectedInstanceId);
  if (validationError) throw new Error(validationError);
  const target = findImagePasteTarget(board, selectedInstanceId);
  if (target) {
    return {
      board: updateClassBoardWidgetConfig(
        board,
        target.instanceId,
        {
          ...target.config,
          ...image,
          caption: target.config?.caption || '',
          fit: target.config?.fit || 'contain',
        },
        { fitToImage: { width: image.width, height: image.height } },
        contentBounds
      ),
      instanceId: target.instanceId,
      replaced: Boolean(target.config?.path),
    };
  }

  const contentWidgets = board.widgets.filter((widget) => widget.zone === 'content');
  const order = Math.max(0, ...contentWidgets.map((widget) => widget.order)) + 10;
  const instance = createWidgetInstance('image', order, contentWidgets.length);
  const pastedInstance = {
    ...instance,
    config: { ...instance.config, ...image, caption: '', fit: 'contain' },
    placement: fitPlacementToImage(
      instance.placement,
      image.width,
      image.height,
      contentBounds
    ),
  };
  return {
    board: { ...board, widgets: [...board.widgets, pastedInstance] },
    instanceId: pastedInstance.instanceId,
    replaced: false,
  };
};
