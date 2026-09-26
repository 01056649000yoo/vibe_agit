import TeacherGuideButton from './TeacherGuideButton';
import { getTeacherTabLabel } from '../../constants/teacherNav';
import './TeacherPageTitle.css';

/**
 * 교사 화면 제목 한 줄 — 제목 · 작은 보조 글 · 도움말 단추.
 *
 * 전에는 화면마다 제목을 따로 그려 단계(h1·h2·h3)·크기·색이 모두 달랐다(2026-09-26 점검).
 * 제목 글은 `tabId` 로 메뉴 이름을 꺼내 쓴다 — 메뉴와 제목이 어긋나지 않게 하려는 것이다.
 * 설정·학급운영도구처럼 메뉴 안에서 다시 고르는 화면만 `title` 로 그 항목 이름을 넘긴다.
 * 바깥 머리말 틀(설명 문장·오른쪽 단추·고정 위치)은 각 화면이 그대로 가진다.
 */
const TeacherPageTitle = ({ tabId, title, guideTabId, meta, id, hideGuide = false }) => (
    <div className="teacher-page-title">
        <h2 id={id}>{title || getTeacherTabLabel(tabId)}</h2>
        {meta ? <span className="teacher-page-title__meta">{meta}</span> : null}
        {hideGuide ? null : <TeacherGuideButton tabId={guideTabId || tabId} variant="help" />}
    </div>
);

export default TeacherPageTitle;
