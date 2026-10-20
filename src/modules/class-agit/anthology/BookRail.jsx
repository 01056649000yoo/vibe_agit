/**
 * 글꽃 책방 `작품 담기` 단계의 왼쪽 "담은 글 현황"(2026-10-20, 전시관의 전시실별 현황과 같은 모양).
 * 무엇을 몇 편 담았는지만 보여 준다 — 주제별 편수, 글쓴이 수, 아직 글을 담지 않은 학생.
 * 글 하나하나와 순서는 다음 단계 `목차 정하기`에서 본다.
 */
const MAX_TOPICS = 6;

export default function BookRail({ items, limit, students = null, ownerStudent = null }) {
    const byTopic = new Map();
    for (const item of items) {
        const key = item.missionId || item.group || '기타';
        const entry = byTopic.get(key) || { key, title: item.group || '주제 없음', count: 0 };
        entry.count += 1; byTopic.set(key, entry);
    }
    const topics = [...byTopic.values()];
    const shown = topics.slice(0, MAX_TOPICS);
    const authors = new Set(items.map((item) => item.studentId).filter(Boolean));
    const missing = students ? students.filter((student) => !authors.has(student.id)) : [];
    return (
        <aside className="class-agit-room-rail class-agit-book-rail" aria-label="담은 글 현황">
            <h3>담은 글 현황</h3>
            <div className="class-agit-room-card is-active">
                <div className="class-agit-room-card__head">
                    <span className="class-agit-room-card__title">{ownerStudent ? `${ownerStudent.name} 학생의 글` : '수록할 글'}</span>
                    <span className="class-agit-room-card__count"><b>{items.length}</b>/{limit}편</span>
                    <span className="class-agit-room-card__bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (items.length / limit) * 100)}%` }} /></span>
                </div>
                {items.length === 0
                    ? <p className="class-agit-room-card__empty">아직 담은 글이 없어요. 오른쪽에서 담아 보세요.</p>
                    : <ul className="class-agit-room-card__topics">
                        {shown.map((topic) => <li key={topic.key}><span>{topic.title}</span><b>{topic.count}편</b></li>)}
                        {topics.length > shown.length && <li className="class-agit-room-card__more">외 {topics.length - shown.length}개 주제</li>}
                    </ul>}
                {!ownerStudent && items.length > 0 && <p className="class-agit-room-card__empty">{authors.size}명의 글</p>}
            </div>
            {students && (
                <details className="class-agit-participation">
                    <summary>아직 글을 담지 않은 학생 {missing.length}명</summary>
                    <p>{missing.map((student) => student.name).join(' · ') || '모든 학생의 글을 담았습니다.'}</p>
                </details>
            )}
        </aside>
    );
}
