/*
 * 확인해 보고 "우리에게는 해당 없음"으로 정리한 취약점.
 *
 * 왜 필요한가:
 *   검사기는 **라이브러리가 이미지에 들어 있는지**만 본다. 그 코드가 실제로 실행되는지는 못 본다.
 *   그래서 SSH 인증 우회 취약점이, SSH 서버를 켜지도 않는 컨테이너에 CRITICAL 로 잡힌다.
 *   한 번 확인하고 넘어가도 **다음 달에 똑같은 것이 다시 올라온다.** 그때 또 처음부터 캐야 한다.
 *   여기에 판단과 근거를 적어 두면 검사기가 그 건을 세지 않고, 화면은 `해당 없음`으로 보여 준다.
 *
 * 규칙:
 *   1. **근거는 확인한 사실만 적는다.** "아마 안 쓸 것"은 여기 적지 않고 그냥 세게 둔다.
 *   2. **유효기간(`expiresAt`)을 반드시 둔다.** 구성은 바뀐다 — 오늘 SSH 를 안 쓴다고 반년 뒤에도
 *      안 쓴다는 보장은 없다. 기한이 지나면 검사기가 다시 세기 시작하고, 그때 다시 확인한다.
 *      분기 점검 주기(3개월)에 맞춘다.
 *   3. 여기에는 **서비스 구성·포트·노출 정보를 적지 않는다.** 이 파일은 브라우저 번들에 들어간다.
 *
 * 이 파일 하나를 `scripts/scan-service-images.mjs`(집계)와 관리자 화면(표시)이 함께 읽는다.
 */

export const SERVICE_FINDING_NOTES = Object.freeze([
    Object.freeze({
        id: 'CVE-2026-56854',
        title: 'x/crypto SSH 인증 우회',
        reason: '취약한 코드는 SSH 서버 구현부다. 우리 서비스 중 SSH 를 받는 것이 하나도 없어(공개 포트 점검 결과 22번 0개) 실행되는 경로가 없다.',
        checkedAt: '2026-09-02',
        expiresAt: '2026-12-02'
    }),
    Object.freeze({
        id: 'CVE-2026-33186',
        title: 'gRPC 권한 검사 우회',
        reason: '취약한 코드는 gRPC 권한 모듈이다. gRPC 로 요청을 받는 서비스가 없어 실행되는 경로가 없다.',
        checkedAt: '2026-09-02',
        expiresAt: '2026-12-02'
    }),
    Object.freeze({
        id: 'CVE-2026-33845',
        title: 'GnuTLS DTLS 서비스 거부',
        reason: '요청을 처리하는 실행 파일이 이 라이브러리를 링크하지 않는 것을 확인했다. 이미지 안에서 이 라이브러리를 쓰는 것은 패키지 관리·내려받기 도구뿐이고, DTLS 로 요청을 받는 서비스도 없다.',
        checkedAt: '2026-09-02',
        expiresAt: '2026-12-02'
    }),
    Object.freeze({
        id: 'CVE-2026-42010',
        title: 'GnuTLS 인증 우회',
        reason: '위와 같은 라이브러리다. 요청을 처리하는 실행 파일이 링크하지 않는 것을 확인했고, 인증은 이 라이브러리를 거치지 않는다.',
        checkedAt: '2026-09-02',
        expiresAt: '2026-12-02'
    }),
    Object.freeze({
        id: 'CVE-2026-59873',
        title: 'node-tar 압축폭탄 서비스 거부',
        reason: '우리 이미지에서는 패키지 관리자를 지워 사라졌고, 상류 이미지에 남은 것도 실행 명령이 node 직접 실행이라 패키지 관리자가 호출되지 않는다. 남이 건넨 압축 파일을 푸는 통로가 없다.',
        checkedAt: '2026-09-02',
        expiresAt: '2026-12-02'
    }),
    Object.freeze({
        id: 'CVE-2025-68121',
        title: 'Go TLS 세션 재개 시 인증서 검증 오류',
        reason: '해당 서비스는 로컬 파일에서 원본을 읽고 내부 평문 경로로만 호출된다. 바깥으로 TLS 연결을 맺지 않아 세션 재개 경로 자체가 없다.',
        checkedAt: '2026-09-02',
        expiresAt: '2026-12-02'
    })
]);

/** 오늘 기준으로 아직 유효한 판단만 고른다. 기한이 지난 것은 다시 세어야 한다. */
export const getActiveFindingNotes = (today = new Date()) => SERVICE_FINDING_NOTES
    .filter((note) => new Date(`${note.expiresAt}T23:59:59+09:00`) >= today);

/** 기한이 지나 다시 확인해야 하는 판단. 화면이 이것을 눈에 띄게 보여 준다. */
export const getExpiredFindingNotes = (today = new Date()) => SERVICE_FINDING_NOTES
    .filter((note) => new Date(`${note.expiresAt}T23:59:59+09:00`) < today);
