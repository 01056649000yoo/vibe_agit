import { useState } from 'react';
import ClassAgitTeacherEntry from '../modules/class-agit/teacher/TeacherEntry.jsx';
import { createClassAgitPersistenceFixture } from './fixtures/classAgitPersistenceFixture.js';
import { previewClass } from './fixtures/classAgitFixtures.js';

export default function ClassAgitPersistencePreview() {
    const [fixture] = useState(createClassAgitPersistenceFixture);
    const [message, setMessage] = useState('');
    return <div>
        <div className="class-agit-live-toolbar" style={{ padding: 12 }} aria-label="개발 전용 상황 점검">
            <strong>샘플 상황 만들기</strong>
            <button type="button" onClick={() => { fixture.controls.conflict(); setMessage('다른 화면의 저장을 재현했습니다. 편집 후 초안 저장을 눌러 충돌 안내를 확인하세요.'); }}>저장 충돌 만들기</button>
            <button type="button" onClick={() => { fixture.controls.changeSource(); setMessage('첫 번째 원글을 수정했습니다. 최신 초안을 불러와 전문을 재확인하세요.'); }}>첫 원글 수정</button>
            <button type="button" onClick={() => { fixture.controls.recallSource(); setMessage('첫 번째 원글을 회수했습니다. 공개 상태를 다시 확인하세요.'); }}>첫 원글 회수</button>
            <button type="button" onClick={() => { fixture.controls.failRead(); setMessage('다음 공개판 조회 한 번이 실패합니다.'); }}>공개 조회 실패 만들기</button>
            <span role="status">{message}</span>
        </div>
        <ClassAgitTeacherEntry activeClass={previewClass} api={fixture.api} isSample />
    </div>;
}
