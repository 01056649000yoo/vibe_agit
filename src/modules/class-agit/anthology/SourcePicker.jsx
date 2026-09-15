import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import SourceBrowser from '../selection/SourceBrowser.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import MissionBulkPicker from '../selection/MissionBulkPicker.jsx';
import StudentBulkPicker from '../selection/StudentBulkPicker.jsx';

/*
 * 담는 방법이 셋이다.
 *
 * 주제째 담기가 기본이다 — 문집은 대부분 "이 미션 글 다 넣기" 이고, 그때 작품을 한 편씩
 * 펼쳐 놓으면 체크만 서른 번이다(2026-09-14 지적). 골라 담기는 몇 편만 고를 때 쓴다.
 * 학생째 담기(2026-09-15)는 한 아이의 글을 모두 담는다 — 개인 문집을 만들 때, 또는 학생별 차례를 채울 때.
 * 이름 검색으로 한 편씩 고르면 같은 성의 두 아이가 섞여 나왔다.
 */
const WAYS = [
    { id: 'mission', label: '주제째 담기', detail: '미션을 고르면 그 미션의 글을 한 번에 담습니다' },
    { id: 'student', label: '학생째 담기', detail: '학생을 고르면 그 학생의 글을 한 번에 담습니다 — 개인 문집을 만들 때' },
    { id: 'work', label: '작품 골라 담기', detail: '글을 하나씩 보고 고릅니다' },
];

export default function SourcePicker({ classId, api, items, onAdd, onClose, ownerStudent = null }) {
    const [way, setWay] = useState('mission');
    // `글 보기` 로 넘어올 때 그 미션을 골라 둔 채로 연다.
    const [startMission, setStartMission] = useState(null);
    const effectiveWay = ownerStudent ? 'student' : way;
    const chosen = WAYS.find((entry) => entry.id === effectiveWay);
    return <section className="class-agit-book-picker">
        <header><h2>수록할 글 찾기</h2><Button variant="outline" type="button" onClick={onClose}>찾기 닫기</Button></header>
        {ownerStudent && <p className="anthology-ways__detail"><strong>{ownerStudent.name}</strong> 학생의 글만 담을 수 있습니다. 지은이는 표지에 한 번만 표시됩니다.</p>}
        {!ownerStudent && <div className="anthology-ways" role="group" aria-label="담는 방법">
            {WAYS.map((entry) => <Button key={entry.id} variant={way === entry.id ? 'primary' : 'outline'} type="button"
                aria-pressed={way === entry.id} onClick={() => { setWay(entry.id); if (entry.id === 'mission') setStartMission(null); }}>{entry.label}</Button>)}
            <p className="anthology-ways__detail">{chosen.detail}</p>
        </div>}
        {effectiveWay === 'mission' && <MissionBulkPicker classId={classId} api={api} items={items} onAdd={onAdd}
            capacity={Math.max(0, limits.anthologyWorks - items.length)}
            capacityNote={`남은 자리 ${Math.max(0, limits.anthologyWorks - items.length)}편 · 담음 ${items.length}/${limits.anthologyWorks}편`}
            addLabel={(count) => `${count}편 모두 담기`}
            onPickMission={(mission) => { setStartMission(mission); setWay('work'); }} />}
        {effectiveWay === 'student' && <StudentBulkPicker classId={classId} api={api} items={items} onAdd={onAdd} fixedStudent={ownerStudent}
            capacity={Math.max(0, limits.anthologyWorks - items.length)}
            capacityNote={`남은 자리 ${Math.max(0, limits.anthologyWorks - items.length)}편 · 담음 ${items.length}/${limits.anthologyWorks}편`} />}
        {effectiveWay === 'work' && <SourceBrowser classId={classId} api={api} items={items} maximum={limits.anthologyWorks} scope="글꽃 책방"
            initialMission={startMission} onAdd={onAdd} />}
    </section>;
}
