import { useCallback, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
// import * as XLSX from 'xlsx'; // 동적 임포트로 변경하여 초기 로딩 속도 최적화

const GOOGLE_DOCS_API_ROOT = 'https://docs.googleapis.com/v1';

const requestGoogleDocs = async (path, accessToken, options = {}) => {
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

/**
 * 엑셀 데이터 추출 및 구글 문서 내보내기를 위한 커스텀 훅
 */
export const useDataExport = () => {

    // Google Identity Services 토큰 클라이언트가 준비되면 내보내기를 활성화한다.
    const [tokenClient, setTokenClient] = useState(null);
    const pendingTokenRejectRef = useRef(null);

    useEffect(() => {
        // Google Identity Services 초기화 (인증용)
        function startGis() {
            try {
                const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
                if (!clientId) {
                    console.error('GIS Error: VITE_GOOGLE_CLIENT_ID is missing');
                    return;
                }

                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: "https://www.googleapis.com/auth/drive.file",
                    // 실제 콜백은 사용자가 내보내기를 누를 때 getAccessToken에서 지정한다.
                    callback: () => {},
                    error_callback: (error) => {
                        const rejectPending = pendingTokenRejectRef.current;
                        if (!rejectPending) return;
                        pendingTokenRejectRef.current = null;
                        const message = error?.type === 'popup_closed'
                            ? 'Google 권한 창이 닫혔습니다.'
                            : error?.type === 'popup_failed_to_open'
                                ? 'Google 권한 창을 열지 못했습니다. 팝업 차단을 확인해 주세요.'
                                : 'Google 권한 창에서 오류가 발생했습니다.';
                        rejectPending(new Error(message));
                    }
                });
                setTokenClient(client);
                console.log('Google Auth Client Ready');
            } catch (err) {
                console.error('GIS Init Error:', err);
            }
        }

        // window.google 이 로드될 때까지 약간 대기 혹은 체크
        const checkGis = setInterval(() => {
            if (window.google?.accounts?.oauth2) {
                startGis();
                clearInterval(checkGis);
            }
        }, 100);

        return () => {
            clearInterval(checkGis);
            pendingTokenRejectRef.current?.(new Error('Google 내보내기 화면이 닫혔습니다.'));
            pendingTokenRejectRef.current = null;
        };
    }, []);

    /**
     * 구글 액세스 토큰 획득 (최신 방식)
     */
    const getAccessToken = useCallback(() => {
        return new Promise((resolve, reject) => {
            if (!tokenClient) return reject(new Error('인증 클라이언트가 준비되지 않았습니다.'));

            pendingTokenRejectRef.current?.(new Error('새 Google 권한 요청을 시작했습니다.'));
            pendingTokenRejectRef.current = reject;
            tokenClient.callback = (response) => {
                pendingTokenRejectRef.current = null;
                if (response.error !== undefined || !response.access_token) {
                    reject(new Error(response.error_description || response.error || 'Google 인증에 실패했습니다.'));
                    return;
                }
                resolve(response.access_token);
            };

            // 이미 토큰이 있을 경우 체크 (선택사항)
            try {
                tokenClient.requestAccessToken({ prompt: 'select_account' });
            } catch (error) {
                pendingTokenRejectRef.current = null;
                reject(error);
            }
        });
    }, [tokenClient]);

    /**
     * 데이터 조회 로직 (기존과 동일)
     */
    const fetchExportData = useCallback(async (type, id) => {
        try {
            let query = supabase
                .from('student_posts')
                .select(`
                    title,
                    content,
                    students (name, student_code, created_at),
                    writing_missions!inner (title, id)
                `)
                .eq('is_submitted', true);

            if (type === 'student') {
                query = query.eq('student_id', id);
            } else if (type === 'mission') {
                query = query.eq('mission_id', id);
            }

            const { data, error } = await query;
            if (error) throw error;

            let formattedData = data.map(post => ({
                작성자: post.students?.name || '알 수 없음',
                번호: post.students?.student_code || 0,
                미션제목: post.writing_missions?.title || '제목 없음',
                학생글제목: post.title || '제목 없음',
                내용: post.content || '',
                _missionId: post.writing_missions?.id,
                _studentCreatedAt: post.students?.created_at
            }));

            if (type === 'student') {
                formattedData.sort((a, b) => (a._missionId || 0) - (b._missionId || 0));
            } else if (type === 'mission') {
                // 학생 등록 순서(created_at)대로 정렬
                formattedData.sort((a, b) => {
                    const dateA = new Date(a._studentCreatedAt || 0);
                    const dateB = new Date(b._studentCreatedAt || 0);
                    return dateA - dateB;
                });
            }

            return formattedData.map(({ 번호, 작성자, 미션제목, 학생글제목, 내용 }) => ({
                번호,
                작성자,
                미션제목,
                학생글제목,
                내용
            }));

        } catch (error) {
            console.error('데이터 추출 실패 상세:', error);
            alert('데이터를 불러오는 중 오류가 발생했습니다.');
            return [];
        }
    }, []);

    /**
     * 구글 문서로 내보내기 (순차 삽입)
     * @param {Array} data - 내보낼 데이터 [{작성자, 미션제목, 내용}]
     * @param {string} title - 문서 제목 (주제)
     * @param {boolean} usePageBreak - 페이지 나누기 사용 여부
     * @param {string} targetDocId - (선택) 기존 문서 ID (여기에 이어붙이려면 전달)
     */
    const exportToGoogleDoc = useCallback(async (
        data,
        title,
        usePageBreak = true,
        targetDocId = null,
        groupBy = 'mission',
        authorizedAccessToken = null
    ) => {
        if (!tokenClient) {
            alert('Google API 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        try {
            const accessToken = authorizedAccessToken || await getAccessToken();

            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const fullTitle = `${title} (${dateStr})`;

            let documentId = targetDocId;
            let currentIndex = 1; // 새 문서일 경우 시작 인덱스

            // 1. 문서 결정 (새로 생성하거나 기존 문서 정보 가져오기)
            if (!documentId) {
                const createResponse = await requestGoogleDocs('/documents', accessToken, {
                    method: 'POST',
                    body: { title: fullTitle }
                });
                documentId = createResponse.documentId;
                console.log(`New Doc Created: ${documentId}`);
            } else {
                // 기존 문서의 마지막 인덱스 확인
                const doc = await requestGoogleDocs(`/documents/${encodeURIComponent(documentId)}`, accessToken);
                const contentRows = doc.body?.content || [];
                const lastContent = Reflect.get(contentRows, contentRows.length - 1);
                currentIndex = lastContent?.endIndex || 1;
                console.log(`Appending to Existing Doc: ${documentId} starting at ${currentIndex}`);
            }

            const requests = [];

            // 2. [주제/제목] 삽입 (새 문서일 경우만 최상단에 추가)
            if (!targetDocId) {
                const headerText = `${fullTitle}\n\n`;
                requests.push({
                    insertText: { location: { index: currentIndex }, text: headerText }
                });
                requests.push({
                    updateParagraphStyle: {
                        range: { startIndex: currentIndex, endIndex: currentIndex + headerText.length },
                        paragraphStyle: {
                            namedStyleType: 'TITLE',
                            alignment: 'CENTER'
                        },
                        fields: 'namedStyleType,alignment'
                    }
                });
                currentIndex += headerText.length;
            } else {
                const separator = "\n--- 새로운 데이터 추가 ---\n\n";
                requests.push({ insertText: { location: { index: currentIndex }, text: separator } });
                currentIndex += separator.length;
            }

            // 3. 데이터 순차 삽입
            let lastGroupValue = ""; // 미션제목 or 작성자

            data.forEach((item, index) => {
                const currentGroupValue = groupBy === 'student' ? item.작성자 : item.미션제목;

                // 그룹(섹션)이 바뀌면 헤더 삽입
                if (currentGroupValue !== lastGroupValue) {
                    // 첫 번째 항목이 아닐 때만 페이지 나누기 (옵션 활성화 시)
                    if (index > 0 && usePageBreak) {
                        requests.push({
                            insertPageBreak: { location: { index: currentIndex } }
                        });
                        currentIndex += 1;
                    }

                    const headerText = groupBy === 'student'
                        ? `[학생: ${item.작성자}]\n\n`
                        : `[미션 주제: ${item.미션제목}]\n\n`;

                    requests.push({
                        insertText: { location: { index: currentIndex }, text: headerText }
                    });
                    requests.push({
                        updateParagraphStyle: {
                            range: { startIndex: currentIndex, endIndex: currentIndex + headerText.length },
                            paragraphStyle: {
                                namedStyleType: 'HEADING_1',
                                alignment: 'CENTER'
                            },
                            fields: 'namedStyleType,alignment'
                        }
                    });
                    currentIndex += headerText.length;
                    lastGroupValue = currentGroupValue;
                }

                // (a) 소제목 (HEADING_2)
                // 학생별 모드일 때: 미션제목이 소제목
                // 미션별 모드일 때: 학생글제목이 소제목 (기존 방식)
                const subTitleText = groupBy === 'student'
                    ? `📄 ${item.미션제목} : ${item.학생글제목}\n`
                    : `${item.학생글제목}\n`;

                requests.push({
                    insertText: { location: { index: currentIndex }, text: subTitleText }
                });
                requests.push({
                    updateParagraphStyle: {
                        range: { startIndex: currentIndex, endIndex: currentIndex + subTitleText.length },
                        paragraphStyle: {
                            namedStyleType: 'HEADING_2'
                        },
                        fields: 'namedStyleType'
                    }
                });
                currentIndex += subTitleText.length;

                // (b) 학생 이름 (작성자: 이름)
                // 학생별 모드인 경우 이미 헤더가 학생 이름이므로 중복 표시 제외
                if (groupBy !== 'student') {
                    const nameLine = `작성자: ${item.작성자}\n\n`;
                    requests.push({
                        insertText: { location: { index: currentIndex }, text: nameLine }
                    });
                    requests.push({
                        updateParagraphStyle: {
                            range: { startIndex: currentIndex, endIndex: currentIndex + nameLine.length },
                            paragraphStyle: {
                                namedStyleType: 'NORMAL_TEXT',
                                alignment: 'START'
                            },
                            fields: 'namedStyleType,alignment'
                        }
                    });
                    requests.push({
                        updateTextStyle: {
                            range: { startIndex: currentIndex, endIndex: currentIndex + nameLine.length - 2 },
                            textStyle: { bold: true },
                            fields: 'bold'
                        }
                    });
                    currentIndex += nameLine.length;
                } else {
                    // 학생별 모드에서는 작성자 생략하고 간격만 살짝
                    const spacer = "\n";
                    requests.push({ insertText: { location: { index: currentIndex }, text: spacer } });
                    currentIndex += spacer.length;
                }

                // (c) 글 내용 (본문)
                const contentText = `${item.내용}\n`;
                requests.push({
                    insertText: { location: { index: currentIndex }, text: contentText }
                });
                requests.push({
                    updateParagraphStyle: {
                        range: { startIndex: currentIndex, endIndex: currentIndex + contentText.length },
                        paragraphStyle: {
                            namedStyleType: 'NORMAL_TEXT',
                            lineSpacing: 115 // 줄간격 1.15
                        },
                        fields: 'namedStyleType,lineSpacing'
                    }
                });
                currentIndex += contentText.length;

                // (d) 학생 간 페이지 나누기 (추가 미션 내에서의 구분)
                // 만약 다음 항목이 다른 그룹(미션/학생)이라면 여기서 나누지 않고 상단의 헤더 삽입부에서 나눔
                const nextItem = index < data.length - 1 ? data[index + 1] : null;
                const isNextDifferentGroup = nextItem && (groupBy === 'student' ? nextItem.작성자 !== item.작성자 : nextItem.미션제목 !== item.미션제목);

                if (usePageBreak && nextItem && !isNextDifferentGroup) {
                    requests.push({
                        insertPageBreak: { location: { index: currentIndex } }
                    });
                    currentIndex += 1;
                } else if (nextItem && !isNextDifferentGroup) {
                    // 데이터 간 줄바꿈
                    const spacer = "\n\n";
                    requests.push({ insertText: { location: { index: currentIndex }, text: spacer } });
                    currentIndex += spacer.length;
                }
            });

            // 4. 배치 업데이트 실행
            if (requests.length > 0) {
                await requestGoogleDocs(`/documents/${encodeURIComponent(documentId)}:batchUpdate`, accessToken, {
                    method: 'POST',
                    body: { requests }
                });
                console.log(`Inserted ${requests.length} operations successfully.`);
            }

            alert(`'${fullTitle}' 문서가 성공적으로 생성되었습니다! ✨\n구글 드라이브에서 확인해 보세요.`);
            window.open(`https://docs.google.com/document/d/${documentId}/edit`, '_blank');

        } catch (error) {
            console.error('Google Doc Export Failed:', error);
            alert('구글 문서 생성에 실패했습니다: ' + (error.message || 'Google 인증 또는 문서 API 오류'));
        }
    }, [getAccessToken, tokenClient]);

    const exportToExcel = useCallback(async (data, fileName) => {
        if (!data || data.length === 0) {
            alert('출력할 데이터가 없습니다.');
            return;
        }

        try {
            // [최적화] xlsx 라이브러리를 필요할 때만 불러옵니다 (Dynamic Import)
            const XLSX = await import('xlsx');

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
            XLSX.writeFile(workbook, `${fileName}.xlsx`);
        } catch (error) {
            console.error('Excel Export Failed:', error);
            alert('엑셀 파일 생성 중 오류가 발생했습니다.');
        }
    }, []);

    return {
        fetchExportData,
        exportToExcel,
        exportToGoogleDoc,
        authorizeGoogleExport: getAccessToken,
        // 기존 호출부 이름은 유지하되, 이제 GIS 토큰 클라이언트 준비 여부를 뜻한다.
        isGapiLoaded: Boolean(tokenClient)
    };
};
