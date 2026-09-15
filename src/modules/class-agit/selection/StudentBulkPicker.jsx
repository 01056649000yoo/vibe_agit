import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import { collectStudentSources, describeBulkResult } from '../anthology/bulkAdd.js';

/*
 * 학생째 담기(2026-09-15 "학생별로 문집을 만드는 기능").
 *
 * 한 아이의 글을 모두 담는다 — 개인 문집 한 권을 만들 때, 또는 반 문집의 학생별 차례를 채울 때.
 * 전에는 이름으로 검색해 한 편씩 체크해야 했고, 같은 성의 두 아이가 섞여 나왔다.
 * 주제째 담기와 같은 모양이다: **작품을 펼치지 않는다** — 학생 한 줄과 담기 단추뿐이다.
 *
 * 목록은 학생마다 검색을 돌리지 않고 `getStudents` 한 번으로 받는다(학생 수와 담을 수 있는 글 수).
 */
export default function StudentBulkPicker({ classId, api, items, capacity, capacityNote, onAdd }) {
    const [students, setStudents] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [input, setInput] = useState('');
    const [busyStudent, setBusyStudent] = useState(null);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const busyRef = useRef(false);
    const alive = useRef(true);
    const added = new Set(items.map((item) => item.sourceId));

    useEffect(() => {
        alive.current = true;
        api.getStudents(classId)
            .then((data) => { if (alive.current) { setStudents(data.items); setLoadError(''); } })
            .catch((reason) => { if (alive.current) setLoadError(reason.message); });
        return () => { alive.current = false; };
    }, [api, classId]);

    const run = (student, seats) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusyStudent(student.id); setError(''); setMessage(''); setProgress(null);
        collectStudentSources(api, classId, { studentId: student.id, capacity: seats, added,
            onProgress: ({ done, total }) => setProgress({ done, total }) })
            .then(({ sources, skipped, truncated }) => {
                if (!sources.length && !skipped.length) { setMessage(`${student.name} 학생의 글은 모두 담겨 있습니다.`); return; }
                onAdd(sources);
                setMessage(`${student.name} · ${describeBulkResult({ added: sources.length, skipped: skipped.length, truncated })}`);
            })
            .catch((reason) => setError(reason.message))
            .finally(() => { busyRef.current = false; setBusyStudent(null); setProgress(null); });
    };

    const working = (student) => (busyStudent === student.id
        ? (progress ? `${progress.done}/${progress.total}편 확인 중…` : '글을 찾고 있습니다…') : null);

    const needle = input.trim().toLowerCase();
    const shown = (students || []).filter((student) => !needle || student.name.toLowerCase().includes(needle));

    return <section className="anthology-bulk" aria-label="학생째 담기">
        {error && <p className="class-agit-error" role="alert">{error}</p>}
        {message && <p className="anthology-bulk__message" role="status">{message}</p>}
        <div className="class-agit-selection-search">
            <label>학생 이름 찾기<input value={input} maxLength={30} placeholder="이름 일부만 적어도 됩니다" onChange={(event) => setInput(event.target.value)} /></label>
        </div>
        <div className="anthology-bulk__filters">
            <span>담을 수 있는 글은 학급에 공개하고 제출·확인한 과제 글입니다.</span>
            <span className="anthology-bulk__capacity">{capacityNote}</span>
        </div>
        {loadError && <p className="class-agit-error" role="alert">{loadError}</p>}
        {!students && !loadError && <p role="status">학생 명단을 불러오고 있습니다…</p>}
        <ul className="anthology-bulk__list">{shown.map((student) => {
            // 이 학생의 글 가운데 이미 담긴 편수. 학생별 차례를 채우다 만 자리를 알 수 있다.
            const mine = items.filter((item) => item.studentId === student.id).length;
            const left = Math.max(0, student.review_count - mine);
            const here = Math.min(left, capacity);
            const busy = busyStudent !== null;
            return <li key={student.id}>
                <div className="anthology-bulk__work">
                    <strong>{student.name}</strong>
                    <small>{student.review_count ? `담을 수 있는 글 ${left}편${mine ? ` · 이미 담음 ${mine}편` : ''}` : '담을 수 있는 글이 아직 없습니다'}</small>
                </div>
                <div className="anthology-bulk__actions">
                    <Button variant="primary" type="button" disabled={!left || !here || busy} onClick={() => run(student, here)}>
                        {working(student) || (!student.review_count ? '글 없음' : !left ? '다 담았습니다' : !capacity ? '자리 없음' : `${here}편 모두 담기`)}
                    </Button>
                </div>
            </li>;
        })}</ul>
        {students && !shown.length && <p className="class-agit-empty">이 이름의 학생이 없습니다.</p>}
    </section>;
}
