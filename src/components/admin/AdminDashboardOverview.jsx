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
                                aria-label={`${item.label} ${item.value}${item.basis ? `, 기준 ${item.basis}` : ''} 자세히 보기`}
                            >
                                <span className="admin-overview__metric-icon" aria-hidden="true">{item.icon}</span>
                                {/*
                                  * 기준을 항목마다 적는다. 묶음 머리말 하나로는 안 된다 —
                                  * 같은 묶음 안에도 `전체 누적`과 `최근 30일`이 섞여 있어
                                  * 머리말만 보면 누적 숫자를 기간 숫자로 잘못 읽는다(2026-08-28 지적).
                                  */}
                                <span className="admin-overview__metric-copy">
                                    <small>{item.label}</small>
                                    <strong style={{ color: item.color }}>{item.value}</strong>
                                    {item.basis && <em>{item.basis}</em>}
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
