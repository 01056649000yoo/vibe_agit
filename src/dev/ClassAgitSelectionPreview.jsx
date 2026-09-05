import { useEffect, useState } from 'react';
import ClassAgitTeacherEntry from '../modules/class-agit/teacher/TeacherEntry.jsx';
import { createClassAgitSelectionFixture } from './fixtures/classAgitSelectionFixture.js';
import { previewClass } from './fixtures/classAgitFixtures.js';
export default function ClassAgitSelectionPreview() {
    const [count, setCount] = useState(0);
    const [fixture, setFixture] = useState(null);
    useEffect(() => { let active = true; createClassAgitSelectionFixture(count).then((value) => { if (active) setFixture(value); }); return () => { active = false; }; }, [count]);
    return <><div className="class-agit-fixture-controls"><strong>66개 미션 · 합성 글 1,040편 · 실제 DB 저장 없음</strong><label>초기 작품<select value={count} onChange={(event) => { setFixture(null); setCount(Number(event.target.value)); }}><option value="0">0편</option><option value="30">30편</option><option value="120">120편</option></select></label></div>
        {fixture ? <ClassAgitTeacherEntry key={count} activeClass={previewClass} api={fixture.api} isSample /> : <p>샘플 준비 중…</p>}</>;
}
