/**
 * 모듈 매니페스트 규격 (Stage 3a — 모듈 시스템 기반)
 *
 * 기능 하나 = 폴더 하나. 각 모듈 폴더에 manifest.js를 두고 아래 형태로 내보낸다.
 * 코어 셸(로그인·학급/학생·포인트·글쓰기 파이프라인)은 이 시스템의 대상이 아니다.
 *
 * @typedef {Object} ModuleManifest
 * @property {string}   id        고유 키. DB `classes.enabled_modules`에 저장되는 값 (예: 'dragon')
 * @property {string}   name      화면에 표시할 이름 (예: '드래곤 파트너')
 * @property {string}   [description] 한 줄 설명 (메뉴 카드 부제)
 * @property {string}   [icon]    이모지/아이콘
 * @property {'game'|'community'|'tool'|'writing'} part  파트 분류 (메뉴 그룹)
 * @property {'student'|'teacher'|'both'} audience  누구에게 보이는가
 * @property {() => Promise<any>} [studentEntry]  학생 진입 컴포넌트 (React.lazy용 동적 import)
 * @property {() => Promise<any>} [myAgitEntry]  나의 아지트 확장 카드 (React.lazy용 동적 import)
 * @property {() => Promise<any>} [teacherEntry]  교사 설정/관리 컴포넌트
 * @property {() => Promise<any>} [settingsEntry] 교사 통합 설정의 모듈별 관리 컴포넌트
 * @property {Record<string, Array<Object>>} [dashboardCards]
 *   교사 대시보드 확장 카드. 키는 대시보드 id이며 공통 카드 호스트가 기본·전체화면·모달 노출을 담당한다.
 * @property {{name?: string, description?: string, background?: string, borderColor?: string, order?: number, entryMode?: 'standard'|'legacy'}} [playground]
 *   학생 놀이터 카드와 진입 방식. standard 모듈은 studentEntry가 공통 호스트 props를 받는다.
 * @property {{order?: number}} [myAgit] 나의 아지트에서 확장 카드를 표시할 순서
 * @property {{title?: string, subtitle?: string, order?: number, activeColor?: string, headerBackground?: string, borderColor?: string, titleColor?: string, subtitleColor?: string, legacy?: boolean}} [management]
 *   교사 아지트 놀이터 관리 카드 표시 정보. teacherEntry가 있으면 공통 관리 셸에서 지연 로딩한다.
 * @property {{order?: number, launchMode?: 'embedded'|'external', href?: string}} [tool]
 *   교사 수업 도구 런처 정보. part가 tool이면 teacherEntry를 선택할 때만 지연 로딩한다.
 * @property {{order?: number, label?: string, description?: string}} [settings]
 *   교사 통합 설정 메뉴 정보. settingsEntry가 있을 때 해당 화면을 선택한 뒤에만 지연 로딩한다.
 *   메뉴 슬롯 크기는 공통 설정 호스트가 데스크톱 270px·항목 좌우 15px·최소 높이 68px로 보장하므로
 *   모듈은 별도 메뉴 폭을 만들지 않고 짧은 label/description만 제공한다.
 * @property {string}   [studentRoute] 학생 화면 내부 라우트 이름
 * @property {string[]} [writingMissionTypes] 이 모듈이 처리하는 글쓰기 입력 미션 유형
 * @property {boolean}  [defaultEnabled]  학급 설정이 없을 때 기본 노출 여부 (기본 false)
 * @property {boolean}  [available] false면 코드·데이터는 보존하되 교사·학생 UI에서 숨김
 * @property {boolean}  [core]    true면 항상 켜짐(끌 수 없음). 코어 인접 기능용
 * @property {boolean}  [toggleable] false면 학급 ON/OFF 대신 자체 조건(예: 미션 생성)으로 활성화
 * @property {string[]} [legacyFields] 기존 노출 상태를 초기값으로 읽을 classes 컬럼
 * @property {(settings: Object) => boolean|undefined} [resolveLegacyEnabled] 기존 설정에서 초기 ON/OFF를 계산
 * @property {{home: 'summary'|'none', load: 'on-open', writes: 'rpc'|'none'|'legacy-bounded', realtime: 'none'|'core-only', maxInitialRows: number}} performance
 *   신규 콘텐츠 성능 계약. 홈 데이터 크기·지연 로딩·쓰기 방식·실시간 연결·첫 목록 상한을 명시한다.
 */

/** 파트 표시 이름 (메뉴 그룹 헤더) */
const PART_LABELS = {
  game: '게임·동기부여',
  community: '학급 커뮤니티',
  tool: '수업 도구',
  writing: '글쓰기 확장',
};

/** 매니페스트 최소 유효성 검사 — 등록 시 실수를 빨리 잡기 위한 용도 */
export function validateManifest(m) {
  const problems = [];
  if (!m || typeof m !== 'object') return ['매니페스트가 객체가 아님'];
  if (!m.id) problems.push('id 없음');
  if (!m.name) problems.push('name 없음');
  if (!PART_LABELS[m.part]) problems.push(`part가 유효하지 않음: ${m.part}`);
  if (!['student', 'teacher', 'both'].includes(m.audience)) problems.push(`audience 유효하지 않음: ${m.audience}`);
  if (!m.studentEntry && !m.teacherEntry && !m.settingsEntry) problems.push('studentEntry/teacherEntry/settingsEntry 모두 없음');
  if (!m.performance || typeof m.performance !== 'object') {
    problems.push('performance 계약 없음');
  } else {
    if (!['summary', 'none'].includes(m.performance.home)) problems.push('performance.home 유효하지 않음');
    if (m.performance.load !== 'on-open') problems.push('performance.load는 on-open이어야 함');
    if (!['rpc', 'none', 'legacy-bounded'].includes(m.performance.writes)) problems.push('performance.writes 유효하지 않음');
    if (!['none', 'core-only'].includes(m.performance.realtime)) problems.push('performance.realtime 유효하지 않음');
    if (!Number.isInteger(m.performance.maxInitialRows) || m.performance.maxInitialRows < 0 || m.performance.maxInitialRows > 100) {
      problems.push('performance.maxInitialRows는 0~100 정수여야 함');
    }
  }
  if (m.myAgit && typeof m.myAgitEntry !== 'function') problems.push('myAgit 설정은 있지만 myAgitEntry가 없음');
  if (m.settings && typeof m.settingsEntry !== 'function') problems.push('settings 설정은 있지만 settingsEntry가 없음');
  if (m.dashboardCards && (typeof m.dashboardCards !== 'object' || Array.isArray(m.dashboardCards))) {
    problems.push('dashboardCards가 객체가 아님');
  } else if (m.dashboardCards) {
    Object.entries(m.dashboardCards).forEach(([dashboardId, cards]) => {
      if (!Array.isArray(cards)) problems.push(`dashboardCards.${dashboardId}가 배열이 아님`);
    });
  }
  if (m.management?.legacy !== true && m.teacherEntry && m.audience === 'student') {
    problems.push('teacherEntry가 있지만 audience가 student임');
  }
  return problems;
}
