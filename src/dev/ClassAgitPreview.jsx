import { createClassAgitPersistenceFixture } from './fixtures/classAgitPersistenceFixture.js';
import { CLASS_AGIT_LIMITS } from '../modules/class-agit/policy.js';
import { useState } from 'react';
import ExhibitionWorkbench from '../modules/class-agit/teacher/ExhibitionWorkbench.jsx';
import { createPreviewDraft, previewClass, previewStudents } from './fixtures/classAgitFixtures.js';

const sourceApi = createClassAgitPersistenceFixture().api;

export default function ClassAgitPreview() {
    const [count, setCount] = useState(12);
    return <>
        <div className="class-agit-fixture-controls"><span>우리반 아지트 · C0 전시실 시안</span><label>초기 작품 수<select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            <option value={0}>0편 · 빈 전시</option><option value={1}>1편 · 첫 작품</option><option value={12}>12편 · 한 전시실</option><option value={60}>60편 · 다섯 전시실</option><option value={CLASS_AGIT_LIMITS.maxWorks}>{CLASS_AGIT_LIMITS.maxWorks}편 · {CLASS_AGIT_LIMITS.maxRooms}개 전시실</option>
        </select></label></div>
        <ExhibitionWorkbench key={count} activeClass={previewClass} sourceApi={sourceApi} students={previewStudents} initialDraft={createPreviewDraft(count)} />
    </>;
}
