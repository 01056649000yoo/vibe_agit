import './cover.css';
import { bookCoverStyle, getBookDesign, getBookPaper } from '../designs.js';

export default function BookCover({ book }) {
    const paper = getBookPaper(book.paper_format), design = getBookDesign(book.design_id);
    const personal = book.book_type === 'personal';
    return <figure className="class-agit-book-preview"><div className="class-agit-book-cover" data-design={design.id} style={bookCoverStyle(design.id, paper.id)} aria-label="문집 표지 미리보기">
        <span>{personal ? '나의 글 모음' : '우리 반의 이야기'}</span><h2>{book.title}</h2><p>{book.subtitle}</p><div className="class-agit-cover-mark" aria-hidden="true">{design.mark}</div>{personal && <strong>{book.owner_student_name} 지음</strong>}<p>{book.class_label}</p><small>{book.issue_date}</small>
    </div><figcaption>{paper.label} · {paper.width} × {paper.height} mm</figcaption></figure>;
}
