import { fitExportImageSize, loadWritingExportImageBlobs } from './writingImageExport.js';

const GOOGLE_DRIVE_API_ROOT = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_UPLOAD_ROOT = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_DOC_IMAGE_URI_MAX_LENGTH = 2000;
const GOOGLE_DOC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

const parseGoogleResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || `Google Drive API 요청 실패 (${response.status})`);
    }
    return payload;
};

const deleteTemporaryDriveImage = async ({ fileId, permissionId }, accessToken) => {
    const fileResponse = await fetch(`${GOOGLE_DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (fileResponse.ok || fileResponse.status === 404) return;
    if (permissionId) {
        const permissionResponse = await fetch(
            `${GOOGLE_DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`,
            {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        if (permissionResponse.ok || permissionResponse.status === 404) return;
    }
    throw new Error('Google 문서용 임시 사진의 공개 권한을 정리하지 못했습니다.');
};

const uploadTemporaryDriveImage = async (image, accessToken) => {
    const boundary = `agit-export-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    const metadata = {
        name: `끄적끄적-임시사진-${Date.now()}.jpg`,
        description: 'Google Docs 삽입 직후 자동 삭제되는 끄적끄적 아지트 임시 사진',
    };
    const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\nContent-Type: ${image.contentType}\r\n\r\n`,
        image.blob,
        `\r\n--${boundary}--`,
    ], { type: `multipart/related; boundary=${boundary}` });
    const uploadResponse = await fetch(`${GOOGLE_DRIVE_UPLOAD_ROOT}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
    });
    const uploaded = await parseGoogleResponse(uploadResponse);
    const temporary = { fileId: uploaded.id, permissionId: null };

    try {
        const permissionResponse = await fetch(
            `${GOOGLE_DRIVE_API_ROOT}/files/${encodeURIComponent(uploaded.id)}/permissions?fields=id`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
            },
        );
        const permission = await parseGoogleResponse(permissionResponse);
        temporary.permissionId = permission.id;
        return {
            ...temporary,
            uri: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(uploaded.id)}`,
        };
    } catch (error) {
        await deleteTemporaryDriveImage(temporary, accessToken).catch(() => {});
        throw error;
    }
};

const canUseSignedUrlDirectly = (image) => (
    GOOGLE_DOC_IMAGE_TYPES.has(String(image?.mimeType || '').toLowerCase())
    && Boolean(image?.url)
    && image.url.length <= GOOGLE_DOC_IMAGE_URI_MAX_LENGTH
);

export const prepareGoogleDocImageAttachments = async (attachmentsByItem, accessToken) => {
    const temporaryImages = [];
    const prepared = (attachmentsByItem || []).map((images) => images.map((image) => (
        canUseSignedUrlDirectly(image) ? { ...image, docUri: image.url } : image
    )));
    const pending = [];
    prepared.forEach((images, itemIndex) => {
        images.forEach((image, imageIndex) => {
            if (!image.docUri) pending.push({ itemIndex, imageIndex, image });
        });
    });

    try {
        if (pending.length > 0) {
            const loaded = await loadWritingExportImageBlobs([pending.map(({ image }) => image)]);
            for (let index = 0; index < pending.length; index += 1) {
                const target = Reflect.get(pending, index);
                const binaryImage = Reflect.get(Reflect.get(loaded, 0), index);
                const temporary = await uploadTemporaryDriveImage(binaryImage, accessToken);
                temporaryImages.push(temporary);
                const itemImages = Reflect.get(prepared, target.itemIndex);
                Reflect.set(itemImages, target.imageIndex, {
                    ...target.image,
                    mimeType: binaryImage.contentType,
                    docUri: temporary.uri,
                });
            }
        }
    } catch (error) {
        await Promise.allSettled(
            temporaryImages.map((image) => deleteTemporaryDriveImage(image, accessToken)),
        );
        throw error;
    }

    return {
        attachmentsByItem: prepared,
        cleanup: async () => {
            const results = await Promise.allSettled(
                temporaryImages.map((image) => deleteTemporaryDriveImage(image, accessToken)),
            );
            if (results.some((result) => result.status === 'rejected')) {
                throw new Error('Google 문서용 임시 사진 일부를 정리하지 못했습니다.');
            }
        },
    };
};

export const appendGoogleDocImageRequests = (requests, startIndex, images) => {
    let currentIndex = startIndex;
    (images || []).forEach((image) => {
        if (!image?.docUri) return;
        const imageStartIndex = currentIndex;
        const size = fitExportImageSize(image, 400, 300);
        requests.push({
            insertInlineImage: {
                uri: image.docUri,
                location: { index: currentIndex },
                objectSize: {
                    width: { magnitude: Number((size.width * 0.75).toFixed(2)), unit: 'PT' },
                    height: { magnitude: Number((size.height * 0.75).toFixed(2)), unit: 'PT' },
                },
            },
        });
        currentIndex += 1;
        requests.push({ insertText: { location: { index: currentIndex }, text: '\n' } });
        currentIndex += 1;
        requests.push({
            updateParagraphStyle: {
                range: { startIndex: imageStartIndex, endIndex: currentIndex },
                paragraphStyle: { alignment: 'CENTER' },
                fields: 'alignment',
            },
        });
    });
    return currentIndex;
};
