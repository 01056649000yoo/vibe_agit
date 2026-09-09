/**
 * Google Docs API 를 부르는 **단 하나의 자리**.
 *
 * 왜 파일로 뺐나:
 *   `useDataExport.js` 안에만 있던 `requestGoogleDocs` 를 문집 내보내기에서도 써야 했다.
 *   복사하면 오류 문구·헤더·실패 처리가 두 벌이 되고 한쪽만 고쳐지기 쉽다.
 *   토큰을 얻는 일(GIS)은 화면 훅이 계속 담당한다 — 여기서는 받은 토큰을 쓰기만 한다.
 *
 * 비밀 값 원칙: 액세스 토큰은 인자로만 받고 이 모듈에 저장하거나 기록하지 않는다.
 */

const GOOGLE_DOCS_API_ROOT = 'https://docs.googleapis.com/v1';

export const requestGoogleDocs = async (path, accessToken, options = {}) => {
    const response = await fetch(`${GOOGLE_DOCS_API_ROOT}${path}`, {
        method: options.method || 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || `Google Docs API 요청 실패 (${response.status})`);
    }
    return payload;
};

/** 빈 문서를 만들고 문서 id 를 돌려준다. */
export const createGoogleDocument = async (title, accessToken) => {
    const created = await requestGoogleDocs('/documents', accessToken, { method: 'POST', body: { title } });
    if (!created?.documentId) throw new Error('구글 문서를 만들지 못했습니다.');
    return created.documentId;
};

/**
 * 편집 요청을 문서에 적용한다.
 *
 * batchUpdate 한 번에 담는 요청 수에는 실질적인 상한이 있다. 문집은 글이 많아 요청이 수천 개가
 * 되므로 나눠 보낸다. **순서가 곧 문서 내용이라 반드시 앞에서부터 차례로** 보낸다.
 */
export const applyGoogleDocRequests = async (documentId, requests, accessToken, chunkSize = 400) => {
    for (let start = 0; start < requests.length; start += chunkSize) {
        await requestGoogleDocs(`/documents/${encodeURIComponent(documentId)}:batchUpdate`, accessToken, {
            method: 'POST', body: { requests: requests.slice(start, start + chunkSize) }
        });
    }
};

export const googleDocEditUrl = (documentId) => `https://docs.google.com/document/d/${documentId}/edit`;
