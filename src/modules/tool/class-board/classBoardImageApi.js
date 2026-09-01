import { supabase } from '../../../lib/supabaseClient';

export const CLASS_BOARD_ASSET_BUCKET = 'class-board-assets';
export const CLASS_BOARD_IMAGE_MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const CLASS_BOARD_IMAGE_MAX_STORED_BYTES = 2 * 1024 * 1024;
export const CLASS_BOARD_IMAGE_MAX_EDGE = 1920;

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('이미지를 화면용 파일로 바꾸지 못했습니다.'));
  }, type, quality);
});

const loadImage = async (file) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('이 이미지 형식은 브라우저에서 읽을 수 없습니다.'));
      element.src = objectUrl;
    });
    return { image, release: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

export const optimizeClassBoardImage = async (file) => {
  if (!file || (!file.type?.startsWith('image/') && file.type !== '')) {
    throw new Error('이미지 파일만 올릴 수 있습니다.');
  }
  if (file.size > CLASS_BOARD_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error('원본 이미지는 30MB 이하만 올릴 수 있습니다.');
  }

  const loaded = await loadImage(file);
  try {
    const sourceWidth = loaded.image.naturalWidth;
    const sourceHeight = loaded.image.naturalHeight;
    if (
      file.size <= CLASS_BOARD_IMAGE_MAX_STORED_BYTES
      && Math.max(sourceWidth, sourceHeight) <= CLASS_BOARD_IMAGE_MAX_EDGE
      && ['image/webp', 'image/jpeg'].includes(file.type)
    ) {
      return {
        blob: file,
        width: sourceWidth,
        height: sourceHeight,
        bytes: file.size,
        mimeType: file.type,
      };
    }
    const scale = Math.min(1, CLASS_BOARD_IMAGE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    let width = Math.max(1, Math.round(sourceWidth * scale));
    let height = Math.max(1, Math.round(sourceHeight * scale));
    let quality = 0.92;
    let type = 'image/webp';
    let blob = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('이미지를 줄이는 브라우저 기능을 사용할 수 없습니다.');
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(loaded.image, 0, 0, width, height);
      blob = await canvasToBlob(canvas, type, quality);
      if (attempt === 0 && blob.type !== type) {
        type = 'image/jpeg';
        blob = await canvasToBlob(canvas, type, quality);
      }
      if (blob.size <= CLASS_BOARD_IMAGE_MAX_STORED_BYTES) break;
      const shrink = Math.max(0.78, Math.sqrt(CLASS_BOARD_IMAGE_MAX_STORED_BYTES / blob.size) * 0.98);
      width = Math.max(1, Math.round(width * shrink));
      height = Math.max(1, Math.round(height * shrink));
      quality = Math.max(0.68, quality - 0.045);
    }
    if (!blob || blob.size > CLASS_BOARD_IMAGE_MAX_STORED_BYTES) {
      throw new Error('이미지를 2MB 이하로 줄이지 못했습니다. 다른 이미지를 골라 주세요.');
    }
    return { blob, width, height, bytes: blob.size, mimeType: blob.type || type };
  } finally {
    loaded.release();
  }
};

const randomId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const uploadClassBoardImage = async ({ classId, boardId, optimizedImage }) => {
  if (!classId || !boardId || !optimizedImage?.blob) throw new Error('먼저 스크린을 저장해 주세요.');
  const extension = optimizedImage.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `${classId}/${boardId}/${randomId()}.${extension}`;
  const { error } = await supabase.storage.from(CLASS_BOARD_ASSET_BUCKET).upload(path, optimizedImage.blob, {
    cacheControl: '31536000',
    contentType: optimizedImage.mimeType,
    upsert: false,
  });
  if (error) throw error;
  return {
    path,
    width: optimizedImage.width,
    height: optimizedImage.height,
    bytes: optimizedImage.bytes,
    mimeType: optimizedImage.mimeType,
    caption: '',
  };
};

export const getClassBoardImageUrls = async (paths) => {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  if (uniquePaths.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from(CLASS_BOARD_ASSET_BUCKET)
    .createSignedUrls(uniquePaths, 6 * 60 * 60);
  if (error) throw error;
  return new Map((data || [])
    .filter((item) => item?.path && item?.signedUrl)
    .map((item) => [item.path, item.signedUrl]));
};

export const removeClassBoardImage = async (path) => {
  if (!path) return;
  const { error } = await supabase.storage.from(CLASS_BOARD_ASSET_BUCKET).remove([path]);
  if (error) throw error;
};
