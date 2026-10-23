import { useState } from 'react';
import TeacherPageTitle from '../../../components/teacher/TeacherPageTitle';
import CreateTab from './CreateTab.jsx';
import MySetsTab from './MySetsTab.jsx';
import OfficialSetsTab from './OfficialSetsTab.jsx';
import { quizArenaApi } from './quizArenaApi.js';
import { quizArenaManifest } from './manifest.js';

/** 시험 중인 게임 서버 주소(공개 주소·비밀 아님). 관리자 암호 입구는 그 서버의 `/host` 이다. */
export const QUIZ_ARENA_HOST_URL = 'https://arena.xn--9y2br3k43n.kr/host';

const TABS = [
    { id: 'official', label: '기본 세트' },
    { id: 'mine', label: '내 세트' },
    { id: 'create', label: '새로 만들기' }
];

const tabStyle = (active) => ({
    padding: 'var(--ui-space-2) var(--ui-space-4)', cursor: 'pointer', fontSize: 'var(--ui-text-md)', fontWeight: 800,
    border: 0, borderBottom: `3px solid ${active ? 'var(--ui-primary)' : 'transparent'}`, background: 'transparent', color: active ? 'var(--ui-primary)' : 'var(--ui-ink-muted)'
});

/**
 * 수호룡 퀴즈 아레나 — 관리자 시험 화면(개발 중).
 * 기본 세트(관리자가 만든 고정 세트 70개) · 내 세트(저장·공유·삭제) · 새로 만들기(자료에서 즉석으로 뽑아 저장).
 * 데이터는 탭을 열 때만 읽는다. 이어서 붙일 것: 공유방(올린 세트 둘러보기·가져오기), 문제 직접 입력·편집, 아지트 로그인으로 방 바로 열기.
 * `api` 로 데이터 길을 갈아 끼울 수 있다(개발실은 흉내 객체).
 */
export default function QuizArenaTeacherEntry({ api = quizArenaApi }) {
    const [tab, setTab] = useState('official');
    const [reloadKey, setReloadKey] = useState(0);

    return (
        <section style={{ display: 'grid', gap: 'var(--ui-space-4)' }}>
            <TeacherPageTitle title={quizArenaManifest.name} guideTabId="quiz-arena" />
            <p style={{ margin: 0, color: 'var(--ui-ink-muted)' }}>
                <strong>개발 중</strong> · 관리자 계정에만 보이고 학생·다른 선생님에게는 보이지 않아요.
            </p>

            <div role="tablist" aria-label="퀴즈 아레나 메뉴" style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--ui-border)' }}>
                {TABS.map((item) => (
                    <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} style={tabStyle(tab === item.id)}>{item.label}</button>
                ))}
            </div>

            <div role="tabpanel" style={{ display: 'grid', gap: 'var(--ui-space-3)', padding: 'var(--ui-space-4)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-lg)', background: 'var(--ui-surface)' }}>
                {tab === 'official' && <OfficialSetsTab api={api} onImported={() => setReloadKey((value) => value + 1)} />}
                {tab === 'mine' && <MySetsTab api={api} reloadKey={reloadKey} />}
                {tab === 'create' && <CreateTab api={api} onSaved={() => setReloadKey((value) => value + 1)} />}
            </div>

            <div style={{ display: 'grid', gap: 'var(--ui-space-2)', padding: 'var(--ui-space-4)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-lg)', background: 'var(--ui-surface)' }}>
                <strong>결투장 열기(시험)</strong>
                <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                    지금은 별도 서버의 선생님 입구에서 관리자 암호로 방을 엽니다. 세트를 골라 바로 방을 여는 기능은 이어서 붙일 예정입니다.
                </span>
                <a href={QUIZ_ARENA_HOST_URL} target="_blank" rel="noopener noreferrer">선생님 입구 열기 ↗</a>
            </div>
        </section>
    );
}
