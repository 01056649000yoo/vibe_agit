import { getGenreMissionType } from '../mission-types/registry.js';

const IMAGE_FETCH_CONCURRENCY = 6;
const GOOGLE_COMPATIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

const getStructuredContent = (item) => (
    item?._structuredContent ?? item?.structured_content ?? item?.structuredContent ?? null
);

const resolveInputTemplate = (item) => {
    const explicitTemplate = item?._inputTemplate ?? item?.input_template ?? '';
    if (getGenreMissionType(explicitTemplate)) return explicitTemplate;
    const structuredTemplate = getStructuredContent(item)?.template || '';
    return getGenreMissionType(structuredTemplate) ? structuredTemplate : explicitTemplate;
};

const createImageExportResolver = () => {
    const cache = new Map();
    return async (item) => {
        const contract = getGenreMissionType(resolveInputTemplate(item))?.imageExport;
        if (!contract?.load) return null;
        if (!cache.has(contract.id)) {
            cache.set(contract.id, Promise.resolve(contract.load()).then((imageExport) => {
                if (
                    imageExport?.id !== contract.id
                    || typeof imageExport?.collectImages !== 'function'
                    || typeof imageExport?.loadImageUrls !== 'function'
                ) {
                    throw new Error(`${contract.id} 장르의 이미지 내보내기 계약이 올바르지 않습니다.`);
                }
                return imageExport;
            }));
        }
        return cache.get(contract.id);
    };
};

export const loadWritingExportImageAttachments = async (items) => {
    const sourceItems = items || [];
    const resolveImageExport = createImageExportResolver();
    const resolved = await Promise.all(sourceItems.map(async (item) => ({
        item,
        imageExport: await resolveImageExport(item),
    })));
    const entriesByExport = new Map();
    resolved.forEach(({ item, imageExport }) => {
        if (!imageExport) return;
        const entries = entriesByExport.get(imageExport) || [];
        entries.push(item);
        entriesByExport.set(imageExport, entries);
    });

    const urlsByExport = new Map();
    for (const [imageExport, entries] of entriesByExport) {
        urlsByExport.set(imageExport, await imageExport.loadImageUrls(entries));
    }

    return resolved.map(({ item, imageExport }) => {
        if (!imageExport) return [];
        const urls = urlsByExport.get(imageExport) || new Map();
        return imageExport.collectImages(item).map((image) => ({
            ...image,
            url: urls.get(image.path),
        }));
    });
};

export const fitExportImageSize = (image, maxWidth, maxHeight) => {
    const width = Math.max(1, Number(image?.width) || 4);
    const height = Math.max(1, Number(image?.height) || 3);
    const scale = Math.min(maxWidth / width, maxHeight / height, 1);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            Reflect.set(results, index, await mapper(Reflect.get(items, index), index));
        }
    };
    await Promise.all(Array.from(
        { length: Math.min(concurrency, items.length) },
        () => worker(),
    ));
    return results;
};

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('내보낼 사진 형식을 바꾸지 못했습니다.'));
    }, type, quality);
});

const convertBlobToJpeg = async (blob) => {
    let source;
    let release = () => {};
    if (typeof createImageBitmap === 'function') {
        source = await createImageBitmap(blob);
        release = () => source.close?.();
    } else {
        const objectUrl = URL.createObjectURL(blob);
        try {
            source = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('내보낼 사진을 읽지 못했습니다.'));
                image.src = objectUrl;
            });
        } catch (error) {
            URL.revokeObjectURL(objectUrl);
            throw error;
        }
        release = () => URL.revokeObjectURL(objectUrl);
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, source.width || source.naturalWidth);
        canvas.height = Math.max(1, source.height || source.naturalHeight);
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('내보낼 사진을 변환할 수 없습니다.');
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        return canvasToBlob(canvas, 'image/jpeg', 0.86);
    } finally {
        release();
    }
};

const fetchCompatibleImageBlob = async (image) => {
    if (!image?.url) throw new Error('내보낼 사진 주소가 없습니다.');
    const response = await fetch(image.url);
    if (!response.ok) throw new Error(`사진을 내려받지 못했습니다. (${response.status})`);
    const originalBlob = await response.blob();
    const contentType = String(originalBlob.type || image.mimeType || '').toLowerCase();
    if (GOOGLE_COMPATIBLE_IMAGE_TYPES.has(contentType)) {
        return { ...image, blob: originalBlob, contentType };
    }
    const jpegBlob = await convertBlobToJpeg(originalBlob);
    return { ...image, blob: jpegBlob, contentType: 'image/jpeg' };
};

export const loadWritingExportImageBlobs = async (attachmentsByItem) => {
    const uniqueImages = new Map();
    (attachmentsByItem || []).flat().forEach((image) => {
        if (image?.path && !uniqueImages.has(image.path)) uniqueImages.set(image.path, image);
    });
    const loadedPairs = await mapWithConcurrency(
        [...uniqueImages.entries()],
        IMAGE_FETCH_CONCURRENCY,
        async ([path, image]) => [path, await fetchCompatibleImageBlob(image)],
    );
    const loadedByPath = new Map(loadedPairs);
    return (attachmentsByItem || []).map((images) => (
        images.map((image) => loadedByPath.get(image.path))
    ));
};
