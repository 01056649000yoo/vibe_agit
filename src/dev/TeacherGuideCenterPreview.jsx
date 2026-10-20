import { useState } from 'react';
import TeacherGuideCenter from '../components/teacher/TeacherGuideCenter';
import { TEACHER_GUIDE_JOURNEYS } from '../guides/teacherGuideJourneys';
import '../components/teacher/TeacherDashboard.css';

/** 교사 활용 안내서(큰 흐름 → 단계 → 상세 도움말)를 실제 컴포넌트로 본다. 이동·동행 모드는 부르지 않는다. */
export default function TeacherGuideCenterPreview() {
    const [journeyId, setJourneyId] = useState(TEACHER_GUIDE_JOURNEYS[0].id);
    const [open, setOpen] = useState(true);
    return (
        <div style={{ padding: 16 }}>
            <label>
                흐름{' '}
                <select value={journeyId} onChange={(event) => { setJourneyId(event.target.value); setOpen(true); }}>
                    {TEACHER_GUIDE_JOURNEYS.map((journey) => <option key={journey.id} value={journey.id}>{journey.title}</option>)}
                </select>
            </label>
            {!open && <button type="button" onClick={() => setOpen(true)}>안내서 열기</button>}
            {open && (
                <TeacherGuideCenter
                    key={journeyId}
                    isOpen
                    initialRequest={{ journeyId }}
                    onClose={() => setOpen(false)}
                    onNavigate={() => {}}
                />
            )}
        </div>
    );
}
