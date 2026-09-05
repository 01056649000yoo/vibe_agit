import { EXHIBITION_RIGHTS } from './rightsNotice.js';

export default function ExhibitionRightsNotice() {
    return <aside className="class-agit-rights-notice" aria-label="전시 작품 이용 안내">
        <strong>{EXHIBITION_RIGHTS.title}</strong>
        <p>{EXHIBITION_RIGHTS.ownership}</p><p>{EXHIBITION_RIGHTS.notice}</p>
        <small>{EXHIBITION_RIGHTS.exception} <a href="/privacy#class-agit-exhibition" target="_blank" rel="noopener noreferrer">개인정보 처리방침</a></small>
    </aside>;
}
