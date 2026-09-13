import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import SourceBrowser from '../selection/SourceBrowser.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';
import MissionBulkPicker from '../selection/MissionBulkPicker.jsx';

/*
 * 담는 방법이 둘이다.
 *
 * 주제째 담기가 기본이다 — 문집은 대부분 "이 미션 글 다 넣기" 이고, 그때 작품을 한 편씩
 * 펼쳐 놓으면 체크만 서른 번이다(2026-09-14 지적). 골라 담기는 몇 편만 고를 때 쓴다.
 */
const WAYS = [
    { id: 'mission', label: '주제째 담기', detail: '미션을 고르면 그 미션의 글을 한 번에 담습니다' },
    { id: 'work', label: '작품 골라 담기', detail: '글을 하나씩 보고 고릅니다' },
];

export default function SourcePicker({ classId, api, items, onAdd, onClose }) {
    const [way, setWay] = useState('mission');
    // `글 보기` 로 넘어올 때 그 미션을 골라 둔 채로 연다.
    const [startMission, setStartMission] = useState(null);
    const chosen = WAYS.find((entry) => entry.id === way);
    return <section className="class-agit-book-picker">
        <header><h2>수록할 글 찾기</h2><Button variant="outline" type="button" onClick={onClose}>찾기 닫기</Button></header>
        <div className="anthology-ways" role="group" aria-label="담는 방법">
            {WAYS.map((entry) => <Button key={entry.id} variant={way === entry.id ? 'primary' : 'outline'} type="button"
                aria-pressed={way === entry.id} onClick={() => { setWay(entry.id); if (entry.id === 'mission') setStartMission(null); }}>{entry.label}</Button>)}
            <p className="anthology-ways__detail">{chosen.detail}</p>
        </div>
        {way === 'mission'
            ? <MissionBulkPicker classId={classId} api={api} items={items} onAdd={onAdd}
                capacity={Math.max(0, limits.anthologyWorks - items.length)}
                capacityNote={`남은 자리 ${Math.max(0, limits.anthologyWorks - items.length)}편 · 담음 ${items.length}/${limits.anthologyWorks}편`}
                addLabel={(count) => `${count}편 모두 담기`}
                onPickMission={(mission) => { setStartMission(mission); setWay('work'); }} />
            : <SourceBrowser classId={classId} api={api} items={items} maximum={limits.anthologyWorks} scope="글꽃 책방"
                initialMission={startMission} onAdd={onAdd} />}
    </section>;
}
