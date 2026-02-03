import { useCallback, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
// import * as XLSX from 'xlsx'; // 동적 임포트로 변경하여 초기 로딩 속도 최적화
import { gapi } from 'gapi-script';

/**
 * 엑셀 데이터 추출 및 구글 문서 내보내기를 위한 커스텀 훅
 */
export const useDataExport = () => {

    // Google API 상태
    const [isGapiLoaded, setIsGapiLoaded] = useState(false);
    const [tokenClient, setTokenClient] = useState(null);

    useEffect(() => {
        // 1. GAPI 클라이언트 초기화 (API 호출용)
        function startGapi() {
            gapi.client.init({
                apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
                // clientId는 여기서 빼고 GIS에서 사용함
            }).then(() => {
                return gapi.client.load('docs', 'v1');
            }).then(() => {
                console.log('Google Docs API Client Loaded');
                setIsGapiLoaded(true);
            }).catch(err => {
                console.error('GAPI Init Error:', err);
            });
        }

        // 2. GIS (Google Identity Services) 초기화 (인증용)
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
                    callback: (response) => {
                        // Default callback - will be overridden in getAccessToken
                        console.log('GIS Token Response:', response);
                    },
                });
                setTokenClient(client);
                console.log('Google Auth Client Ready');
            } catch (err) {
                console.error('GIS Init Error:', err);
            }
        }

        // 두 라이브러리 모두 로드
        gapi.load('client', startGapi);

        // window.google 이 로드될 때까지 약간 대기 혹은 체크
        const checkGis = setInterval(() => {
            if (window.google?.accounts?.oauth2) {
                startGis();
                clearInterval(checkGis);
            }
        }, 100);

        return () => clearInterval(checkGis);
    }, []);

    /**
     * 구글 액세스 토큰 획득 (최신 방식)
     */
    const getAccessToken = () => {
        return new Promise((resolve, reject) => {
            if (!tokenClient) return reject('인증 클라이언트가 준비되지 않았습니다.');

            tokenClient.callback = (response) => {
                if (response.error !== undefined) {
                    reject(response);
                }
                resolve(response);
            };

            // 이미 토큰이 있을 경우 체크 (선택사항)
            tokenClient.requestAccessToken({ prompt: 'select_account' });
        });
    };

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
    const exportToGoogleDoc = useCallback(async (data, title, usePageBreak = true, targetDocId = null, groupBy = 'mission') => {
        if (!isGapiLoaded || !tokenClient) {
            alert('Google API 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        try {
            await getAccessToken();

            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const fullTitle = `${title} (${dateStr})`;

            let documentId = targetDocId;
            let currentIndex = 1; // 새 문서일 경우 시작 인덱스

            // 1. 문서 결정 (새로 생성하거나 기존 문서 정보 가져오기)
            if (!documentId) {
                const createResponse = await gapi.client.docs.documents.create({ title: fullTitle });
                documentId = createResponse.result.documentId;
                console.log(`New Doc Created: ${documentId}`);
            } else {
                // 기존 문서의 마지막 인덱스 확인
                const doc = await gapi.client.docs.documents.get({ documentId });
                currentIndex = doc.result.body.content[doc.result.body.content.length - 1].endIndex;
                console.log(`Appending to Existing Doc: ${documentId} starting at ${currentIndex}`);
            }

            const requests = [];

            // 2. [주제/제목] 삽입 및 안내 문구 추가
            if (!targetDocId) {
                // (a) 본문 최상단 제목
                const headerText = `${fullTitle}\n`;
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

                // (b) 목차 생성 방법 안내 (구글 API 제한으로 인해 자동 삽입이 불가능하므로 가이드 제공)
                const guideText = "\n[ ✍️ 목차를 만드는 방법 ]\n본 문서는 자동 목차 생성을 위한 헤더 스타일이 모두 적용되어 있습니다.\n상단 메뉴에서 [삽입] -> [목차]를 선택하시면 즉시 목차가 완성됩니다! ✨\n\n";
                requests.push({
                    insertText: { location: { index: currentIndex }, text: guideText }
                });
                requests.push({
                    updateTextStyle: {
                        range: { startIndex: currentIndex, endIndex: currentIndex + guideText.length },
                        textStyle: {
                            italic: true,
                            foregroundColor: { color: { rgbColor: { red: 0.2, green: 0.5, blue: 0.8 } } }
                        },
                        fields: 'italic,foregroundColor'
                    }
                });
                currentIndex += guideText.length;

                // (c) 페이지 나누기 (안내 문구 다음 본문)
                requests.push({
                    insertPageBreak: { location: { index: currentIndex } }
                });
                currentIndex += 1;

            } else {
                const separator = "\n--- 새로운 데이터 추가 ---\n\n";
                requests.push({ insertText: { location: { index: currentIndex }, text: separator } });
                currentIndex += separator.length;
            }

            // 3. 데이터 순차 삽입
            let lastGroupValue = ""; // 미션제목 or 작성자

            data.forEach((item, index) => {
                const currentGroupValue = groupBy === 'student' ? item.작성자 : item.미션제목;

                // 그룹(섹션)이 바뀌면 헤더 삽입 (이 헤더들이 목차에 표시됨)
                if (currentGroupValue !== lastGroupValue) {
                    // 첫 번째 항목이 아닐 때만 페이지 나누기 (옵션 활성화 시)
                    if (index > 0 && usePageBreak) {
                        requests.push({
                            insertPageBreak: { location: { index: currentIndex } }
                        });
                        currentIndex += 1;
                    }

                    const headerText = groupBy === 'student'
                        ? `${item.작성자}\n`
                        : `${item.미션제목}\n`;

                    requests.push({
                        insertText: { location: { index: currentIndex }, text: headerText }
                    });
                    requests.push({
                        updateParagraphStyle: {
                            range: { startIndex: currentIndex, endIndex: currentIndex + headerText.length },
                            paragraphStyle: {
                                namedStyleType: 'HEADING_1',
                                alignment: 'START'
                            },
                            fields: 'namedStyleType,alignment'
                        }
                    });
                    currentIndex += headerText.length;
                    lastGroupValue = currentGroupValue;
                }

                // (a) 소제목 (HEADING_2) - 개별 글 제목도 목차에 표시되도록 설정
                const subTitleText = groupBy === 'student'
                    ? `📄 ${item.미션제목} : ${item.학생글제목}\n`
                    : `👤 ${item.작성자} : ${item.학생글제목}\n`;

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

                // (b) 작성자 정보 (기호에 따라 본문에 추가 노출)
                // 작성자 이름이 이미 HEADING_2에 포함되어 있으므로 추가 텍스트 보다는 본문으로 바로 진입 가능

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
                await gapi.client.docs.documents.batchUpdate({
                    documentId: documentId,
                    requests: requests
                });
                console.log(`Inserted ${requests.length} operations successfully.`);
            }

            alert(`'${fullTitle}' 문서가 목차를 포함하여 성공적으로 생성되었습니다! ✨\n구글 드라이브에서 확인해 보세요.`);
            window.open(`https://docs.google.com/document/d/${documentId}/edit`, '_blank');

        } catch (error) {
            console.error('Google Doc Export Failed:', error);
            alert('구글 문서 생성에 실패했습니다: ' + (error.result?.error?.message || error.message));
        }
    }, [isGapiLoaded]);

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

    return { fetchExportData, exportToExcel, exportToGoogleDoc, isGapiLoaded };
};
