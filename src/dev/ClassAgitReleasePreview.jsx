import { useEffect, useState } from 'react';
import ClassAgitTeacherEntry from '../modules/class-agit/teacher/TeacherEntry.jsx';
import StudentBooks from '../modules/class-agit/anthology/StudentBooks.jsx';
import PublicGallery from '../modules/class-agit/public/PublicGallery.jsx';
import { getClassAgitBackDestination } from '../modules/class-agit/student/navigation.js';
import { createClassAgitReleaseFixture } from './fixtures/classAgitReleaseFixture.js';
import { previewClass } from './fixtures/classAgitFixtures.js';
export default function ClassAgitReleasePreview() {
    const [fixture, setFixture] = useState(null); const [area, setArea] = useState('teacher'); const [version, setVersion] = useState(0);
    const [route, setRoute] = useState({ mode: 'books' }); const [token, setToken] = useState(''); const [message, setMessage] = useState('');
    useEffect(() => { let active = true; createClassAgitReleaseFixture().then((value) => { if (active) setFixture(value); }); return () => { active = false; }; }, []);
    if (!fixture) return <p role="status">통합 샘플을 준비합니다…</p>;
    return <div><div className="class-agit-live-toolbar" style={{ padding: 16 }} aria-label="문집과 외부 공유 개발 점검"><strong>전체 흐름 샘플 · 실제 DB 저장 없음</strong>
        <button type="button" onClick={() => setArea('teacher')}>교사 관리</button><button type="button" onClick={() => { setArea('student'); setRoute({ mode: 'books' }); }}>학생 문집 서가</button>
        <button type="button" onClick={() => { setToken(fixture.controls.token() || ''); setArea('public'); }}>현재 공유 방문자</button>
        <button type="button" onClick={async () => { await fixture.controls.sampleExhibition120(); setArea('teacher'); setVersion((v) => v + 1); setMessage('120편 전시를 만들었습니다. 전시 목록에서 열어 보세요.'); }}>120편 전시 준비</button>
        <button type="button" onClick={async () => { await fixture.controls.sampleBook100(); setVersion((v) => v + 1); setMessage('100편 확정판을 만들었습니다. 문집 목록에서 인쇄를 확인하세요.'); }}>100편 문집 준비</button>
        <button type="button" onClick={() => { fixture.controls.changeSource(); setMessage('첫 원글을 수정했습니다. 확정판은 그대로 보관됩니다.'); }}>첫 원글 수정</button>
        <button type="button" onClick={() => { fixture.controls.recallSource(); setMessage('첫 원글을 회수했습니다. 다음 조회와 출력에서 확인하세요.'); }}>첫 원글 회수</button>
        <button type="button" onClick={() => { fixture.controls.expireIn(10); setToken(fixture.controls.token() || ''); setArea('public'); }}>10초 뒤 공유 만료</button>
        <button type="button" onClick={() => { fixture.controls.expire(); setMessage('공유 주소가 만료되었습니다. 다음 조회에서 확인하세요.'); }}>공유 만료</button><span role="status">{message}</span></div>
        {area === 'teacher' && <ClassAgitTeacherEntry key={version} activeClass={previewClass} api={fixture.sourceApi} releaseApi={fixture.api} isSample isAdmin onOpenPublic={(value) => { setToken(value); setArea('public'); }} />}
        {area === 'student' && <StudentBooks route={route} api={fixture.api} onNavigate={(_name, params) => setRoute(params)} onReplace={(next) => setRoute(next.params)} onBack={() => { const next = getClassAgitBackDestination(route); if (!next.params.mode) setArea('teacher'); else setRoute(next.params); }} />}
        {area === 'public' && <PublicGallery key={token} api={fixture.publicApi} token={token} isPreview onExit={() => setArea('teacher')} />}
    </div>;
}
