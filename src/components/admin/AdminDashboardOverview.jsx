import './AdminDashboardOverview.css';

/**
 * 관리자 첫 화면의 운영 요약.
 *
 * 숫자 원본은 새로 조회하지 않고 AdminDashboard가 이미 읽는 사용량·건강검진 결과를 받는다.
 * 항목을 누르면 그 숫자를 실제로 확인하거나 처리하는 화면으로 바로 이동한다.
 */
const AdminDashboardOverview = ({ groups }) => (
    <section className="admin-overview" aria-labelledby="admin-overview-title">
        <div className="admin-overview__heading">
            <div>
                <span>ADMIN CHECK</span>
                <h2 id="admin-overview-title">오늘 확인할 운영 요약</h2>
            </div>
            <p>처리가 필요한 항목과 전체 이용 현황을 첫 화면에서 확인하세요.</p>
        </div>

        <div className="admin-overview__groups">
            {groups.map((group) => (
                <section key={group.id} className={`admin-overview__group admin-overview__group--${group.tone || 'neutral'}`}>
                    <div className="admin-overview__group-heading">
                        <strong>{group.title}</strong>
                        {group.description && <span>{group.description}</span>}
                    </div>
                    <div className="admin-overview__metrics">
                        {group.items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="admin-overview__metric"
                                onClick={item.onOpen}
                                aria-label={`${item.label} ${item.value} 자세히 보기`}
                            >
                                <span className="admin-overview__metric-icon" aria-hidden="true">{item.icon}</span>
                                <span className="admin-overview__metric-copy">
                                    <small>{item.label}</small>
                                    <strong style={{ color: item.color }}>{item.value}</strong>
                                </span>
                                <span className="admin-overview__metric-arrow" aria-hidden="true">→</span>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    </section>
);

export default AdminDashboardOverview;
