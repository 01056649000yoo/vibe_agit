import { formatBadgeCount } from './teacherNavBadges.js';
import './TeacherCountBadge.css';

/** 처리할 일 수 배지. 모양은 이것 하나다 — 규칙은 `teacherNavBadges.js` 참고. */
const TeacherCountBadge = ({ count, label }) => (count > 0 ? (
    <span className="teacher-count-badge" aria-label={`${label} ${count}건`}>{formatBadgeCount(count)}</span>
) : null);

export default TeacherCountBadge;
