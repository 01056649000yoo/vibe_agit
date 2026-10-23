import TeacherPageTitle from '../../../components/teacher/TeacherPageTitle';
import OfficialSetsTab from './OfficialSetsTab.jsx';
import { quizArenaApi } from './quizArenaApi.js';
import { quizArenaManifest } from './manifest.js';

/** 시험 중인 게임 서버 주소(공개 주소·비밀 아님). 관리자 암호 입구는 그 서버의 `/host` 이다. */
export const QUIZ_ARENA_HOST_URL = 'https://arena.xn--9y2br3k43n.kr/host';

/**
 * 수호룡 퀴즈 아레나 — 관리자 시험 화면(개발 중).
 * 지금은 기본 세트 작업대 하나: 학년을 고르고 세트의 모든 문제를 한 화면에서 점검한 뒤 `아레나 열기`로 게임 서버 입구에 세트를 실어 보낸다.
 * `내 세트`·`새로 만들기` 화면 파일은 있으나 선생님 결정(10-24)으로 아직 메뉴에 붙이지 않는다.
 * 이어서 붙일 것: 공유방, 문제 직접 입력·편집, 아지트 로그인으로 방 바로 열기(입장권).
 * `api` 로 데이터 길을 갈아 끼울 수 있다(개발실은 흉내 객체).
 */
export default function QuizArenaTeacherEntry({ api = quizArenaApi }) {
    return (
        <section style={{ display: 'grid', gap: 'var(--ui-space-4)' }}>
            <TeacherPageTitle title={quizArenaManifest.name} guideTabId="quiz-arena" />
            <p style={{ margin: 0, color: 'var(--ui-ink-muted)' }}>
                <strong>개발 중</strong> · 관리자 계정에만 보이고 학생·다른 선생님에게는 보이지 않아요. 학년을 고르고 문제를 점검한 뒤 `아레나 열기`를 누르면 선생님 입구가 열려요(관리자 암호 입력).
            </p>
            <div style={{ display: 'grid', gap: 'var(--ui-space-3)', padding: 'var(--ui-space-4)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-lg)', background: 'var(--ui-surface)' }}>
                <OfficialSetsTab api={api} hostUrl={QUIZ_ARENA_HOST_URL} />
            </div>
        </section>
    );
}
