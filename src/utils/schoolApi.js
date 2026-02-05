/**
 * 나이스 고등학교 검색 API 호출 (인증키 없이 호출 시에도 기본 데이터는 검색 가능할 수 있으나, 가급적 발급 권장)
 * @param {string} schoolName - 검색할 학교명
 * @returns {Promise<Array>} - 검색된 학교 목록
 */
export const searchSchools = async (schoolName) => {
    if (!schoolName || schoolName.trim().length < 2) return [];

    try {
        // NEIS Open API (인증키 없이도 호출 가능한 경우를 대비, KEY 파라미터 제외)
        // 만약 키가 필수라면 공공데이터포털 등에서 발급받아야 함
        const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=20&SCHUL_NM=${encodeURIComponent(schoolName)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.schoolInfo) {
            const list = data.schoolInfo[1].row;
            return list.map(item => ({
                name: item.SCHUL_NM,
                address: item.ORG_RDNMA,
                region: item.ATPT_OFCDC_SC_NM,
                code: item.SD_SCHUL_CODE
            }));
        }
        return [];
    } catch (error) {
        console.error('School search failed:', error);
        return [];
    }
};
