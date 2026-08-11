import { supabase } from '../../../../lib/supabaseClient';

export const REPORT_IMAGE_BUCKET = 'report-images';
export const REPORT_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const REPORT_IMAGE_MAX_STORED_BYTES = 256 * 1024;
export const REPORT_IMAGE_MAX_EDGE = 720;

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('사진을 웹용 파일로 바꾸지 못했습니다.'));
    }, type, quality);
});

const loadWithImageElement = async (file) => {
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('이 사진 형식은 브라우저에서 읽을 수 없습니다.'));
            element.src = objectUrl;
        });
        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            release: () => URL.revokeObjectURL(objectUrl),
        };
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
};

const loadImageSource = async (file) => {
    if (typeof createImageBitmap === 'function') {
        try {
            let bitmap;
            try {
                bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch {
                bitmap = await createImageBitmap(file);
            }
            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                release: () => bitmap.close?.(),
            };
        } catch {
            // 태블릿 브라우저가 API는 제공하지만 특정 사진 형식이나 회전 옵션을
            // 처리하지 못하는 경우 일반 이미지 디코더로 한 번 더 시도한다.
        }
    }

    return loadWithImageElement(file);
};

const drawResized = (source, width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('사진을 줄일 수 있는 화면 기능을 사용할 수 없습니다.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
};

export const optimizeReportImage = async (file) => {
    if (!file || (!file.type?.startsWith('image/') && file.type !== '')) {
        throw new Error('사진 파일만 넣을 수 있어요.');
    }
    if (file.size > REPORT_IMAGE_MAX_SOURCE_BYTES) {
        throw new Error('원본 사진이 너무 커요. 20MB 이하 사진을 골라주세요.');
    }

    const loaded = await loadImageSource(file);
    try {
        const initialScale = Math.min(1, REPORT_IMAGE_MAX_EDGE / Math.max(loaded.width, loaded.height));
        let width = Math.max(1, Math.round(loaded.width * initialScale));
        let height = Math.max(1, Math.round(loaded.height * initialScale));
        let quality = 0.64;
        let blob = null;
        let outputType = 'image/webp';

        for (let attempt = 0; attempt < 6; attempt += 1) {
            const canvas = drawResized(loaded.source, width, height);
            blob = await canvasToBlob(canvas, outputType, quality);
            if (attempt === 0 && blob.type !== outputType) {
                outputType = 'image/jpeg';
                blob = await canvasToBlob(canvas, outputType, quality);
            }
            if (blob.size <= REPORT_IMAGE_MAX_STORED_BYTES) break;
            const shrink = Math.max(0.68, Math.sqrt(REPORT_IMAGE_MAX_STORED_BYTES / blob.size) * 0.94);
            width = Math.max(1, Math.round(width * shrink));
            height = Math.max(1, Math.round(height * shrink));
            quality = Math.max(0.42, quality - 0.06);
        }

        if (!blob || blob.size > REPORT_IMAGE_MAX_STORED_BYTES) {
            throw new Error('사진 용량을 충분히 줄이지 못했어요. 다른 사진을 골라주세요.');
        }

        return {
            blob,
            width,
            height,
            bytes: blob.size,
            mimeType: blob.type || outputType,
        };
    } finally {
        loaded.release();
    }
};

const randomId = () => globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const uploadReportImage = async ({ postId, sectionId, optimizedImage }) => {
    if (!postId || !sectionId || !optimizedImage?.blob) throw new Error('사진을 저장할 보고서 정보가 부족합니다.');
    const extension = optimizedImage.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
    const path = `${postId}/${sectionId}/${randomId()}.${extension}`;
    const { error } = await supabase.storage
        .from(REPORT_IMAGE_BUCKET)
        .upload(path, optimizedImage.blob, {
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

export const getReportImageUrls = async (paths) => {
    const uniquePaths = [...new Set((paths || []).filter(Boolean))];
    if (uniquePaths.length === 0) return new Map();
    const { data, error } = await supabase.storage
        .from(REPORT_IMAGE_BUCKET)
        .createSignedUrls(uniquePaths, 12 * 60 * 60);
    if (error) throw error;
    return new Map((data || [])
        .filter((item) => item?.path && item?.signedUrl)
        .map((item) => [item.path, item.signedUrl]));
};

export const removeReportImage = async (path) => {
    if (!path) return true;
    const { error } = await supabase.storage.from(REPORT_IMAGE_BUCKET).remove([path]);
    if (error) throw error;
    return true;
};
