const EMPTY_SPACE_MESSAGE = '왼쪽 공간 목록에서 미리 볼 공간을 선택해 주세요.';

export const NeighborAgitTeacherPreview = ({ space }) => (
    <section className="neighbor-admin-preview" aria-label="교사 화면 미리보기">
        <header>
            <div>
                <span>교사 화면 미리보기</span>
                <h3>{space?.name || '선택한 이웃 아지트 없음'}</h3>
            </div>
            {space && <strong>{space.status === 'active' ? '운영 중' : space.status}</strong>}
        </header>
        {!space ? <p className="neighbor-admin-preview__empty">{EMPTY_SPACE_MESSAGE}</p> : (
            <>
                <p>{space.description || '여러 학급이 글로 만나는 공간입니다.'}</p>
                <div className="neighbor-admin-preview__metrics">
                    <span>참여 {space.memberships?.filter((item) => item.status === 'active').length || 0}학급</span>
                    <span>공개 글 {Number(space.published_post_count) || 0}편</span>
                    <span>검토 대기 {Number(space.pending_post_count) || 0}편</span>
                    <span>숨긴 댓글 {Number(space.hidden_comment_count) || 0}개</span>
                </div>
                <ul className="neighbor-admin-preview__classes">
                    {(space.memberships || []).map((membership) => (
                        <li key={membership.class_id}>
                            <span>{membership.class_name}</span>
                            <small>{membership.role === 'host' ? '호스트' : '게스트'} · 학생 {membership.student_access_enabled ? '공개' : 'OFF'}</small>
                        </li>
                    ))}
                </ul>
            </>
        )}
    </section>
);

export const NeighborAgitStudentPreview = ({ space, items = [] }) => (
    <section className="neighbor-admin-preview neighbor-admin-preview--student" aria-label="학생 피드 미리보기">
        <header>
            <div>
                <span>학생 피드 미리보기 · 읽기 전용</span>
                <h3>{space?.name || '이웃 글 피드'}</h3>
            </div>
            <strong>최대 20편</strong>
        </header>
        {!space ? <p className="neighbor-admin-preview__empty">{EMPTY_SPACE_MESSAGE}</p> : items.length === 0 ? (
            <p className="neighbor-admin-preview__empty">아직 공개된 시험 글이 없습니다.</p>
        ) : (
            <div className="neighbor-admin-preview__feed">
                {items.map((item) => (
                    <article key={item.shared_post_id}>
                        <div><strong>{item.author_name}</strong><span>{item.class_name}</span></div>
                        <h4>{item.title}</h4>
                        <p>{item.excerpt || '본문 미리보기 없음'}</p>
                        <small>💛 {Number(item.reaction_count) || 0} · 💬 {Number(item.comment_count) || 0}</small>
                    </article>
                ))}
            </div>
        )}
    </section>
);
