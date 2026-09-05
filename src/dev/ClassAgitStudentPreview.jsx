import { CLASS_AGIT_LIMITS } from '../modules/class-agit/policy.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardMenu from '../components/student/DashboardMenu.jsx';
import { createStudentHistoryState, getStudentBackDestination, getStudentRouteKey, readStudentHistoryParent, readStudentHistoryState } from '../components/student/studentNavigation.js';
import ClassAgitStudentEntry from '../modules/class-agit/student/StudentEntry.jsx';
import { classAgitManifest } from '../modules/class-agit/manifest.js';
import { createClassAgitStudentFixture } from './fixtures/classAgitStudentFixture.js';
import { previewClass } from './fixtures/classAgitFixtures.js';

function StudentScenario({ count }) {
    const [route, setRoute] = useState({ name: 'main', params: {} });
    const [counts, setCounts] = useState({ list: 0, room: 0, work: 0 });
    const [fixture] = useState(() => createClassAgitStudentFixture(count, setCounts));
    const [message, setMessage] = useState('샘플 학생 화면입니다. 실제 계정이나 DB를 사용하지 않습니다.');
    const [homeAvailable, setHomeAvailable] = useState(count > 0);
    const previewId = useRef(crypto.randomUUID());
    const replace = useCallback((next, preserveParent = true) => {
        window.history.replaceState({ ...createStudentHistoryState(next.name, next.params, preserveParent ? readStudentHistoryParent(window.history.state) : null), classAgitPreviewId: previewId.current }, '');
        setRoute(next);
    }, []);
    useEffect(() => {
        const initial = createStudentHistoryState('main');
        window.history.replaceState({ ...initial, classAgitPreviewId: previewId.current }, '');
        const onPop = (event) => {
            if (event.state?.classAgitPreviewId !== previewId.current) replace({ name: 'main', params: {} }, false);
            else setRoute(readStudentHistoryState(event.state));
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [replace]);
    const navigate = (name, params = {}) => {
        if (!['main', 'class_agit'].includes(name)) { setMessage('이 샘플에서는 우리반 아지트 경로를 점검합니다.'); return; }
        const next = { name, params };
        if (getStudentRouteKey(next) === getStudentRouteKey(route)) return;
        window.history.pushState({ ...createStudentHistoryState(name, params, route), classAgitPreviewId: previewId.current }, '');
        setRoute(next);
    };
    const back = () => {
        const target = getStudentBackDestination(route);
        const parent = readStudentHistoryParent(window.history.state);
        if (parent && getStudentRouteKey(parent) === getStudentRouteKey(target)) window.history.back();
        else replace(target, false);
    };
    return <div>
        <div className="class-agit-live-toolbar" style={{ padding: 14 }} aria-label="학생 전시 개발 점검">
            <strong>학생 감상 샘플 · {count}편</strong>
            <button type="button" onClick={() => { fixture.controls.withdrawFirst(); setMessage('첫 작품의 수록을 철회했습니다. 작품을 열거나 전시를 다시 확인해 보세요.'); }}>첫 작품 철회</button>
            <button type="button" onClick={() => { fixture.controls.republish(); setMessage('새 판을 발행했습니다. 이전 판의 액자를 누르면 재확인 안내가 나옵니다.'); }}>새 판 발행</button>
            <button type="button" onClick={() => { fixture.controls.close(); setMessage('전시를 중단했습니다. 다음 조회부터 열람할 수 없습니다.'); }}>전시 중단</button>
            <button type="button" onClick={() => { setHomeAvailable(false); replace({ name: 'main', params: {} }, false); }}>홈 공개 신호 끄기</button>
            <button type="button" onClick={() => { fixture.controls.delayNext(); setMessage('다음 전문 응답이 10초 늦게 도착합니다. 로딩 중 닫기를 확인하세요.'); }}>다음 전문 10초 지연</button>
            <button type="button" onClick={() => { fixture.controls.failNext(); setMessage('다음 전문 조회 한 번이 실패합니다.'); }}>다음 전문 조회 실패</button>
            <output aria-label="샘플 조회 횟수">전시 목록 {counts.list}회 · 방 {counts.room}회 · 전문 {counts.work}회</output>
            <span role="status">{message}</span>
        </div>
        {route.name === 'main' ? <div className="class-agit">
            <h1>햇살반 학생 홈</h1><p>홈에서는 전시를 조회하지 않습니다. 선생님이 공개한 전시가 있을 때만 카드가 보입니다.</p>
            <DashboardMenu studentSession={{ id: 'sample-student', classId: previewClass.id }} enabledModules={[classAgitManifest]}
                homeBootstrap={{ home: { class_agit_available: homeAvailable }, reading_daily: {}, diary_daily: {} }}
                onNavigate={navigate} onOpenMyAgit={() => setMessage('우리반 아지트 카드를 눌러 주세요.')} onOpenPlayground={() => setMessage('우리반 아지트 카드를 눌러 주세요.')} />
            {!count && <button type="button" className="class-agit-secondary" onClick={() => navigate('class_agit')}>빈 전시 목록 점검</button>}
        </div> : <ClassAgitStudentEntry params={route.params} onNavigate={navigate} onReplace={replace} onBack={back} api={fixture.api} releaseApi={fixture.api} />}
    </div>;
}

export default function ClassAgitStudentPreview() {
    const [count, setCount] = useState(12);
    return <>
        <div className="class-agit-fixture-controls"><label>학생 전시 작품 수<select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            <option value={0}>0편 · 공개 전시 없음</option><option value={1}>1편 · 첫 작품</option><option value={12}>12편 · 한 전시실</option><option value={60}>60편 · 다섯 전시실</option><option value={CLASS_AGIT_LIMITS.maxWorks}>{CLASS_AGIT_LIMITS.maxWorks}편 · {CLASS_AGIT_LIMITS.maxRooms}개 전시실</option>
        </select></label></div>
        <StudentScenario key={count} count={count} />
    </>;
}
